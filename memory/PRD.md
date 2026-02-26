# Smart Excel Reader — Product Requirements Document

## Problem Statement
A mobile-first inventory lookup and quotation app for a steel/metal trading business. The app connects to the user's Google Drive to read inventory Excel files and provides a smart filter to look up sizes, check stock, and generate quotation "Parchis".

## User Persona
- **Primary user:** `partharjun04@gmail.com` — a steel trader who needs to quickly look up inventory sizes, calculate rates, and create quotations while on the go.
- **Language:** English UI, Hindi audio output for field use

---

## Architecture Overview

### Sheet Library System (Completed 2026-02-25)
The app uses a **Sheet Library** architecture — storing configured sheet profiles, not just files:

```typescript
SheetProfile {
  id: string,              // Unique ID
  displayName: string,     // User-editable name
  fileName: string,        // Original file name
  fileId: string,          // Google Drive file ID
  sheetName: string,       // Sheet name in Excel
  range: string,           // Cell range (e.g., "A1:Z100")
  sheetType: 'stock' | 'layout' | 'mixed',  // Auto-detected
  data: string[][] | null, // Cached data
  rowCount: number,
  colCount: number,
  savedAt: timestamp,
  lastRefreshed: timestamp
}
```

**Key Behaviors:**
1. **Manual Save**: After loading data, user taps "Save to Library" button
2. **Auto-detect Type**: Sheet type detected from sheet name (layout, stock, mixed)
3. **Refresh Data**: Each saved sheet has a refresh button to re-fetch from Drive
4. **Duplicate Prevention**: Same fileName + sheetName updates existing profile

---

## User Experience

### Home Screen
```
┌─────────────────────────────┐
│ Active Sheet Card           │
│ FEB-26-JGT (STOCK)     ✓   │
│ 147 rows • Range: A1:Z100   │
│ [STOCK] Refreshed Feb 25    │
└─────────────────────────────┘

[ + Add File from Drive ]

Saved Sheets (0)
┌─────────────────────────────┐
│ 📄 No Saved Sheets          │
│ Load data and tap           │
│ "Save to Library"           │
└─────────────────────────────┘

Quick Actions
┌───────┐ ┌───────┐
│Filter │ │Parchi │
│(gray) │ │       │
└───────┘ └───────┘
┌───────┐ ┌───────┐
│Invent │ │Layout │
│(gray) │ │       │
└───────┘ └───────┘
```

**Interactions:**
- Tap saved sheet → Set as Active
- Long-press saved sheet → Options (Set Active, Refresh, Rename, Delete)
- Refresh icon → Re-fetch data from Google Drive

### Data Screen (after loading)
```
┌─────────────────────────────┐
│ ← FEB-26-JGT.xlsx           │
│   STOCK • A1:Z100           │
├─────────────────────────────┤
│ 147 rows × 26 cols  [STOCK] │
├─────────────────────────────┤
│   [Table Preview]           │
│                             │
├─────────────────────────────┤
│ [💾 Save to Library]        │  ← Manual button
│                             │
│ [Browse Files] [Filter]     │
└─────────────────────────────┘
```

### Layout Tab
- Reads from Sheet Library (layout-type sheets only)
- Shows "No Sheets Saved" if library empty
- Shows "No Layout Sheets" if no layout-type sheets
- Select sheet → Choose JGT or JGI layout type
- Refresh button to update data from Drive

---

## Navigation
- Bottom tab bar: **Home | Filter | Parchi | Inventory | Layout**
- Recent & Settings accessible via header icons

---

## Core Requirements

### Authentication
- Google OAuth 2.0 for Google Drive access
- Auto-detect existing session on app start

### Smart Size Filter (P0)
**Matching Engine (3-pass):**
1. Exact match on Col E (inch format) or Col F (mm format)
2. Tolerance ±5mm dimension matching
3. Inch-to-mm conversion (×25.4)

**Category Shortcuts:**
- `Local` = rows 3-73
- `HR/Coil` = rows 74-109
- `Apollo` = rows 110-147

**Results:**
- Card per result with speaker icon (Hindi audio)
- Data chips: Diff | Stock | Rate
- Multi-select for Parchi

### Parchi (Quotation) System
- Editable header: Company, Location, Date, Vehicle
- Table: S.N. | SIZE | PCS | WT(KG) | RATE | AMOUNT
- Footer: LOADING, KANTA, GST @18% (reorderable)
- GRAND TOTAL auto-calculated
- Share: WhatsApp, PDF export

### Hindi Audio
- Speaker icon on each result
- Speaks: `{size} डिफरेंस {diff}, स्टॉक {stock} किलो`

