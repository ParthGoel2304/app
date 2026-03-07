# Smart Excel Reader ERP - Product Requirements Document

## Original Problem Statement
Mobile-first inventory lookup and quotation app "Excel Reader" connecting to Google Drive to read/interact with Excel files. Evolved into a lightweight ERP with inventory management, sales tracking, debtors ledger, purchase reordering, weight calculator, and dynamic pricing.

## Tech Stack
- **Frontend:** Expo (React Native) with Expo Router, Zustand store
- **Backend:** FastAPI (Python) with MongoDB
- **3rd Party:** Google Drive API
- **Auth:** Google OAuth via `WebBrowser.openBrowserAsync` (Chrome Custom Tabs)
- **Subdomain:** `excel-reader-erp.preview.emergentagent.com`

## What's Been Implemented (as of 2026-03-07)

### Core Features
- Google OAuth (Chrome Custom Tabs via WebBrowser.openBrowserAsync)
- Manual auth code fallback
- File listing (.xlsx, .xls, .xlsm)
- Sheet data reading, session management

### Tabs (Bottom Nav: Home, Inventory, Pricer, Calc)
- **Home:** 8 quick actions (no Sales), Low Stock with L/HR/A categories from "F.Y. 2025-26 Final"
- **Inventory:** Dark-themed item list with search/sort/detail
- **Pricer:** E column stock names, logo header, size difference pricing
- **Calculator:** Weight calc (round/square/rect), length converter, NB/OD table
- **Debtors:** (via Home) 3-tab: Debtors from "Sales Summary", Bills from "Sales" sheet, Payments CRUD
- **Purchase:** Category-based reorder lists
- **SheetView:** Columns A-P visible, editable print page ranges
- **Sales tab:** REMOVED from nav (hidden, accessible via route only)

### Data Sources
- **STOCK sheet** from JGT file: Inventory, Pricer (A=item, E=stock name, I=size diff, O=stock, P=order qty)
- **"Sales FY. 25-26"** file: Debtors ("Sales Summary": A=name, B=city, C=debt), Bills ("Sales": A-K columns)
- **"F.Y. 2025-26 Final"** file: Low Stock ("L In Demand", "HR In Demand", "A In Demand" sheets, A=name from row 3, B=stock)

### Bug Fixes Applied
- `sheet_names` key mismatch, index redirect, calculator toFixed crash
- OAuth disallowed_useragent → WebBrowser.openBrowserAsync (Chrome Custom Tabs)
- SheetView P column: maxCol limit removed, fetch range auto-extends to P
- Dark theme across all screens

## Key API Endpoints
- `POST /api/debtors/payments/record` - Record payment
- `GET /api/debtors/payments/list` - List payments
- `DELETE /api/debtors/payments/{date}` - Delete payment

## Pending Tasks
### P1
- Purchase Tab: Multi-list management
- Navigation: Sticky top nav, active tab highlighting
### P2
- APK build via EAS
- PDF/TXT export, keyboard shortcuts
### P3
- Table virtualization, search autocomplete
