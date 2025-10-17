import { MessageToExtension, MessageToWebview, ExcelDiffViewerState } from '../shared/message';
import { FileSelector } from './components/fileSelector';
import { DiffTable } from './components/diffTable';
import { Toolbar } from './components/toolbar';
import { VirtualScroll } from './utils/virtualScroll';

// 导入样式（会被提取为webview.css）
import './styles/main.css';

// 声明全局类型
declare function acquireVsCodeApi(): any;

declare global {
  interface Window {
    bootstrap: any;
  }
}

class ExcelDiffViewer {
  private vscode: any;
  private state: ExcelDiffViewerState = {};
  private fileSelector!: FileSelector;
  private diffTable: any;
  private toolbar: any;
  private virtualScroll: any;

  constructor() {
    this.vscode = acquireVsCodeApi();
    this.initializeComponents();
    this.setupEventListeners();
    this.initializeApp();
  }

  private initializeComponents(): void {
    // 初始化所有组件（同步加载，减少请求数）
    this.fileSelector = new FileSelector(this);
    this.diffTable = new DiffTable(this);
    this.toolbar = new Toolbar(this);
    this.virtualScroll = new VirtualScroll();
    
    // 初始化 toolbar（绑定事件监听器）
    // 需要在DOM加载后执行
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', () => {
        this.toolbar.initialize();
        this.diffTable.initialize();
      });
    } else {
      // DOM已经加载完成
      setTimeout(() => {
        this.toolbar.initialize();
        this.diffTable.initialize();
      }, 0);
    }
  }

  private setupEventListeners(): void {
    // 监听来自扩展的消息
    window.addEventListener('message', (event: MessageEvent<MessageToWebview>) => {
      this.handleMessage(event.data);
    });

    // 监听DOM加载完成
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', () => {
        this.onDOMReady();
      });
    } else {
      this.onDOMReady();
    }

    // 监听错误返回按钮
    document.addEventListener('click', (event) => {
      const target = event.target as HTMLElement;
      if (target.id === 'error-back') {
        this.showFileSelection();
      }
    });
  }

  private onDOMReady(): void {
    this.fileSelector.initialize();
    this.showFileSelection();
  }

  private initializeApp(): void {
    // 从bootstrap获取初始状态
    if (window.bootstrap) {
      this.updateState(window.bootstrap);
    }
  }

  private async handleMessage(message: MessageToWebview): Promise<void> {
    switch (message.kind) {
      case 'updateState':
        this.updateState(message.state);
        break;
      case 'updateDiff':
        this.updateState({ diff: message.data, loading: false });
        break;
      case 'showLoading':
        this.updateState({ loading: true, error: undefined });
        break;
      case 'showError':
        this.updateState({ error: message.error, loading: false });
        break;
      case 'fileSelected':
        this.fileSelector.handleFileSelected(message.fileType, message.filePath, message.fileName, message.fileSize, message.fileTime);
        break;
      case 'highlightCell':
        this.diffTable.highlightCell(message.rowIndex, message.colIndex);
        break;
    }
  }

  private updateState(newState: Partial<ExcelDiffViewerState>): void {
    this.state = { ...this.state, ...newState };
    this.render();
  }

  private render(): void {
    const { loading, error, diff, oldFilePath, newFilePath } = this.state;

    // 显示/隐藏各个区域
    this.toggleElement('file-selection', !(diff || loading || error));
    this.toggleElement('toolbar', !!(diff && !loading && !error));
    this.toggleElement('loading', !!loading);
    this.toggleElement('error', !!error);
    this.toggleElement('diff-content', !!(diff && !loading && !error));

    if (error) {
      this.showError(error);
    } else if (diff) {
      this.renderDiff(diff, oldFilePath, newFilePath);
    }
  }

  private toggleElement(elementId: string, show: boolean): void {
    const element = document.getElementById(elementId);
    if (element) {
      element.classList.toggle('hidden', !show);
    }
  }

  private showError(error: string): void {
    const errorMessageEl = document.querySelector('.error-message');
    if (errorMessageEl) {
      errorMessageEl.textContent = error;
    }
  }

  private renderDiff(diff: any, oldFilePath?: string, newFilePath?: string): void {
    this.diffTable.render(diff, oldFilePath, newFilePath);
    this.toolbar.updateDiffMode();
  }

  public showFileSelection(): void {
    this.updateState({
      diff: undefined,
      oldFilePath: undefined,
      newFilePath: undefined,
      loading: false,
      error: undefined
    });
  }

  public postMessage(message: MessageToExtension): void {
    if (this.vscode) {
      this.vscode.postMessage(message);
    } else {
      console.error('VS Code API not available');
    }
  }

  public getState(): ExcelDiffViewerState {
    return this.state;
  }

  public getVirtualScroll(): any {
    return this.virtualScroll;
  }
}

// 初始化应用
const app = new ExcelDiffViewer();

// 导出给其他模块使用
export { ExcelDiffViewer };
export default app;
