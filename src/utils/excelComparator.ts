import { 
  ExcelFile, 
  ExcelSheet, 
  ExcelRow, 
  ExcelCell 
} from './excelTypes';
import { 
  ExcelFileDiff, 
  ExcelSheetDiff, 
  ExcelRowDiff, 
  ExcelCellDiff, 
  ExcelDiffOptions, 
  ExcelDiffResult 
} from './excelDiffTypes';

/**
 * Excel 差异比较工具类
 */
export class ExcelComparator {
  
  /**
   * 比较两个 Excel 文件
   */
  public static async compareFiles(
    oldFile: ExcelFile, 
    newFile: ExcelFile, 
    options: ExcelDiffOptions = {}
  ): Promise<ExcelDiffResult> {
    const startTime = Date.now();
    
    try {
      const defaultOptions: ExcelDiffOptions = {
        ignoreEmptyCells: true,
        ignoreWhitespace: true,
        caseSensitive: false,
        compareFormulas: false,
        maxRows: 10000,
        maxCols: 1000
      };
      
      const mergedOptions = { ...defaultOptions, ...options };
      
      // 比较工作表
      const sheetDiffs = this.compareSheets(
        oldFile.sheets, 
        newFile.sheets, 
        mergedOptions
      );
      
      // 计算汇总信息
      const summary = this.calculateSummary(sheetDiffs);
      
      const result: ExcelFileDiff = {
        oldFile,
        newFile,
        sheetDiffs,
        summary
      };
      
      const processingTime = Date.now() - startTime;
      
      return {
        success: true,
        diff: result,
        processingTime
      };
      
    } catch (error) {
      return {
        success: false,
        error: `比较失败: ${error instanceof Error ? error.message : String(error)}`,
        processingTime: Date.now() - startTime
      };
    }
  }
  
  /**
   * 比较工作表数组
   */
  private static compareSheets(
    oldSheets: ExcelSheet[], 
    newSheets: ExcelSheet[], 
    options: ExcelDiffOptions
  ): ExcelSheetDiff[] {
    const sheetDiffs: ExcelSheetDiff[] = [];
    const oldSheetMap = new Map(oldSheets.map(sheet => [sheet.name, sheet]));
    const newSheetMap = new Map(newSheets.map(sheet => [sheet.name, sheet]));
    
    // 检查所有工作表名称
    const allSheetNames = new Set([...oldSheetMap.keys(), ...newSheetMap.keys()]);
    
    for (const sheetName of allSheetNames) {
      const oldSheet = oldSheetMap.get(sheetName);
      const newSheet = newSheetMap.get(sheetName);
      
      let sheetDiff: ExcelSheetDiff;
      
      if (!oldSheet && newSheet) {
        // 新增的工作表
        sheetDiff = {
          sheetName,
          type: 'added',
          rowDiffs: [],
          newSheet,
          summary: {
            addedRows: newSheet.data.length,
            removedRows: 0,
            modifiedRows: 0,
            unchangedRows: 0,
            addedCells: this.countCells(newSheet),
            removedCells: 0,
            modifiedCells: 0
          }
        };
      } else if (oldSheet && !newSheet) {
        // 删除的工作表
        sheetDiff = {
          sheetName,
          type: 'removed',
          rowDiffs: [],
          oldSheet,
          summary: {
            addedRows: 0,
            removedRows: oldSheet.data.length,
            modifiedRows: 0,
            unchangedRows: 0,
            addedCells: 0,
            removedCells: this.countCells(oldSheet),
            modifiedCells: 0
          }
        };
      } else if (oldSheet && newSheet) {
        // 比较两个工作表
        const rowDiffs = this.compareRows(oldSheet, newSheet, options);
        const summary = this.calculateSheetSummary(rowDiffs);
        
        sheetDiff = {
          sheetName,
          type: this.determineSheetType(rowDiffs),
          rowDiffs,
          oldSheet,
          newSheet,
          summary
        };
      } else {
        continue; // 理论上不会发生
      }
      
      sheetDiffs.push(sheetDiff);
    }
    
    return sheetDiffs;
  }
  
