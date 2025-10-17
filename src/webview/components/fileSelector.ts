import { MessageToExtension } from '../../shared/message';

export class FileSelector {
  private app: any;
  private oldFilePath: string | null = null;
  private newFilePath: string | null = null;
  private oldFileSize: number = 0;
  private newFileSize: number = 0;

  constructor(app: any) {
    this.app = app;
  }

  public initialize(): void {
    this.bindEvents();
    this.setupDragDrop();
    this.preventDefaultDragBehavior();
    this.initializeTheme();
  }

  private initializeTheme(): void {
    // 初始化主题图标显示
    // 从 localStorage 加载主题设置
    const settings = JSON.parse(localStorage.getItem('excelDiffViewerSettings') || '{}');
    const currentTheme = settings.theme || 'auto'; // 默认为 'auto'
    
    // 延迟执行以确保 DOM 已准备好
    setTimeout(() => {
      const toolbar = (this.app as any).toolbar;
      if (toolbar) {
        // 确保 toolbar 使用正确的主题设置
        toolbar.currentTheme = currentTheme;
        if (typeof toolbar.updateTheme === 'function') {
          toolbar.updateTheme();
        }
      }
    }, 0);
  }

  private preventDefaultDragBehavior(): void {
    // 在整个文档级别阻止默认的拖拽行为，防止VSCode打开文件
    ['dragenter', 'dragover', 'drop'].forEach(eventName => {
      document.addEventListener(eventName, (e) => {
        e.preventDefault();
        e.stopPropagation();
      }, false);
    });

    // 防止拖拽离开窗口
    document.addEventListener('dragleave', (e) => {
      e.preventDefault();
      e.stopPropagation();
    }, false);
  }

  private bindEvents(): void {
    // 点击事件委托
    document.addEventListener('click', (event) => {
      const target = event.target as HTMLElement;
      
      // 先检查是否点击了移除按钮（优先级最高）
      if (target.id === 'remove-file-a' || target.closest('#remove-file-a')) {
        event.stopPropagation();
        this.removeFile('old');
        return;
      }
      if (target.id === 'remove-file-b' || target.closest('#remove-file-b')) {
        event.stopPropagation();
        this.removeFile('new');
        return;
      }
      
      // 检查是否点击了复制路径按钮
      if (target.id === 'btn-copy-path-a' || target.closest('#btn-copy-path-a')) {
        event.stopPropagation();
        this.copyPath('old');
        return;
      }
      if (target.id === 'btn-copy-path-b' || target.closest('#btn-copy-path-b')) {
        event.stopPropagation();
        this.copyPath('new');
        return;
      }
      
      // 检查是否点击了dropzone区域（包括其子元素）
      const clickedDropzoneA = target.closest('#dropzone-a');
      const clickedDropzoneB = target.closest('#dropzone-b');
      
      if (clickedDropzoneA) {
        this.selectFile('old');
        return;
      }
      if (clickedDropzoneB) {
        this.selectFile('new');
        return;
      }
      
      // 开始对比按钮
      if (target.id === 'btn-start-compare' || target.closest('#btn-start-compare')) {
        this.startComparison();
        return;
      }
      
      // 菜单项
      if (target.id === 'menu-open-file-a') {
        this.selectFile('old');
        return;
      }
      if (target.id === 'menu-open-file-b') {
        this.selectFile('new');
        return;
      }
      if (target.id === 'menu-clear-all') {
        this.clearAllFiles();
        return;
      }
      // 使用 closest() 处理子元素上的点击
      const themeButton = target.closest('#menu-theme-toggle');
      if (themeButton) {
        this.toggleTheme();
        return;
      }
    });
  }

