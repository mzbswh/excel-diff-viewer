// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import * as vscode from 'vscode';
import { ExcelTestCommands } from './test/excelTestCommands';
import { ExcelReader } from './utils/excelReader';
import { ExcelComparator } from './utils/excelComparator';
import { WebviewController } from './webview/webviewController';
import { Logger } from './utils/logger';

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

	// 在 activate 函数中添加更多命令
	const logCommand = vscode.commands.registerCommand('excel-diff-viewer.showLogs', () => {
		Logger.show();
	});

	const clearLogCommand = vscode.commands.registerCommand('excel-diff-viewer.clearLogs', () => {
		Logger.clear();
		Logger.info('Logs cleared', 'Extension');
	});

	// 注册Excel差异查看器命令
	const openDiffViewerCommand = vscode.commands.registerCommand('excel-diff-viewer.openDiffViewer', async () => {
		try {
			Logger.info('Opening Excel Diff Viewer', 'Extension');
			// 直接打开diff webview，不传递文件路径
			await WebviewController.createOrShow(context, undefined, undefined);
		} catch (error) {
			const errorMsg = `打开Excel差异查看器失败: ${error}`;
			vscode.window.showErrorMessage(errorMsg);
			Logger.error(`Error opening diff viewer: ${error}`, 'Extension');
		}
	});

	// 测试webview命令
	const testWebviewCommand = vscode.commands.registerCommand('excel-diff-viewer.testWebview', async () => {
		try {
			Logger.info('Testing webview with sample files', 'Extension');
			const oldFile = vscode.Uri.joinPath(context.extensionUri, 'test', 'excels', 'test_excel_a.xlsx');
			const newFile = vscode.Uri.joinPath(context.extensionUri, 'test', 'excels', 'test_excel_b.xlsx');
			await WebviewController.createOrShow(context, oldFile.fsPath, newFile.fsPath);
		} catch (error) {
			const errorMsg = `测试webview失败: ${error}`;
			vscode.window.showErrorMessage(errorMsg);
			Logger.error(`Error testing webview: ${error}`, 'Extension');
		}
	});

	// 注册测试命令
	const testCommands = ExcelTestCommands.registerCommands(context);

	context.subscriptions.push(logCommand, clearLogCommand, openDiffViewerCommand, testWebviewCommand, ...testCommands);
}

// This method is called when your extension is deactivated
export function deactivate() {
	if (outputChannel) {
		outputChannel.dispose();
	}
}
