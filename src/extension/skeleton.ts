import * as vscode from 'vscode';

export interface SkeletonOptions {
  webviewId: string;
  webviewInstanceId: string;
  cspSource: string;
  cspNonce: string;
  root: string;
  webRoot: string;
  placement: 'editor' | 'view';
  bootstrap?: any;
}

export class SkeletonBuilder {
  private static htmlCache: Map<string, string> = new Map();
  
  private static readonly CSS_VARIABLES = `
    :root {
      --diff-added-color: #4caf50;
      --diff-removed-color: #f44336;
      --diff-modified-color: #ff9800;
      --diff-unchanged-color: transparent;
      --diff-border-color: #e0e0e0;
      --diff-hover-color: #f5f5f5;
      
      --primary-color: #007acc;
      --secondary-color: #6c757d;
      --success-color: #28a745;
      --danger-color: #dc3545;
      --warning-color: #ffc107;
      --info-color: #17a2b8;
      
      --bg-primary: var(--vscode-editor-background, #ffffff);
      --bg-secondary: var(--vscode-panel-background, #f8f9fa);
      --bg-tertiary: var(--vscode-tab-inactiveBackground, #e9ecef);
      --bg-hover: var(--vscode-list-hoverBackground, #f1f3f4);
      
      --text-primary: var(--vscode-foreground, #212529);
      --text-secondary: var(--vscode-descriptionForeground, #6c757d);
      --text-muted: var(--vscode-disabledForeground, #adb5bd);
      
      --border-color: var(--vscode-panel-border, #dee2e6);
      --border-light: var(--vscode-tab-border, #e9ecef);
      
      --shadow-sm: 0 0.125rem 0.25rem rgba(0, 0, 0, 0.075);
      --shadow-md: 0 0.5rem 1rem rgba(0, 0, 0, 0.15);
      --shadow-lg: 0 1rem 3rem rgba(0, 0, 0, 0.175);
      
      --border-radius-sm: 0.25rem;
      --border-radius-md: 0.375rem;
      --border-radius-lg: 0.5rem;
      
      --spacing-xs: 0.25rem;
      --spacing-sm: 0.5rem;
      --spacing-md: 1rem;
      --spacing-lg: 1.5rem;
      --spacing-xl: 3rem;
      
      /* 自动主题：根据 VS Code 主题自动适配 */
      --diff-added-bg: var(--vscode-diffEditor-insertedTextBackground, rgba(76, 175, 80, 0.2));
      --diff-removed-bg: var(--vscode-diffEditor-removedTextBackground, rgba(244, 67, 54, 0.2));
      --diff-modified-bg: var(--vscode-diffEditor-diagonalFill, rgba(255, 152, 0, 0.2));
    }

    [data-theme="light"] {
      /* 浅色主题颜色 */
      --bg-primary: #ffffff;
      --bg-secondary: #f3f3f3;
      --bg-tertiary: #e8e8e8;
      --bg-hover: #e5e5e5;
      
      --text-primary: #000000;
      --text-secondary: #616161;
      --text-muted: #a0a0a0;
      
      --border-color: #cccccc;
      --border-light: #d9d9d9;
      
      --diff-added-bg: #d4edda;
      --diff-removed-bg: #f8d7da;
      --diff-modified-bg: #fff3cd;
    }

    [data-theme="dark"] {
      /* 深色主题颜色 */
      --bg-primary: #1e1e1e;
      --bg-secondary: #252526;
      --bg-tertiary: #2d2d30;
      --bg-hover: #3e3e40;
      
      --text-primary: #d4d4d4;
      --text-secondary: #969696;
      --text-muted: #6e6e6e;
      
      --border-color: #3f3f46;
      --border-light: #454545;
      
      --diff-added-bg: #1e4620;
      --diff-removed-bg: #5a1d1d;
      --diff-modified-bg: #5b5b28;
    }
  `;

