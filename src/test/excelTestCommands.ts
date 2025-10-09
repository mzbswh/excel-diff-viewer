import * as vscode from 'vscode';
import { ExcelReader } from '../utils/excelReader';
import { ExcelComparator } from '../utils/excelComparator';
import { ExcelDiffOptions } from '../utils/excelDiffTypes';

/**
 * Excel 测试命令集合
 */
export class ExcelTestCommands {
  private static outputChannel: vscode.OutputChannel;

  /**
   * 初始化测试命令
   */
  public static initialize(outputChannel: vscode.OutputChannel) {
    this.outputChannel = outputChannel;
  }

  /**
   * 注册所有测试命令
   */
  public static registerCommands(context: vscode.ExtensionContext): vscode.Disposable[] {
    const disposables: vscode.Disposable[] = [];

    // Excel 读取测试命令
    const testExcelCommand = vscode.commands.registerCommand('excel-diff-viewer.testExcel', async () => {
      await this.testExcelReader();
    });

    // Excel 文件验证测试命令
    const validateExcelCommand = vscode.commands.registerCommand('excel-diff-viewer.validateExcel', async () => {
      await this.testExcelValidation();
    });

    // Excel 工作表信息测试命令
    const sheetInfoCommand = vscode.commands.registerCommand('excel-diff-viewer.sheetInfo', async () => {
      await this.testSheetInfo();
    });

    // Excel 批量处理测试命令
    const batchProcessCommand = vscode.commands.registerCommand('excel-diff-viewer.batchProcess', async () => {
      await this.testBatchProcess();
    });

    // Excel 文件比较测试命令
    const compareFilesCommand = vscode.commands.registerCommand('excel-diff-viewer.compareFiles', async () => {
      await this.testCompareFiles();
    });

    // Excel 快速比较测试命令
    const quickCompareCommand = vscode.commands.registerCommand('excel-diff-viewer.quickCompare', async () => {
      await this.testQuickCompare();
    });

    // Excel 差异选项测试命令
    const compareWithOptionsCommand = vscode.commands.registerCommand('excel-diff-viewer.compareWithOptions', async () => {
      await this.testCompareWithOptions();
    });

    disposables.push(
      testExcelCommand, 
      validateExcelCommand, 
      sheetInfoCommand, 
      batchProcessCommand,
      compareFilesCommand,
      quickCompareCommand,
      compareWithOptionsCommand
    );
    return disposables;
  }

  /**
   * 测试 Excel 读取功能
   */
  private static async testExcelReader() {
    const fileUri = await vscode.window.showOpenDialog({
      canSelectFiles: true,
      canSelectMany: false,
      filters: {
        'Excel Files': ['xlsx', 'xls', 'xlsm', 'xlsb']
      }
    });

    if (fileUri && fileUri[0]) {
      const filePath = fileUri[0].fsPath;
      this.outputChannel.appendLine(`正在读取 Excel 文件: ${filePath}`);
      
      const result = await ExcelReader.readExcelFile(filePath);
      if (result.success && result.data) {
        this.outputChannel.appendLine(`✓ 成功读取文件: ${result.data.fileName}`);
        this.outputChannel.appendLine(`  工作表数量: ${result.data.sheets.length}`);
        result.data.sheets.forEach((sheet, index) => {
          this.outputChannel.appendLine(`  工作表 ${index + 1}: ${sheet.name} (${sheet.data.length} 行)`);
        });
      } else {
        this.outputChannel.appendLine(`✗ 读取失败: ${result.error}`);
      }
      this.outputChannel.show();
    }
  }