---

## Code Architecture

```
/app
├── backend/
│   └── server.py
└── frontend/
    ├── app/
    │   ├── _layout.tsx      # Stack navigator
    │   ├── index.tsx        # Login screen
    │   ├── (tabs)/
    │   │   ├── _layout.tsx  # Tab navigator (5 tabs)
    │   │   ├── home.tsx     # ✅ Sheet Library manager
    │   │   ├── filter.tsx   # Smart filter
    │   │   ├── parchi.tsx   # Quotation builder
    │   │   ├── inventory.tsx# Stock list (placeholder)
    │   │   ├── layout.tsx   # ✅ Warehouse view (uses library)
    │   │   ├── recent.tsx   # Recent files
    │   │   └── settings.tsx # Settings
    │   ├── files.tsx        # Drive file browser
    │   ├── sheets.tsx       # Sheet selector
    │   └── data.tsx         # ✅ Data viewer + Save to Library
    └── utils/
        └── store.ts         # ✅ Sheet Library store
```

---

## Implemented Features

| Feature | Status | Date |
|---------|--------|------|
| Google OAuth | ✅ Done | - |
| Sheet Library System | ✅ Done | 2026-02-25 |
| Home Tab (Sheet Manager) | ✅ Done | 2026-02-25 |
| Save to Library Button | ✅ Done | 2026-02-25 |
| Layout Tab (Library Read) | ✅ Done | 2026-02-25 |
| Sheet Rename/Delete | ✅ Done | 2026-02-25 |
| Sheet Refresh | ✅ Done | 2026-02-25 |
| Auto-detect Sheet Type | ✅ Done | 2026-02-25 |
| 5-tab navigation | ✅ Done | - |
| Smart Size Filter | ✅ Done | - |
| Category Shortcuts | ✅ Done | - |
| Parchi PDF export | ✅ Done | - |
| Hindi audio | ✅ Done | - |

---

## Prioritized Backlog

### P0 (Immediate)
- [x] Sheet Library architecture
- [ ] End-to-end user test with real Excel file

### P1 (High Value)
- [ ] Voice Search - Hindi NLP with phrase training
- [ ] Visual Layout rendering from sheet data
- [ ] Inventory tab full implementation

### P2 (Nice to Have)
- [ ] Parchi Log - saved quotations history
- [ ] Layout Builder - drag-and-drop rack editor
- [ ] Offline mode with AsyncStorage persistence

---

## Session Log

### 2026-02-26 (Current Session)
- **FIX: Folder-restricted Drive access** - Backend now fetches files ONLY from office folder ID: `1Kw96RZVDd0DBUjSblYN2FEElZqRdqTWH`
- **Result**: Only 3 files shown (FEB-26-JGT.xlsx, FEB-26-JGI.xlsx, MS_Inventory_System_FINAL.xlsx)
- **FIX: JGI "S1" rack** - Changed layout grid from "3X1.5X20(S1)" to "S1"
- **FIX: JGT "Others" rack** - Made "Others" a valid rack ID (not filtered as label)
- **FIX: Clean label logic** - Only "Office Side" and "Gate Side" render as labels
- **Temp files filtered** - Backend filters out `~$filename.xlsx` files

### 2026-02-25 (Previous Session)
- **FIX 1-3: Basic Fixes** - Layout column mapping, Drive cache busting, Default tab = Home
- **FIX 4: Multi-Size Rack Support** - Racks can have multiple sizes (duplicates). Dialog shows:
  - Single entry: detailed view (Size, Diff, Stock)
  - Multiple entries: scrollable list with total stock
- **FIX 5: "Others" and "S1" as Valid Racks** - Treated as valid rack IDs, not filtered as labels
- **FIX 6: Clean Grid UI** - Grid shows only rack ID + badge for multiple entries
- **FIX 7: Backend Temp File Filter** - Filters out `~$filename.xlsx` temp files from Drive list

- **COMPLETED: Sheet Library System**
  - Rewrote `store.ts` with SheetProfile type and CRUD operations
  - Rewrote `home.tsx` as sheet library manager
  - Added "Save to Library" button in `data.tsx`
  - Rewrote `layout.tsx` to read from sheet library
  - Implemented: rename, delete, refresh, set active
  - Auto-detection of sheet types (stock/layout/mixed)
  - All features tested: 100% pass rate (9/9 features)

### Previous Work
- Google OAuth integration
- Smart Filter with 3-pass matching
- Category shortcuts (Local, HR, Apollo)
- Parchi PDF export
- Hindi audio output
