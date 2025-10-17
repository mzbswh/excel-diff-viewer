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
        sheets: sheetDiffs,
        oldFileName: oldFile.fileName,
        newFileName: newFile.fileName,
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
        // 新增的工作表 - 创建所有新增行
        const rows: ExcelRowDiff[] = newSheet.data.map(row => ({
          rowIndex: row.rowIndex,
          type: 'added' as const,
          newRow: row.cells
        }));
        
        sheetDiff = {
          sheetName,
          rows,
          stats: {
            added: newSheet.data.length,
            deleted: 0,
            modified: 0,
            unchanged: 0
          }
        };
      } else if (oldSheet && !newSheet) {
        // 删除的工作表 - 创建所有删除行
        const rows: ExcelRowDiff[] = oldSheet.data.map(row => ({
          rowIndex: row.rowIndex,
          type: 'deleted' as const,
          oldRow: row.cells
        }));
        
        sheetDiff = {
          sheetName,
          rows,
          stats: {
            added: 0,
            deleted: oldSheet.data.length,
            modified: 0,
            unchanged: 0
          }
        };
      } else if (oldSheet && newSheet) {
        // 比较两个工作表（行级别）
        const rows = this.compareRowsAsUnits(oldSheet, newSheet, options);
        const stats = this.calculateRowStats(rows);
        
        sheetDiff = {
          sheetName,
          rows,
          stats
        };
      } else {
        continue; // 理论上不会发生
      }
      
      sheetDiffs.push(sheetDiff);
    }
    
    return sheetDiffs;
  }
  
  /**
   * 比较两个工作表的行（行级别比较）
   */
  private static compareRowsAsUnits(
    oldSheet: ExcelSheet, 
    newSheet: ExcelSheet, 
    options: ExcelDiffOptions
  ): ExcelRowDiff[] {
    const rowDiffs: ExcelRowDiff[] = [];
    const oldRowMap = new Map(oldSheet.data.map(row => [row.rowIndex, row]));
    const newRowMap = new Map(newSheet.data.map(row => [row.rowIndex, row]));
    
    // 检查所有行索引
    const allRowIndexes = new Set([...oldRowMap.keys(), ...newRowMap.keys()]);
    
    for (const rowIndex of Array.from(allRowIndexes).sort((a, b) => a - b)) {
      const oldRow = oldRowMap.get(rowIndex);
      const newRow = newRowMap.get(rowIndex);
      
      if (!oldRow && newRow) {
        // 新增的行
        rowDiffs.push({
          rowIndex,
          type: 'added',
          newRow: newRow.cells
        });
      } else if (oldRow && !newRow) {
        // 删除的行
        rowDiffs.push({
          rowIndex,
          type: 'deleted',
          oldRow: oldRow.cells
        });
      } else if (oldRow && newRow) {
        // 比较两个行的所有单元格
        const isRowIdentical = this.areRowsIdentical(oldRow, newRow, options);
        
        if (isRowIdentical) {
          // 行完全相同
          rowDiffs.push({
            rowIndex,
            type: 'unchanged',
            oldRow: oldRow.cells,
            newRow: newRow.cells
          });
        } else {
          // 行有修改 - 找出修改的单元格索引
          const modifiedCells = this.findModifiedCells(oldRow, newRow, options);
          rowDiffs.push({
            rowIndex,
            type: 'modified',
            oldRow: oldRow.cells,
            newRow: newRow.cells,
            modifiedCells
          });
        }
      }
    }
    
    return rowDiffs;
  }

  /**
   * 判断两行是否完全相同
   */
  private static areRowsIdentical(
    oldRow: ExcelRow, 
    newRow: ExcelRow, 
    options: ExcelDiffOptions
  ): boolean {
    const maxCols = Math.max(oldRow.cells.length, newRow.cells.length);
    
    for (let i = 0; i < maxCols; i++) {
      const oldCell = oldRow.cells[i];
      const newCell = newRow.cells[i];
      
      if (!this.areCellsEqual(oldCell, newCell, options)) {
        return false;
      }
    }
    
    return true;
  }

  /**
   * 找出修改的单元格索引
   */
  private static findModifiedCells(
    oldRow: ExcelRow, 
    newRow: ExcelRow, 
    options: ExcelDiffOptions
  ): number[] {
    const modifiedCells: number[] = [];
    const maxCols = Math.max(oldRow.cells.length, newRow.cells.length);
    
    for (let i = 0; i < maxCols; i++) {
      const oldCell = oldRow.cells[i];
      const newCell = newRow.cells[i];
      
      if (!this.areCellsEqual(oldCell, newCell, options)) {
        modifiedCells.push(i);
      }
    }
    
    return modifiedCells;
  }

  /**
   * 判断两个单元格是否相等
   */
  private static areCellsEqual(
    oldCell: ExcelCell | undefined,
    newCell: ExcelCell | undefined,
    options: ExcelDiffOptions
  ): boolean {
    // 如果都为空，认为相等
    if (!oldCell && !newCell) {
      return true;
    }
    
    // 如果一个为空，另一个不为空
    if (!oldCell || !newCell) {
      // 如果忽略空单元格，且为空的单元格确实为空，认为相等
      if (options.ignoreEmptyCells) {
        const cell = oldCell || newCell;
        return this.isCellEmpty(cell);
      }
      return false;
    }
    
    // 都不为空，比较值
    let oldValue = oldCell.value;
    let newValue = newCell.value;
    
    // 如果是字符串，处理空白字符
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
    
    // 比较公式（如果启用）
    if (options.compareFormulas) {
      if (oldCell.formula !== newCell.formula) {
        return false;
      }
    }
    
    return oldValue === newValue;
  }

  /**
   * 判断单元格是否为空
   */
  private static isCellEmpty(cell: ExcelCell): boolean {
    if (!cell) return true;
    if (cell.value === null || cell.value === undefined) return true;
    if (typeof cell.value === 'string' && cell.value.trim() === '') return true;
    return false;
  }

  /**
   * 计算行统计信息
   */
  private static calculateRowStats(rows: ExcelRowDiff[]): {
    added: number;
    deleted: number;
    modified: number;
    unchanged: number;
  } {
    const stats = {
      added: 0,
      deleted: 0,
      modified: 0,
      unchanged: 0
    };
    
    for (const row of rows) {
      switch (row.type) {
        case 'added':
          stats.added++;
          break;
        case 'deleted':
          stats.deleted++;
          break;
        case 'modified':
          stats.modified++;
          break;
        case 'unchanged':
          stats.unchanged++;
          break;
      }
    }
    
    return stats;
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
    let totalAdded = 0;
    let totalDeleted = 0;
    let totalModified = 0;
    
    for (const sheetDiff of sheetDiffs) {
      totalAdded += sheetDiff.stats.added;
      totalDeleted += sheetDiff.stats.deleted;
      totalModified += sheetDiff.stats.modified;
    }
    
    return {
      totalAdded,
      totalDeleted,
      totalModified
    };
  }
  
  /**
   * 计算工作表中的单元格数量
   */
  private static countCells(sheet: ExcelSheet): number {
    return sheet.data.reduce((total, row) => total + row.cells.length, 0);
  }
}
