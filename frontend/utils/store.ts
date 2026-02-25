// Sheet Library Store - manages saved sheet profiles and active selection

export type SheetType = 'stock' | 'layout' | 'mixed';

export interface SheetProfile {
  id: string;
  displayName: string;        // User-editable name
  fileName: string;           // Original file name
  fileId: string;             // Google Drive file ID
  sheetName: string;          // Sheet name in Excel
  range: string;              // Cell range (e.g., "A1:Z100")
  sheetType: SheetType;       // Auto-detected type
  data: string[][] | null;    // Cached parsed data (null if not loaded)
  rowCount: number;           // Number of rows
  colCount: number;           // Number of columns
  savedAt: number;            // Timestamp when saved
  lastRefreshed: number;      // Timestamp when data was last fetched
}

// In-memory sheet library
let _sheetLibrary: SheetProfile[] = [];
let _activeSheetId: string | null = null;

// ─── Sheet Library CRUD ─────────────────────────────────────────────────────

export const getSheetLibrary = (): SheetProfile[] => _sheetLibrary;

export const setSheetLibrary = (library: SheetProfile[]): void => {
  _sheetLibrary = library;
};

export const getActiveSheetId = (): string | null => _activeSheetId;

export const setActiveSheetId = (id: string | null): void => {
  _activeSheetId = id;
};

export const getActiveSheet = (): SheetProfile | null => {
  if (!_activeSheetId) return null;
  return _sheetLibrary.find(s => s.id === _activeSheetId) || null;
};

export const addSheetProfile = (profile: SheetProfile): { success: boolean; error?: string } => {
  // Check for duplicate (fileName + sheetName)
  const exists = _sheetLibrary.find(
    s => s.fileName === profile.fileName && s.sheetName === profile.sheetName
  );
  
  if (exists) {
    // Update existing instead of adding duplicate
    _sheetLibrary = _sheetLibrary.map(s => 
      s.id === exists.id ? { ...profile, id: exists.id } : s
    );
    return { success: true };
  }
  
  _sheetLibrary.push(profile);
  return { success: true };
};

export const updateSheetProfile = (id: string, updates: Partial<SheetProfile>): boolean => {
  const index = _sheetLibrary.findIndex(s => s.id === id);
  if (index === -1) return false;
  
  _sheetLibrary[index] = { ..._sheetLibrary[index], ...updates };
  return true;
};

export const removeSheetProfile = (id: string): boolean => {
  const initialLength = _sheetLibrary.length;
  _sheetLibrary = _sheetLibrary.filter(s => s.id !== id);
  
  // Clear active if removed
  if (_activeSheetId === id) {
    _activeSheetId = null;
  }
  
  return _sheetLibrary.length < initialLength;
};

export const clearSheetLibrary = (): void => {
  _sheetLibrary = [];
  _activeSheetId = null;
};

// ─── Sheet Type Detection ───────────────────────────────────────────────────

export const detectSheetType = (sheetName: string, fileName: string): SheetType => {
  const nameLower = sheetName.toLowerCase();
  const fileLower = fileName.toLowerCase();
  
  // Layout sheets
  if (
    nameLower.includes('inventory_chart') ||
    nameLower.includes('jgt') ||
    nameLower.includes('jgi') ||
    nameLower.includes('layout')
  ) {
    return 'layout';
  }
  
  // Stock sheets
  if (
    nameLower === 'stock' ||
    nameLower.includes('stock') ||
    nameLower.includes('inventory')
  ) {
    // Check if file also has layout indicators
    if (fileLower.includes('inventory_system') || fileLower.includes('ms_inventory')) {
      return 'mixed';
    }
    return 'stock';
  }
  
  // Default to stock for unknown
  return 'stock';
};

// ─── Filtered Getters ───────────────────────────────────────────────────────

export const getStockSheets = (): SheetProfile[] => {
  return _sheetLibrary.filter(s => s.sheetType === 'stock' || s.sheetType === 'mixed');
};

export const getLayoutSheets = (): SheetProfile[] => {
  return _sheetLibrary.filter(s => 
    s.sheetType === 'layout' || 
    s.sheetName.toLowerCase().includes('inventory_chart')
  );
};

// ─── Utility ────────────────────────────────────────────────────────────────

export const generateSheetId = (): string => {
  return `sheet_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
};

export const createDisplayName = (fileName: string, sheetName: string): string => {
  // Remove extension from fileName
  const baseName = fileName.replace(/\.xlsx?$/i, '');
  return `${baseName} (${sheetName})`;
};

// ─── Column Offset Calculation ──────────────────────────────────────────────

export function getColOffset(cellRange: string): number {
  try {
    const match = cellRange.match(/^([A-Z]+)/i);
    if (!match) return 0;
    const col = match[1].toUpperCase();
    let num = 0;
    for (let i = 0; i < col.length; i++) {
      num = num * 26 + (col.charCodeAt(i) - 64);
    }
    return num - 1; // 0-indexed offset (A=0, B=1, C=2...)
  } catch {
    return 0;
  }
}

// ─── Legacy Compatibility (for existing Filter/Parchi code) ─────────────────
// These provide backward compatibility with existing code that uses getExcelStore()

export interface ExcelDataStore {
  data: string[][];
  fileName: string;
  fileId: string;
  sheetName: string;
  cellRange: string;
  loadedAt: number;
}

export const getExcelStore = (): ExcelDataStore | null => {
  const active = getActiveSheet();
  if (!active || !active.data) return null;
  
  return {
    data: active.data,
    fileName: active.fileName,
    fileId: active.fileId,
    sheetName: active.sheetName,
    cellRange: active.range,
    loadedAt: active.lastRefreshed,
  };
};

// Set excel store by updating active sheet's data
export const setExcelStore = (store: ExcelDataStore): void => {
  const active = getActiveSheet();
  if (active) {
    updateSheetProfile(active.id, {
      data: store.data,
      lastRefreshed: Date.now(),
    });
  }
};

export const clearExcelStore = (): void => {
  const active = getActiveSheet();
  if (active) {
    updateSheetProfile(active.id, { data: null });
  }
};
