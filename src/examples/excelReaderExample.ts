import { ExcelReader } from '../utils/excelReader';
import { ExcelReadOptions } from '../utils/excelTypes';

/**
 * Excel 读取工具使用示例
 */
export class ExcelReaderExample {
  
  /**
   * 基本读取示例
   */
  public static async basicReadExample(filePath: string) {
    console.log('=== Excel 基本读取示例 ===');
    
    // 验证文件
    if (!ExcelReader.isExcelFile(filePath)) {
      console.error('不是有效的 Excel 文件');
      return;
    }

    // 读取文件
    const result = await ExcelReader.readExcelFile(filePath);
    
    if (result.success && result.data) {
      console.log(`文件: ${result.data.fileName}`);
      console.log(`工作表数量: ${result.data.sheets.length}`);
      
      result.data.sheets.forEach((sheet, index) => {
        console.log(`工作表 ${index + 1}: ${sheet.name}`);
        console.log(`  数据行数: ${sheet.data.length}`);
        console.log(`  数据列数: ${sheet.data[0]?.cells.length || 0}`);
        console.log(`  范围: ${sheet.range.startRow}-${sheet.range.endRow}, ${sheet.range.startCol}-${sheet.range.endCol}`);
      });
    } else {
      console.error('读取失败:', result.error);
    }
  }

  /**
   * 高级读取示例
   */
  public static async advancedReadExample(filePath: string) {
    console.log('=== Excel 高级读取示例 ===');
    
    const options: ExcelReadOptions = {
      cellDates: true,
      cellNF: false,
      cellText: false,
      includeEmptyRows: false,
      includeEmptyCols: false
    };

    const result = await ExcelReader.readExcelFile(filePath, options);
    
    if (result.success && result.data) {
      // 显示第一个工作表的前几行数据
      const firstSheet = result.data.sheets[0];
      if (firstSheet && firstSheet.data.length > 0) {
        console.log(`\n${firstSheet.name} 工作表数据预览:`);
        
        // 显示前5行数据
        const previewRows = firstSheet.data.slice(0, 5);
        previewRows.forEach((row, rowIndex) => {
          const rowData = row.cells.map(cell => {
            if (cell.type === 'empty') {return '';}
            return `${cell.value}(${cell.type})`;
          }).join(' | ');
          console.log(`  行 ${rowIndex + 1}: ${rowData}`);
        });
      }
    }
  }

  /**
   * 获取工作表信息示例
   */
  public static async getSheetInfoExample(filePath: string) {
    console.log('=== 获取工作表信息示例 ===');
    
    const sheetNames = await ExcelReader.getSheetNames(filePath);
    console.log('工作表名称:', sheetNames);
    
    const validation = await ExcelReader.validateExcelFile(filePath);
    console.log('文件验证结果:', validation);
  }

  /**
   * 批量处理示例
   */
  public static async batchProcessExample(filePaths: string[]) {
    console.log('=== 批量处理示例 ===');
    
    const results = await Promise.all(
      filePaths.map(async (filePath) => {
        const result = await ExcelReader.readExcelFile(filePath);
        return {
          filePath,
          success: result.success,
          sheetCount: result.data?.sheets.length || 0,
          error: result.error
        };
      })
    );

    console.log('批量处理结果:');
    results.forEach(result => {
      if (result.success) {
        console.log(`✓ ${result.filePath}: ${result.sheetCount} 个工作表`);
      } else {
        console.log(`✗ ${result.filePath}: ${result.error}`);
      }
    });
  }
}
