# Smart Excel Reader — Product Requirements Document

## Problem Statement
A mobile-first inventory lookup and quotation app for a steel/metal trading business. The app connects to the user's Google Drive to read an inventory Excel file (sheet: "STOCK") and provides a smart filter to look up sizes, check stock, and generate quotation "Parchis".

## User Persona
- **Primary user:** `partharjun04@gmail.com` — a steel trader who needs to quickly look up inventory sizes, calculate rates, and create quotations while on the go.
- **Language:** English UI, Hindi audio output for field use

---

## Architecture Overview

### Multi-File Registry System (NEW - Completed 2026-02-25)
The app uses a **multi-file registry** architecture:
- **File Registry**: In-memory store (`utils/store.ts`) that holds metadata of all loaded Excel files
- **Home Tab as File Manager**: Users add files from Google Drive, which are registered in the store
- **Decoupled Tabs**: Layout, Filter, Parchi tabs read from the registry, not from Google Drive directly
- **Active File Concept**: One file can be set as "active" for Filter/Parchi operations

---

## Core Requirements

### Authentication
- Google OAuth 2.0 for Google Drive access
- Auto-detect existing session on app start and skip login
- "I've Connected" button to check auth status post-browser redirect

### Navigation
- Bottom tab bar: **Home | Filter | Parchi | Inventory | Layout**
- (Recent & Settings accessible via menu/navigation)

### Home Tab (File Manager - REWRITTEN 2026-02-25)
- **My Files Section**: Shows all registered files with type badges (stock/layout/mixed)
- **Add File Button**: Opens file picker to add files from Google Drive
- **File Cards**: Display file name, type, sheet count. Tap to load, long-press for options
- **Quick Actions Grid**: Filter, Parchi, Inventory, Layout shortcuts
- **Active File Info**: Shows currently active file with sheet and range info
- **Empty State**: Helpful guidance when no files are registered

### Smart Size Filter (P0 — Core Feature)
**Input:**
- Multi-line text area for sizes (comma/newline/semicolon separated)
- Basic Rate (numeric) input

**Matching Engine (3-pass):**
1. **Pass 1a** — Exact match: Strip `(xxxMM)` from Column E → normalize → compare
2. **Pass 1b** — Exact match on Col F (mm format)
3. **Pass 1c** — Full Col E (normalized) match
4. **Pass 2a** — Tolerance ±5mm: parse user dims vs Col F dims
5. **Pass 2b** — Tolerance ±5mm: user dims × 25.4 (inch→mm) vs Col F dims
6. **Pass 2c** — Tolerance ±5mm: user dims vs stripped Col E dims

**Category Shortcuts:**
- `Local` = rows 3-73
- `HR/Coil` = rows 74-109
- `Apollo` = rows 110-147

**Column Mapping (0-indexed, from range start):**
- Col E (index 4): Inch format — `1.5X1X7(1.1MM)`
- Col F (index 5): MM format — `40X25X7`
- Col H (index 7): Size Difference (numeric)
- Col O (index 14): Current Stock (kg)

**Results Display:**
- Card per result: Size name + speaker icon
- 3 data chips: Diff | Stock | Rate (₹)
- Checkbox for selection (multi-select for Parchi)
- "Add X to Parchi" button when items selected

### Parchi (Quotation) System
- Editable Parchi name (tap pencil icon to rename)
- Editable header: Company Name, Location, Date, Vehicle No
- Table: S.N. | SIZE | PCS | WT(KG) | RATE | AMOUNT
- Footer rows: LOADING, KANTA, GST @18% (reorderable, deletable)
- GRAND TOTAL auto-calculated
- Share: WhatsApp, PDF export

### Layout Tab (Warehouse View - REWRITTEN 2026-02-25)
- **File Registry Integration**: Reads from file registry, not Drive directly
- **File Selection**: If multiple layout files, shows picker
- **Layout Types**: JGT and JGI visual grid layouts
- **Rack Grid**: Color-coded by stock level (green >1000kg, yellow low, red empty)
- **Rack Details Modal**: Tap rack to see size, diff, stock info