  /**
   * 比较两个工作表的行
   */
  private static compareRows(
    oldSheet: ExcelSheet, 
    newSheet: ExcelSheet, 
    options: ExcelDiffOptions
  ): ExcelRowDiff[] {
    const rowDiffs: ExcelRowDiff[] = [];
    const oldRowMap = new Map(oldSheet.data.map(row => [row.rowIndex, row]));
    const newRowMap = new Map(newSheet.data.map(row => [row.rowIndex, row]));
    
    // 检查所有行索引
    const allRowIndexes = new Set([...oldRowMap.keys(), ...newRowMap.keys()]);
    
    for (const rowIndex of allRowIndexes) {
      const oldRow = oldRowMap.get(rowIndex);
      const newRow = newRowMap.get(rowIndex);
      
      let rowDiff: ExcelRowDiff;
      
      if (!oldRow && newRow) {
        // 新增的行
        rowDiff = {
          rowIndex,
          type: 'added',
          cellDiffs: this.createAddedRowCells(newRow),
          newRow
        };
      } else if (oldRow && !newRow) {
        // 删除的行
        rowDiff = {
          rowIndex,
          type: 'removed',
          cellDiffs: this.createRemovedRowCells(oldRow),
          oldRow
        };
      } else if (oldRow && newRow) {
        // 比较两个行
        const cellDiffs = this.compareCells(oldRow, newRow, options);
        const type = this.determineRowType(cellDiffs);
        
        rowDiff = {
          rowIndex,
          type,
          cellDiffs,
          oldRow,
          newRow
        };
      } else {
        continue; // 理论上不会发生
      }
      
      rowDiffs.push(rowDiff);
    }
    
    return rowDiffs;
  }
  
  /**
   * 比较两个行的单元格
   */
  private static compareCells(
    oldRow: ExcelRow, 
    newRow: ExcelRow, 
    options: ExcelDiffOptions
  ): ExcelCellDiff[] {
    const cellDiffs: ExcelCellDiff[] = [];
    const maxCols = Math.max(oldRow.cells.length, newRow.cells.length);
    
    for (let colIndex = 0; colIndex < maxCols; colIndex++) {
      const oldCell = oldRow.cells[colIndex];
      const newCell = newRow.cells[colIndex];
      
      let cellDiff: ExcelCellDiff;
      
      if (!oldCell && newCell) {
        // 新增的单元格
        cellDiff = {
          rowIndex: oldRow.rowIndex,
          colIndex,
          type: 'added',
          newValue: newCell.value,
          newType: newCell.type,
          newFormula: newCell.formula
        };
      } else if (oldCell && !newCell) {
        // 删除的单元格
        cellDiff = {
          rowIndex: oldRow.rowIndex,
          colIndex,
          type: 'removed',
          oldValue: oldCell.value,
          oldType: oldCell.type,
          oldFormula: oldCell.formula
        };
      } else if (oldCell && newCell) {
        // 比较两个单元格
        const isEqual = this.compareCellValues(oldCell, newCell, options);
        
        cellDiff = {
          rowIndex: oldRow.rowIndex,
          colIndex,
          type: isEqual ? 'unchanged' : 'modified',
          oldValue: oldCell.value,
          newValue: newCell.value,
          oldType: oldCell.type,
          newType: newCell.type,
          oldFormula: oldCell.formula,
          newFormula: newCell.formula
        };
      } else {
        continue; // 理论上不会发生
      }
      
      // 根据选项过滤空单元格
      if (options.ignoreEmptyCells && this.isEmptyCell(cellDiff)) {
        continue;
      }
      
      cellDiffs.push(cellDiff);
    }
    
    return cellDiffs;
  }
  
  /**
   * 比较单元格值是否相等
   */
  private static compareCellValues(
    oldCell: ExcelCell, 
    newCell: ExcelCell, 
    options: ExcelDiffOptions
  ): boolean {
    // 比较类型
    if (oldCell.type !== newCell.type) {
      return false;
    }
    
    // 比较公式
    if (options.compareFormulas) {
      if (oldCell.formula !== newCell.formula) {
        return false;
      }
    }
    
    // 比较值
    let oldValue = oldCell.value;
    let newValue = newCell.value;
    
    // 处理空值
    if (this.isEmptyValue(oldValue) && this.isEmptyValue(newValue)) {
      return true;
    }
    
    // 处理字符串
    if (typeof oldValue === 'string' && typeof newValue === 'string') {
      if (options.ignoreWhitespace) {
        oldValue = oldValue.trim();
        newValue = newValue.trim();
      }
      if (!options.caseSensitive) {
        oldValue = oldValue.toLowerCase();
        newValue = newValue.toLowerCase();
      }
    }
    
    return oldValue === newValue;
  }
  
  /**
   * 判断单元格是否为空
   */
  private static isEmptyCell(cellDiff: ExcelCellDiff): boolean {
    const oldEmpty = this.isEmptyValue(cellDiff.oldValue);
    const newEmpty = this.isEmptyValue(cellDiff.newValue);
    return oldEmpty && newEmpty;
  }
  
  /**
   * 判断值是否为空
   */
  private static isEmptyValue(value: any): boolean {
    return value === null || value === undefined || value === '' || value === 0;
  }
  
