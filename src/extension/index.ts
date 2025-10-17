import * as vscode from 'vscode';
import { ExcelTestCommands } from '../test/excelTestCommands';
import { Logger } from '../utils/logger';
import { ExcelDiffProvider } from './excelDiffProvider';

// 创建自定义输出通道
let outputChannel: vscode.OutputChannel;

// This method is called when your extension is activated
// Your extension is activated the very first time the command is executed
export function activate(context: vscode.ExtensionContext) {
  // 创建自定义输出通道
  outputChannel = vscode.window.createOutputChannel('Excel Diff Viewer');
  
  // 初始化Logger
  Logger.initialize(outputChannel);
  Logger.info('Excel Diff Viewer extension activated!', 'Extension');

  // 初始化测试命令
  ExcelTestCommands.initialize(outputChannel);

  const helloWorldCommand = vscode.commands.registerCommand('excel-diff-viewer.helloWorld', () => {
    vscode.window.showInformationMessage('Hello World');
  });

  const logCommand = vscode.commands.registerCommand('excel-diff-viewer.showLogs', () => {
    Logger.show();
  });

  const clearLogCommand = vscode.commands.registerCommand('excel-diff-viewer.clearLogs', () => {
    Logger.clear();
    Logger.info('Logs cleared', 'Extension');
  });

  // 注册Excel差异查看器Provider
  const providerCommands = ExcelDiffProvider.registerContributions({
    extensionContext: context,
    webviewPath: 'dist/webview.js'
  });

  // 注册测试命令
  const testCommands = ExcelTestCommands.registerCommands(context);

  context.subscriptions.push(
    helloWorldCommand,
    logCommand, 
    clearLogCommand, 
    ...providerCommands, 
    ...testCommands
  );
}

// This method is called when your extension is deactivated
export function deactivate() {
  if (outputChannel) {
    outputChannel.dispose();
  }
}
