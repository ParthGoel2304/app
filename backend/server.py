from fastapi import FastAPI, APIRouter, HTTPException, Query
from fastapi.responses import RedirectResponse, JSONResponse
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
import os
import logging
from pathlib import Path
from pydantic import BaseModel, Field
from typing import List, Optional, Dict, Any
import uuid
from datetime import datetime, timezone
from googleapiclient.discovery import build
from googleapiclient.http import MediaIoBaseDownload
from google_auth_oauthlib.flow import Flow
from google.oauth2.credentials import Credentials
from google.auth.transport.requests import Request as GoogleRequest
import io
import openpyxl
from openpyxl.utils import get_column_letter, column_index_from_string

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

# MongoDB connection
mongo_url = os.environ['MONGO_URL']
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ['DB_NAME']]

# Create the main app without a prefix
app = FastAPI()

# Create a router with the /api prefix
api_router = APIRouter(prefix="/api")

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

# ==================== MODELS ====================

class UserSession(BaseModel):
    session_id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    email: Optional[str] = None
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

class DriveCredentials(BaseModel):
    session_id: str
    access_token: str
    refresh_token: Optional[str] = None
    token_uri: str
    client_id: str
    client_secret: str
    scopes: List[str]
    expiry: Optional[str] = None
    updated_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

class ExcelFile(BaseModel):
    file_id: str
    file_name: str
    modified_time: str
    size: Optional[str] = None

class SheetConfig(BaseModel):
    session_id: str
    file_id: str
    file_name: str
    sheet_name: str
    cell_range: str  # e.g., "A1:D10"
    updated_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

class SheetConfigCreate(BaseModel):
    file_id: str
    file_name: str
    sheet_name: str
    cell_range: str

# ==================== HELPER FUNCTIONS ====================

async def get_drive_service(session_id: str):
    """Get Google Drive service with auto-refresh credentials"""
    creds_doc = await db.drive_credentials.find_one({"session_id": session_id})
    if not creds_doc:
        raise HTTPException(
            status_code=401, 
            detail="Google Drive not connected. Please authenticate first."
        )
    
    # Create credentials object
    creds = Credentials(
        token=creds_doc["access_token"],
        refresh_token=creds_doc.get("refresh_token"),
        token_uri=creds_doc["token_uri"],
        client_id=creds_doc["client_id"],
        client_secret=creds_doc["client_secret"],
        scopes=creds_doc["scopes"]
    )
    
    # Auto-refresh if expired
    if creds.expired and creds.refresh_token:
        logger.info(f"Refreshing expired token for session {session_id}")
        creds.refresh(GoogleRequest())
        
        # Update in database
        await db.drive_credentials.update_one(
            {"session_id": session_id},
            {"$set": {
                "access_token": creds.token,
                "expiry": creds.expiry.isoformat() if creds.expiry else None,
                "updated_at": datetime.now(timezone.utc)
            }}
        )
    
    return build('drive', 'v3', credentials=creds)

def parse_cell_range(cell_range: str):
    """Parse cell range like 'A1:D10' to row/col coordinates"""
    try:
        start, end = cell_range.split(':')
        
        # Parse start cell (e.g., 'A1')
        start_col = ''.join(filter(str.isalpha, start))
        start_row = int(''.join(filter(str.isdigit, start)))
        
        # Parse end cell (e.g., 'D10')
        end_col = ''.join(filter(str.isalpha, end))
        end_row = int(''.join(filter(str.isdigit, end)))
        
        return {
            'start_col': column_index_from_string(start_col),
            'start_row': start_row,
            'end_col': column_index_from_string(end_col),
            'end_row': end_row
        }
    except Exception as e:
        raise ValueError(f"Invalid cell range format: {cell_range}. Use format like 'A1:D10'")

# ==================== ROUTES ====================

@api_router.get("/")
async def root():
    return {"message": "Excel Reader API", "status": "running"}

# 1. CREATE SESSION
@api_router.post("/session/create")
async def create_session():
    """Create a new user session"""
    session = UserSession()
    await db.user_sessions.insert_one(session.dict())
    logger.info(f"Created session: {session.session_id}")
    return {"session_id": session.session_id}