  /**
   * 测试 Excel 文件验证功能
   */
  private static async testExcelValidation() {
    const fileUri = await vscode.window.showOpenDialog({
      canSelectFiles: true,
      canSelectMany: false,
      filters: {
        'Excel Files': ['xlsx', 'xls', 'xlsm', 'xlsb']
      }
    });

    if (fileUri && fileUri[0]) {
      const filePath = fileUri[0].fsPath;
      this.outputChannel.appendLine(`正在验证 Excel 文件: ${filePath}`);
      
      // 检查文件格式
      const isExcel = ExcelReader.isExcelFile(filePath);
      this.outputChannel.appendLine(`文件格式检查: ${isExcel ? '✓ 支持' : '✗ 不支持'}`);
      
      // 验证文件完整性
      const validation = await ExcelReader.validateExcelFile(filePath);
      this.outputChannel.appendLine(`文件完整性: ${validation.valid ? '✓ 有效' : '✗ 无效'}`);
      if (!validation.valid) {
        this.outputChannel.appendLine(`  错误: ${validation.error}`);
      }
      
      this.outputChannel.show();
    }
  }

  /**
   * 测试工作表信息获取
   */
  private static async testSheetInfo() {
    const fileUri = await vscode.window.showOpenDialog({
      canSelectFiles: true,
      canSelectMany: false,
      filters: {
        'Excel Files': ['xlsx', 'xls', 'xlsm', 'xlsb']
      }
    });

    if (fileUri && fileUri[0]) {
      const filePath = fileUri[0].fsPath;
      this.outputChannel.appendLine(`正在获取工作表信息: ${filePath}`);
      
      const sheetNames = await ExcelReader.getSheetNames(filePath);
      this.outputChannel.appendLine(`工作表名称: ${sheetNames.join(', ')}`);
      this.outputChannel.appendLine(`工作表数量: ${sheetNames.length}`);
      
      this.outputChannel.show();
    }
  }

  /**
   * 测试批量处理功能
   */
  private static async testBatchProcess() {
    const fileUris = await vscode.window.showOpenDialog({
      canSelectFiles: true,
      canSelectMany: true,
      filters: {
        'Excel Files': ['xlsx', 'xls', 'xlsm', 'xlsb']
      }
    });

    if (fileUris && fileUris.length > 0) {
      this.outputChannel.appendLine(`正在批量处理 ${fileUris.length} 个文件...`);
      
      const results = await Promise.all(
        fileUris.map(async (fileUri) => {
          const result = await ExcelReader.readExcelFile(fileUri.fsPath);
          return {
            fileName: fileUri.fsPath.split('/').pop() || 'unknown',
            success: result.success,
            sheetCount: result.data?.sheets.length || 0,
            error: result.error
          };
        })
      );

      this.outputChannel.appendLine('批量处理结果:');
      results.forEach(result => {
        if (result.success) {
          this.outputChannel.appendLine(`✓ ${result.fileName}: ${result.sheetCount} 个工作表`);
        } else {
          this.outputChannel.appendLine(`✗ ${result.fileName}: ${result.error}`);
        }
      });
      
      this.outputChannel.show();
    }
  }

  /**
   * 测试 Excel 文件比较功能
   */
  private static async testCompareFiles() {
    this.outputChannel.appendLine('=== Excel 文件比较测试 ===');
    
    // 选择第一个文件
    const firstFile = await vscode.window.showOpenDialog({
      canSelectFiles: true,
      canSelectMany: false,
      filters: {
        'Excel Files': ['xlsx', 'xls', 'xlsm', 'xlsb']
      },
      title: '选择第一个 Excel 文件'
    });

    if (!firstFile || firstFile.length === 0) {
      this.outputChannel.appendLine('未选择第一个文件');
      return;
    }

    // 选择第二个文件
    const secondFile = await vscode.window.showOpenDialog({
      canSelectFiles: true,
      canSelectMany: false,
      filters: {
        'Excel Files': ['xlsx', 'xls', 'xlsm', 'xlsb']
      },
      title: '选择第二个 Excel 文件'
    });

    if (!secondFile || secondFile.length === 0) {
      this.outputChannel.appendLine('未选择第二个文件');
      return;
    }

    // 读取文件
    this.outputChannel.appendLine('正在读取文件...');
    const [firstResult, secondResult] = await Promise.all([
      ExcelReader.readExcelFile(firstFile[0].fsPath),
      ExcelReader.readExcelFile(secondFile[0].fsPath)
    ]);

    if (!firstResult.success || !secondResult.success) {
      this.outputChannel.appendLine(`读取文件失败: ${firstResult.error || secondResult.error}`);
      return;
    }

    // 比较文件
    this.outputChannel.appendLine('正在比较文件...');
    const diffResult = await ExcelComparator.compareFiles(
      firstResult.data!,
      secondResult.data!,
      {
        ignoreEmptyCells: true,
        ignoreWhitespace: true,
        caseSensitive: false
      }
    );

    if (!diffResult.success) {
      this.outputChannel.appendLine(`比较失败: ${diffResult.error}`);
      return;
    }

    // 显示比较结果
    this.displayDiffResult(diffResult.diff!);
    this.outputChannel.show();
  }

