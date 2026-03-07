# Smart Excel Reader ERP - Product Requirements Document

## Original Problem Statement
Mobile-first inventory lookup and quotation app "Excel Reader" connecting to Google Drive to read/interact with Excel files. Evolved into a lightweight ERP with:
- Inventory management
- Sales tracking
- Debtors ledger with payment tracking
- Purchase reordering
- Weight calculator
- Dynamic pricing tool

## Tech Stack
- **Frontend:** Expo (React Native) with Expo Router, Zustand store
- **Backend:** FastAPI (Python) with MongoDB
- **3rd Party:** Google Drive API, Google Sheets API
- **Auth:** Google OAuth via `Linking.openURL` (system browser)
- **Subdomain:** `excel-reader-erp.preview.emergentagent.com`

## Architecture
```
/app
├── backend/
│   ├── .env (MONGO_URL, GOOGLE_*, FRONTEND_URL)
│   ├── server.py (FastAPI with all routes)
│   └── requirements.txt
└── frontend/
    ├── .env (EXPO_PUBLIC_BACKEND_URL)
    ├── app/
    │   ├── _layout.tsx (Root layout)
    │   ├── index.tsx (Login/splash → routes to /(tabs)/home)
    │   ├── files.tsx (File browser - dark themed)
    │   ├── sheets.tsx (Sheet configuration)
    │   ├── sheetview.tsx (Sheet viewer with editable print ranges, P column visible)
    │   └── (tabs)/
    │       ├── _layout.tsx (Tab nav: Home, Inventory, Sales, Pricer, Calc)
    │       ├── home.tsx (Dashboard with low stock widget using E+P columns)
    │       ├── inventory.tsx (Dark themed inventory list)
    │       ├── sales.tsx (Sales tab reading from Sales sheet)
    │       ├── pricer.tsx (Pricer with E column stock names, logo header)
    │       ├── calculator.tsx (Weight calc with toFixed fix)
    │       ├── debtors.tsx (NEW - 3-sheet debtor ledger with payment CRUD)
    │       ├── purchase.tsx (Purchase reorder)
    │       ├── warehouse.tsx (Layout management)
    │       └── filter.tsx (Smart filter - hidden tab)
    └── utils/
        ├── store.ts (Zustand sheet store)
        └── conversions.ts (Weight/length conversion engine)
```

## What's Been Implemented (as of 2026-03-07)

### Core Features
- Google OAuth flow (system browser via Linking.openURL)
- Manual auth code entry fallback
- File listing from Google Drive (.xlsx, .xls, .xlsm)
- Sheet data reading via Excel API
- Session management

### Tabs & Screens
- **Home:** Quick actions grid (9 modules), low stock widget (E col name, P col stock, >1000 filter)
- **Inventory:** Dark-themed item list with search, sort, detail modal
- **Sales:** Sales sheet viewer
- **Pricer:** Basic rate input, E column stock names, size difference pricing, logo header
- **Calculator:** Weight calculator (round/square/rectangle), length converter, NB/OD table
- **Debtors:** 3-tab ledger (Debtors, Bills, Payments) with payment recording via MongoDB
- **Purchase:** Category-based reorder lists (HR, Apollo, Local)
- **SheetView:** Spreadsheet view with P column, editable print page ranges (add/edit/delete/reset)
- **Warehouse:** Layout management
- **Files:** Dark-themed file browser

### Bug Fixes Applied
- `sheet_names` key mismatch (root cause of Pricer/Low Stock failures)
- Auto-redirect from `/(tabs)/filter` → `/(tabs)/home`
- Sales error text ("Debtors" → "Sales")
- Calculator `result.toFixed()` crash (WeightResult object handling)
- Dark theme consistency across inventory and files screens
- Pricer tab icon (Ionicons pricetag instead of text character)

## Key API Endpoints
- `GET /api/` - Health check
- `POST /api/session/create` - Create session
- `GET /api/drive/files` - List Drive files
- `GET /api/drive/file/{id}/sheets` - List sheet names
- `GET /api/excel/read` - Read sheet data
- `POST /api/debtors/payments/record` - Record payment
- `GET /api/debtors/payments/list` - List payments
- `DELETE /api/debtors/payments/{date}` - Delete payment

## Data Source
- Excel files in Google Drive (no local database for inventory data)
- MongoDB used for: sessions, payments, layouts, configs

## Column Mapping (STOCK Sheet)
- A (0): Item code
- E (4): Stock item name
- I (8): Size difference
- M (12): Legacy stock column
- N (13): Additional data
- O (14): Stock quantity
- P (15): Order quantity / reorder amount

## Pending Tasks (Prioritized)

### P1 - High Priority
- Purchase Tab: Multiple reorder list management (create/save/delete/export named lists)
- Navigation improvements: Sticky top nav bar, active tab highlighting

### P2 - Medium Priority
- APK build via EAS (eas.json created)
- PDF/TXT export implementation
- Keyboard shortcuts for navigation
- Breadcrumb navigation within modules

### P3 - Future/Backlog
- Smart Filter category shortcuts
- Performance: Table virtualization for large datasets
- Search bars with autocomplete in all data views

## Known Issues
- Google OAuth `redirect_uri_mismatch`: Requires user to configure their Google Cloud Console with correct redirect URI
- `shadow*` style deprecation warnings in Expo (cosmetic, non-breaking)
- `expo-av` deprecation warning (non-blocking)

## Critical Notes
- **DO NOT change subdomain** from `excel-reader-erp`
- **OAuth redirect URI:** `https://excel-reader-erp.preview.emergentagent.com/api/oauth/drive/callback`
- **Sheet name is STOCK** (not "JGT") for inventory data
- **Mobile OAuth:** Use `Linking.openURL` only, never WebView or expo-auth-session
