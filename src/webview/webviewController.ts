import * as vscode from 'vscode';
import { ExcelDiffViewerProvider } from './excelDiffViewer';

export class WebviewController {
	private static readonly viewType = 'excelDiffViewer';
	private static panels: Map<string, vscode.WebviewPanel> = new Map();

	static async createOrShow(context: vscode.ExtensionContext, oldFilePath: string | undefined, newFilePath: string | undefined): Promise<vscode.WebviewPanel> {
		// 如果没有文件路径，使用默认键
		const panelKey = oldFilePath && newFilePath ? `${oldFilePath}|${newFilePath}` : 'file-selection';
		
		// 如果面板已存在，直接显示
		if (this.panels.has(panelKey)) {
			const panel = this.panels.get(panelKey)!;
			panel.reveal(vscode.ViewColumn.One);
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
				localResourceRoots: [
					vscode.Uri.joinPath(context.extensionUri, 'src', 'webview')
				]
			}
		);

		// 创建提供者
		const provider = new ExcelDiffViewerProvider(context, panel);

		// 面板关闭时清理
		panel.onDidDispose(() => {
			this.panels.delete(panelKey);
			provider.dispose();
		});

		// 存储面板引用
		this.panels.set(panelKey, panel);

		// 设置webview内容（异步进行，不阻塞面板显示）
		this.setWebviewContent(panel, context, provider);

		// 如果有文件路径，开始比较文件；否则显示文件选择界面
		if (oldFilePath && newFilePath) {
			provider.show(oldFilePath, newFilePath);
		} else {
			// 显示文件选择界面
			await provider.showFileSelection();
		}

		return panel;
	}

	private static async setWebviewContent(panel: vscode.WebviewPanel, context: vscode.ExtensionContext, provider: ExcelDiffViewerProvider): Promise<void> {
		const webview = panel.webview;

		// 读取HTML模板
		const htmlPath = vscode.Uri.joinPath(context.extensionUri, 'src', 'webview', 'excelDiffViewer.html');
		const htmlBytes = await vscode.workspace.fs.readFile(htmlPath);
		let html = Buffer.from(htmlBytes).toString('utf-8');

		// 替换token
		html = this.replaceWebviewHtmlTokens(
			html,
			'excelDiffViewer',
			'',
			webview.cspSource,
			'',
			'',
			'',
			'editor',
			await provider.includeBootstrap(),
			provider.includeHead(),
			provider.includeBody(),
			provider.includeEndOfBody()
		);

		// 设置webview HTML
		webview.html = html;
	}

	private static replaceWebviewHtmlTokens(
		html: string,
		webviewId: string,
		webviewInstanceId: string,
		cspSource: string,
		cspNonce: string,
		root: string,
		webRoot: string,
		placement: 'editor' | 'view',
		bootstrap?: any,
		head?: string,
		body?: string,
		endOfBody?: string
	): string {
		return html.replace(
			/#{(head|body|endOfBody|webviewId|webviewInstanceId|placement|cspSource|cspNonce|root|webroot|state)}/g,
			(_substring: string, token: string) => {
				switch (token) {
					case 'head':
						return head ?? '';
					case 'body':
						return body ?? '';
					case 'state':
						return bootstrap !== null ? JSON.stringify(bootstrap) : '';
					case 'endOfBody':
						return `${
							bootstrap !== null
								? `<script type="text/javascript" nonce="${cspNonce}">window.bootstrap=${JSON.stringify(
										bootstrap,
									)};</script>`
								: ''
						}${endOfBody ?? ''}`;
					case 'webviewId':
						return webviewId;
					case 'webviewInstanceId':
						return webviewInstanceId ?? '';
					case 'placement':
						return placement;
					case 'cspSource':
						return cspSource;
					case 'cspNonce':
						return cspNonce;
					case 'root':
						return root;
					case 'webroot':
						return webRoot;
					default:
						return '';
				}
			},
		);
	}

	private static getFileName(filePath: string | undefined): string {
		if (!filePath) {
			return 'Unknown File';
		}
		return filePath.split('/').pop() || filePath;
	}
}
