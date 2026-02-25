// Global in-memory store for Excel data (fast, no serialization overhead)

export type FileType = 'stock' | 'layout' | 'mixed';

export interface ExcelFile {
  fileId: string;
  fileName: string;
  fileType: FileType;
  sheetNames: string[];
  hasLayoutSheets: boolean;  // Has Inventory_Chart_JGT or JGI
  loadedAt: number;
}

export interface ExcelDataStore {
  data: string[][];
  fileName: string;
  fileId: string;
  sheetName: string;
  cellRange: string;
  loadedAt: number;
}

// File Registry - stores metadata of all loaded files
let _fileRegistry: ExcelFile[] = [];

export const getFileRegistry = () => _fileRegistry;

export const addToFileRegistry = (file: ExcelFile) => {
  // Remove if already exists (update)
  _fileRegistry = _fileRegistry.filter(f => f.fileId !== file.fileId);
  _fileRegistry.push(file);
};

export const removeFromFileRegistry = (fileId: string) => {
  _fileRegistry = _fileRegistry.filter(f => f.fileId !== fileId);
};

export const clearFileRegistry = () => {
  _fileRegistry = [];
};

export const getLayoutFiles = () => {
  return _fileRegistry.filter(f => f.hasLayoutSheets);
};

export const getStockFiles = () => {
  return _fileRegistry.filter(f => f.fileType === 'stock' || f.fileType === 'mixed');
};

// Active Stock Data Store (the currently loaded stock data for filter/parchi)
let _excelStore: ExcelDataStore | null = null;

export const getExcelStore = () => _excelStore;
export const setExcelStore = (store: ExcelDataStore) => { _excelStore = store; };
export const clearExcelStore = () => { _excelStore = null; };

// Active Layout Data Store (the currently loaded layout data)
let _layoutStore: ExcelDataStore | null = null;

export const getLayoutStore = () => _layoutStore;
export const setLayoutStore = (store: ExcelDataStore) => { _layoutStore = store; };
export const clearLayoutStore = () => { _layoutStore = null; };

// Parse start column offset from cell range string (e.g. "A1:Z100" → 0, "C1:Z100" → 2)
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

// Check if file has layout sheets
export function detectFileType(sheetNames: string[]): { type: FileType; hasLayout: boolean } {
  const hasLayoutSheets = sheetNames.some(s => 
    s.includes('Inventory_Chart') || 
    s.toLowerCase().includes('jgt') || 
    s.toLowerCase().includes('jgi')
  );
  
  const hasStockSheet = sheetNames.some(s => 
    s.toLowerCase() === 'stock' || 
    s.toLowerCase().includes('stock')
  );
  
  if (hasLayoutSheets && hasStockSheet) {
    return { type: 'mixed', hasLayout: true };
  } else if (hasLayoutSheets) {
    return { type: 'layout', hasLayout: true };
  } else {
    return { type: 'stock', hasLayout: false };
  }
}
