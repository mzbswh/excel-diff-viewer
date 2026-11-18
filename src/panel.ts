import * as vscode from 'vscode';
import { WorkbookComparison, type RowFilter, type ViewOptions, type LocationRequest } from './model';
import type { DiffOpenTiming } from './timing';

type TextDiffGranularity = 'character' | 'word' | 'line';
type TextDiffLayout = 'sideBySide' | 'inline' | 'stacked';

interface RequestRowsMessage {
  type: 'requestRows';
  requestId: number;
  freezeRows?: number;
  freezeColumns?: number;
  focusChanges?: boolean;
  expandedRows?: number[];
  expandedColumns?: number[];
  sheet: string;
  offset: number;
  limit: number;
  columns?: number[];
  filter: RowFilter;
  query: string;
}

interface ReadyMessage {
  type: 'ready';
}

interface TimingMessage {
  type: 'timing';
  stage: 'startup' | 'initialize' | 'firstRowsRender' | 'firstRowsFrame';
  durationMs: number;
}

export interface WebviewAssets {
  script: string;
  style: string;
}

interface OpenLocalFileMessage {
  type: 'openLocalFile';
}

interface RequestChangeMessage extends ViewOptions {
  type: 'requestChange';
  requestId: number;
  viewRequestId: number;
  sheet: string;
  row?: number;
  column?: number;
  direction: 'previous' | 'next';
  unit: 'row' | 'cell';
  filter: RowFilter;
  query: string;
}

interface RequestFindMessage extends RequestChangeMessageBase {
  type: 'requestFind';
  text: string;
  includeCurrent?: boolean;
}

interface RequestLocateMessage extends RequestChangeMessageBase {
  type: 'requestLocate';
  location: LocationRequest;
}

interface RequestChangeMessageBase extends ViewOptions {
  requestId: number;
  viewRequestId: number;
  sheet: string;
  row?: number;
  column?: number;
  direction: 'previous' | 'next';
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
    | 'rowFilter'
    | 'focusChanges';
  value: string | boolean;
}

type WebviewMessage =
  | RequestRowsMessage
  | RequestChangeMessage
  | RequestFindMessage
  | RequestLocateMessage
  | UpdateSettingMessage
  | ReadyMessage
  | TimingMessage
  | OpenLocalFileMessage;

export class ExcelDiffPanel {
  private disposed = false;
  private ready = false;
  private firstRowsRequested = false;
  private comparison?: WorkbookComparison;
  private loadError?: string;
  private rowQueue: RequestRowsMessage[] = [];
  private latestViewRequest = 0;
  private drainingRows = false;

  private constructor(
    private readonly panel: vscode.WebviewPanel,
    private readonly extensionUri: vscode.Uri,
    private readonly timing: DiffOpenTiming,
    private readonly assets?: WebviewAssets
  ) {
    const configurationListener = vscode.workspace.onDidChangeConfiguration((event) => {
      if (event.affectsConfiguration('excelDiffViewer.cellHoverDelay')) {
        void panel.webview.postMessage({ type: 'cellHoverDelayChanged', delay: getCellHoverDelay() });
      }
    });
    panel.webview.onDidReceiveMessage(
      (message: WebviewMessage) => this.onMessage(message),
      undefined,
      []
    );
    panel.onDidDispose(() => {
      this.disposed = true;
      configurationListener.dispose();
    });
    panel.webview.html = this.renderHtml(panel.webview);
  }