  private setupDragDrop(): void {
    const setupDropzone = (dropzoneId: string, fileType: 'old' | 'new') => {
      const dropzone = document.getElementById(dropzoneId);
      if (!dropzone) return;

      // 拖拽进入 - 设置 dropEffect 告诉 VS Code 我们要处理这个拖拽
      dropzone.addEventListener('dragenter', (e: Event) => {
        const dragEvent = e as DragEvent;
        e.preventDefault();
        e.stopPropagation();
        
        // 设置为 'copy' 表示我们要处理这个文件，不要让 VS Code 打开它
        if (dragEvent.dataTransfer) {
          dragEvent.dataTransfer.dropEffect = 'copy';
        }
        
        dropzone.classList.add('dropzone-drag-over');
      });

      // 拖拽悬停 - 持续设置 dropEffect
      dropzone.addEventListener('dragover', (e: Event) => {
        const dragEvent = e as DragEvent;
        e.preventDefault();
        e.stopPropagation();
        
        // 必须在 dragover 中持续设置 dropEffect
        if (dragEvent.dataTransfer) {
          dragEvent.dataTransfer.dropEffect = 'copy';
        }
        
        dropzone.classList.add('dropzone-drag-over');
      });

      // 拖拽离开
      dropzone.addEventListener('dragleave', (e: Event) => {
        e.preventDefault();
        e.stopPropagation();
        dropzone.classList.remove('dropzone-drag-over');
      });

      // 文件放下
      dropzone.addEventListener('drop', (e: Event) => {
        const dropEvent = e as DragEvent;
        e.preventDefault();
        e.stopPropagation();
        
        dropzone.classList.remove('dropzone-drag-over');
        
        const files = dropEvent.dataTransfer?.files;
        
        if (files && files.length > 0) {
          const file = files[0];
          // 验证文件格式
          if (file.name.endsWith('.xlsx') || file.name.endsWith('.xls')) {
            // 通过postMessage让扩展端处理文件
            // 注意：WebView中无法直接读取文件路径，需要扩展端处理
            this.handleFileDrop(fileType, file);
          } else {
            this.showError('请选择 .xlsx 或 .xls 格式的文件');
          }
        }
      });
    };

    setupDropzone('dropzone-a', 'old');
    setupDropzone('dropzone-b', 'new');
  }

  private handleFileDrop(fileType: 'old' | 'new', file: File): void {
    // 检查文件类型
    const isExcelFile = file.name.endsWith('.xlsx') || file.name.endsWith('.xls');
    
    if (!isExcelFile) {
      this.showError('请拖拽 Excel 文件（.xlsx 或 .xls）');
      return;
    }
    
    console.log(`检测到 Excel 文件: ${file.name}`);
    
    // 尝试获取文件路径（Electron 特性，但可能不可用）
    const filePath = (file as any).path;
    
    if (filePath) {
      // 方法1：如果能获取路径，直接发送路径
      console.log(`✅ 使用文件路径: ${filePath}`);
      this.app.postMessage({
        kind: 'fileDropped',
        fileType: fileType,
        filePath: filePath,
        fileName: file.name,
        fileSize: file.size
      });
    } else {
      // 方法2：无法获取路径，使用 FileReader 读取文件内容
      console.log('📖 无法获取路径，使用 FileReader 读取文件内容');
      this.readFileContent(fileType, file);
    }
  }

  private readFileContent(fileType: 'old' | 'new', file: File): void {
    const reader = new FileReader();
    
    reader.onload = (e) => {
      const arrayBuffer = e.target?.result as ArrayBuffer;
      if (arrayBuffer) {
        // 将 ArrayBuffer 转换为 Base64
        const base64 = this.arrayBufferToBase64(arrayBuffer);
        
        console.log(`✅ 文件读取成功，大小: ${file.size} 字节`);
        
        // 发送文件内容到扩展端
        this.app.postMessage({
          kind: 'fileContentDropped',
          fileType: fileType,
          fileName: file.name,
          fileSize: file.size,
          fileContent: base64
        });
      }
    };
    
    reader.onerror = () => {
      console.error('❌ 文件读取失败');
      this.showError('读取文件失败，请使用点击选择方式');
    };
    
    // 读取文件为 ArrayBuffer
    reader.readAsArrayBuffer(file);
  }