# 2. START GOOGLE DRIVE OAUTH
@api_router.get("/oauth/drive/connect")
async def connect_drive(session_id: str = Query(...)):
    """Initiate Google Drive OAuth flow"""
    try:
        # Verify session exists
        session = await db.user_sessions.find_one({"session_id": session_id})
        if not session:
            raise HTTPException(status_code=404, detail="Session not found")
        
        redirect_uri = os.getenv("GOOGLE_DRIVE_REDIRECT_URI")
        
        flow = Flow.from_client_config(
            {
                "web": {
                    "client_id": os.getenv("GOOGLE_CLIENT_ID"),
                    "client_secret": os.getenv("GOOGLE_CLIENT_SECRET"),
                    "auth_uri": "https://accounts.google.com/o/oauth2/auth",
                    "token_uri": "https://oauth2.googleapis.com/token",
                    "redirect_uris": [redirect_uri]
                }
            },
            scopes=['https://www.googleapis.com/auth/drive.readonly'],
            redirect_uri=redirect_uri
        )
        
        authorization_url, state = flow.authorization_url(
            access_type='offline',
            include_granted_scopes='true',
            prompt='consent',
            state=session_id
        )
        
        logger.info(f"Drive OAuth initiated for session {session_id}")
        return {"authorization_url": authorization_url}
    
    except Exception as e:
        logger.error(f"Failed to initiate OAuth: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Failed to initiate OAuth: {str(e)}")

# 3. HANDLE OAUTH CALLBACK
@api_router.get("/oauth/drive/callback")
async def drive_callback(code: str = Query(...), state: str = Query(...)):
    """Handle Google Drive OAuth callback"""
    try:
        session_id = state
        redirect_uri = os.getenv("GOOGLE_DRIVE_REDIRECT_URI")
        
        flow = Flow.from_client_config(
            {
                "web": {
                    "client_id": os.getenv("GOOGLE_CLIENT_ID"),
                    "client_secret": os.getenv("GOOGLE_CLIENT_SECRET"),
                    "auth_uri": "https://accounts.google.com/o/oauth2/auth",
                    "token_uri": "https://oauth2.googleapis.com/token",
                    "redirect_uris": [redirect_uri]
                }
            },
            scopes=None,
            redirect_uri=redirect_uri
        )
        
        flow.fetch_token(code=code)
        credentials = flow.credentials
        
        logger.info(f"Drive credentials obtained for session {session_id}")
        
        # Store credentials in database
        creds_data = {
            "session_id": session_id,
            "access_token": credentials.token,
            "refresh_token": credentials.refresh_token,
            "token_uri": credentials.token_uri,
            "client_id": credentials.client_id,
            "client_secret": credentials.client_secret,
            "scopes": credentials.scopes,
            "expiry": credentials.expiry.isoformat() if credentials.expiry else None,
            "updated_at": datetime.now(timezone.utc)
        }
        
        await db.drive_credentials.update_one(
            {"session_id": session_id},
            {"$set": creds_data},
            upsert=True
        )
        
        logger.info(f"Drive credentials stored for session {session_id}")
        
        # Redirect to frontend with success
        frontend_url = os.getenv("FRONTEND_URL")
        return RedirectResponse(url=f"{frontend_url}?drive_connected=true&session_id={session_id}")
    
    except Exception as e:
        logger.error(f"OAuth callback failed: {str(e)}")
        frontend_url = os.getenv("FRONTEND_URL")
        return RedirectResponse(url=f"{frontend_url}?drive_connected=false&error={str(e)}")

# 4. CHECK CONNECTION STATUS
@api_router.get("/drive/status")
async def check_drive_status(session_id: str = Query(...)):
    """Check if Google Drive is connected"""
    creds = await db.drive_credentials.find_one({"session_id": session_id})
    return {
        "connected": creds is not None,
        "session_id": session_id
    }

# Office folder ID - only fetch files from this folder
OFFICE_FOLDER_ID = "1Kw96RZVDd0DBUjSblYN2FEElZqRdqTWH"

# 5. LIST EXCEL FILES FROM DRIVE (from specific folder only)
@api_router.get("/drive/files")
async def list_excel_files(session_id: str = Query(...)):
    """List Excel files from the office Drive folder only"""
    try:
        service = await get_drive_service(session_id)
        
        # Query for Excel files ONLY in the specific office folder
        query = f"'{OFFICE_FOLDER_ID}' in parents and (mimeType='application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' or mimeType='application/vnd.ms-excel') and trashed=false"
        
        # Force fresh query - no caching
        results = service.files().list(
            q=query,
            pageSize=100,
            fields="files(id, name, modifiedTime, size)",
            orderBy="modifiedTime desc",
            supportsAllDrives=True,
            includeItemsFromAllDrives=True
        ).execute()
        
        files = results.get('files', [])
        
        # Filter out temp files (~$filename.xlsx)
        excel_files = [
            ExcelFile(
                file_id=f['id'],
                file_name=f['name'],
                modified_time=f['modifiedTime'],
                size=f.get('size', 'Unknown')
            ).dict()
            for f in files
            if not f['name'].startswith('~$')
        ]
        
        logger.info(f"Found {len(excel_files)} Excel files in office folder for session {session_id}")
        return {"files": excel_files}
    
    except Exception as e:
        logger.error(f"Failed to list files: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Failed to list files: {str(e)}")

