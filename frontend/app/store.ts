// Global in-memory store for Excel data (fast, no serialization overhead)
export interface ExcelDataStore {
  data: string[][];
  fileName: string;
  sheetName: string;
  cellRange: string;
  loadedAt: number;
}

let _excelStore: ExcelDataStore | null = null;

export const getExcelStore = () => _excelStore;
export const setExcelStore = (store: ExcelDataStore) => { _excelStore = store; };
export const clearExcelStore = () => { _excelStore = null; };

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
