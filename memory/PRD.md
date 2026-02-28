# Smart Excel Reader — Product Requirements Document

## Problem Statement
Build a mobile-first inventory lookup and quotation app that connects to Google Drive to read Excel files, manage a sheet library, provide visual warehouse layouts, weight/length calculators, and purchase order management.

## Tech Stack
- **Frontend:** React Native (Expo), Expo Router, Zustand
- **Backend:** FastAPI (Python), MongoDB
- **3rd Party:** Google Drive API, OpenAI Whisper (emergentintegrations)

## Navigation (Bottom Tabs)
| Tab | Screen | Description |
|-----|--------|-------------|
| Home | home.tsx | Library management + Quick Actions |
| Purchase | purchase.tsx | Purchase order from In Demand sheets |
| Calculator | calculator.tsx | Weight calculator + Length/NB-OD converter |
| Inventory | inventory.tsx | Master stock list |
| Layout | layout.tsx | Visual warehouse rack layout |

**Hidden (via Quick View):** Filter (filter.tsx), Parchi (parchi.tsx), Sheet View (sheetview.tsx)

## Completed Features (as of 28 Feb 2026)

### Core
- [x] Google OAuth with dual approach (browser redirect + manual code fallback)
- [x] Sheet Library system (add, save, switch profiles)
- [x] Home Quick Actions: Purchase, Calculator, Layout, Smart Filter, Parchi, Sheet View

### Weight Calculator (NEW)
- [x] Shape-first flow: Square / Rectangle / Round
- [x] Unit-first selection: dimension unit (mm/inch), thickness unit (mm/inch, default mm)
- [x] Input fields with unit labels (e.g., "Side (inch)")
- [x] Length unit picker: mm / inch / m / feet
- [x] Internal normalization: all dimensions → mm, length → meters
- [x] Weight formulas: Square, Rectangle, Round (density = 0.00785)
- [x] Share result via native share sheet

### Length / NB-OD Converter (NEW)
- [x] 7 length units: mm, cm, m, inch, feet, NB, OD
- [x] NB↔OD pipe standard lookup table (11 entries: 15-150 NB)
- [x] Nearest NB suggestion from OD input
- [x] Convert button with result display
- [x] NB/OD reference table in UI

### Purchase Tab (NEW)
- [x] Reads from saved library file (no file picker)
- [x] Category selector: HR / Apollo / Local → loads respective "In Demand" sheet
- [x] Table: checkbox, Item, Current, Ideal, Order (editable)
- [x] Highlight items where Current < Ideal (red tint)
- [x] "Show only items needing order" toggle
- [x] Selected items horizontal chip panel
- [x] Export: Share List (native share) + Export PDF
- [x] Load once, cache in memory, switch category = switch view

### Layout Improvements (NEW)
- [x] Rack search bar at top (real-time filtering, highlight match)
- [x] Short item names on rack cards (e.g., SDF(2.5MM), MSS(3MM), P(40NB))
- [x] Compact/Detail mode toggle
- [x] Auto-abbreviation: first letters of words + thickness notation
- [x] Edit mode + version management (save/load/delete custom layouts)

### Central Conversion Engine (utils/conversions.ts)
- [x] NB_OD_TABLE: 15→21.34, 20→26.67, 25→33.40, 32→42.16, 40→48.26, 50→60.33, 65→73.03, 80→88.90, 100→114.30, 125→139.70, 150→168.30
- [x] toMM/fromMM: convert any unit through mm base
- [x] calcWeight: handles all 3 shapes with proper unit conversion
- [x] shortItemName: auto-generates abbreviated display names
- [x] Reusable across Calculator, Filter, Layout

### Other Completed
- [x] Visual Layout (JGT + JGI grids, rack tap dialog, stock coloring)
- [x] Voice search with OpenAI Whisper STT (Hindi)
- [x] Sheet View (STOCK vertical pager, 24 rows/page)
- [x] OAuth callback returns HTML page (fixes 404 on deployed apps)
- [x] Dark theme throughout

## Upcoming Tasks
- [ ] (P0) Smart Filter - Category shortcuts (Local, HR) + keyword search
- [ ] (P1) Parchi - Full calculation logic, dynamic charges, GST
- [ ] (P2) Voice Output - "Speak" button on results
- [ ] (P2) Parchi Log screen
- [ ] (P3) Refactor parchi.tsx (900+ lines)

## File Structure
```
/app
├── backend/
│   ├── server.py (OAuth, Drive, Layout CRUD, Voice transcribe)
│   ├── .env
│   └── requirements.txt
└── frontend/
    ├── app/
    │   ├── _layout.tsx (Root stack)
    │   ├── login.tsx (OAuth + manual code fallback)
    │   ├── (tabs)/
    │   │   ├── _layout.tsx (5 visible + 4 hidden tabs)
    │   │   ├── home.tsx (Library + 6 Quick Actions)
    │   │   ├── purchase.tsx (Purchase orders)
    │   │   ├── calculator.tsx (Weight + Length/NB-OD)
    │   │   ├── inventory.tsx
    │   │   ├── layout.tsx (Search + short names + versions)
    │   │   ├── filter.tsx (hidden tab)
    │   │   └── parchi.tsx (hidden tab)
    │   └── sheetview.tsx
    └── utils/
        ├── store.ts (Zustand + AsyncStorage)
        └── conversions.ts (Central engine)
```
