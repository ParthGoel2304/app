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

### Google OAuth Connection Flow (DUAL APPROACH)
- **Primary:** Standard browser-based OAuth flow with hardcoded production redirect URI
- **Fallback (NEW):** Manual authorization code entry — if the OAuth callback returns 404 on deployed app, user can copy the `code=` parameter from the browser URL bar and paste it into the app
- Callback endpoint now returns HTML page ("Connected!") instead of redirect, preventing 404 issues
- App polls `/api/drive/status` in background after opening auth URL
- Backend endpoint `POST /api/oauth/drive/manual-connect` accepts session_id + auth_code

### Layout Version Management
- Users can create, edit, save, and load multiple versions of JGT and JGI layouts
- Default layouts are hardcoded; custom versions stored in MongoDB
- Edit mode allows modifying rack IDs, adding/removing rows/sections
- Backend CRUD: POST/GET/PUT/DELETE /api/layouts/*

### Voice Search with Whisper STT
- Real audio recording via expo-av on mobile
- Audio sent to backend -> OpenAI Whisper for Hindi transcription
- Manual text input fallback available

## Navigation
Bottom tabs: Home, Filter, Parchi, Inventory, Layout

## Key API Endpoints
- `/api/` - Health check
- `/api/session/create` - Create user session
- `/api/drive/status` - Check Google Drive connection
- `/api/drive/files` - List Excel files from Office folder
- `/api/drive/file/{file_id}/sheets` - Get sheet names
- `/api/excel/read` - Read Excel data for a range
- `/api/oauth/drive/connect` - Initiate Google OAuth
- `/api/oauth/drive/callback` - OAuth callback (returns HTML, not redirect)
- `/api/oauth/drive/manual-connect` - Manual auth code exchange (NEW)
- `/api/layouts/save` - Save layout version (POST)
- `/api/layouts/list` - List layout versions (GET)
- `/api/layouts/{layout_id}` - Get/Update/Delete layout version
- `/api/voice/transcribe` - Transcribe audio with Whisper STT (POST)

## Completed Features (as of 27 Feb 2026)
- [x] Google OAuth with dual approach (browser redirect + manual code fallback)
- [x] OAuth callback returns HTML page instead of redirect
- [x] Sheet Library system (add, save, switch profiles)
- [x] Visual Layout screen (JGT + JGI grids with rack tap dialog)
- [x] Layout editability: save/load multiple versions of JGT/JGI
- [x] Sheet View screen (STOCK vertical pager, 24 rows/page)
- [x] Voice search with OpenAI Whisper STT
- [x] Dark theme login page with manual code fallback UI
- [x] Backend layout CRUD + voice transcription endpoints
- [x] Deployment health check passed

## Upcoming Tasks
- [ ] (P0) Smart Filter - Category shortcuts + keyword search
- [ ] (P1) Parchi - Full calculation logic, dynamic charges, GST
- [ ] (P2) Inventory Tab - Master stock list with timestamp
- [ ] (P2) Voice Output - "Speak" button
- [ ] (P2) Parchi Log screen
- [ ] (P2) Layout Builder (advanced visual config)
- [ ] (P3) Refactor parchi.tsx (900+ lines)