  private static readonly BASE_STYLES = `
    * {
      box-sizing: border-box;
      margin: 0;
      padding: 0;
    }

    html, body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      font-size: 14px;
      line-height: 1.5;
      color: var(--text-primary);
      background-color: var(--bg-primary);
      overflow: auto; /* 允许滚动 */
      min-width: 800px; /* 设置最小宽度 */
    }

    .hidden {
      display: none !important;
    }

    .loading {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      height: 100vh;
      gap: 16px;
    }

    .loading-spinner {
      width: 32px;
      height: 32px;
      border: 3px solid var(--vscode-progressBar-background);
      border-top: 3px solid var(--vscode-progressBar-foreground);
      border-radius: 50%;
      animation: spin 1s linear infinite;
    }

    @keyframes spin {
      0% { transform: rotate(0deg); }
      100% { transform: rotate(360deg); }
    }

    .error {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      height: 100vh;
      gap: 16px;
      text-align: center;
      padding: 20px;
    }

    .error-icon {
      font-size: 48px;
    }

    .error-message {
      color: var(--vscode-errorForeground);
      font-size: 16px;
    }
  `;

  static buildSkeleton(options: SkeletonOptions): string {
    const { webviewId, webviewInstanceId, cspSource, cspNonce, root, webRoot, placement, bootstrap } = options;

    // 使用缓存键（排除动态内容）
    const cacheKey = `${webviewId}_${placement}_${webRoot}`;
    
    // 检查缓存
    if (this.htmlCache.has(cacheKey) && !bootstrap) {
      const cachedHtml = this.htmlCache.get(cacheKey)!;
      // 替换动态内容
      return cachedHtml
        .replace(/nonce="[^"]+"/g, `nonce="${cspNonce}"`)
        .replace(/window\.bootstrap = null/, `window.bootstrap = ${bootstrap ? JSON.stringify(bootstrap) : 'null'}`);
    }

    const html = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Excel Diff Viewer</title>
    <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${cspSource} 'unsafe-inline'; script-src ${cspSource} 'nonce-${cspNonce}';">
    <style nonce="${cspNonce}">
        ${this.CSS_VARIABLES}
        ${this.BASE_STYLES}
    </style>
    <link rel="stylesheet" href="${webRoot}/webview.css">
</head>
<body data-placement="${placement}" data-vscode-context='{"webview": "${webviewId}", "webviewInstance": "${webviewInstanceId}"}'>
    <div id="excel-diff-container">
        <!-- 工具栏 -->
        <div id="toolbar" class="toolbar hidden">
            <div class="toolbar-left">
                <div class="logo">
                    <span class="logo-icon">📊</span>
                    <span class="logo-text">Excel Diff Viewer</span>
                </div>
            </div>
            
            <div class="toolbar-center">
                <div class="diff-mode-selector">
                    <label for="diff-mode">视图模式:</label>
                    <select id="diff-mode" class="mode-select" title="选择差异视图模式">
                        <option value="side-by-side">并排视图</option>
                        <option value="inline">分栏视图</option>
                    </select>
                </div>
            </div>
            
            <div class="toolbar-right">
                <button class="btn btn-icon" id="change-files" title="重新选择文件">
                    <span>🔄</span>
                </button>
                <button class="btn btn-icon" id="toggle-unchanged" title="折叠未改变的行">
                    <span class="unchanged-icon">👁️</span>
                </button>
                <button class="btn btn-icon theme-btn" id="theme-toggle" title="切换主题（自动/浅色/深色）">
                    <span class="theme-icon">🌓</span>
                </button>
            </div>
        </div>


        <!-- 文件选择区域 -->
        <div id="file-selection" class="file-selection">
            <!-- 顶部菜单栏 -->
            <div class="menu-bar">
                <div class="menu-left">
                    <span class="app-icon">📊</span>
                    <span class="app-title">Excel Diff Viewer</span>
                    <div class="menu-items">
                        <div class="menu-item">
                            <span class="menu-label" title="文件操作">文件</span>
                            <div class="menu-dropdown">
                                <div class="menu-dropdown-content">
                                    <div class="menu-option" id="menu-open-file-a" title="选择原始文件（旧版本）">打开文件 A</div>
                                    <div class="menu-option" id="menu-open-file-b" title="选择新文件（新版本）">打开文件 B</div>
                                    <div class="menu-divider"></div>
                                    <div class="menu-option" id="menu-clear-all" title="清除所有已选择的文件">清除全部</div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
                <div class="menu-right">
                    <button class="btn-menu" id="menu-theme-toggle" title="切换主题（自动/浅色/深色）">
                        <span class="theme-icon">🌓</span>
                    </button>
                </div>
            </div>

            <!-- 主内容区 - 左右文件选择布局 -->
            <div class="file-compare-container">
                <!-- 左侧：文件 A -->
                <div class="file-side file-side-left">
                    <div class="file-side-header">
                        <div class="file-label">
                            <span class="label-icon">📄</span>
                            <span class="label-text">文件 A (原始)</span>
                        </div>
                    </div>
                    <div class="file-side-body">
                        <div class="file-dropzone" id="dropzone-a" data-file-type="old">
                            <div class="dropzone-content" id="dropzone-content-a">
                                <div class="dropzone-icon">📂</div>
                                <div class="dropzone-text">点击选择或拖拽文件到此处</div>
                                <div class="dropzone-hint">支持 .xlsx 和 .xls 格式</div>
                            </div>
                            <div class="file-selected-info hidden" id="file-info-a">
                                <div class="selected-header">
                                    <div class="selected-icon">✅</div>
                                    <button class="btn-remove" id="remove-file-a" title="移除文件">×</button>
                                </div>
                                <div class="selected-name" id="file-name-a"></div>
                                <div class="selected-path" id="file-path-a"></div>
                                <div class="selected-meta">
                                    <span class="meta-item" id="file-size-a"></span>
                                    <span class="meta-divider">•</span>
                                    <span class="meta-item" id="file-time-a"></span>
                                </div>
                                <button class="btn-copy-path" id="btn-copy-path-a" title="复制文件路径">
                                    <span class="copy-icon">📋</span>
                                    <span class="copy-text">复制路径</span>
                                </button>
                            </div>
                        </div>
                    </div>
                </div>

                <!-- 中间分隔线 -->
                <div class="compare-divider">
                    <div class="divider-line"></div>
                    <div class="compare-icon">VS</div>
                    <div class="divider-line"></div>
                </div>

                <!-- 右侧：文件 B -->
                <div class="file-side file-side-right">
                    <div class="file-side-header">
                        <div class="file-label">
                            <span class="label-icon">📄</span>
                            <span class="label-text">文件 B (新版)</span>
                        </div>
                    </div>
                    <div class="file-side-body">
                        <div class="file-dropzone" id="dropzone-b" data-file-type="new">
                            <div class="dropzone-content" id="dropzone-content-b">
                                <div class="dropzone-icon">📂</div>
                                <div class="dropzone-text">点击选择或拖拽文件到此处</div>
                                <div class="dropzone-hint">支持 .xlsx 和 .xls 格式</div>
                            </div>
                            <div class="file-selected-info hidden" id="file-info-b">
                                <div class="selected-header">
                                    <div class="selected-icon">✅</div>
                                    <button class="btn-remove" id="remove-file-b" title="移除文件">×</button>
                                </div>
                                <div class="selected-name" id="file-name-b"></div>
                                <div class="selected-path" id="file-path-b"></div>
                                <div class="selected-meta">
                                    <span class="meta-item" id="file-size-b"></span>
                                    <span class="meta-divider">•</span>
                                    <span class="meta-item" id="file-time-b"></span>
                                </div>
                                <button class="btn-copy-path" id="btn-copy-path-b" title="复制文件路径">
                                    <span class="copy-icon">📋</span>
                                    <span class="copy-text">复制路径</span>
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            <!-- 底部状态栏 -->
            <div class="status-bar">
                <div class="status-left">
                    <span class="status-item" id="file-count-status">已选择: 0/2 个文件</span>
                    <span class="status-item" id="file-size-status"></span>
                </div>
                <div class="status-center">
                    <button class="btn-compare" id="btn-start-compare" disabled>
                        <span class="btn-icon">▶</span>
                        <span class="btn-text">开始对比</span>
                    </button>
                </div>
                <div class="status-right">
                    <span class="status-hint" id="status-hint">请选择两个Excel文件进行对比</span>
                </div>
            </div>
        </div>

        <!-- 加载状态 -->
        <div id="loading" class="loading hidden">
            <div class="loading-content">
                <div class="loading-spinner"></div>
                <div class="loading-text">正在分析Excel文件...</div>
                <div class="loading-subtitle">请稍候，这可能需要几秒钟</div>
            </div>
        </div>

        <!-- 错误状态 -->
        <div id="error" class="error hidden">
            <div class="error-content">
                <div class="error-icon">⚠️</div>
                <h3 class="error-title">出错了</h3>
                <div class="error-message"></div>
                <button class="btn btn-primary" id="error-back">返回选择文件</button>
            </div>
        </div>

        <!-- 复制成功提示 -->
        <div id="copy-toast" class="copy-toast hidden">
            <span class="toast-icon">✓</span>
            <span class="toast-text"></span>
        </div>

        <!-- 差异内容 -->
        <div id="diff-content" class="diff-content hidden">
            <!-- 文件信息 -->
            <div class="diff-header">
                <div class="file-info">
                    <div class="file-old">
                        <span class="file-label">原始:</span>
                        <span class="file-path"></span>
                    </div>
                    <div class="file-new">
                        <span class="file-label">新版:</span>
                        <span class="file-path"></span>
                    </div>
                </div>
                <div class="diff-summary">
                    <div class="summary-item added">
                        <span class="summary-icon">+</span>
                        <span class="summary-label">新增:</span>
                        <span class="summary-value">0</span>
                    </div>
                    <div class="summary-item removed">
                        <span class="summary-icon">-</span>
                        <span class="summary-label">删除:</span>
                        <span class="summary-value">0</span>
                    </div>
                    <div class="summary-item modified">
                        <span class="summary-icon">~</span>
                        <span class="summary-label">修改:</span>
                        <span class="summary-value">0</span>
                    </div>
                </div>
            </div>

            <!-- 标签页 -->
            <div class="diff-tabs">
                <div class="tab-list"></div>
                <div class="tab-content"></div>
            </div>
        </div>
    </div>

    <script nonce="${cspNonce}">
        window.bootstrap = ${bootstrap ? JSON.stringify(bootstrap) : 'null'};
    </script>
    <script nonce="${cspNonce}" src="${webRoot}/webview.js"></script>
</body>
</html>`;

    // 缓存HTML（如果没有bootstrap数据）
    if (!bootstrap) {
      this.htmlCache.set(cacheKey, html);
    }

    return html;
  }

  static replaceTokens(
    html: string,
    webviewId: string,
    webviewInstanceId: string,
    cspSource: string,
    cspNonce: string,
    root: string,
    webRoot: string,
    placement: 'editor' | 'view',
    bootstrap?: any
  ): string {
    return html.replace(
      /#{(head|body|endOfBody|webviewId|webviewInstanceId|placement|cspSource|cspNonce|root|webroot|state)}/g,
      (_substring: string, token: string) => {
        switch (token) {
          case 'head':
            return '';
          case 'body':
            return '';
          case 'state':
            return bootstrap !== null ? JSON.stringify(bootstrap) : '';
          case 'endOfBody':
            return `${
              bootstrap !== null
                ? `<script type="text/javascript" nonce="${cspNonce}">window.bootstrap=${JSON.stringify(
                    bootstrap,
                  )};</script>`
                : ''
            }`;
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
}
