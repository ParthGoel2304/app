# Excel Reader App - Direct Google Drive Integration

## 🎯 Overview

A mobile app that connects **directly** to your Microsoft Excel files stored in Google Drive, without using Microsoft Azure, Microsoft Graph API, or Google Sheets. The app reads Excel files, allows you to select specific sheets and cell ranges, and displays the data beautifully on your mobile device.

## ✨ Features

- ✅ **Google Drive Integration**: Connect directly to your Google Drive (partharjun04@gmail.com)
- ✅ **Excel File Browser**: View all your .xlsx files from Google Drive
- ✅ **Smart Sheet Selection**: Choose specific sheets from your Excel workbook
- ✅ **Custom Range Reading**: Define exact cell ranges to read (e.g., A1:D10)
- ✅ **Manual Sync**: Refresh data on-demand whenever you update your Excel files
- ✅ **Beautiful Mobile UI**: Native-feeling interface with smooth navigation
- ✅ **Session Management**: Your connection persists across app restarts

## 🏗️ Architecture

### Backend (FastAPI + MongoDB)
- **Google OAuth 2.0**: Secure authentication with Google Drive
- **Excel Parser**: Uses `openpyxl` to read .xlsx files
- **MongoDB Storage**: Stores credentials, configurations, and cached data
- **RESTful APIs**: Clean endpoints for all operations

### Frontend (Expo React Native)
- **4 Main Screens**:
  1. **Welcome Screen**: Google Drive connection
  2. **Files Screen**: Browse Excel files
  3. **Sheets Screen**: Configure sheet and range
  4. **Data Screen**: View Excel data in table format
- **Cross-platform**: Works on iOS and Android
- **Offline Support**: Uses AsyncStorage for session persistence

## 📋 How It Works

1. **User uploads Excel to Google Drive** (via Desktop App auto-sync)
2. **User opens mobile app** → Connects Google Drive
3. **App fetches Excel files** from Google Drive
4. **User selects file** → Views available sheets
5. **User configures range** (e.g., A1:D10)
6. **App downloads and parses** the Excel file
7. **Data displayed** in a scrollable table
8. **Manual sync** available anytime

## 🔐 Google OAuth Setup

Your credentials are already configured:

```
Client ID: 352071874328-ehoi67f6ug14o1hbjodg18pvdu8ni110.apps.googleusercontent.com
Client Secret: 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
Redirect URI: https://excel-link-app.preview.emergentagent.com/api/oauth/drive/callback
Authorized Origin: https://excel-link-app.preview.emergentagent.com
```

**Scopes Used:**
- `https://www.googleapis.com/auth/drive.readonly` (Read-only access)

## 📤 Auto-Upload Excel Files to Google Drive

### Option 1: Google Drive Desktop App (Recommended)

1. **Download**: https://www.google.com/drive/download/
2. **Sign in**: partharjun04@gmail.com
3. **Create folder**: `ExcelAppData` in Google Drive
4. **Enable sync**: Folder will auto-sync with your laptop
5. **Save Excel files**: Save to `Google Drive/ExcelAppData/`
6. **Auto-sync**: Every Ctrl+S in Excel → instant upload

### Option 2: Manual Upload
- Open Google Drive in browser
- Drag and drop Excel files
- Or use "Upload" button

## 🚀 API Endpoints

### Session Management
- `POST /api/session/create` - Create new session
- `GET /api/drive/status?session_id=...` - Check connection status

### OAuth
- `GET /api/oauth/drive/connect?session_id=...` - Initiate OAuth
- `GET /api/oauth/drive/callback` - OAuth callback handler

### Files & Data
- `GET /api/drive/files?session_id=...` - List Excel files
- `GET /api/drive/file/{file_id}/sheets?session_id=...` - Get sheet names
- `GET /api/excel/read?session_id=...&file_id=...&sheet_name=...&cell_range=...` - Read data

### Configuration
- `POST /api/config/save` - Save sheet configuration
- `GET /api/config/list?session_id=...` - List saved configs

## 📱 Mobile App Navigation Flow

```
Welcome Screen (/)
    ↓ [Connect Google Drive]
Files Screen (/files)
    ↓ [Select Excel File]
Sheets Screen (/sheets)
    ↓ [Choose Sheet + Range]
Data Screen (/data)
    ← [Manual Refresh]
    ← [Back to Files]
```

## 🧪 Testing Results

### Backend Tests ✅
- ✅ Root endpoint responding
- ✅ Session creation working
- ✅ OAuth flow initiated successfully
- ✅ Drive status checked correctly
- ✅ Error handling validated

### Testing Commands
```bash
# Test backend
curl https://excel-link-app.preview.emergentagent.com/api/

# Create session
curl -X POST https://excel-link-app.preview.emergentagent.com/api/session/create

# Check status
curl "https://excel-link-app.preview.emergentagent.com/api/drive/status?session_id=YOUR_SESSION_ID"
```

## 📂 Project Structure

