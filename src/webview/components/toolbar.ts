import { MessageToExtension } from '../../shared/message';

export class Toolbar {
  private app: any;
  private currentDiffMode: 'side-by-side' | 'inline' = 'side-by-side';  // 简化为两种模式
  public currentTheme: 'auto' | 'light' | 'dark' = 'auto'; // 改为 public 以便外部访问

  constructor(app: any) {
    this.app = app;
  }

  public initialize(): void {
    this.loadSettings();
    this.bindEvents();
    this.updateTheme();
    this.updateDiffMode();
  }

  private bindEvents(): void {
    // 工具栏按钮
    document.addEventListener('click', (event) => {
      const target = event.target as HTMLElement;
      
      // 使用 closest 查找最近的按钮，以处理点击按钮内部元素的情况
      const themeToggle = target.closest('#theme-toggle');
      const settingsToggle = target.closest('#settings-toggle');
      const changeFiles = target.closest('#change-files');
      const refreshCompare = target.closest('#refresh-compare');
      const closeSettings = target.closest('#close-settings');
      const resetSettings = target.closest('#reset-settings');
      
      if (themeToggle) {
        this.toggleTheme();
      } else if (settingsToggle) {
        this.toggleSettings();
      } else if (changeFiles) {
        this.changeFiles();
      } else if (refreshCompare) {
        this.refreshComparison();
      } else if (closeSettings) {
        this.closeSettings();
      } else if (resetSettings) {
        this.resetSettings();
      }
    });

    // 设置变更
    document.addEventListener('change', (event) => {
      const target = event.target as HTMLSelectElement;
      
      if (target.id === 'diff-mode') {
        this.changeDiffMode(target.value as any);
      } else if (target.id === 'theme-select') {
        this.changeTheme(target.value as any);
      } else if (target.id === 'highlight-mode') {
        this.changeHighlightMode(target.value as any);
      } else if (target.id === 'font-size') {
        this.changeFontSize(target.value as any);
      }
    });
  }

  private toggleTheme(): void {
    const themes: ('auto' | 'light' | 'dark')[] = ['auto', 'light', 'dark'];
    const currentIndex = themes.indexOf(this.currentTheme);
    const nextIndex = (currentIndex + 1) % themes.length;
    this.changeTheme(themes[nextIndex]);
  }

  private changeTheme(theme: 'auto' | 'light' | 'dark'): void {
    this.currentTheme = theme;
    this.updateTheme();
    this.saveSettings();
  }

  public updateTheme(): void {
    const container = document.getElementById('excel-diff-container');
    const themeIcons = document.querySelectorAll('.theme-icon'); // 查找所有主题图标
    
    if (container) {
      if (this.currentTheme === 'auto') {
        container.removeAttribute('data-theme');
        // 更新所有主题图标
        themeIcons.forEach(icon => {
          icon.textContent = '🌓'; // 自动模式
        });
      } else {
        container.setAttribute('data-theme', this.currentTheme);
        // 更新所有主题图标
        themeIcons.forEach(icon => {
          // 修复：浅色主题=太阳图标，深色主题=月亮图标
          icon.textContent = this.currentTheme === 'light' ? '☀️' : '🌙';
        });
      }
    }
    
    // 更新设置面板中的选择
    const themeSelect = document.getElementById('theme-select') as HTMLSelectElement;
    if (themeSelect) {
      themeSelect.value = this.currentTheme;
    }
  }

  private toggleSettings(): void {
    const settingsPanel = document.getElementById('settings-panel');
    if (settingsPanel) {
      settingsPanel.classList.toggle('hidden');
    }
  }

  private closeSettings(): void {
    const settingsPanel = document.getElementById('settings-panel');
    if (settingsPanel) {
      settingsPanel.classList.add('hidden');
    }
  }

  private changeDiffMode(mode: 'side-by-side' | 'inline'): void {
    this.currentDiffMode = mode;
    this.updateDiffMode();
    this.saveSettings();
  }

  public updateDiffMode(): void {
    // 更新工具栏中的选择
    const diffModeSelect = document.getElementById('diff-mode') as HTMLSelectElement;
    if (diffModeSelect) {
      diffModeSelect.value = this.currentDiffMode;
    }
    
    // 触发 diffTable 重新渲染
    // 通过触发 change 事件通知 diffTable 更新视图
    const event = new Event('diffModeChanged');
    document.dispatchEvent(event);
  }

  private changeHighlightMode(mode: string): void {
    document.body.setAttribute('data-highlight-mode', mode);
    this.saveSettings();
  }

  private changeFontSize(size: string): void {
    const sizeMap: Record<string, string> = {
      'small': '0.8rem',
      'medium': '1rem',
      'large': '1.2rem'
    };
    document.documentElement.style.setProperty('--base-font-size', sizeMap[size]);
    this.saveSettings();
  }

  private changeFiles(): void {
    this.app.showFileSelection();
  }

  private refreshComparison(): void {
    const state = this.app.getState();
    if (state.oldFilePath && state.newFilePath) {
      this.app.postMessage({
        kind: 'startComparison',
        oldFilePath: state.oldFilePath,
        newFilePath: state.newFilePath
      });
    }
  }

  private loadSettings(): void {
    const settings = JSON.parse(localStorage.getItem('excelDiffViewerSettings') || '{}');
    this.currentTheme = settings.theme || 'auto';
    this.currentDiffMode = settings.diffMode || 'side-by-side';
    
    // 应用设置
    const themeSelect = document.getElementById('theme-select') as HTMLSelectElement;
    const diffModeSelect = document.getElementById('diff-mode') as HTMLSelectElement;
    const highlightModeSelect = document.getElementById('highlight-mode') as HTMLSelectElement;
    const fontSizeSelect = document.getElementById('font-size') as HTMLSelectElement;
    
    if (themeSelect) {
      themeSelect.value = this.currentTheme;
    }
    if (diffModeSelect) {
      diffModeSelect.value = this.currentDiffMode;
    }
    if (highlightModeSelect) {
      highlightModeSelect.value = settings.highlightMode || 'enhanced';
    }
    if (fontSizeSelect) {
      fontSizeSelect.value = settings.fontSize || 'medium';
    }
  }

  private saveSettings(): void {
    const highlightModeSelect = document.getElementById('highlight-mode') as HTMLSelectElement;
    const fontSizeSelect = document.getElementById('font-size') as HTMLSelectElement;
    
    const settings = {
      theme: this.currentTheme,
      diffMode: this.currentDiffMode,
      highlightMode: highlightModeSelect ? highlightModeSelect.value : 'enhanced',
      fontSize: fontSizeSelect ? fontSizeSelect.value : 'medium'
    };
    localStorage.setItem('excelDiffViewerSettings', JSON.stringify(settings));
  }

  private resetSettings(): void {
    localStorage.removeItem('excelDiffViewerSettings');
    this.currentTheme = 'auto';
    this.currentDiffMode = 'unified';
    this.loadSettings();
    this.updateTheme();
    this.updateDiffMode();
  }
}
