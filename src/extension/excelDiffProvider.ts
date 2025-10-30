import * as vscode from 'vscode';
import { Disposable } from 'vscode';
import { promises as fsPromises } from 'fs';
import { ExcelFileDiff, ExcelDiffResult } from '../utils/excelDiffTypes';
import { ExcelComparator } from '../utils/excelComparator';
import { ExcelReader } from '../utils/excelReader';
import { Logger } from '../utils/logger';
import { MessageToExtension, MessageToWebview, ExcelDiffViewerState } from '../shared/message';
import { SkeletonBuilder } from './skeleton';
import { GitFileHandler } from '../utils/gitFileHandler';

export interface ExcelDiffProviderArgs {
  extensionContext: vscode.ExtensionContext;
  webviewPath: string;
}

export class ExcelDiffProvider implements Disposable {
  private static readonly viewType = 'excelDiffViewer';
  private static panels: Map<string, vscode.WebviewPanel> = new Map();
  private static selectedFileForCompare: string | undefined = undefined;
  private readonly _disposable: Disposable;
  private _currentDiff?: ExcelFileDiff;
  private _oldFilePath?: string;
  private _newFilePath?: string;

  constructor(
    private readonly context: vscode.ExtensionContext,
    private readonly panel: vscode.WebviewPanel
  ) {
    this._disposable = Disposable.from(
      panel.onDidDispose(() => this.dispose()),
      panel.webview.onDidReceiveMessage(this.onMessageReceived, this)
    );
  }

  dispose(): void {
    this._disposable.dispose();
  }

  // 文件选择状态管理方法
  public static getSelectedFile(): string | undefined {
    return this.selectedFileForCompare;
  }

  public static setSelectedFile(filePath: string | undefined): void {
    this.selectedFileForCompare = filePath;
  }

  public static clearSelectedFile(): void {
    this.selectedFileForCompare = undefined;
  }

  // 文件路径验证方法
  private static isExcelFile(filePath: string): boolean {
    const ext = filePath.toLowerCase();
    return ext.endsWith('.xlsx') || ext.endsWith('.xls') || ext.endsWith('.csv');
  }

  private static async validateFilePath(filePath: string): Promise<boolean> {
    try {
      await fsPromises.access(filePath);
      return this.isExcelFile(filePath);
    } catch {
      return false;
    }
  }

