# Smart Excel Reader — Product Requirements Document

## Problem Statement
Build a mobile-first inventory lookup and quotation app called "Smart Excel Reader" that connects to Google Drive to read Excel files, manage a sheet library, provide visual warehouse layouts, and generate quotations (Parchis).

## Target User
Inventory managers / warehouse staff, primarily Hindi-speaking, using the app on mobile.

## Tech Stack
- **Frontend:** React Native (Expo), Expo Router, Zustand state management
- **Backend:** FastAPI (Python), MongoDB
- **3rd Party:** Google Drive API, OpenAI Whisper (via emergentintegrations), Expo Print/Sharing
- **Deployment:** Emergent Platform (Kubernetes), EAS Build for Android

## Core Architecture
### Sheet Library System
- Users add Excel files from Google Drive (from Office folder ID: 1Kw96RZVDd0DBUjSblYN2FEElZqRdqTWH)
- Users save sheet "profiles" (file name, sheet name, range, cached data) to a persistent library
- Home screen displays saved profiles and allows setting one as "active"
- Auto-detect sheet type: layout (Inventory_Chart_JGT/JGI), stock (STOCK), mixed

### Data Source Rule (Layout)
- JGT layout -> `Inventory_Chart_JGT` sheet
- JGI layout -> `Inventory Chart_JGI` sheet (note: space not underscore)
- Column B=Rack ID, E=Size, I=Stock, J=Rate Diff
- Trim + case-insensitive matching

### Layout Version Management (NEW)
- Users can create, edit, save, and load multiple versions of JGT and JGI layouts
- Default layouts are hardcoded; custom versions stored in MongoDB
- Edit mode allows modifying rack IDs, adding/removing rows/sections
- Version panel shows all saved versions with load/delete options
- Backend CRUD: POST/GET/PUT/DELETE /api/layouts/*

### Voice Search with Whisper STT (IMPROVED)
- Real audio recording via expo-av on mobile
- Audio sent to backend -> OpenAI Whisper (whisper-1) for Hindi transcription
- Transcribed text auto-converted to size format (Hindi numbers -> dimensions)
- Manual text input fallback still available

## Navigation
Bottom tabs: Home, Filter, Parchi, Inventory, Layout

## Key API Endpoints
- `/api/` - Health check
- `/api/session/create` - Create user session
- `/api/drive/status` - Check Google Drive connection
- `/api/drive/files` - List Excel files from Office folder
- `/api/drive/file/{file_id}/sheets` - Get sheet names
- `/api/excel/read` - Read Excel data for a range
- `/api/oauth/drive/connect` - Initiate Google OAuth (hardcoded production URI)
- `/api/oauth/drive/callback` - OAuth callback handler
- `/api/layouts/save` - Save layout version (POST)
- `/api/layouts/list` - List layout versions (GET)
- `/api/layouts/{layout_id}` - Get/Update/Delete layout version
- `/api/voice/transcribe` - Transcribe audio with Whisper STT (POST)

## Completed Features (as of 26 Feb 2026)
- [x] Google OAuth integration for Drive access
- [x] Sheet Library system (add, save, switch profiles)
- [x] Visual Layout screen (JGT + JGI grids with rack tap dialog)
- [x] Layout detects Inventory_Chart_JGT and Inventory Chart_JGI sheet names
- [x] Sheet View screen (STOCK vertical pager, 24 rows/page, all cols fit)
- [x] Home Quick Actions (5 actions: Filter, Parchi, Sheet View, Layout, Inventory)
- [x] Backend: Office folder file listing with temp file filtering
- [x] Backend: Excel read with full range support
- [x] OAuth redirect URI hardcoded to production (Option B per user request)
- [x] Layout editability: save/load multiple versions of JGT/JGI (MongoDB backed)
- [x] Voice search improved with OpenAI Whisper STT via emergentintegrations
- [x] Backend layout CRUD (13/13 tests passed)

## Upcoming Tasks
- [ ] (P0) Smart Filter - Advanced category shortcuts + keyword search refinement
- [ ] (P1) Parchi - Full calculation logic, dynamic charges, GST
- [ ] (P2) Inventory Tab - Master stock list view with timestamp
- [ ] (P2) Voice Output - "Speak" button on results
- [ ] (P2) Parchi Log - View/manage saved Parchis
- [ ] (P2) Layout Builder - Visual rack config (beyond current edit mode)

## File Structure
```
/app
├── backend/
│   ├── .env (MONGO_URL, DB_NAME, GOOGLE_CLIENT_ID/SECRET, OFFICE_FOLDER_ID, FRONTEND_URL, GOOGLE_DRIVE_REDIRECT_URI, EMERGENT_LLM_KEY)
│   ├── server.py
│   ├── requirements.txt
│   └── tests/
│       └── test_layout_voice.py
└── frontend/
    ├── .env (EXPO_PUBLIC_BACKEND_URL)
    ├── package.json
    ├── app/
    │   ├── _layout.tsx
    │   ├── (tabs)/
    │   │   ├── _layout.tsx
    │   │   ├── home.tsx
    │   │   ├── filter.tsx (Whisper voice search)
    │   │   ├── layout.tsx (Version management + edit mode)
    │   │   ├── parchi.tsx
    │   │   └── inventory.tsx
    │   └── sheetview.tsx
    └── utils/
        └── store.ts
```
