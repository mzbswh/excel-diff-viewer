import * as vscode from 'vscode';
import { WorkbookComparison, type RowFilter } from './model';

type TextDiffGranularity = 'character' | 'word' | 'line';
type TextDiffLayout = 'sideBySide' | 'inline' | 'stacked';

interface RequestPageMessage {
  type: 'requestPage';
  sheet: string;
  page: number;
  filter: RowFilter;
  query: string;
}

interface ReadyMessage {
  type: 'ready';
}

interface OpenLocalFileMessage {
  type: 'openLocalFile';
}

interface RequestChangeMessage {
  type: 'requestChange';
  sheet: string;
  row?: number;
  column?: number;
  direction: 'previous' | 'next';
  unit: 'row' | 'cell';
  filter: RowFilter;
  query: string;
}

interface UpdateSettingMessage {
  type: 'updateSetting';
  key:
    | 'theme'
    | 'diffMode'
    | 'textDiffGranularity'
    | 'textDiffLayout'
    | 'navigationUnit'
    | 'rowFilter';
  value: string;
}

type WebviewMessage =
  | RequestPageMessage
  | RequestChangeMessage
  | UpdateSettingMessage
  | ReadyMessage
  | OpenLocalFileMessage;

export class ExcelDiffPanel {
  private disposed = false;

  private constructor(
    private readonly panel: vscode.WebviewPanel,
    private readonly comparison: WorkbookComparison,
    private readonly extensionUri: vscode.Uri,
    private readonly pageSize: number
  ) {
    panel.webview.html = this.renderHtml(panel.webview);
    panel.webview.onDidReceiveMessage(
      (message: WebviewMessage) => this.onMessage(message),
      undefined,
      []
    );
    panel.onDidDispose(() => {
      this.disposed = true;
    });
  }

  static show(
    context: vscode.ExtensionContext,
    comparison: WorkbookComparison,
    title: string
  ): ExcelDiffPanel {
    const panel = vscode.window.createWebviewPanel(
      'excelDiffViewer.diff',
      title,
      vscode.ViewColumn.Active,
      {
        enableScripts: true,
        retainContextWhenHidden: true,
        localResourceRoots: [vscode.Uri.joinPath(context.extensionUri, 'media')]
      }
    );
    panel.iconPath = {
      light: vscode.Uri.joinPath(context.extensionUri, 'media', 'excel-light.svg'),
      dark: vscode.Uri.joinPath(context.extensionUri, 'media', 'excel-dark.svg')
    };
    const configuredPageSize = vscode.workspace
      .getConfiguration('excelDiffViewer')
      .get<number>('pageSize', 200);
    return new ExcelDiffPanel(
      panel,
      comparison,
      context.extensionUri,
      Math.max(50, Math.min(1000, configuredPageSize))
    );
  }

  private async onMessage(message: WebviewMessage): Promise<void> {
    if (this.disposed) {
      return;
    }
    if (message.type === 'ready') {
      const configuration = vscode.workspace.getConfiguration('excelDiffViewer');
      await this.panel.webview.postMessage({
        type: 'initialize',
        summary: this.comparison.summary,
        showUnchangedSheets: configuration.get<boolean>('showUnchangedSheets', true),
        theme: configuration.get<'dark' | 'light'>('theme', 'dark'),
        diffMode: configuration.get<'sideBySide' | 'unified'>('diffMode', 'sideBySide'),
        textDiffGranularity: configuration.get<TextDiffGranularity>(
          'textDiffGranularity',
          'character'
        ),
        textDiffLayout: configuration.get<TextDiffLayout>('textDiffLayout', 'sideBySide'),
        navigationUnit: configuration.get<'cell' | 'row'>('navigationUnit', 'cell'),
        rowFilter: configuration.get<RowFilter>('rowFilter', 'all')
      });
      return;
    }
    if (message.type === 'openLocalFile') {
      const localUri = await findLocalWorkbookUri(
        this.comparison.summary.right.uri,
        this.comparison.summary.left.uri
      );
      if (!localUri) {
        await vscode.window.showWarningMessage(
          'The compared workbook could not be found on the local file system.'
        );
        return;
      }
      try {
        await vscode.commands.executeCommand('vscode.open', localUri, { preview: false });
      } catch (error) {
        const detail = error instanceof Error ? error.message : String(error);
        await vscode.window.showWarningMessage(`Unable to open ${localUri.fsPath}. ${detail}`);
      }
      return;
    }
    if (message.type === 'requestPage') {
      try {
        const page = this.comparison.getPage(
          message.sheet,
          message.page,
          this.pageSize,
          isRowFilter(message.filter) ? message.filter : 'all',
          typeof message.query === 'string' ? message.query : ''
        );
        await this.panel.webview.postMessage({ type: 'page', page });
      } catch (error) {
        await this.panel.webview.postMessage({
          type: 'error',
          message: error instanceof Error ? error.message : String(error)
        });
      }
      return;
    }
    if (message.type === 'requestChange') {
      const target = this.comparison.getNavigationTarget(
        message.sheet,
        message.row,
        message.column,
        message.direction === 'previous' ? 'previous' : 'next',
        message.unit === 'row' ? 'row' : 'cell',
        this.pageSize,
        isRowFilter(message.filter) ? message.filter : 'all',
        typeof message.query === 'string' ? message.query : ''
      );
      await this.panel.webview.postMessage({ type: 'navigation', target });
      return;
    }
    if (message.type === 'updateSetting') {
      const allowed = message.key === 'theme'
        ? message.value === 'dark' || message.value === 'light'
        : message.key === 'diffMode'
          ? message.value === 'sideBySide' || message.value === 'unified'
          : message.key === 'textDiffGranularity'
            ? isTextDiffGranularity(message.value)
            : message.key === 'textDiffLayout'
              ? isTextDiffLayout(message.value)
              : message.key === 'navigationUnit'
                ? message.value === 'cell' || message.value === 'row'
                : isRowFilter(message.value);
      if (allowed) {
        await vscode.workspace
          .getConfiguration('excelDiffViewer')
          .update(message.key, message.value, vscode.ConfigurationTarget.Global);
      }
    }
  }