  public static registerContributions(args: ExcelDiffProviderArgs): vscode.Disposable[] {
    return [
      vscode.commands.registerCommand('excel-diff-viewer.openDiffViewer', async () => {
        try {
          Logger.info('Opening Excel Diff Viewer', 'Extension');
          await this.createOrShow(args.extensionContext, undefined, undefined);
        } catch (error) {
          const errorMsg = `打开Excel差异查看器失败: ${error}`;
          vscode.window.showErrorMessage(errorMsg);
          Logger.error(`Error opening diff viewer: ${error}`, 'Extension');
        }
      }),
      vscode.commands.registerCommand('excel-diff-viewer.testWebview', async () => {
        try {
          Logger.info('Testing webview with sample files', 'Extension');
          const oldFile = vscode.Uri.joinPath(args.extensionContext.extensionUri, 'test_datas', 'test_excel_a.xlsx');
          const newFile = vscode.Uri.joinPath(args.extensionContext.extensionUri, 'test_datas', 'test_excel_b.xlsx');
          await this.createOrShow(args.extensionContext, oldFile.fsPath, newFile.fsPath);
        } catch (error) {
          const errorMsg = `测试webview失败: ${error}`;
          vscode.window.showErrorMessage(errorMsg);
          Logger.error(`Error testing webview: ${error}`, 'Extension');
        }
      }),
      vscode.commands.registerCommand('excel-diff-viewer.selectToCompare', (uri: vscode.Uri) => {
        if (!uri || !uri.fsPath) {
          vscode.window.showErrorMessage('无法获取文件路径');
          return;
        }

        // 验证文件格式
        const ext = uri.fsPath.toLowerCase();
        if (!ext.endsWith('.xlsx') && !ext.endsWith('.xls') && !ext.endsWith('.csv')) {
          vscode.window.showErrorMessage('请选择 Excel 文件 (.xlsx, .xls, .csv)');
          return;
        }

        this.setSelectedFile(uri.fsPath);
        const relativePath = vscode.workspace.asRelativePath(uri);
        
        // 使用状态栏消息，3秒后自动消失
        vscode.window.setStatusBarMessage(`✓ 已选择文件: ${relativePath}`, 3000);
        Logger.info(`Selected file for comparison: ${uri.fsPath}`, 'Extension');
      }),
      vscode.commands.registerCommand('excel-diff-viewer.compareWithSelected', async (uri: vscode.Uri) => {
        if (!uri || !uri.fsPath) {
          vscode.window.showErrorMessage('无法获取文件路径');
          return;
        }

        const selectedFile = this.getSelectedFile();
        if (!selectedFile) {
          vscode.window.showWarningMessage('请先右键选择一个文件进行对比');
          return;
        }

        // 验证文件格式
        const ext = uri.fsPath.toLowerCase();
        if (!ext.endsWith('.xlsx') && !ext.endsWith('.xls') && !ext.endsWith('.csv')) {
          vscode.window.showErrorMessage('请选择 Excel 文件 (.xlsx, .xls, .csv)');
          return;
        }

        // 避免选择同一个文件
        if (selectedFile === uri.fsPath) {
          vscode.window.showWarningMessage('不能与同一个文件进行对比');
          return;
        }

        try {
          Logger.info(`Comparing files: ${selectedFile} vs ${uri.fsPath}`, 'Extension');
          
          // 自动打开 diff viewer 并显示对比结果
          await this.createOrShow(args.extensionContext, selectedFile, uri.fsPath);
          
          // 清除选择状态
          this.clearSelectedFile();
        } catch (error) {
          vscode.window.showErrorMessage(`对比文件失败: ${error}`);
          Logger.error(`Error comparing files: ${error}`, 'Extension');
        }
      }),
      vscode.commands.registerCommand('excel-diff-viewer.compareWithGitHead', async (uri: vscode.Uri) => {
        if (!uri || !uri.fsPath) {
          vscode.window.showErrorMessage('无法获取文件路径');
          return;
        }

        Logger.info(`Compare with Git HEAD: ${uri.fsPath}`, 'Extension');

        try {
          // 检查是否在 Git 仓库中
          const isInGit = await GitFileHandler.isInGitRepository(uri);
          if (!isInGit) {
            vscode.window.showWarningMessage('文件不在 Git 仓库中');
            return;
          }

          // 获取 HEAD 版本
          const headVersion = await GitFileHandler.getHeadVersion(uri.fsPath);
          if (!headVersion) {
            vscode.window.showErrorMessage('无法获取文件的 Git HEAD 版本');
            return;
          }

          Logger.info(`HEAD version created: ${headVersion}`, 'Extension');

          // 对比当前文件和 HEAD 版本
          await this.createOrShow(args.extensionContext, headVersion, uri.fsPath);

        } catch (error) {
          vscode.window.showErrorMessage(`对比失败: ${error}`);
          Logger.error(`Error comparing with Git HEAD: ${error}`, 'Extension');
        }
      }),
      vscode.commands.registerCommand('excel-diff-viewer.compareWithGit', async (contextItem: any) => {
        Logger.info(`Compare with Git command triggered`, 'Extension');
        Logger.info(`Context type: ${contextItem?.constructor?.name}`, 'Extension');
        Logger.info(`Context value: ${contextItem?.contextValue}`, 'Extension');

        try {
          let files: { original: string; modified: string } | null = null;

          // 检测是 GitLens 的 CommitFileNode 还是 SCM 资源
          if (contextItem?.contextValue?.includes('gitlens:file')) {
            // GitLens commit file node
            Logger.info(`Detected GitLens commit file node`, 'Extension');
            
            const fileUri = contextItem.uri || contextItem._uri;
            if (!fileUri) {
              vscode.window.showErrorMessage('无法获取文件 URI');
              return;
            }

            const filePath = fileUri.fsPath;
            Logger.info(`File path: ${filePath}`, 'Extension');

            // 检查是否是 Excel 文件
            const excelExtensions = ['.xlsx', '.xls', '.xlsm', '.xlsb', '.csv'];
            const isExcelFile = excelExtensions.some(ext => filePath.toLowerCase().endsWith(ext));
            
            if (!isExcelFile) {
              Logger.info(`Not an Excel file, skipping: ${filePath}`, 'Extension');
              return;
            }

            // 获取 HEAD 版本
            const headVersion = await GitFileHandler.getHeadVersion(filePath);
            
            if (!headVersion) {
              vscode.window.showErrorMessage('无法获取 Git HEAD 版本');
              return;
            }

            files = {
              original: headVersion,
              modified: filePath
            };
          } else {
            // 标准 SCM 资源
            Logger.info(`Detected standard SCM resource`, 'Extension');
            Logger.info(`Resource group type: ${contextItem?._resourceGroupType}`, 'Extension');
            Logger.info(`Resource type: ${contextItem?._type}`, 'Extension');
            
            // 检查资源组类型，跳过未跟踪的文件
            const resourceGroupType = contextItem?._resourceGroupType;
            if (resourceGroupType === 7) {  // 7 通常是 untracked
              Logger.info(`Skipping untracked file`, 'Extension');
              return;
            }
            
            files = await GitFileHandler.getFilesFromScmResource(contextItem);
          }
          
          if (!files) {
            vscode.window.showErrorMessage('无法获取 Git 文件信息');
            return;
          }

          Logger.info(`Comparing: ${files.original} vs ${files.modified}`, 'Extension');

          // 对比
          await this.createOrShow(args.extensionContext, files.original, files.modified);

        } catch (error) {
          vscode.window.showErrorMessage(`对比失败: ${error}`);
          Logger.error(`Error comparing with Git: ${error}`, 'Extension');
        }
      }),
      vscode.commands.registerCommand('excel-diff-viewer.debugContext', async (contextItem: any) => {
        Logger.info(`Debug Context Command Triggered`, 'Extension');
        
        // 安全地提取信息，避免循环引用
        const safeExtract = (obj: any, maxDepth: number = 2, currentDepth: number = 0): any => {
          if (currentDepth >= maxDepth || !obj || typeof obj !== 'object') {
            return String(obj);
          }
          
          const result: any = {};
          try {
            for (const key of Object.keys(obj)) {
              try {
                const value = obj[key];
                if (value === null || value === undefined) {
                  result[key] = String(value);
                } else if (typeof value === 'function') {
                  result[key] = '[Function]';
                } else if (typeof value === 'object') {
                  if (value.constructor?.name) {
                    result[key] = `[${value.constructor.name}]`;
                  } else {
                    result[key] = '[Object]';
                  }
                } else {
                  result[key] = value;
                }
              } catch (e) {
                result[key] = '[Error reading property]';
              }
            }
          } catch (e) {
            return '[Error extracting object]';
          }
          return result;
        };
        
        // 提取关键信息
        const debugInfo = {
          hasContextItem: !!contextItem,
          constructor: contextItem?.constructor?.name,
          contextValue: contextItem?.contextValue,
          viewItem: contextItem?.viewItem,
          resourceUri: contextItem?.resourceUri?.toString(),
          uri: contextItem?.uri?.toString(),
          label: contextItem?.label,
          description: contextItem?.description,
          tooltip: contextItem?.tooltip,
          scheme: contextItem?.resourceUri?.scheme || contextItem?.uri?.scheme,
          path: contextItem?.resourceUri?.path || contextItem?.uri?.path,
          fsPath: contextItem?.resourceUri?.fsPath || contextItem?.uri?.fsPath,
          keys: contextItem ? Object.keys(contextItem).join(', ') : 'N/A',
          topLevelProperties: safeExtract(contextItem, 1)
        };
        
        Logger.info(`Context Debug Info:`, 'Extension');
        Logger.info(`  Constructor: ${debugInfo.constructor}`, 'Extension');
        Logger.info(`  contextValue: ${debugInfo.contextValue}`, 'Extension');
        Logger.info(`  viewItem: ${debugInfo.viewItem}`, 'Extension');
        Logger.info(`  resourceUri: ${debugInfo.resourceUri}`, 'Extension');
        Logger.info(`  uri: ${debugInfo.uri}`, 'Extension');
        Logger.info(`  scheme: ${debugInfo.scheme}`, 'Extension');
        Logger.info(`  path: ${debugInfo.path}`, 'Extension');
        Logger.info(`  fsPath: ${debugInfo.fsPath}`, 'Extension');
        Logger.info(`  label: ${debugInfo.label}`, 'Extension');
        Logger.info(`  Available keys: ${debugInfo.keys}`, 'Extension');
        
        vscode.window.showInformationMessage(
          `Context Debug Info:\n` +
          `contextValue: ${debugInfo.contextValue || 'undefined'}\n` +
          `resourceUri: ${debugInfo.resourceUri || 'undefined'}\n` +
          `Check Output panel for full details`
        );
      })
    ];
  }

