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
  type: 'added' | 'deleted' | 'modified' | 'unchanged';
  oldRow?: ExcelCell[];  // 原始行数据（单元格数组）
  newRow?: ExcelCell[];  // 新行数据（单元格数组）
  modifiedCells?: number[];  // 修改的单元格索引
}

export interface ExcelSheetDiff {
  sheetName: string;
  rows: ExcelRowDiff[];  // 行差异数组
  stats: {
    added: number;       // 新增行数
    deleted: number;     // 删除行数
    modified: number;    // 修改行数
    unchanged: number;   // 未变化行数
  };
}

export interface ExcelFileDiff {
  sheets: ExcelSheetDiff[];  // 工作表差异数组
  oldFileName: string;       // 原始文件名
  newFileName: string;       // 新文件名
  summary: {
    totalAdded: number;      // 总新增行数
    totalDeleted: number;    // 总删除行数
    totalModified: number;   // 总修改行数
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
