import * as XLSX from 'xlsx';
import * as fs from 'fs';
import * as path from 'path';
import { 
  ExcelFile, 
  ExcelSheet, 
  ExcelRow, 
  ExcelCell, 
  ExcelReadOptions, 
  ExcelReadResult 
} from './excelTypes';

/**
 * Excel 文件读取工具类
 */
export class ExcelReader {
  private static readonly SUPPORTED_EXTENSIONS = ['.xlsx', '.xls', '.xlsm', '.xlsb'];

  /**
   * 检查文件是否为支持的 Excel 格式
   */
  public static isExcelFile(filePath: string): boolean {
    const ext = path.extname(filePath).toLowerCase();
    return this.SUPPORTED_EXTENSIONS.includes(ext);
  }

  /**
   * 读取 Excel 文件
   */
  public static async readExcelFile(
    filePath: string, 
    options: ExcelReadOptions = {}
  ): Promise<ExcelReadResult> {
    try {
      // 验证文件路径
      if (!fs.existsSync(filePath)) {
        return {
          success: false,
          error: `文件不存在: ${filePath}`
        };
      }

      // 验证文件格式
      if (!this.isExcelFile(filePath)) {
        return {
          success: false,
          error: `不支持的文件格式: ${path.extname(filePath)}`
        };
      }

      // 读取文件
      const buffer = fs.readFileSync(filePath);
      const workbook = XLSX.read(buffer, {
        type: 'buffer',
        cellDates: options.cellDates || true,
        cellNF: options.cellNF || false,
        cellText: options.cellText || false,
        cellHTML: options.cellHTML || false
      });

      // 解析工作表
      const sheets: ExcelSheet[] = [];
      const sheetNames = options.sheetNames || workbook.SheetNames;

      for (const sheetName of sheetNames) {
        if (workbook.Sheets[sheetName]) {
          const sheet = this.parseSheet(workbook.Sheets[sheetName], sheetName, options);
          if (sheet) {
            sheets.push(sheet);
          }
        }
      }

      // 构建结果
      const result: ExcelFile = {
        fileName: path.basename(filePath),
        filePath: filePath,
        sheets: sheets,
        properties: this.extractProperties(workbook.Props)
      };

      return {
        success: true,
        data: result
      };

    } catch (error) {
      return {
        success: false,
        error: `读取 Excel 文件失败: ${error instanceof Error ? error.message : String(error)}`
      };
    }
  }

  /**
   * 解析单个工作表
   */
  private static parseSheet(
    worksheet: XLSX.WorkSheet, 
    sheetName: string, 
    options: ExcelReadOptions
  ): ExcelSheet | null {
    try {
      // 获取工作表范围
      const range = XLSX.utils.decode_range(worksheet['!ref'] || 'A1');
      
      // 解析数据
      const data: ExcelRow[] = [];
      
      for (let rowIndex = range.s.r; rowIndex <= range.e.r; rowIndex++) {
        const row: ExcelRow = {
          cells: [],
          rowIndex: rowIndex
        };

        for (let colIndex = range.s.c; colIndex <= range.e.c; colIndex++) {
          const cellAddress = XLSX.utils.encode_cell({ r: rowIndex, c: colIndex });
          const cell = worksheet[cellAddress];
          
          const excelCell = this.parseCell(cell, cellAddress);
          row.cells.push(excelCell);
        }

        // 检查是否为空行
        const isEmptyRow = row.cells.every(cell => cell.type === 'empty');
        if (!isEmptyRow || options.includeEmptyRows) {
          data.push(row);
        }
      }

      return {
        name: sheetName,
        data: data,
        range: {
          startRow: range.s.r,
          endRow: range.e.r,
          startCol: range.s.c,
          endCol: range.e.c
        },
        properties: {
          hidden: worksheet['!hidden'] || false,
          tabColor: worksheet['!tabColor']
        }
      };

    } catch (error) {
      console.error(`解析工作表 ${sheetName} 失败:`, error);
      return null;
    }
  }

  /**
   * 解析单个单元格
   */
  private static parseCell(cell: XLSX.CellObject | undefined, address: string): ExcelCell {
    if (!cell) {
      return {
        value: '',
        type: 'empty'
      };
    }

    let value = cell.v;
    let type: ExcelCell['type'] = 'string';

    // 判断单元格类型
    const cellType = cell.t as string;
    if (cellType === 'n') {
      type = 'number';
    } else if (cellType === 'b') {
      type = 'boolean';
    } else if (cellType === 'd') {
      type = 'date';
    } else if (cellType === 'e') {
      type = 'error';
    } else if (cellType === 'f') {
      type = 'formula';
    } else if (cellType === 's') {
      type = 'string';
    } else if (value === null || value === undefined || value === '') {
      type = 'empty';
    }

    return {
      value: value,
      type: type,
      formula: cell.f,
      comment: cell.c ? String(cell.c) : undefined,
      style: cell.s
    };
  }

  /**
   * 提取文件属性
   */
  private static extractProperties(props: any): ExcelFile['properties'] {
    if (!props) {return undefined;}

    return {
      title: props.Title,
      subject: props.Subject,
      author: props.Author,
      created: props.CreatedDate ? new Date(props.CreatedDate) : undefined,
      modified: props.ModifiedDate ? new Date(props.ModifiedDate) : undefined
    };
  }

  /**
   * 获取工作表名称列表
   */
  public static async getSheetNames(filePath: string): Promise<string[]> {
    try {
      const buffer = fs.readFileSync(filePath);
      const workbook = XLSX.read(buffer, { type: 'buffer' });
      return workbook.SheetNames;
    } catch (error) {
      console.error('获取工作表名称失败:', error);
      return [];
    }
  }

  /**
   * 验证 Excel 文件完整性
   */
  public static async validateExcelFile(filePath: string): Promise<{ valid: boolean; error?: string }> {
    try {
      const buffer = fs.readFileSync(filePath);
      const workbook = XLSX.read(buffer, { type: 'buffer' });
      
      if (!workbook.SheetNames || workbook.SheetNames.length === 0) {
        return { valid: false, error: '文件不包含任何工作表' };
      }

      return { valid: true };
    } catch (error) {
      return { 
        valid: false, 
        error: `文件验证失败: ${error instanceof Error ? error.message : String(error)}` 
      };
    }
  }
}
