# Parchi Builder — Product Requirements Document

## Problem Statement
A mobile-first inventory lookup and quotation app for a steel/metal trading business. The app connects to the user's Google Drive to read an inventory Excel file (sheet: "STOCK") and provides a smart filter to look up sizes, check stock, and generate quotation "Parchis".

## User Persona
- **Primary user:** `partharjun04@gmail.com` — a steel trader who needs to quickly look up inventory sizes, calculate rates, and create quotations while on the go.
- **Language:** English UI, Hindi audio output for field use

---

## Core Requirements

### Authentication
- Google OAuth 2.0 for Google Drive access
- Auto-detect existing session on app start and skip login
- "I've Connected" button to check auth status post-browser redirect

### Navigation
- Bottom tab bar: **Home | Filter | Parchi | Inventory | Layout**
- (Recent & Settings accessible via menu/navigation)

### Home Tab
- Shows currently active file info (name, sheet, range) with "Ready" badge
- 4 action cards: Select File, Load Data, Filter Tool, Parchi
- Load Data button fetches from backend `/api/excel/read` and stores in module store
- Saves to Recent files history (AsyncStorage, max 10 entries)

### Smart Size Filter (P0 — Core Feature)
**Input:**
- Multi-line text area for sizes (comma/newline/semicolon separated)
- Basic Rate (numeric) input

**Matching Engine (3-pass):**
1. **Pass 1a** — Exact match: Strip `(xxxMM)` from Column E → normalize → compare with input
   - `"1.5X1X7(1.1MM)"` → strip → `"1.5X1X7"` → matches user input `"1.5X1X7"` ✓
2. **Pass 1b** — Exact match on Col F (mm format, e.g. `"40X25X7"`)
3. **Pass 1c** — Full Col E (normalized) match
4. **Pass 2a** — Tolerance ±5mm: parse user dims vs Col F dims directly
5. **Pass 2b** — Tolerance ±5mm: user dims × 25.4 (inch→mm) vs Col F dims
6. **Pass 2c** — Tolerance ±5mm: user dims vs stripped Col E dims

**Column Mapping (0-indexed, from range start):**
- Col E (index 4): Inch format — `1.5X1X7(1.1MM)`
- Col F (index 5): MM format — `40X25X7`
- Col H (index 7): Size Difference (numeric)
- Col O (index 14): Current Stock (kg)
- Offset calculated automatically from range start column

**Results Display:**
- Card per result: Size name (large/bold) + small speaker icon (30×30 blue)
- 3 data chips: Diff | Stock | Rate (₹)
- Checkbox for selection (multi-select for Parchi)
- "Add X to Parchi" button when items selected

### Parchi (Quotation) System
- Editable Parchi name (tap pencil icon to rename)
- Table: Size | Diff | Rate (tap rate to edit inline)
- Delete individual rows (tap × button)
- Clear All button
- Items persisted in AsyncStorage

### Hindi Audio
- Small speaker icon on each filter result (volume-medium, 18px, in blue chip)
- On press: `{size} डिफरेंस {diff_hindi}, स्टॉक {stock_hindi} किलो`
- numToHindi function handles special rules:
  - 2100 → इक्कीस सौ (N × 100 = N सौ pattern for 100-9999)
  - Full lookup table for 0-99
  - Thousands: N हजार

### Recent Files
- List of last 10 opened files with name, sheet, range, timestamp
- Tap to reload from Google Drive
- Auto-saves when data is loaded via Home or data.tsx

### Settings
- Active data info (file, sheet, range, cache status)
- Clear Data Cache
- Clear Parchi
- Disconnect Google Drive

---

## Architecture