  /**
   * 创建新增行的单元格差异
   */
  private static createAddedRowCells(row: ExcelRow): ExcelCellDiff[] {
    return row.cells.map((cell, colIndex) => ({
      rowIndex: row.rowIndex,
      colIndex,
      type: 'added' as const,
      newValue: cell.value,
      newType: cell.type,
      newFormula: cell.formula
    }));
  }
  
  /**
   * 创建删除行的单元格差异
   */
  private static createRemovedRowCells(row: ExcelRow): ExcelCellDiff[] {
    return row.cells.map((cell, colIndex) => ({
      rowIndex: row.rowIndex,
      colIndex,
      type: 'removed' as const,
      oldValue: cell.value,
      oldType: cell.type,
      oldFormula: cell.formula
    }));
  }
  
  /**
   * 确定工作表类型
   */
  private static determineSheetType(rowDiffs: ExcelRowDiff[]): 'added' | 'removed' | 'modified' | 'unchanged' {
    const hasAdded = rowDiffs.some(diff => diff.type === 'added');
    const hasRemoved = rowDiffs.some(diff => diff.type === 'removed');
    const hasModified = rowDiffs.some(diff => diff.type === 'modified');
    
    if (hasAdded || hasRemoved || hasModified) {
      return 'modified';
    }
    return 'unchanged';
  }
  
  /**
   * 确定行类型
   */
  private static determineRowType(cellDiffs: ExcelCellDiff[]): 'added' | 'removed' | 'modified' | 'unchanged' {
    const hasAdded = cellDiffs.some(diff => diff.type === 'added');
    const hasRemoved = cellDiffs.some(diff => diff.type === 'removed');
    const hasModified = cellDiffs.some(diff => diff.type === 'modified');
    
    if (hasAdded || hasRemoved || hasModified) {
      return 'modified';
    }
    return 'unchanged';
  }
  
  /**
   * 计算工作表汇总信息
   */
  private static calculateSheetSummary(rowDiffs: ExcelRowDiff[]): ExcelSheetDiff['summary'] {
    let addedRows = 0;
    let removedRows = 0;
    let modifiedRows = 0;
    let unchangedRows = 0;
    let addedCells = 0;
    let removedCells = 0;
    let modifiedCells = 0;
    
    for (const rowDiff of rowDiffs) {
      switch (rowDiff.type) {
        case 'added':
          addedRows++;
          addedCells += rowDiff.cellDiffs.length;
          break;
        case 'removed':
          removedRows++;
          removedCells += rowDiff.cellDiffs.length;
          break;
        case 'modified':
          modifiedRows++;
          for (const cellDiff of rowDiff.cellDiffs) {
            switch (cellDiff.type) {
              case 'added':
                addedCells++;
                break;
              case 'removed':
                removedCells++;
                break;
              case 'modified':
                modifiedCells++;
                break;
            }
          }
          break;
        case 'unchanged':
          unchangedRows++;
          break;
      }
    }
    
    return {
      addedRows,
      removedRows,
      modifiedRows,
      unchangedRows,
      addedCells,
      removedCells,
      modifiedCells
    };
  }
  
  /**
   * 计算文件汇总信息
   */
  private static calculateSummary(sheetDiffs: ExcelSheetDiff[]): ExcelFileDiff['summary'] {
    let addedSheets = 0;
    let removedSheets = 0;
    let modifiedSheets = 0;
    let unchangedSheets = 0;
    let totalAddedRows = 0;
    let totalRemovedRows = 0;
    let totalModifiedRows = 0;
    let totalAddedCells = 0;
    let totalRemovedCells = 0;
    let totalModifiedCells = 0;
    
    for (const sheetDiff of sheetDiffs) {
      switch (sheetDiff.type) {
        case 'added':
          addedSheets++;
          break;
        case 'removed':
          removedSheets++;
          break;
        case 'modified':
          modifiedSheets++;
          break;
        case 'unchanged':
          unchangedSheets++;
          break;
      }
      
      totalAddedRows += sheetDiff.summary.addedRows;
      totalRemovedRows += sheetDiff.summary.removedRows;
      totalModifiedRows += sheetDiff.summary.modifiedRows;
      totalAddedCells += sheetDiff.summary.addedCells;
      totalRemovedCells += sheetDiff.summary.removedCells;
      totalModifiedCells += sheetDiff.summary.modifiedCells;
    }
    
    return {
      addedSheets,
      removedSheets,
      modifiedSheets,
      unchangedSheets,
      totalAddedRows,
      totalRemovedRows,
      totalModifiedRows,
      totalAddedCells,
      totalRemovedCells,
      totalModifiedCells
    };
  }
  
  /**
   * 计算工作表中的单元格数量
   */
  private static countCells(sheet: ExcelSheet): number {
    return sheet.data.reduce((total, row) => total + row.cells.length, 0);
  }
}
