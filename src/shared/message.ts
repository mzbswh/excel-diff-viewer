import { ExcelFileDiff } from '../utils/excelDiffTypes';

// Extension → Webview 消息类型
export type MessageToWebview = 
  | { kind: 'updateDiff'; data: ExcelFileDiff }
  | { kind: 'showLoading' }
  | { kind: 'showError'; error: string }
  | { kind: 'fileSelected'; fileType: 'old' | 'new'; filePath: string; fileName: string; fileSize?: number; fileTime?: string }
  | { kind: 'highlightCell'; rowIndex: number; colIndex: number }
  | { kind: 'updateState'; state: ExcelDiffViewerState };

// Webview → Extension 消息类型
export type MessageToExtension = 
  | { kind: 'selectFile'; fileType: 'old' | 'new' }
  | { kind: 'fileDropped'; fileType: 'old' | 'new'; filePath: string; fileName: string; fileSize?: number }
  | { kind: 'fileContentDropped'; fileType: 'old' | 'new'; fileName: string; fileSize: number; fileContent: string }
  | { kind: 'startComparison'; oldFilePath: string; newFilePath: string }
  | { kind: 'refresh' }
  | { kind: 'navigateToDiff'; rowIndex: number; colIndex: number }
  | { kind: 'changeFiles' }
  | { kind: 'changeDiffMode'; mode: 'side-by-side' | 'inline' }
  | { kind: 'changeTheme'; theme: 'auto' | 'light' | 'dark' };

// Webview 状态接口
export interface ExcelDiffViewerState {
  diff?: ExcelFileDiff;
  oldFilePath?: string;
  newFilePath?: string;
  error?: string;
  loading?: boolean;
}

// 消息处理器接口
export interface MessageHandler {
  onMessageReceived(message: any): void;
}

// 消息发送器接口
export interface MessageSender {
  postMessage(message: MessageToExtension): void;
}
