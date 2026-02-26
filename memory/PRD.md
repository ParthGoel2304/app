# Smart Excel Reader — Product Requirements Document

## Problem Statement
Build a mobile-first inventory lookup and quotation app called "Smart Excel Reader" that connects to Google Drive to read Excel files, manage a sheet library, provide visual warehouse layouts, and generate quotations (Parchis).

## Target User
Inventory managers / warehouse staff, primarily Hindi-speaking, using the app on mobile.

## Tech Stack
- **Frontend:** React Native (Expo), Expo Router, Zustand state management
- **Backend:** FastAPI (Python), MongoDB
- **3rd Party:** Google Drive API, Expo Print/Sharing
- **Deployment:** Emergent Platform (Kubernetes), EAS Build for Android

## Core Architecture
### Sheet Library System
- Users add Excel files from Google Drive (from Office folder ID: 1Kw96RZVDd0DBUjSblYN2FEElZqRdqTWH)
- Users save sheet "profiles" (file name, sheet name, range, cached data) to a persistent library
- Home screen displays saved profiles and allows setting one as "active"
- Auto-detect sheet type: layout (Inventory_JGT/JGI), stock (STOCK), mixed

### Data Source Rule (Layout)
- JGT layout → Inventory_JGT sheet
- JGI layout → Inventory_JGI sheet
- Column B=Rack ID, E=Size, I=Stock, J=Rate Diff
- No dependency on STOCK sheet for layout
- Trim + case-insensitive matching

### Sheet View (STOCK pager)
- Source: STOCK sheet from saved profile
- Visible columns: A, E, F, G, H, I, M, N, O (hide B, C, D, J, K, L)
- 4-page pager with rows split: 1-42, 43-74, 75-110, 111-153
- Pinch zoom, pan, double-tap reset
- Timestamp display, auto-refresh, manual refresh
- Cached data with retry on failure

## Navigation
Bottom tabs: Home, Filter, Parchi, Inventory, Layout
Quick actions on Home: Filter, Parchi, Sheet View, Layout, Inventory

## Key API Endpoints
- `/api/` - Health check
- `/api/session/create` - Create user session
- `/api/drive/status` - Check Google Drive connection
- `/api/drive/files` - List Excel files from Office folder
- `/api/excel/sheets` - Get sheet names from a file
- `/api/excel/read` - Read Excel data for a range
- `/api/oauth/drive/connect` - Initiate Google OAuth
- `/api/oauth/drive/callback` - OAuth callback handler

## File Structure
```
/app
├── backend/
│   ├── .env (MONGO_URL, DB_NAME, GOOGLE_CLIENT_ID/SECRET, OFFICE_FOLDER_ID, FRONTEND_URL, GOOGLE_DRIVE_REDIRECT_URI)
│   ├── server.py
│   └── requirements.txt
└── frontend/
    ├── .env (EXPO_PUBLIC_BACKEND_URL)
    ├── package.json
    ├── app/
    │   ├── _layout.tsx
    │   ├── index.tsx (Entry: session check → redirect)
    │   ├── login.tsx
    │   ├── data.tsx
    │   ├── files.tsx
    │   ├── sheets.tsx
    │   ├── sheetview.tsx (NEW: STOCK 4-page pager)
    │   └── (tabs)/
    │       ├── _layout.tsx (Tab config, initialRoute=home)
    │       ├── home.tsx (Sheet library + Quick Actions)
    │       ├── filter.tsx
    │       ├── parchi.tsx
    │       ├── inventory.tsx
    │       └── layout.tsx (JGT/JGI visual grid)
    └── utils/
        └── store.ts (Zustand: sheet library, profiles)
```

## Completed Features (as of 26 Feb 2026)
- [x] Google OAuth integration for Drive access
- [x] Sheet Library system (add, save, switch profiles)
- [x] Visual Layout screen (JGT + JGI grids with rack tap dialog)
- [x] Sheet View screen (STOCK 4-page pager with zoom)
- [x] Home Quick Actions (5 actions: Filter, Parchi, Sheet View, Layout, Inventory)
- [x] Backend: Office folder file listing with temp file filtering
- [x] Backend: Excel read with full range support (removed read_only limitation)
- [x] Dynamic OAuth redirect URIs
- [x] Deployment env vars configured

## Upcoming Tasks
- [ ] (P0) Smart Filter — Advanced category shortcuts + keyword search
- [ ] (P1) Voice Search — Hindi/Hinglish NLP + Voice Training Panel
- [ ] (P1) Parchi — Full calculation logic, dynamic charges, GST
- [ ] (P2) Inventory Tab — Master stock list view
- [ ] (P2) Voice Output — "Speak" button on results
- [ ] (P2) Parchi Log — View/manage saved Parchis
- [ ] (P2) Layout Builder — Visual rack config
