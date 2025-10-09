/**
 * Excel 文件数据结构定义
 */

export interface ExcelCell {
  value: any;
  type: 'string' | 'number' | 'boolean' | 'date' | 'formula' | 'error' | 'empty';
  formula?: string;
  comment?: string;
  style?: any;
}

export interface ExcelRow {
  cells: ExcelCell[];
  rowIndex: number;
  height?: number;
}

export interface ExcelSheet {
  name: string;
  data: ExcelRow[];
  range: {
    startRow: number;
    endRow: number;
    startCol: number;
    endCol: number;
  };
  properties?: {
    hidden?: boolean;
    tabColor?: string;
  };
}

export interface ExcelFile {
  fileName: string;
  filePath: string;
  sheets: ExcelSheet[];
  properties?: {
    title?: string;
    subject?: string;
    author?: string;
    created?: Date;
    modified?: Date;
  };
}

export interface ExcelReadOptions {
  sheetNames?: string[];
  cellDates?: boolean;
  cellNF?: boolean;
  cellText?: boolean;
  cellHTML?: boolean;
  includeEmptyRows?: boolean;
  includeEmptyCols?: boolean;
}

export interface ExcelReadResult {
  success: boolean;
  data?: ExcelFile;
  error?: string;
  warnings?: string[];
}