  public static async createOrShow(
    context: vscode.ExtensionContext, 
    oldFilePath: string | undefined, 
    newFilePath: string | undefined
  ): Promise<vscode.WebviewPanel> {
    // 如果没有文件路径，使用默认键
    const panelKey = oldFilePath && newFilePath ? `${oldFilePath}|${newFilePath}` : 'file-selection';
    
    // 如果面板已存在，直接显示（复用）
    if (this.panels.has(panelKey)) {
      const panel = this.panels.get(panelKey)!;
      panel.reveal(vscode.ViewColumn.One);
      Logger.info('♻️  Reusing existing panel', 'Performance');
      return panel;
    }

    // 创建新的webview面板
    const panel = vscode.window.createWebviewPanel(
      this.viewType,
      oldFilePath && newFilePath 
        ? `Excel Diff: ${this.getFileName(oldFilePath)} vs ${this.getFileName(newFilePath)}`
        : 'Excel Diff Viewer',
      vscode.ViewColumn.One,
      {
        enableScripts: true,
        retainContextWhenHidden: true, // 保持 webview 状态，避免重新加载
        localResourceRoots: [
          vscode.Uri.joinPath(context.extensionUri, 'dist')
        ]
      }
    );

    // 创建提供者
    const provider = new ExcelDiffProvider(context, panel);

    // 面板关闭时清理
    panel.onDidDispose(() => {
      this.panels.delete(panelKey);
      provider.dispose();
    });

    // 存储面板引用
    this.panels.set(panelKey, panel);

    // 设置webview内容（使用缓存）
    provider.setWebviewContent();

    // 如果有文件路径，开始比较文件；否则显示文件选择界面
    if (oldFilePath && newFilePath) {
      await provider.show(oldFilePath, newFilePath);
    } else {
      // 显示文件选择界面（异步但不阻塞）
      provider.showFileSelection();
    }

    return panel;
  }