### Hindi Audio
- Small speaker icon on each filter result
- On press: `{size} डिफरेंस {diff_hindi}, स्टॉक {stock_hindi} किलो`
- numToHindi function handles 0-9999 number conversion

---

## Code Architecture

```
/app
├── backend/
│   └── server.py
└── frontend/
    ├── .env
    ├── app.json
    ├── package.json
    ├── app/
    │   ├── _layout.tsx      # Stack navigator
    │   ├── index.tsx        # Login screen
    │   ├── (tabs)/
    │   │   ├── _layout.tsx  # Tab navigator (5 tabs)
    │   │   ├── home.tsx     # ✅ File Manager (rewritten)
    │   │   ├── filter.tsx   # Smart filter
    │   │   ├── parchi.tsx   # Quotation builder
    │   │   ├── inventory.tsx# Stock list (placeholder)
    │   │   ├── layout.tsx   # ✅ Warehouse view (uses registry)
    │   │   ├── recent.tsx   # Recent files
    │   │   └── settings.tsx # Settings
    │   ├── files.tsx        # Drive file browser
    │   ├── sheets.tsx       # Sheet selector
    │   └── data.tsx         # Data viewer (adds to registry)
    └── utils/
        └── store.ts         # ✅ Multi-file registry store
```

---

## Implemented Features

| Feature | Status | Date |
|---------|--------|------|
| Google OAuth | ✅ Done | - |
| Multi-File Registry | ✅ Done | 2026-02-25 |
| Home Tab File Manager | ✅ Done | 2026-02-25 |
| Layout Tab Registry Integration | ✅ Done | 2026-02-25 |
| 5-tab navigation | ✅ Done | - |
| Smart Size Filter | ✅ Done | - |
| Category Shortcuts | ✅ Done | - |
| Auto-suggestions | ✅ Done | - |
| Parchi system | ✅ Done | - |
| PDF export | ✅ Done | - |
| Hindi audio | ✅ Done | - |
| Recent files | ✅ Done | - |

---

## Prioritized Backlog

### P0 (Immediate)
- [x] Multi-file registry architecture
- [ ] End-to-end user test with real Excel file

### P1 (High Value)
- [ ] Voice Search - Hindi NLP with custom phrase training
- [ ] Visual Layout rendering from Excel data (JGT/JGI grids)
- [ ] Inventory tab full implementation
- [ ] Parchi PDF customization

### P2 (Nice to Have)
- [ ] Parchi Log - saved quotations history
- [ ] Layout Builder - drag-and-drop rack editor
- [ ] Offline caching for Excel data
- [ ] Dark mode support

---

## Technical Notes

### Store Structure (`utils/store.ts`)
```typescript
// File Registry - array of loaded file metadata
ExcelFile {
  fileId, fileName, fileType, sheetNames, hasLayoutSheets, loadedAt
}

// Active Store - currently loaded data for Filter/Parchi
ExcelDataStore {
  data, fileName, fileId, sheetName, cellRange, loadedAt
}

// Layout Store - currently loaded layout data
ExcelDataStore (same structure)
```

### Key APIs
- `POST /api/session/create` - Create session
- `GET /api/oauth/drive/connect` - Google OAuth flow
- `GET /api/files` - List Drive .xlsx files
- `GET /api/excel/read` - Read sheet data

---

## Session Log

### 2026-02-25 (Current Session)
- **COMPLETED: Multi-File Registry Architecture**
  - Rewrote `home.tsx` as file manager with My Files section
  - Added file registry display, Add File button, Quick Actions grid
  - Fixed `layout.tsx` to use file registry instead of Drive calls
  - Fixed AsyncStorage key inconsistency (`sessionId` → `session_id`)
  - All features tested and verified (100% success rate)

### Previous Sessions
- Google OAuth integration
- Smart Filter implementation
- Parchi PDF export
- Hindi audio output
- Connection issue fixes