  static show(
    context: vscode.ExtensionContext,
    title: string,
    viewColumn = vscode.ViewColumn.Active,
    timing: DiffOpenTiming,
    assets?: WebviewAssets
  ): ExcelDiffPanel {
    const panel = vscode.window.createWebviewPanel(
      'excelDiffViewer.diff',
      title,
      viewColumn,
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
    return new ExcelDiffPanel(
      panel,
      context.extensionUri,
      timing,
      assets
    );
  }

  static async preloadAssets(extensionUri: vscode.Uri): Promise<WebviewAssets> {
    const [stream, columns, renderer, script, style, workbench] = await Promise.all([
      vscode.workspace.fs.readFile(vscode.Uri.joinPath(extensionUri, 'media', 'row-stream.js')),
      vscode.workspace.fs.readFile(vscode.Uri.joinPath(extensionUri, 'media', 'column-window.js')),
      vscode.workspace.fs.readFile(vscode.Uri.joinPath(extensionUri, 'media', 'grid-renderer.js')),
      vscode.workspace.fs.readFile(vscode.Uri.joinPath(extensionUri, 'media', 'main.js')),
      vscode.workspace.fs.readFile(vscode.Uri.joinPath(extensionUri, 'media', 'main.css')),
      vscode.workspace.fs.readFile(vscode.Uri.joinPath(extensionUri, 'media', 'workbench.css'))
    ]);
    const decoder = new TextDecoder();
    return { script: `${decoder.decode(stream)}\n${decoder.decode(columns)}\n${decoder.decode(renderer)}\n${decoder.decode(script)}`, style: `${decoder.decode(style)}\n${decoder.decode(workbench)}` };
  }

  async setComparison(comparison: WorkbookComparison): Promise<void> {
    this.comparison = comparison;
    await this.initialize();
  }

  async showLoadError(message: string): Promise<void> {
    this.loadError = message;
    await this.initialize();
  }

  private async initialize(): Promise<void> {
    if (this.disposed || !this.ready) { return; }
    if (this.loadError) {
      await this.panel.webview.postMessage({ type: 'loadError', message: this.loadError });
      return;
    }
    if (!this.comparison) { return; }
    const configuration = vscode.workspace.getConfiguration('excelDiffViewer');
    const sendStartedAt = performance.now();
    await this.panel.webview.postMessage({
      type: 'initialize',
      summary: this.comparison.summary,
      showUnchangedSheets: configuration.get<boolean>('showUnchangedSheets', true),
      theme: configuration.get<'dark' | 'light'>('theme', 'dark'),
      diffMode: configuration.get<'sideBySide' | 'unified'>('diffMode', 'sideBySide'),
      textDiffGranularity: configuration.get<TextDiffGranularity>('textDiffGranularity', 'character'),
      textDiffLayout: configuration.get<TextDiffLayout>('textDiffLayout', 'sideBySide'),
      navigationUnit: configuration.get<'cell' | 'row'>('navigationUnit', 'cell'),
      rowFilter: configuration.get<RowFilter>('rowFilter', 'all'),
      focusChanges: configuration.get<boolean>('focusChanges', false),
      cellHoverDelay: getCellHoverDelay()
    });
    this.timing.measure('send Webview initialize', sendStartedAt);
  }

  private async onMessage(message: WebviewMessage): Promise<void> {
    if (this.disposed) {
      return;
    }
    if (message.type === 'ready') {
      this.ready = true;
      this.timing.mark('Webview ready');
      await this.initialize();
      return;
    }
    if (message.type === 'timing') {
      if (Number.isFinite(message.durationMs) && message.durationMs >= 0) {
        this.timing.record(`Webview ${message.stage}`, message.durationMs);
      }
      return;
    }
    if (!this.comparison) { return; }
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
    if (message.type === 'requestRows') {
      if (message.requestId < this.latestViewRequest) { return; }
      if (message.requestId > this.latestViewRequest) {
        this.latestViewRequest = message.requestId;
        this.rowQueue = [];
      }
      this.rowQueue.push(message);
      if (!this.drainingRows) { void this.drainRows(); }
      return;
    }
    if (message.type === 'requestFind' || message.type === 'requestLocate') {
      const filter = isRowFilter(message.filter) ? message.filter : 'all';
      const target = message.type === 'requestFind'
        ? this.comparison.getSearchTarget(message.sheet, message.text, message.row, message.column, message.direction,
          filter, message.query, viewOptions(message), message.includeCurrent === true)
        : this.comparison.getLocationTarget(message.sheet, message.location, filter, message.query, viewOptions(message));
      await this.panel.webview.postMessage({ type: message.type === 'requestFind' ? 'findResult' : 'location', target,
        requestId: message.requestId, viewRequestId: message.viewRequestId });
      return;
    }
    if (message.type === 'requestChange') {
      const target = this.comparison.getNavigationTarget(
        message.sheet,
        message.row,
        message.column,
        message.direction === 'previous' ? 'previous' : 'next',
        message.unit === 'row' ? 'row' : 'cell',
        isRowFilter(message.filter) ? message.filter : 'all',
        typeof message.query === 'string' ? message.query : '',
        viewOptions(message)
      );
      await this.panel.webview.postMessage({ type: 'navigation', target, requestId: message.requestId, viewRequestId: message.viewRequestId });
      return;
    }
    if (message.type === 'updateSetting') {
      const allowed = message.key === 'focusChanges' ? typeof message.value === 'boolean'
        : typeof message.value === 'string' && (message.key === 'theme'
        ? message.value === 'dark' || message.value === 'light'
        : message.key === 'diffMode'
          ? message.value === 'sideBySide' || message.value === 'unified'
          : message.key === 'textDiffGranularity'
            ? isTextDiffGranularity(message.value)
            : message.key === 'textDiffLayout'
              ? isTextDiffLayout(message.value)
              : message.key === 'navigationUnit'
                ? message.value === 'cell' || message.value === 'row'
                : isRowFilter(message.value));
      if (allowed) {
        await vscode.workspace
          .getConfiguration('excelDiffViewer')
          .update(message.key, message.value, vscode.ConfigurationTarget.Global);
      }
    }
  }

  private async drainRows(): Promise<void> {
    this.drainingRows = true;
    while (this.rowQueue.length && !this.disposed) {
      await new Promise<void>((resolve) => setImmediate(resolve));
      const message = this.rowQueue.shift();
      if (!message || message.requestId !== this.latestViewRequest || !this.comparison) { continue; }
      const firstRows = !this.firstRowsRequested;
      this.firstRowsRequested = true;
      if (firstRows) {
        this.timing.mark('first rows requested');
      }
      try {
        const rowsStartedAt = performance.now();
        const rows = this.comparison.getRows(
          message.sheet,
          Number.isFinite(message.offset) ? message.offset : 0,
          Number.isFinite(message.limit) ? message.limit : 200,
          isRowFilter(message.filter) ? message.filter : 'all',
          typeof message.query === 'string' ? message.query : '',
          viewOptions(message),
          Array.isArray(message.columns) ? message.columns.filter(Number.isInteger) : undefined
        );
        if (firstRows) {
          this.timing.measure('build first rows', rowsStartedAt);
        }
        const sendStartedAt = performance.now();
        await this.panel.webview.postMessage({ type: 'rows', rows, requestId: message.requestId });
        if (firstRows) {
          this.timing.measure('send first rows', sendStartedAt);
        }
      } catch (error) {
        await this.panel.webview.postMessage({
          type: 'error',
          requestId: message.requestId,
          offset: message.offset,
          message: error instanceof Error ? error.message : String(error)
        });
      }
    }
    this.drainingRows = false;
  }

  private renderHtml(webview: vscode.Webview): string {
    const theme = vscode.workspace.getConfiguration('excelDiffViewer').get<string>('theme') === 'light'
      ? 'light' : 'dark';
    const nonce = createNonce();
    const scriptUri = webview.asWebviewUri(vscode.Uri.joinPath(this.extensionUri, 'media', 'main.js'));
    const streamUri = webview.asWebviewUri(vscode.Uri.joinPath(this.extensionUri, 'media', 'row-stream.js'));
    const columnUri = webview.asWebviewUri(vscode.Uri.joinPath(this.extensionUri, 'media', 'column-window.js'));
    const rendererUri = webview.asWebviewUri(vscode.Uri.joinPath(this.extensionUri, 'media', 'grid-renderer.js'));
    const styleUri = webview.asWebviewUri(vscode.Uri.joinPath(this.extensionUri, 'media', 'main.css'));
    const workbenchUri = webview.asWebviewUri(vscode.Uri.joinPath(this.extensionUri, 'media', 'workbench.css'));
    const csp = [
      "default-src 'none'",
      `style-src 'nonce-${nonce}' ${webview.cspSource}`,
      `script-src 'nonce-${nonce}'`,
      `img-src ${webview.cspSource} data:`
    ].join('; ');
    const styleTag = this.assets
      ? `<style nonce="${nonce}">${this.assets.style.replace(/<\/style/gi, '<\\/style')}</style>`
      : `<link rel="stylesheet" href="${styleUri}"><link rel="stylesheet" href="${workbenchUri}">`;
    const scriptTag = this.assets
      ? `<script nonce="${nonce}">${this.assets.script.replace(/<\/script/gi, '<\\/script')}</script>`
      : `<script nonce="${nonce}" src="${streamUri}"></script><script nonce="${nonce}" src="${columnUri}"></script><script nonce="${nonce}" src="${rendererUri}"></script><script nonce="${nonce}" src="${scriptUri}"></script>`;

    return /* html */ `<!doctype html>
<html lang="en" data-theme="${theme}">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="Content-Security-Policy" content="${csp}">
  ${styleTag}
  <title>Excel Diff Viewer</title>
</head>
<body>
  <div id="app" class="app loading">
    <header class="topbar">
      <div class="brand" aria-label="Excel Diff Viewer">
        <div class="brand-mark" aria-hidden="true"><svg viewBox="0 0 24 24"><rect x="3" y="3" width="18" height="18" rx="3"/><path d="M3 9h18M9 9v12M13 13h5M15.5 16v3M14 17.5h3"/></svg></div>
        <strong>Excel Diff</strong>
      </div>
      <div class="file-comparison">
        <div class="file-card left-file">
          <span class="side-label">Before</span>
          <div><strong id="left-name">Loading…</strong><span id="left-detail"></span></div>
        </div>
        <div class="compare-arrow" aria-hidden="true">→</div>
        <div class="file-card right-file">
          <span class="side-label">After</span>
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
      ><svg viewBox="0 0 16 16" aria-hidden="true"><path d="M9 2h5v5M14 2 7 9M6 3H3a1 1 0 0 0-1 1v9a1 1 0 0 0 1 1h9a1 1 0 0 0 1-1v-3"/></svg><span>Open</span></button>
    </header>

    <div class="workspace">
      <main class="main">
        <div class="toolbar">
          <div class="toolbar-primary">
            <div class="sheet-picker">
              <span class="sheet-icon" aria-hidden="true"><svg viewBox="0 0 20 20"><rect x="3" y="3" width="14" height="14" rx="2"/><path d="M3 8h14M8 8v9"/></svg></span>
              <select id="sheet-select" aria-label="Select worksheet"></select>
              <span id="sheet-dimensions" class="sheet-dimensions"></span>
            </div>
            <div class="search-box">
              <svg viewBox="0 0 16 16" aria-hidden="true"><circle cx="6.7" cy="6.7" r="4.2"/><path d="m10 10 3.4 3.4"/></svg>
              <input id="search" type="search" placeholder="Find in worksheet" autocomplete="off" aria-label="Find text">
              <span id="find-status" class="find-status" role="status"></span>
              <div class="find-actions">
                <button id="find-previous" class="icon-button" type="button" title="Previous match (Shift+Enter)" aria-label="Previous match"><svg viewBox="0 0 16 16" aria-hidden="true"><path d="m4 10 4-4 4 4"/></svg></button>
                <button id="find-next" class="icon-button" type="button" title="Next match (Enter)" aria-label="Next match"><svg viewBox="0 0 16 16" aria-hidden="true"><path d="m4 6 4 4 4-4"/></svg></button>
              </div>
            </div>
            <div class="view-settings">
              <div id="diff-mode-switch" class="mode-switch" role="group" aria-label="Comparison layout">
                <button class="icon-button" type="button" data-mode="sideBySide" aria-label="Side by side" aria-pressed="true" data-tooltip="Side by side: compare the two worksheets next to each other"><svg viewBox="0 0 16 16" aria-hidden="true"><rect x="2" y="2" width="12" height="12" rx="1.5"/><path d="M8 2v12"/></svg></button>
                <button class="icon-button" type="button" data-mode="unified" aria-label="Combined" aria-pressed="false" data-tooltip="Combined: show before and after values in one table"><svg viewBox="0 0 16 16" aria-hidden="true"><rect x="2" y="2" width="12" height="12" rx="1.5"/><path d="M5 6h6M5 10h6"/></svg></button>
              </div>
              <button id="focus-changes" class="icon-button focus-button" type="button" aria-pressed="false" aria-label="Hide unrelated rows and columns">
                <svg class="focus-collapse" viewBox="0 0 16 16" aria-hidden="true"><path d="m4 2 4 4 4-4M3 8h10m-9 6 4-4 4 4"/></svg>
                <svg class="focus-expand" viewBox="0 0 16 16" aria-hidden="true"><path d="m4 5 4-4 4 4M3 8h10m-9 3 4 4 4-4"/></svg>
              </button>
              <button id="display-options-button" class="quiet-button" type="button" popovertarget="display-options" aria-expanded="false" title="Display options">
                <svg viewBox="0 0 16 16" aria-hidden="true"><path d="M2 4h12M2 12h12M6 2v4M10 10v4"/></svg><span>Options</span>
              </button>
            </div>
          </div>
          <div class="toolbar-secondary">
            <div class="segmented" role="group" aria-label="Difference filter">
              <button class="filter active" data-filter="all">All</button>
              <button class="filter" data-filter="changed" data-tooltip="Rows containing any difference">Changes</button>
              <button class="filter" data-filter="modified" data-tooltip="Edits to existing values; skip added or removed cells">Edits</button>
              <button class="filter" data-filter="added" data-tooltip="New rows, columns, or cell values">Added</button>
              <button class="filter" data-filter="removed" data-tooltip="Deleted rows, columns, or cell values">Removed</button>
            </div>
            <div class="review-navigation">
              <div class="change-navigation" aria-label="Change navigation">
                <span id="change-position" class="change-position" role="status">No changes</span>
                <button id="previous-change" class="icon-button" title="Previous change (Shift+F7)" aria-label="Previous change"><svg viewBox="0 0 16 16" aria-hidden="true"><path d="m4 10 4-4 4 4"/></svg></button>
                <button id="next-change" class="icon-button" title="Next change (F7)" aria-label="Next change"><svg viewBox="0 0 16 16" aria-hidden="true"><path d="m4 6 4 4 4-4"/></svg></button>
              </div>
            </div>
          </div>
        </div>
        <div id="display-options" class="display-options" popover aria-label="Display options">
          <div class="options-title">Display options</div>
          <section class="option-group" aria-label="Appearance">
            <h3 class="option-heading">Appearance</h3>
            <label class="option-row"><span>Theme</span><select id="theme-select" aria-label="Color theme"><option value="dark">Dark</option><option value="light">Light</option></select></label>
            <div class="option-row"><span>Freeze first</span><div class="freeze-settings">
              <label><input id="freeze-rows" type="number" min="0" max="20" step="1" value="0" aria-label="Freeze first rows"> rows</label>
              <label><input id="freeze-columns" type="number" min="0" max="20" step="1" value="0" aria-label="Freeze first columns"> columns</label>
            </div></div>
            <span id="freeze-note" class="option-note" role="status"></span>
          </section>
          <section class="option-section option-group" aria-label="Find and navigate">
            <h3 class="option-heading">Find &amp; navigate</h3>
            <label class="option-row"><span>Move between</span><select id="navigation-unit-select" aria-label="Change navigation unit"><option value="cell">Changed cells</option><option value="row">Changed rows</option></select></label>
            <label class="option-row address-box"><span>Go to row or cell <kbd>⌃/⌘ G</kbd></span><input id="go-to" placeholder="218 or C218" aria-label="Go to row or cell in the active side" title="Enter a row number or cell address, then press Enter. A row number keeps the current column."></label>
            <label class="option-checkbox"><input id="match-only" type="checkbox"> Show only rows matching the search</label>
          </section>
          <section class="option-section option-group" aria-label="Other changed sheets">
            <h3 class="option-heading">Other changed sheets</h3>
            <div class="sheet-navigation">
              <button id="previous-sheet-change" class="quiet-button" title="Previous worksheet with changes">← Previous</button>
              <button id="next-sheet-change" class="quiet-button" title="Next worksheet with changes">Next →</button>
            </div>
          </section>
          <div class="options-hint"><span>Previous / next change</span><kbd>Shift F7 / F7</kbd></div>
        </div>

        <div id="error-banner" class="error-banner" hidden></div>
        <div class="column-labels">
          <div class="side-label-heading before-heading"><span class="legend-dot removed"></span><strong>Before</strong></div>
          <div class="side-label-heading after-heading"><span class="legend-dot added"></span><strong>After</strong></div>
          <div class="unified-heading"><span class="legend-dot changed"></span><strong>Combined</strong><span>Before → After</span></div>
        </div>
        <div id="grid-shell" class="grid-shell">
          <section class="grid-pane left-pane">
            <div id="left-grid" class="grid-scroll" tabindex="0" aria-label="Before worksheet. Use arrow keys to select cells, Enter for details."></div>
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
            <div id="right-grid" class="grid-scroll" tabindex="0" aria-label="After worksheet. Use arrow keys to select cells, Enter for details."></div>
          </section>
          <section class="grid-pane unified-pane">
            <div id="unified-grid" class="grid-scroll" tabindex="0" aria-label="Combined worksheet. Use arrow keys to select cells, Enter for details."></div>
          </section>
          <div class="load-status" role="status">Reading and comparing workbooks…</div>
          <div id="empty-state" class="empty-state" hidden>
            <div id="empty-icon" class="empty-icon" aria-hidden="true">⌕</div>
            <strong id="empty-title">No rows match this view</strong>
            <span id="empty-detail">Try another filter or search term.</span>
            <button id="empty-show-changes" class="action-button" hidden>Show all changes</button>
          </div>
        </div>

        <aside id="details-panel" class="details-panel" hidden aria-label="Selected cell details">
          <header><strong id="details-address">Select a cell</strong><button id="close-details" class="compact-button" aria-label="Close details">×</button></header>
          <div id="details-content" class="details-content"></div>
        </aside>
        <div id="navigation-notice" class="navigation-notice" role="status" hidden></div>
        <footer class="footer">
          <div class="row-status">
            <span id="row-range">Rows 0 of 0</span>
            <span id="row-loading" role="status" hidden>Loading rows…</span><button id="retry-rows" class="compact-button" hidden>Retry</button>
          </div>
          <div id="cell-inspector" class="cell-inspector" tabindex="0">Select a cell for details</div>
          <div class="footer-actions">
            <span id="filter-summary" class="filter-summary" aria-live="polite"></span>
            <button id="toggle-details" class="quiet-button" title="Keep cell details open" aria-pressed="false"><svg viewBox="0 0 16 16" aria-hidden="true"><rect x="2" y="2" width="12" height="12" rx="1"/><path d="M2 9h12"/></svg>Details</button>
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
              <span>Compare by</span>
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
  ${scriptTag}
</body>
</html>`;
  }
}

function viewOptions(message: ViewOptions): ViewOptions {
  return {
    freezeRows: Number.isFinite(message.freezeRows) ? message.freezeRows : 0,
    freezeColumns: Number.isFinite(message.freezeColumns) ? message.freezeColumns : 0,
    focusChanges: message.focusChanges === true,
    expandedRows: Array.isArray(message.expandedRows) ? message.expandedRows.filter(Number.isInteger) : [],
    expandedColumns: Array.isArray(message.expandedColumns) ? message.expandedColumns.filter(Number.isInteger) : []
  };
}

function getCellHoverDelay(): number {
  const value = vscode.workspace.getConfiguration('excelDiffViewer').get<number>('cellHoverDelay', 150);
  return Number.isFinite(value) ? Math.max(0, Math.min(2000, value)) : 150;
}

function isRowFilter(value: string): value is RowFilter {
  return value === 'all' || value === 'changed' || value === 'modified' || value === 'added' || value === 'removed';
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