  private setWebviewContent(): void {
    const webview = this.panel.webview;
    const cspSource = webview.cspSource;
    const cspNonce = ExcelDiffProvider.generateNonce();
    const webRoot = webview.asWebviewUri(vscode.Uri.joinPath(this.context.extensionUri, 'dist')).toString();

    // 使用skeleton生成HTML（不传递bootstrap数据，使用缓存）
    const html = SkeletonBuilder.buildSkeleton({
      webviewId: 'excelDiffViewer',
      webviewInstanceId: this.panel.viewType,
      cspSource: cspSource,
      cspNonce: cspNonce,
      root: webRoot,
      webRoot: webRoot,
      placement: 'editor',
      bootstrap: undefined  // 不传递初始数据，让webview更快加载
    });

    // 设置webview HTML
    webview.html = html;
  }

  private static generateNonce(): string {
    let text = '';
    const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    for (let i = 0; i < 32; i++) {
      text += possible.charAt(Math.floor(Math.random() * possible.length));
    }
    return text;
  }

  private async getBootstrapData(): Promise<ExcelDiffViewerState> {
    return {
      diff: this._currentDiff,
      oldFilePath: this._oldFilePath,
      newFilePath: this._newFilePath,
      loading: false
    };
  }

  public async show(oldFilePath: string, newFilePath: string): Promise<void> {
    this._oldFilePath = oldFilePath;
    this._newFilePath = newFilePath;
    
    // 显示加载状态
    await this.updateWebview({ loading: true });

    try {
      // 读取Excel文件
      const [oldFileResult, newFileResult] = await Promise.all([
        ExcelReader.readExcelFile(oldFilePath),
        ExcelReader.readExcelFile(newFilePath)
      ]);

      if (!oldFileResult.success || !newFileResult.success) {
        throw new Error(oldFileResult.error || newFileResult.error || '读取文件失败');
      }

      // 比较Excel文件
      const diffResult: ExcelDiffResult = await ExcelComparator.compareFiles(
        oldFileResult.data!, 
        newFileResult.data!
      );

      if (diffResult.success && diffResult.diff) {
        this._currentDiff = diffResult.diff;
        await this.updateWebview({
          diff: diffResult.diff,
          oldFilePath,
          newFilePath,
          loading: false
        });
      } else {
        await this.updateWebview({
          error: diffResult.error || '比较失败',
          oldFilePath,
          newFilePath,
          loading: false
        });
      }
    } catch (error) {
      await this.updateWebview({
        error: error instanceof Error ? error.message : '未知错误',
        oldFilePath,
        newFilePath,
        loading: false
      });
    }
  }