  /**
   * 测试快速比较功能
   */
  private static async testQuickCompare() {
    this.outputChannel.appendLine('=== Excel 快速比较测试 ===');
    
    // 选择两个文件
    const files = await vscode.window.showOpenDialog({
      canSelectFiles: true,
      canSelectMany: true,
      filters: {
        'Excel Files': ['xlsx', 'xls', 'xlsm', 'xlsb']
      },
      title: '选择要比较的 Excel 文件（最多2个）'
    });

    if (!files || files.length < 2) {
      this.outputChannel.appendLine('请选择至少2个文件进行比较');
      return;
    }

    if (files.length > 2) {
      this.outputChannel.appendLine('只比较前两个文件');
    }

    // 读取并比较
    const [firstResult, secondResult] = await Promise.all([
      ExcelReader.readExcelFile(files[0].fsPath),
      ExcelReader.readExcelFile(files[1].fsPath)
    ]);

    if (!firstResult.success || !secondResult.success) {
      this.outputChannel.appendLine(`读取文件失败: ${firstResult.error || secondResult.error}`);
      return;
    }

    const diffResult = await ExcelComparator.compareFiles(firstResult.data!, secondResult.data!);
    
    if (diffResult.success) {
      this.displayQuickSummary(diffResult.diff!);
    } else {
      this.outputChannel.appendLine(`比较失败: ${diffResult.error}`);
    }
    
    this.outputChannel.show();
  }

  /**
   * 测试带选项的比较功能
   */
  private static async testCompareWithOptions() {
    this.outputChannel.appendLine('=== Excel 带选项比较测试 ===');
    
    // 选择文件
    const files = await vscode.window.showOpenDialog({
      canSelectFiles: true,
      canSelectMany: true,
      filters: {
        'Excel Files': ['xlsx', 'xls', 'xlsm', 'xlsb']
      },
      title: '选择要比较的 Excel 文件（最多2个）'
    });

    if (!files || files.length < 2) {
      this.outputChannel.appendLine('请选择至少2个文件进行比较');
      return;
    }

    // 选择比较选项
    const options = await this.selectCompareOptions();
    if (!options) {
      this.outputChannel.appendLine('用户取消了选项选择');
      return;
    }

    // 读取并比较
    const [firstResult, secondResult] = await Promise.all([
      ExcelReader.readExcelFile(files[0].fsPath),
      ExcelReader.readExcelFile(files[1].fsPath)
    ]);

    if (!firstResult.success || !secondResult.success) {
      this.outputChannel.appendLine(`读取文件失败: ${firstResult.error || secondResult.error}`);
      return;
    }

    this.outputChannel.appendLine(`使用选项: ${JSON.stringify(options, null, 2)}`);
    
    const diffResult = await ExcelComparator.compareFiles(firstResult.data!, secondResult.data!, options);
    
    if (diffResult.success) {
      this.displayDiffResult(diffResult.diff!);
    } else {
      this.outputChannel.appendLine(`比较失败: ${diffResult.error}`);
    }
    
    this.outputChannel.show();
  }

