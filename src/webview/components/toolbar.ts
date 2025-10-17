import { MessageToExtension } from '../../shared/message';

export class Toolbar {
  private app: any;
  private currentDiffMode: 'side-by-side' | 'inline' = 'side-by-side';  // 简化为两种模式
  public currentTheme: 'auto' | 'light' | 'dark' = 'auto'; // 改为 public 以便外部访问
  private showUnchangedRows: boolean = true;  // 默认显示全部行（非折叠状态）

  constructor(app: any) {
    this.app = app;
  }

  public initialize(): void {
    this.loadSettings();
    this.bindEvents();
    this.setupAutoThemeListener();
    this.updateTheme();
    this.updateDiffMode();
    this.updateUnchangedRowsButton();
  }

  /**
   * 设置系统主题监听器（用于自动主题模式）
   */
  private setupAutoThemeListener(): void {
    // 监听系统主题变化
    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
    
    const handleThemeChange = () => {
      if (this.currentTheme === 'auto') {
        this.updateTheme();
      }
    };
    
    // 现代浏览器使用 addEventListener
    if (mediaQuery.addEventListener) {
      mediaQuery.addEventListener('change', handleThemeChange);
    } else {
      // 旧版浏览器兼容
      mediaQuery.addListener(handleThemeChange);
    }
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
      const toggleUnchanged = target.closest('#toggle-unchanged');
      
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
      } else if (toggleUnchanged) {
        this.toggleUnchangedRows();
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
    const themeIcons = document.querySelectorAll('.theme-icon');
    
    if (container) {
      if (this.currentTheme === 'auto') {
        // 自动模式：根据系统主题设置
        const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
        const actualTheme = prefersDark ? 'dark' : 'light';
        container.setAttribute('data-theme', actualTheme);
        
        // 更新图标为自动模式
        themeIcons.forEach(icon => {
          icon.textContent = '🌓'; // 自动模式图标
        });
      } else {
        // 手动模式：使用用户选择的主题
        container.setAttribute('data-theme', this.currentTheme);
        
        // 更新图标
        themeIcons.forEach(icon => {
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

  private toggleUnchangedRows(): void {
    this.showUnchangedRows = !this.showUnchangedRows;
    this.updateUnchangedRowsButton();
    this.saveSettings();
    
    // 触发自定义事件通知 diffTable 重新渲染
    const event = new Event('unchangedRowsToggled');
    document.dispatchEvent(event);
  }

  private updateUnchangedRowsButton(): void {
    const button = document.getElementById('toggle-unchanged');
    if (button) {
      if (this.showUnchangedRows) {
        button.classList.add('active');
        button.title = '隐藏未改变的行';
      } else {
        button.classList.remove('active');
        button.title = '显示全部行';
      }
    }
  }

  public getShowUnchangedRows(): boolean {
    return this.showUnchangedRows;
  }

  private loadSettings(): void {
    const settings = JSON.parse(localStorage.getItem('excelDiffViewerSettings') || '{}');
    this.currentTheme = settings.theme || 'auto';
    this.currentDiffMode = settings.diffMode || 'side-by-side';
    this.showUnchangedRows = settings.showUnchangedRows !== undefined ? settings.showUnchangedRows : true;
    
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
    
    // 更新未改变行按钮状态
    this.updateUnchangedRowsButton();
  }

  private saveSettings(): void {
    const highlightModeSelect = document.getElementById('highlight-mode') as HTMLSelectElement;
    const fontSizeSelect = document.getElementById('font-size') as HTMLSelectElement;
    
    const settings = {
      theme: this.currentTheme,
      diffMode: this.currentDiffMode,
      showUnchangedRows: this.showUnchangedRows,
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