  private async updateWebview(state: Partial<ExcelDiffViewerState>): Promise<void> {
    const currentState: ExcelDiffViewerState = {
      diff: this._currentDiff,
      oldFilePath: this._oldFilePath,
      newFilePath: this._newFilePath,
      ...state
    };

    await this.panel.webview.postMessage({
      kind: 'updateState',
      state: currentState
    });
  }

  private async onMessageReceived(message: MessageToExtension): Promise<void> {
    switch (message.kind) {
      case 'navigateToDiff':
        await this.navigateToDiff(message.rowIndex, message.colIndex);
        break;
      case 'refresh':
        if (this._oldFilePath && this._newFilePath) {
          await this.show(this._oldFilePath, this._newFilePath);
        }
        break;
      case 'selectFile':
        await this.handleFileSelection(message.fileType);
        break;
      case 'fileDropped':
        await this.handleFileDropped(message.fileType, message.filePath, message.fileName, message.fileSize);
        break;
      case 'fileContentDropped':
        await this.handleFileContentDropped(message.fileType, message.fileName, message.fileSize, message.fileContent);
        break;
      case 'startComparison':
        await this.handleStartComparison(message.oldFilePath, message.newFilePath);
        break;
      case 'changeFiles':
        await this.showFileSelection();
        break;
    }
  }

  private async navigateToDiff(rowIndex: number, colIndex: number): Promise<void> {
    // 实现差异导航功能
    await this.panel.webview.postMessage({
      kind: 'highlightCell',
      rowIndex,
      colIndex
    });
  }