  /**
   * 选择比较选项
   */
  private static async selectCompareOptions(): Promise<ExcelDiffOptions | null> {
    const options: ExcelDiffOptions = {};

    // 忽略空单元格
    const ignoreEmpty = await vscode.window.showQuickPick(
      ['是', '否'],
      { placeHolder: '忽略空单元格？' }
    );
    if (!ignoreEmpty) {return null;}
    options.ignoreEmptyCells = ignoreEmpty === '是';

    // 忽略空白字符
    const ignoreWhitespace = await vscode.window.showQuickPick(
      ['是', '否'],
      { placeHolder: '忽略空白字符？' }
    );
    if (!ignoreWhitespace) {return null;}
    options.ignoreWhitespace = ignoreWhitespace === '是';

    // 大小写敏感
    const caseSensitive = await vscode.window.showQuickPick(
      ['是', '否'],
      { placeHolder: '大小写敏感？' }
    );
    if (!caseSensitive) {return null;}
    options.caseSensitive = caseSensitive === '是';

    // 比较公式
    const compareFormulas = await vscode.window.showQuickPick(
      ['是', '否'],
      { placeHolder: '比较公式？' }
    );
    if (!compareFormulas) {return null;}
    options.compareFormulas = compareFormulas === '是';

    return options;
  }

  /**
   * 显示比较结果
   */
  private static displayDiffResult(diff: any) {
    this.outputChannel.appendLine(`\n=== 比较结果 ===`);
    this.outputChannel.appendLine(`处理时间: ${diff.processingTime || 0}ms`);
    this.outputChannel.appendLine(`\n文件汇总:`);
    this.outputChannel.appendLine(`  新增工作表: ${diff.summary.addedSheets}`);
    this.outputChannel.appendLine(`  删除工作表: ${diff.summary.removedSheets}`);
    this.outputChannel.appendLine(`  修改工作表: ${diff.summary.modifiedSheets}`);
    this.outputChannel.appendLine(`  未变更工作表: ${diff.summary.unchangedSheets}`);
    this.outputChannel.appendLine(`  新增行: ${diff.summary.totalAddedRows}`);
    this.outputChannel.appendLine(`  删除行: ${diff.summary.totalRemovedRows}`);
    this.outputChannel.appendLine(`  修改行: ${diff.summary.totalModifiedRows}`);
    this.outputChannel.appendLine(`  新增单元格: ${diff.summary.totalAddedCells}`);
    this.outputChannel.appendLine(`  删除单元格: ${diff.summary.totalRemovedCells}`);
    this.outputChannel.appendLine(`  修改单元格: ${diff.summary.totalModifiedCells}`);

    this.outputChannel.appendLine(`\n工作表详情:`);
    for (const sheetDiff of diff.sheetDiffs) {
      this.outputChannel.appendLine(`\n  工作表: ${sheetDiff.sheetName} (${sheetDiff.type})`);
      this.outputChannel.appendLine(`    新增行: ${sheetDiff.summary.addedRows}`);
      this.outputChannel.appendLine(`    删除行: ${sheetDiff.summary.removedRows}`);
      this.outputChannel.appendLine(`    修改行: ${sheetDiff.summary.modifiedRows}`);
      this.outputChannel.appendLine(`    未变更行: ${sheetDiff.summary.unchangedRows}`);
      this.outputChannel.appendLine(`    新增单元格: ${sheetDiff.summary.addedCells}`);
      this.outputChannel.appendLine(`    删除单元格: ${sheetDiff.summary.removedCells}`);
      this.outputChannel.appendLine(`    修改单元格: ${sheetDiff.summary.modifiedCells}`);
    }
  }

  /**
   * 显示快速汇总
   */
  private static displayQuickSummary(diff: any) {
    this.outputChannel.appendLine(`\n=== 快速比较结果 ===`);
    this.outputChannel.appendLine(`处理时间: ${diff.processingTime || 0}ms`);
    this.outputChannel.appendLine(`工作表变更: ${diff.summary.addedSheets + diff.summary.removedSheets + diff.summary.modifiedSheets}`);
    this.outputChannel.appendLine(`行变更: ${diff.summary.totalAddedRows + diff.summary.totalRemovedRows + diff.summary.totalModifiedRows}`);
    this.outputChannel.appendLine(`单元格变更: ${diff.summary.totalAddedCells + diff.summary.totalRemovedCells + diff.summary.totalModifiedCells}`);
  }
}