  private arrayBufferToBase64(buffer: ArrayBuffer): string {
    let binary = '';
    const bytes = new Uint8Array(buffer);
    const len = bytes.byteLength;
    for (let i = 0; i < len; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
    return btoa(binary);
  }

  private showDropHint(fileType: 'old' | 'new', fileName: string): void {
    // 在拖拽区显示提示：请在文件选择对话框中选择该文件
    const suffix = fileType === 'old' ? 'a' : 'b';
    const dropzoneContent = document.getElementById(`dropzone-content-${suffix}`);
    
    if (dropzoneContent) {
      const hint = document.createElement('div');
      hint.className = 'drop-hint';
      hint.textContent = `正在打开文件选择器...`;
      hint.style.cssText = 'color: var(--primary-color); font-size: 12px; margin-top: 8px;';
      
      dropzoneContent.appendChild(hint);
      
      // 3秒后移除提示
      setTimeout(() => {
        hint.remove();
      }, 3000);
    }
  }

  private selectFile(fileType: 'old' | 'new'): void {
    this.app.postMessage({
      kind: 'selectFile',
      fileType: fileType
    });
  }

  public handleFileSelected(fileType: 'old' | 'new', filePath: string, fileName: string, fileSize?: number, fileTime?: string): void {
    const suffix = fileType === 'old' ? 'a' : 'b';
    const dropzoneContent = document.getElementById(`dropzone-content-${suffix}`);
    const fileInfo = document.getElementById(`file-info-${suffix}`);
    const fileNameEl = document.getElementById(`file-name-${suffix}`);
    const filePathEl = document.getElementById(`file-path-${suffix}`);
    const fileSizeEl = document.getElementById(`file-size-${suffix}`);
    const fileTimeEl = document.getElementById(`file-time-${suffix}`);

    if (!dropzoneContent || !fileInfo || !fileNameEl || !filePathEl) {
      console.error('Required DOM elements not found');
      return;
    }

    // 更新文件信息
    fileNameEl.textContent = fileName;
    filePathEl.textContent = filePath;
    
    // 更新文件大小
    if (fileSizeEl) {
      if (fileSize !== undefined) {
        fileSizeEl.textContent = this.formatFileSize(fileSize);
        fileSizeEl.style.display = '';
        if (fileType === 'old') {
          this.oldFileSize = fileSize;
        } else {
          this.newFileSize = fileSize;
        }
      } else {
        fileSizeEl.textContent = '';
        fileSizeEl.style.display = 'none';
      }
    }
    
    // 更新文件时间
    if (fileTimeEl) {
      if (fileTime) {
        fileTimeEl.textContent = fileTime;
        fileTimeEl.style.display = '';
      } else {
        fileTimeEl.textContent = '';
        fileTimeEl.style.display = 'none';
      }
    }

    // 更新分隔符显示（只有当两个信息都有时才显示）
    const metaDivider = document.querySelector(`#file-info-${suffix} .meta-divider`) as HTMLElement;
    if (metaDivider) {
      const hasSize = fileSize !== undefined;
      const hasTime = fileTime !== undefined && fileTime !== '';
      metaDivider.style.display = (hasSize && hasTime) ? '' : 'none';
    }

    // 显示文件信息，隐藏dropzone提示
    dropzoneContent.classList.add('hidden');
    fileInfo.classList.remove('hidden');

    // 存储文件路径
    if (fileType === 'old') {
      this.oldFilePath = filePath;
    } else {
      this.newFilePath = filePath;
    }

    // 更新状态栏
    this.updateStatusBar();
  }

  private removeFile(fileType: 'old' | 'new'): void {
    const suffix = fileType === 'old' ? 'a' : 'b';
    const dropzoneContent = document.getElementById(`dropzone-content-${suffix}`);
    const fileInfo = document.getElementById(`file-info-${suffix}`);

    if (dropzoneContent && fileInfo) {
      // 隐藏文件信息，显示dropzone提示
      fileInfo.classList.add('hidden');
      dropzoneContent.classList.remove('hidden');
    }

    // 清除文件路径
    if (fileType === 'old') {
      this.oldFilePath = null;
      this.oldFileSize = 0;
    } else {
      this.newFilePath = null;
      this.newFileSize = 0;
    }

    // 更新状态栏
    this.updateStatusBar();
  }

  private clearAllFiles(): void {
    this.removeFile('old');
    this.removeFile('new');
  }

  private copyPath(fileType: 'old' | 'new'): void {
    const path = fileType === 'old' ? this.oldFilePath : this.newFilePath;
    if (path) {
      navigator.clipboard.writeText(path).then(() => {
        this.showToast(`复制成功：${path}`);
      }).catch(() => {
        this.showToast('复制失败，请重试');
      });
    }
  }

  private showToast(message: string): void {
    const toast = document.getElementById('copy-toast');
    const toastText = toast?.querySelector('.toast-text');
    
    if (toast && toastText) {
      toastText.textContent = message;
      toast.classList.remove('hidden', 'toast-hide');
      
      // 2秒后隐藏
      setTimeout(() => {
        toast.classList.add('toast-hide');
        setTimeout(() => {
          toast.classList.add('hidden');
        }, 300); // 等待动画完成
      }, 2000);
    }
  }

  private toggleTheme(): void {
    // 确保 toolbar 已初始化再进行委托
    const toolbar = (this.app as any).toolbar;
    if (toolbar && typeof toolbar.toggleTheme === 'function') {
      toolbar.toggleTheme();
    } else {
      console.error('Toolbar 未初始化或 toggleTheme 方法不可用');
    }
  }

  private updateStatusBar(): void {
    const fileCountEl = document.getElementById('file-count-status');
    const fileSizeEl = document.getElementById('file-size-status');
    const compareBtn = document.getElementById('btn-start-compare') as HTMLButtonElement;
    const statusIndicator = document.getElementById('status-indicator');

    // 更新文件计数
    const fileCount = (this.oldFilePath ? 1 : 0) + (this.newFilePath ? 1 : 0);
    if (fileCountEl) {
      fileCountEl.textContent = `已选择: ${fileCount}/2 个文件`;
    }

    // 更新总文件大小
    if (fileSizeEl) {
      const totalSize = this.oldFileSize + this.newFileSize;
      if (totalSize > 0) {
        fileSizeEl.textContent = `总大小: ${this.formatFileSize(totalSize)}`;
      } else {
        fileSizeEl.textContent = '';
      }
    }

    // 更新对比按钮状态
    if (compareBtn) {
      const canCompare = this.oldFilePath && this.newFilePath;
      compareBtn.disabled = !canCompare;
    }

    // 更新状态提示
    const statusHint = document.getElementById('status-hint');
    if (statusHint) {
      if (fileCount === 2) {
        statusHint.textContent = '✓ 已就绪，点击按钮开始对比';
        statusHint.style.color = 'var(--success-color)';
      } else if (fileCount === 1) {
        statusHint.textContent = `还需选择 ${2 - fileCount} 个文件`;
        statusHint.style.color = 'var(--text-secondary)';
      } else {
        statusHint.textContent = '请选择两个Excel文件进行对比';
        statusHint.style.color = 'var(--text-secondary)';
      }
    }
  }

  private startComparison(): void {
    if (!this.oldFilePath || !this.newFilePath) {
      console.error('Both files must be selected');
      return;
    }

    this.app.postMessage({
      kind: 'startComparison',
      oldFilePath: this.oldFilePath,
      newFilePath: this.newFilePath
    });
  }

  private formatFileSize(bytes: number): string {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i];
  }

  private showError(message: string): void {
    // 显示错误提示，使用红色样式区分
    console.error(message);
    
    const toast = document.getElementById('copy-toast');
    const toastIcon = toast?.querySelector('.toast-icon');
    const toastText = toast?.querySelector('.toast-text');
    
    if (toast && toastIcon && toastText) {
      // 设置错误样式
      toast.style.backgroundColor = 'var(--danger-color, #dc3545)';
      toast.style.color = '#ffffff';
      toastIcon.textContent = '✗'; // 错误图标
      toastText.textContent = message;
      toast.classList.remove('hidden', 'toast-hide');
      
      // 3秒后隐藏
      setTimeout(() => {
        toast.classList.add('toast-hide');
        setTimeout(() => {
          toast.classList.add('hidden');
          // 恢复默认样式
          toast.style.backgroundColor = '';
          toast.style.color = '';
          toastIcon.textContent = '✓';
        }, 300);
      }, 3000);
    }
  }

  private showSuccess(message: string): void {
    // 简单的成功提示，可以后续改进
    console.log(message);
  }

  public getSelectedFiles(): { oldFilePath: string | null; newFilePath: string | null } {
    return {
      oldFilePath: this.oldFilePath,
      newFilePath: this.newFilePath
    };
  }
}
