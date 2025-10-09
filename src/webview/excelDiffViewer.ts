import * as vscode from 'vscode';
import { Disposable } from 'vscode';
import { ExcelFileDiff, ExcelDiffResult } from '../utils/excelDiffTypes';
import { ExcelComparator } from '../utils/excelComparator';
import { ExcelReader } from '../utils/excelReader';
import { Logger } from '../utils/logger';

export interface ExcelDiffViewerState {
	diff?: ExcelFileDiff;
	oldFilePath?: string;
	newFilePath?: string;
	error?: string;
	loading?: boolean;
}

export class ExcelDiffViewerProvider implements Disposable {
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

	async show(oldFilePath: string, newFilePath: string): Promise<void> {
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
			type: 'updateState',
			state: currentState
		});
	}

	private async onMessageReceived(message: any): Promise<void> {
		switch (message.type) {
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
			type: 'highlightCell',
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

				// 发送文件选择结果给webview
				await this.panel.webview.postMessage({
					type: 'fileSelected',
					fileType: fileType,
					filePath: filePath,
					fileName: fileName
				});
			}
		} catch (error) {
			Logger.error(`File selection error: ${error}`, 'ExcelDiffViewer');
			await this.panel.webview.postMessage({
				type: 'error',
				message: `选择文件失败: ${error}`
			});
		}
	}

	private async handleStartComparison(oldFilePath: string, newFilePath: string): Promise<void> {
		await this.show(oldFilePath, newFilePath);
	}

	async showFileSelection(): Promise<void> {
		await this.updateWebview({
			diff: undefined,
			oldFilePath: undefined,
			newFilePath: undefined,
			loading: false,
			error: undefined
		});
	}

	async includeBootstrap(): Promise<ExcelDiffViewerState> {
		return {
			diff: this._currentDiff,
			oldFilePath: this._oldFilePath,
			newFilePath: this._newFilePath,
			loading: false
		};
	}

	includeHead(): string {
		return `
			<meta name="viewport" content="width=device-width, initial-scale=1.0">
			<link rel="stylesheet" href="${this.getResourceUri('excelDiffViewer.css')}">
		`;
	}

	includeBody(): string {
		// HTML结构已经在excelDiffViewer.html中定义
		// 这里只返回空字符串，因为HTML模板已经包含了所有必要的结构
		return '';
	}

	includeEndOfBody(): string {
		return `
			<script src="${this.getResourceUri('excelDiffViewer.js')}"></script>
		`;
	}

	private getResourceUri(fileName: string): vscode.Uri {
		return this.panel.webview.asWebviewUri(
			vscode.Uri.joinPath(this.context.extensionUri, 'src', 'webview', fileName)
		);
	}
}
