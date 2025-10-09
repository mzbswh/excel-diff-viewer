import * as vscode from 'vscode';

/**
 * 通用日志工具类
 */
export class Logger {
	private static _outputChannel: vscode.OutputChannel | undefined;

	/**
	 * 初始化日志输出通道
	 */
	static initialize(outputChannel: vscode.OutputChannel): void {
		this._outputChannel = outputChannel;
	}

	/**
	 * 输出信息日志
	 */
	static info(message: string, component?: string): void {
		this.log('INFO', message, component);
	}

	/**
	 * 输出警告日志
	 */
	static warn(message: string, component?: string): void {
		this.log('WARN', message, component);
	}

	/**
	 * 输出错误日志
	 */
	static error(message: string, component?: string): void {
		this.log('ERROR', message, component);
	}

	/**
	 * 输出调试日志
	 */
	static debug(message: string, component?: string): void {
		this.log('DEBUG', message, component);
	}

	/**
	 * 输出日志到output channel
	 */
	private static log(level: string, message: string, component?: string): void {
		if (!this._outputChannel) {
			return;
		}

		const timestamp = new Date().toISOString();
		const componentTag = component ? `[${component}]` : '';
		const logMessage = `${timestamp} [${level}]${componentTag} ${message}`;
		
		this._outputChannel.appendLine(logMessage);
	}

	/**
	 * 清空日志
	 */
	static clear(): void {
		if (this._outputChannel) {
			this._outputChannel.clear();
		}
	}

	/**
	 * 显示日志面板
	 */
	static show(): void {
		if (this._outputChannel) {
			this._outputChannel.show();
		}
	}
}