### Frontend
- **Framework:** Expo (React Native) with expo-router v6
- **Navigation:** Stack (root) + Bottom Tabs `(tabs)/`
- **State:** Module-level store (`utils/store.ts`) — fast, no serialization, persists during session
- **Persistence:** AsyncStorage for config, recent files, parchi items
- **Key files:**
  - `app/(tabs)/_layout.tsx` — Tab navigator
  - `app/(tabs)/filter.tsx` — Smart filter (core)
  - `app/(tabs)/parchi.tsx` — Parchi system
  - `app/(tabs)/home.tsx` — Home with load data
  - `app/(tabs)/recent.tsx` — Recent files
  - `app/(tabs)/settings.tsx` — Settings
  - `app/login.tsx` — Google auth
  - `app/index.tsx` — Session check + redirect
  - `utils/store.ts` — Module-level Excel data store

### Backend
- **Framework:** FastAPI (Python)
- **Key endpoints:**
  - `POST /api/session/create`
  - `GET /api/oauth/drive/connect`
  - `GET /api/drive/status`
  - `GET /api/files` — list Drive .xlsx files
  - `POST /api/sheets` — list sheets in file
  - `GET /api/excel/read` — read sheet data
- **Storage:** MongoDB (user sessions + OAuth tokens)

---

## Implemented Features (as of 2026-02-25)

| Feature | Status | Notes |
|---------|--------|-------|
| Google OAuth | ✅ Done | Session-based, works with test user |
| 5-tab navigation | ✅ Done | Home/Recent/Filter/Parchi/Settings |
| Login screen | ✅ Done | Beautiful UI with feature list |
| Home tab | ✅ Done | File info + 4 action cards |
| Smart Size Filter | ✅ Done | 3-pass matching, exact+tolerance |
| Parchi system | ✅ Done | Editable table, AsyncStorage |
| Hindi audio | ✅ Done | expo-speech + numToHindi function |
| Recent files | ✅ Done | AsyncStorage, tap to reload |
| Settings tab | ✅ Done | Disconnect, clear cache/parchi |
| Back button bug fix | ✅ Done | router.back() instead of router.push |
| Module store | ✅ Done | Fast in-memory Excel data store |
| File/Sheet selection | ✅ Done | files.tsx + sheets.tsx stack screens |
| Data viewer | ✅ Done | data.tsx with filter navigation |

---

## Prioritized Backlog

### P0 (Must fix/complete)
- [ ] End-to-end user test with real Excel file to verify filter matching accuracy

### P1 (High value)
- [ ] Export Parchi to PDF/Image
- [ ] Share Parchi via WhatsApp
- [ ] Performance: Cache Excel data in AsyncStorage for offline/quick reload
- [ ] Multiple Parchi management (save/load named parchis)

### P2 (Nice to have)
- [ ] Header detection from Excel (auto-detect column names)
- [ ] Synonym matching for size formats
- [ ] Bulk parchi creation (select all filter results at once)
- [ ] Dark mode support

---

## Known Issues / Limitations
- The Google OAuth app is in "Testing" mode; only `partharjun04@gmail.com` is authorized
- Module store is session-only (cleared on app restart) — user must tap "Load Data" on next open
- Cell range must start from Column A for correct column index calculations
- Hindi audio requires device TTS support for hi-IN language

---

## Session Log

### 2026-02-25 (Current Session)
- Fixed connection issue by simplifying `.env` configuration
- Removed problematic `EXPO_PACKAGER_HOSTNAME` and other unnecessary tunnel variables
- Verified tunnel working: `https://umejvty-anonymous-3000.exp.direct`
- All 5 tabs and Smart Filter logic confirmed working in web view
- **CRITICAL FIX:** Updated rate calculation formula from `Basic Rate + Size Diff` to `Basic Rate + (Size Diff / 1000)`
- **Major Parchi Redesign:**
  - Added full header: Company Name, Location, Date, Vehicle No (all editable)
  - New table columns: S.N., SIZE, PCS, WT(KG), RATE, AMOUNT
  - Auto-calculated TOTAL row
  - Editable footer rows: LOADING, KANTA, GST @18% (default)
  - Footer rows are reorderable (up/down arrows) and deletable
  - Custom rows can be added (Add Row button)
  - GRAND TOTAL auto-calculated with all charges
  - Share buttons: WhatsApp (text) and PDF (expo-print)
- **Status:** Ready for user testing on Android device