  private async handleFileSelection(fileType: 'old' | 'new'): Promise<void> {
    Logger.info(`Handling file selection for: ${fileType}`, 'ExcelDiffViewer');
    try {
      const fileUri = await vscode.window.showOpenDialog({
        canSelectFiles: true,
        canSelectMany: false,
        filters: {
          'Excel Files': ['xlsx', 'xls', 'xlsm', 'xlsb']
        },
        title: `选择${fileType === 'old' ? '第一个' : '第二个'}Excel文件`
      });

      if (fileUri && fileUri.length > 0) {
        const filePath = fileUri[0].fsPath;
        const fileName = filePath.split('/').pop() || filePath;
        Logger.info(`File selected: ${filePath}`, 'ExcelDiffViewer');

        // 获取文件信息
        const stats = await fsPromises.stat(filePath);
        const fileSize = stats.size;
        const fileTime = stats.mtime.toLocaleString('zh-CN', {
          year: 'numeric',
          month: '2-digit',
          day: '2-digit',
          hour: '2-digit',
          minute: '2-digit'
        });

        // 发送文件选择结果给webview
        await this.panel.webview.postMessage({
          kind: 'fileSelected',
          fileType: fileType,
          filePath: filePath,
          fileName: fileName,
          fileSize: fileSize,
          fileTime: fileTime
        });
      }
    } catch (error) {
      Logger.error(`File selection error: ${error}`, 'ExcelDiffViewer');
      await this.panel.webview.postMessage({
        kind: 'showError',
        error: `选择文件失败: ${error}`
      });
    }
  }

  private async handleFileDropped(fileType: 'old' | 'new', filePath: string, fileName: string, fileSize?: number): Promise<void> {
    Logger.info(`Handling dropped file: ${filePath}`, 'ExcelDiffViewer');
    try {
      // 验证文件是否存在
      const stats = await fsPromises.stat(filePath);
      const formattedSize = fileSize || stats.size;
      const fileTime = stats.mtime.toLocaleString('zh-CN');

      // 发送文件信息到 webview
      await this.panel.webview.postMessage({
        kind: 'fileSelected',
        fileType: fileType,
        filePath: filePath,
        fileName: fileName,
        fileSize: formattedSize,
        fileTime: fileTime
      });

      Logger.info(`Dropped file processed: ${fileName}`, 'ExcelDiffViewer');
    } catch (error) {
      Logger.error(`Failed to process dropped file: ${error}`, 'ExcelDiffViewer');
      await this.panel.webview.postMessage({
        kind: 'showError',
        error: `处理拖拽文件失败: ${error}`
      });
    }
  }

  private async handleFileContentDropped(fileType: 'old' | 'new', fileName: string, fileSize: number, fileContent: string): Promise<void> {
    Logger.info(`Handling dropped file content: ${fileName}`, 'ExcelDiffViewer');
    try {
      // 将 Base64 内容转换回 Buffer
      const buffer = Buffer.from(fileContent, 'base64');
      
      // 创建临时文件
      const os = await import('os');
      const path = await import('path');
      const tempDir = os.tmpdir();
      const tempFilePath = path.join(tempDir, `excel-diff-${Date.now()}-${fileName}`);
      
      // 写入临时文件
      await fsPromises.writeFile(tempFilePath, buffer);
      Logger.info(`Temporary file created: ${tempFilePath}`, 'ExcelDiffViewer');
      
      const fileTime = new Date().toLocaleString('zh-CN');

      // 发送文件信息到 webview
      await this.panel.webview.postMessage({
        kind: 'fileSelected',
        fileType: fileType,
        filePath: tempFilePath,
        fileName: fileName,
        fileSize: fileSize,
        fileTime: fileTime
      });

      Logger.info(`Dropped file content processed: ${fileName}`, 'ExcelDiffViewer');
    } catch (error) {
      Logger.error(`Failed to process dropped file content: ${error}`, 'ExcelDiffViewer');
      await this.panel.webview.postMessage({
        kind: 'showError',
        error: `处理拖拽文件失败: ${error}`
      });
    }
  }

  private async handleStartComparison(oldFilePath: string, newFilePath: string): Promise<void> {
    await this.show(oldFilePath, newFilePath);
  }

  public async showFileSelection(): Promise<void> {
    await this.updateWebview({
      diff: undefined,
      oldFilePath: undefined,
      newFilePath: undefined,
      loading: false,
      error: undefined
    });
  }

  private static getFileName(filePath: string | undefined): string {
    if (!filePath) {
      return 'Unknown File';
    }
    return filePath.split('/').pop() || filePath;
  }
}