  private renderHtml(webview: vscode.Webview): string {
    const nonce = createNonce();
    const scriptUri = webview.asWebviewUri(vscode.Uri.joinPath(this.extensionUri, 'media', 'main.js'));
    const styleUri = webview.asWebviewUri(vscode.Uri.joinPath(this.extensionUri, 'media', 'main.css'));
    const csp = [
      "default-src 'none'",
      `style-src ${webview.cspSource}`,
      `script-src 'nonce-${nonce}'`,
      `img-src ${webview.cspSource} data:`
    ].join('; ');

    return /* html */ `<!doctype html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="Content-Security-Policy" content="${csp}">
  <link rel="stylesheet" href="${styleUri}">
  <title>Excel Diff Viewer</title>
</head>
<body>
  <div id="app" class="app loading">
    <header class="topbar">
      <div class="brand" aria-label="Excel Diff Viewer">
        <div class="brand-mark">X</div>
        <strong>Excel Diff</strong>
      </div>
      <div class="file-comparison">
        <div class="file-card left-file">
          <span class="side-label">BEFORE</span>
          <div><strong id="left-name">Loading…</strong><span id="left-detail"></span></div>
        </div>
        <div class="compare-arrow" aria-hidden="true">→</div>
        <div class="file-card right-file">
          <span class="side-label">AFTER</span>
          <div><strong id="right-name">Loading…</strong><span id="right-detail"></span></div>
        </div>
      </div>
      <div class="summary" id="summary"></div>
      <button
        id="open-local-file"
        class="topbar-open-button"
        type="button"
        title="Open the compared workbook in Visual Studio Code"
        aria-label="Open the compared workbook in Visual Studio Code"
      ><span aria-hidden="true">↗</span><span>Open</span></button>
    </header>

    <div class="workspace">
      <main class="main">
        <div class="toolbar">
          <div class="sheet-picker">
            <span class="sheet-icon">▦</span>
            <label for="sheet-select">Worksheet</label>
            <select id="sheet-select" aria-label="Select worksheet"></select>
            <span id="sheet-dimensions" class="sheet-dimensions"></span>
          </div>
          <div class="toolbar-actions">
            <label class="view-setting">
              <span>Theme</span>
              <select id="theme-select" aria-label="Color theme">
                <option value="dark">Dark</option>
                <option value="light">Light</option>
              </select>
            </label>
            <label class="view-setting">
              <span>View</span>
              <select id="diff-mode-select" aria-label="Diff display mode">
                <option value="sideBySide">Side by side</option>
                <option value="unified">Single page</option>
              </select>
            </label>
            <label class="search-box">
              <span aria-hidden="true">⌕</span>
              <input id="search" type="search" placeholder="Search this worksheet" autocomplete="off">
              <kbd>⌘F</kbd>
            </label>
            <div class="segmented" role="group" aria-label="Row filter">
              <button class="filter active" data-filter="all">All</button>
              <button class="filter" data-filter="changed">Changed</button>
              <button class="filter" data-filter="added">Added</button>
              <button class="filter" data-filter="removed">Removed</button>
            </div>
          </div>
        </div>

        <div id="error-banner" class="error-banner" hidden></div>
        <div class="column-labels">
          <div class="side-label-heading before-heading"><span class="legend-dot removed"></span><strong>Before</strong><span>Original workbook</span></div>
          <div class="side-label-heading after-heading"><span class="legend-dot added"></span><strong>After</strong><span>Compared workbook</span></div>
          <div class="unified-heading"><span class="legend-dot changed"></span><strong>Single page</strong><span>Before → After</span></div>
        </div>
        <div id="grid-shell" class="grid-shell">
          <section class="grid-pane left-pane">
            <div id="left-grid" class="grid-scroll"></div>
          </section>
          <div
            id="splitter"
            class="splitter"
            role="separator"
            aria-label="Resize comparison panes"
            aria-orientation="vertical"
            aria-valuemin="10"
            aria-valuemax="90"
            aria-valuenow="50"
            tabindex="0"
            title="Drag to resize · Double-click to reset"
          ></div>
          <section class="grid-pane right-pane">
            <div id="right-grid" class="grid-scroll"></div>
          </section>
          <section class="grid-pane unified-pane">
            <div id="unified-grid" class="grid-scroll"></div>
          </section>
          <div id="empty-state" class="empty-state" hidden>
            <div class="empty-icon">✓</div>
            <strong>No rows match this view</strong>
            <span>Try another filter or search term.</span>
          </div>
        </div>

        <footer class="footer">
          <div class="pagination">
            <button id="previous-page" class="page-button page-arrow" title="Previous page">‹</button>
            <span id="row-range">Rows 0 of 0</span>
            <span class="page-separator">·</span>
            <span id="page-label">Page 1 of 1</span>
            <button id="next-page" class="page-button page-arrow" title="Next page">›</button>
          </div>
          <div id="cell-inspector" class="cell-inspector" tabindex="0">Select a cell to inspect its value and formula</div>
          <div class="change-navigation" aria-label="Changed cell navigation">
            <button id="previous-change" class="change-button" title="Previous changed cell">←</button>
            <select id="navigation-unit-select" aria-label="Change navigation unit">
              <option value="cell">Cell</option>
              <option value="row">Row</option>
            </select>
            <button id="next-change" class="change-button" title="Next changed cell">→</button>
          </div>
        </footer>
      </main>
    </div>
    <dialog id="cell-comparison-dialog" class="cell-comparison-dialog" aria-labelledby="cell-comparison-address">
      <div class="cell-comparison-dialog-card">
        <header class="cell-comparison-dialog-header">
          <div class="cell-comparison-dialog-title">
            <span>Cell comparison</span>
            <strong id="cell-comparison-address"></strong>
          </div>
          <div class="cell-comparison-dialog-actions">
            <label class="text-diff-control">
              <span>Granularity</span>
              <select id="cell-comparison-granularity" aria-label="Text diff granularity">
                <option value="character">Characters</option>
                <option value="word">Words</option>
                <option value="line">Lines</option>
              </select>
            </label>
            <label class="text-diff-control">
              <span>Layout</span>
              <select id="cell-comparison-layout" aria-label="Text diff layout">
                <option value="sideBySide">Side by side</option>
                <option value="inline">Inline</option>
                <option value="stacked">Stacked</option>
              </select>
            </label>
            <button id="close-cell-comparison" class="dialog-close-button" aria-label="Close cell comparison">×</button>
          </div>
        </header>
        <div id="cell-comparison-body" class="cell-comparison-dialog-grid"></div>
        <div class="cell-comparison-dialog-hint">Press Esc or click outside to close</div>
      </div>
    </dialog>
    <div id="hover-tooltip" class="hover-tooltip" role="tooltip" hidden></div>
  </div>
  <script nonce="${nonce}" src="${scriptUri}"></script>
</body>
</html>`;
  }
}