# 6. GET SHEET NAMES FROM FILE
@api_router.get("/drive/file/{file_id}/sheets")
async def get_sheet_names(file_id: str, session_id: str = Query(...)):
    """Get all sheet names from an Excel file"""
    try:
        service = await get_drive_service(session_id)
        
        # Download file to memory
        request = service.files().get_media(fileId=file_id)
        file_stream = io.BytesIO()
        downloader = MediaIoBaseDownload(file_stream, request)
        
        done = False
        while not done:
            status, done = downloader.next_chunk()
        
        file_stream.seek(0)
        
        # Load workbook
        workbook = openpyxl.load_workbook(file_stream, read_only=True)
        sheet_names = workbook.sheetnames
        workbook.close()
        
        logger.info(f"Found {len(sheet_names)} sheets in file {file_id}")
        return {"sheet_names": sheet_names}
    
    except Exception as e:
        logger.error(f"Failed to get sheet names: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Failed to get sheet names: {str(e)}")

# 7. SAVE SHEET CONFIGURATION
@api_router.post("/config/save")
async def save_config(session_id: str, config: SheetConfigCreate):
    """Save sheet and range configuration"""
    try:
        # Validate cell range format
        parse_cell_range(config.cell_range)
        
        config_data = {
            "session_id": session_id,
            "file_id": config.file_id,
            "file_name": config.file_name,
            "sheet_name": config.sheet_name,
            "cell_range": config.cell_range,
            "updated_at": datetime.now(timezone.utc)
        }
        
        await db.sheet_configs.update_one(
            {"session_id": session_id, "file_id": config.file_id},
            {"$set": config_data},
            upsert=True
        )
        
        logger.info(f"Saved config for session {session_id}, file {config.file_id}")
        return {"status": "success", "message": "Configuration saved"}
    
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        logger.error(f"Failed to save config: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Failed to save config: {str(e)}")

# 8. GET SAVED CONFIGURATIONS
@api_router.get("/config/list")
async def list_configs(session_id: str = Query(...)):
    """Get all saved configurations for a session"""
    configs = await db.sheet_configs.find({"session_id": session_id}).to_list(100)
    for config in configs:
        config['_id'] = str(config['_id'])
    return {"configs": configs}

# 9. READ EXCEL DATA FROM SPECIFIC SHEET AND RANGE
@api_router.get("/excel/read")
async def read_excel_data(
    session_id: str = Query(...),
    file_id: str = Query(...),
    sheet_name: str = Query(...),
    cell_range: str = Query(...)
):
    """Read data from specific sheet and cell range"""
    try:
        service = await get_drive_service(session_id)
        
        # Download file to memory
        request = service.files().get_media(fileId=file_id)
        file_stream = io.BytesIO()
        downloader = MediaIoBaseDownload(file_stream, request)
        
        done = False
        while not done:
            status, done = downloader.next_chunk()
        
        file_stream.seek(0)
        
        # Load workbook
        workbook = openpyxl.load_workbook(file_stream, read_only=True, data_only=True)
        
        if sheet_name not in workbook.sheetnames:
            raise HTTPException(status_code=404, detail=f"Sheet '{sheet_name}' not found")
        
        worksheet = workbook[sheet_name]
        
        # Parse cell range
        range_coords = parse_cell_range(cell_range)
        
        # Extract data
        data = []
        for row_idx in range(range_coords['start_row'], range_coords['end_row'] + 1):
            row_data = []
            for col_idx in range(range_coords['start_col'], range_coords['end_col'] + 1):
                cell = worksheet.cell(row=row_idx, column=col_idx)
                value = cell.value
                # Convert to string for JSON serialization
                row_data.append(str(value) if value is not None else "")
            data.append(row_data)
        
        workbook.close()
        
        logger.info(f"Read {len(data)} rows from {sheet_name} range {cell_range}")
        
        return {
            "sheet_name": sheet_name,
            "cell_range": cell_range,
            "data": data,
            "row_count": len(data),
            "col_count": len(data[0]) if data else 0
        }
    
    except Exception as e:
        logger.error(f"Failed to read Excel data: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Failed to read Excel data: {str(e)}")

# Include the router in the main app
app.include_router(api_router)

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.on_event("shutdown")
async def shutdown_db_client():
    client.close()