```
/app/
├── backend/
│   ├── server.py           # FastAPI app with all endpoints
│   ├── .env                # Google OAuth credentials
│   └── requirements.txt    # Python dependencies
│
├── frontend/
│   ├── app/
│   │   ├── index.tsx       # Welcome/Login screen
│   │   ├── files.tsx       # Excel files browser
│   │   ├── sheets.tsx      # Sheet configurator
│   │   ├── data.tsx        # Data viewer
│   │   └── _layout.tsx     # App navigation
│   ├── .env                # Backend URL
│   └── package.json        # Dependencies
```

## 🔧 Environment Variables

### Backend (.env)
```env
MONGO_URL="mongodb://localhost:27017"
DB_NAME="excel_reader_db"
GOOGLE_CLIENT_ID="352071874328-ehoi67f6ug14o1hbjodg18pvdu8ni110.apps.googleusercontent.com"
GOOGLE_CLIENT_SECRET="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"
GOOGLE_DRIVE_REDIRECT_URI="https://excel-link-app.preview.emergentagent.com/api/oauth/drive/callback"
FRONTEND_URL="https://excel-link-app.preview.emergentagent.com"
```

### Frontend (.env)
```env
EXPO_PUBLIC_BACKEND_URL=https://excel-link-app.preview.emergentagent.com
```

## 📦 Dependencies

### Backend
- `fastapi` - Web framework
- `motor` - Async MongoDB driver
- `google-api-python-client` - Google Drive API
- `google-auth-oauthlib` - OAuth handling
- `openpyxl` - Excel file parser
- `pandas` - Data manipulation

### Frontend
- `expo` - Mobile framework
- `expo-router` - File-based routing
- `expo-web-browser` - OAuth browser
- `axios` - HTTP client
- `@react-native-async-storage/async-storage` - Local storage

## 🎨 UI Design

**Color Scheme:**
- Primary: Google Blue (#4285F4)
- Success: Google Green (#34A853)
- Error: Google Red (#EA4335)
- Background: Light Gray (#f5f5f5)
- Text: Dark Gray (#202124)

**Components:**
- Material-inspired cards and buttons
- Icon-based navigation with Ionicons
- Pull-to-refresh on file lists
- Loading indicators for async operations
- Responsive touch targets (44x44 minimum)

## 🚦 How to Use

1. **Open the app** on your mobile device
2. **Tap "Connect Google Drive"**
3. **Sign in with Google** (partharjun04@gmail.com)
4. **Grant read-only permission**
5. **Browse your Excel files**
6. **Tap a file** to select it
7. **Choose sheet and range** (e.g., Sheet1, A1:D10)
8. **Tap "View Data"**
9. **See your Excel data** displayed!
10. **Tap refresh icon** to sync latest changes

## 🔄 Auto-Sync Workflow

```
Excel File (Laptop)
    ↓ Save (Ctrl+S)
Google Drive Desktop App
    ↓ Auto-Upload
Google Drive Cloud
    ↓ API Access
Mobile App (Backend)
    ↓ Parse Excel
Mobile App (Frontend)
    ↓ Display Data
```

## ⚠️ Important Notes

1. **Read-Only Access**: App can only read files, not edit them
2. **Manual Sync**: Refresh data manually when Excel updates
3. **Excel Format**: Only .xlsx files supported (not .xls)
4. **File Size**: Large files may take time to download
5. **Cell Range**: Invalid ranges will show error
6. **Session**: Stays logged in until you disconnect

## 🐛 Troubleshooting

**Problem**: Can't connect to Google Drive
- **Solution**: Check internet connection, try reconnecting

**Problem**: Files not showing
- **Solution**: Ensure Excel files are in Google Drive, tap refresh

**Problem**: Invalid cell range error
- **Solution**: Use format like "A1:D10", check sheet has data in that range

**Problem**: Data not updating
- **Solution**: Tap refresh icon to manually sync latest changes

## 🔐 Security

- OAuth tokens stored securely in MongoDB
- Refresh tokens for seamless re-authentication
- HTTPS for all communications
- Read-only scope (cannot modify files)
- Session-based authentication
- No password storage

## 📈 Future Enhancements (Not Implemented Yet)

- [ ] Edit Excel data from mobile
- [ ] Multiple file configurations
- [ ] Automatic sync on app open
- [ ] Push notifications on file changes
- [ ] Export data as CSV
- [ ] Search and filter data
- [ ] Charts and visualizations
- [ ] Dark mode

## 📞 Support

For issues or questions:
- Check troubleshooting section above
- Review Google OAuth console for credential issues
- Verify Excel files are in .xlsx format
- Ensure Google Drive Desktop app is syncing

## 🎉 Success!

Your Excel Reader app is now ready to use! Connect your Google Drive, select your Excel files, and view your data on mobile.

**App URL**: https://excel-link-app.preview.emergentagent.com
**Backend API**: https://excel-link-app.preview.emergentagent.com/api/

---

Built with ❤️ using FastAPI, Expo, and Google Drive API