function isRowFilter(value: string): value is RowFilter {
  return value === 'all' || value === 'changed' || value === 'added' || value === 'removed';
}

function isTextDiffGranularity(value: string): value is TextDiffGranularity {
  return value === 'character' || value === 'word' || value === 'line';
}

function isTextDiffLayout(value: string): value is TextDiffLayout {
  return value === 'sideBySide' || value === 'inline' || value === 'stacked';
}

async function findLocalWorkbookUri(...sources: string[]): Promise<vscode.Uri | undefined> {
  for (const value of sources) {
    try {
      const source = vscode.Uri.parse(value);
      for (const candidatePath of decodedPathCandidates(source.fsPath)) {
        const localUri = vscode.Uri.file(candidatePath);
        try {
          const stat = await vscode.workspace.fs.stat(localUri);
          if ((stat.type & vscode.FileType.File) !== 0) {
            return localUri;
          }
        } catch {
          // Try the next decoding level or comparison side.
        }
      }
    } catch {
      // The comparison side may represent a repository revision without a local counterpart.
    }
  }
  return undefined;
}

function decodedPathCandidates(value: string): string[] {
  const candidates = [value];
  let current = value;
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      const decoded = decodeURIComponent(current);
      if (decoded === current) {
        break;
      }
      candidates.push(decoded);
      current = decoded;
    } catch {
      break;
    }
  }
  return candidates;
}

function createNonce(): string {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let result = '';
  for (let index = 0; index < 32; index += 1) {
    result += alphabet.charAt(Math.floor(Math.random() * alphabet.length));
  }
  return result;
}
