/**
 * Excel 差异比较数据结构定义
 */
import { ExcelFile, ExcelSheet, ExcelRow, ExcelCell } from './excelTypes';

export interface ExcelCellDiff {
  rowIndex: number;
  colIndex: number;
  type: 'added' | 'removed' | 'modified' | 'unchanged';
  oldValue?: any;
  newValue?: any;
  oldType?: string;
  newType?: string;
  oldFormula?: string;
  newFormula?: string;
}

export interface ExcelRowDiff {
  rowIndex: number;
  type: 'added' | 'removed' | 'modified' | 'unchanged';
  cellDiffs: ExcelCellDiff[];
  oldRow?: ExcelRow;
  newRow?: ExcelRow;
}

export interface ExcelSheetDiff {
  sheetName: string;
  type: 'added' | 'removed' | 'modified' | 'unchanged';
  rowDiffs: ExcelRowDiff[];
  oldSheet?: ExcelSheet;
  newSheet?: ExcelSheet;
  summary: {
    addedRows: number;
    removedRows: number;
    modifiedRows: number;
    unchangedRows: number;
    addedCells: number;
    removedCells: number;
    modifiedCells: number;
  };
}

export interface ExcelFileDiff {
  oldFile?: ExcelFile;
  newFile?: ExcelFile;
  sheetDiffs: ExcelSheetDiff[];
  summary: {
    addedSheets: number;
    removedSheets: number;
    modifiedSheets: number;
    unchangedSheets: number;
    totalAddedRows: number;
    totalRemovedRows: number;
    totalModifiedRows: number;
    totalAddedCells: number;
    totalRemovedCells: number;
    totalModifiedCells: number;
  };
}

export interface ExcelDiffOptions {
  ignoreEmptyCells?: boolean;
  ignoreWhitespace?: boolean;
  caseSensitive?: boolean;
  compareFormulas?: boolean;
  maxRows?: number;
  maxCols?: number;
}

export interface ExcelDiffResult {
  success: boolean;
  diff?: ExcelFileDiff;
  error?: string;
  warnings?: string[];
  processingTime?: number;
}
