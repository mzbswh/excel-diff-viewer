(() => {
  const vscode = acquireVsCodeApi();
  const previousState = vscode.getState() || {};
  const state = {
    summary: null,
    sheet: previousState.sheet || '',
    offset: Number.isInteger(previousState.offset) ? previousState.offset : 0,
    filter: previousState.filter || 'all',
    query: previousState.query || '',
    rowData: null,
    showUnchangedSheets: true,
    theme: 'dark',
    diffMode: 'sideBySide',
    textDiffGranularity: normalizeTextDiffGranularity(previousState.textDiffGranularity),
    textDiffLayout: normalizeTextDiffLayout(previousState.textDiffLayout),
    navigationUnit: 'cell',
    cellHoverDelay: 150,
    selectedCell: null,
    pendingFocus: null,
    splitRatio: Number.isFinite(previousState.splitRatio)
      ? Math.max(0.1, Math.min(0.9, previousState.splitRatio))
      : 0.5,
    requestId: 0,
    navigationRequestId: 0,
    freezeRows: normalizeFreeze(previousState.freezeRows),
    freezeColumns: normalizeFreeze(previousState.freezeColumns),
    focusChanges: previousState.focusPreferenceVersion === 2 && previousState.focusChanges === true,
    expandedRows: [],
    expandedColumns: [],
    sheetSizes: previousState.sheetSizes || {},
    findText: previousState.findText ?? previousState.query ?? '',
    matchOnly: previousState.matchOnly === true,
    sheetViews: previousState.sheetViews || {},
    detailsOpen: previousState.detailsOpen === true,
    activeSide: 'right',
    dataRequestId: 0,
    findRequestId: 0,
    locationRequestId: 0,
    columnView: null,
    selectedColumns: [],
    changePosition: null
  };

  const elements = {
    app: document.getElementById('app'),
    leftName: document.getElementById('left-name'),
    leftDetail: document.getElementById('left-detail'),
    rightName: document.getElementById('right-name'),
    rightDetail: document.getElementById('right-detail'),
    summary: document.getElementById('summary'),
    openLocalFile: document.getElementById('open-local-file'),
    sheetSelect: document.getElementById('sheet-select'),
    sheetDimensions: document.getElementById('sheet-dimensions'),
    themeSelect: document.getElementById('theme-select'),
    diffModeSwitch: document.getElementById('diff-mode-switch'),
    search: document.getElementById('search'),
    freezeRows: document.getElementById('freeze-rows'),
    freezeColumns: document.getElementById('freeze-columns'),
    focusChanges: document.getElementById('focus-changes'),
    filterSummary: document.getElementById('filter-summary'),
    freezeNote: document.getElementById('freeze-note'),
    leftGrid: document.getElementById('left-grid'),
    rightGrid: document.getElementById('right-grid'),
    unifiedGrid: document.getElementById('unified-grid'),
    columnLabels: document.querySelector('.column-labels'),
    gridShell: document.getElementById('grid-shell'),
    splitter: document.getElementById('splitter'),
    emptyState: document.getElementById('empty-state'),
    emptyIcon: document.getElementById('empty-icon'),
    emptyTitle: document.getElementById('empty-title'),
    emptyDetail: document.getElementById('empty-detail'),
    emptyShowChanges: document.getElementById('empty-show-changes'),
    errorBanner: document.getElementById('error-banner'),
    rowRange: document.getElementById('row-range'),
    rowLoading: document.getElementById('row-loading'),
    previousChange: document.getElementById('previous-change'),
    nextChange: document.getElementById('next-change'),
    navigationUnitSelect: document.getElementById('navigation-unit-select'),
    cellInspector: document.getElementById('cell-inspector'),
    cellComparisonDialog: document.getElementById('cell-comparison-dialog'),
    cellComparisonAddress: document.getElementById('cell-comparison-address'),
    cellComparisonBody: document.getElementById('cell-comparison-body'),
    cellComparisonGranularity: document.getElementById('cell-comparison-granularity'),
    cellComparisonLayout: document.getElementById('cell-comparison-layout'),
    closeCellComparison: document.getElementById('close-cell-comparison'),
    hoverTooltip: document.getElementById('hover-tooltip')
  };

  const extraElements = ['find-status', 'find-previous', 'find-next', 'match-only', 'go-to', 'change-position',
    'previous-sheet-change', 'next-sheet-change', 'display-options', 'display-options-button', 'toggle-details', 'details-panel',
    'details-address', 'details-content', 'close-details', 'navigation-notice', 'retry-rows'];
  for (const id of extraElements) { elements[id.replace(/-([a-z])/g, (_, letter) => letter.toUpperCase())] = document.getElementById(id); }
  let searchTimer;
  let persistTimer;
  let noticeTimer;
  let logicalTop = 0;
  let restoreHorizontal = null;
  let restoreIntra = 0;
  let restoreSelection = null;
  let pendingSheetDirection = null;
  const sheetSelections = new Map();
  const programmaticScroll = new WeakMap();
  const columnWindow = new WorksheetColumnWindow();
  const gridRenderers = new Map([elements.leftGrid, elements.rightGrid, elements.unifiedGrid]
    .map((grid) => [grid, new WorksheetGridRenderer(grid)]));
  let syncingScroll = false;
  let cellResize = null;
  let cellResizeFrame = null;
  let activeTooltipTarget = null;
  let tooltipHideTimer;
  let tooltipShowTimer;
  let pendingTooltipTarget = null;
  let activeDialogComparison = null;
  let firstRowsRendered = false;
  const comparisonTooltips = new WeakMap();
  const textDiffMatrixLimit = 1_000_000;
  const graphemeSegmenter = typeof Intl.Segmenter === 'function'
    ? new Intl.Segmenter(undefined, { granularity: 'grapheme' })
    : null;
  const wordSegmenter = typeof Intl.Segmenter === 'function'
    ? new Intl.Segmenter(undefined, { granularity: 'word' })
    : null;

  window.addEventListener('message', (event) => {
    const message = event.data;
    if (message.type === 'initialize') {
      const startedAt = performance.now();
      initialize(
        message.summary,
        message.showUnchangedSheets,
        message.theme,
        message.diffMode,
        message.textDiffGranularity,
        message.textDiffLayout,
        message.navigationUnit,
        message.rowFilter,
        message.focusChanges,
        message.cellHoverDelay
      );
      vscode.postMessage({ type: 'timing', stage: 'initialize', durationMs: performance.now() - startedAt });
    } else if (message.type === 'cellHoverDelayChanged') {
      state.cellHoverDelay = normalizeCellHoverDelay(message.delay);
    } else if (message.type === 'loadError') {
      elements.app.classList.remove('loading');
      showError(message.message);
    } else if (message.type === 'rows') {
      if (message.requestId === state.dataRequestId) { receiveRows(message.rows); }
    } else if (message.type === 'navigation') {
      if (message.requestId === state.navigationRequestId && message.viewRequestId === state.requestId) {
        receiveNavigation(message.target);
      }
    } else if (message.type === 'findResult') {
      if (message.requestId === state.findRequestId && message.viewRequestId === state.requestId) {
        const target = message.target;
        elements.findStatus.textContent = target ? `${target.ordinal} / ${formatNumber(target.total)}` : 'No matches';
        elements.findPrevious.disabled = elements.findNext.disabled = !target;
        if (target?.wrapped) { announce(target.ordinal === 1 ? 'Back to the first match.' : 'Back to the last match.'); }
        if (target) { jumpToTarget(target, 'find'); }
      }
    } else if (message.type === 'location') {
      if (message.requestId === state.locationRequestId && message.viewRequestId === state.requestId) {
        if (message.target) { jumpToTarget(message.target, 'location'); }
        else { announce('That row or cell is not in this view. Check the row number or address, or show all rows and columns.'); }
      }
    } else if (message.type === 'error' && message.requestId === state.dataRequestId) {
      elements.app.classList.remove('loading');
      for (const grid of [elements.leftGrid, elements.rightGrid, elements.unifiedGrid]) {
        grid.removeAttribute('aria-busy');
      }
      rowStream.fail(message.offset);
      elements.rowLoading.hidden = true;
      elements.retryRows.hidden = false;
      showError(message.message);
    }
  });

  function initialize(
    summary,
    showUnchangedSheets,
    theme,
    diffMode,
    textDiffGranularity,
    textDiffLayout,
    navigationUnit,
    rowFilter,
    focusChanges,
    cellHoverDelay
  ) {
    state.summary = summary;
    state.focusChanges = focusChanges === true;
    state.cellHoverDelay = normalizeCellHoverDelay(cellHoverDelay);
    state.showUnchangedSheets = showUnchangedSheets;
    state.theme = theme === 'light' ? 'light' : 'dark';
    state.diffMode = diffMode === 'unified' ? 'unified' : 'sideBySide';
    state.textDiffGranularity = normalizeTextDiffGranularity(textDiffGranularity);
    state.textDiffLayout = normalizeTextDiffLayout(textDiffLayout);
    state.navigationUnit = navigationUnit === 'row' ? 'row' : 'cell';
    state.filter = ['all', 'changed', 'modified', 'added', 'removed'].includes(rowFilter) ? rowFilter : 'all';
    const leftFileTooltip = formatFileTooltip(summary.left);
    const rightFileTooltip = formatFileTooltip(summary.right);
    elements.leftName.textContent = summary.left.name;
    setTooltip(elements.leftName, leftFileTooltip);
    elements.leftDetail.textContent = summary.left.detail;
    setTooltip(elements.leftDetail, leftFileTooltip);
    setTooltip(elements.leftName.closest('.file-card'), leftFileTooltip);
    elements.rightName.textContent = summary.right.name;
    setTooltip(elements.rightName, rightFileTooltip);
    elements.rightDetail.textContent = summary.right.detail;
    setTooltip(elements.rightDetail, rightFileTooltip);
    setTooltip(elements.rightName.closest('.file-card'), rightFileTooltip);
    state.query = state.matchOnly ? state.findText : '';
    elements.search.value = state.findText;
    elements.matchOnly.checked = state.matchOnly;
    elements.search.closest('.search-box').classList.toggle('has-query', Boolean(state.findText.trim()));
    elements.findPrevious.disabled = elements.findNext.disabled = !state.findText.trim();
    elements.detailsPanel.hidden = !state.detailsOpen;
    elements.toggleDetails.setAttribute('aria-pressed', String(state.detailsOpen));
    elements.freezeRows.value = state.freezeRows;
    elements.freezeColumns.value = state.freezeColumns;
    syncFocusButton();
    renderSummary();
    renderSheetSelector();
    applyTheme(state.theme);
    applyDiffMode(state.diffMode, false);
    syncTextDiffControls();
    applyNavigationUnit(state.navigationUnit);

    const visibleSheets = getVisibleSheets();
    if (!visibleSheets.some((sheet) => sheet.name === state.sheet)) {
      const firstChanged = visibleSheets.find((sheet) => sheet.status !== 'unchanged');
      state.sheet = (firstChanged || visibleSheets[0] || {}).name || '';
      state.offset = 0;
    }
    updateFilterButtons();
    applySplitRatio();
    if (state.sheet) {
      selectSheet(state.sheet, false);
    } else {
      elements.app.classList.remove('loading');
      const option = document.createElement('option');
      option.textContent = 'No worksheets';
      elements.sheetSelect.append(option);
      elements.sheetSelect.disabled = true;
      elements.emptyState.hidden = false;
      elements.emptyTitle.textContent = 'No worksheets';
      elements.emptyDetail.textContent = 'Neither workbook contains a worksheet to compare.';
    }
  }

  function renderSummary() {
    elements.summary.replaceChildren();
    const columnCounts = { changed: 0, added: 0, removed: 0 };
    for (const sheet of state.summary.sheets) {
      for (const key of Object.keys(columnCounts)) { columnCounts[key] += sheet.columnChanges[key]; }
    }
    const items = [
      ['Affected rows', state.summary.totals.rows],
      ['Column structure', columnCounts],
      ['Changed cells', state.summary.totals.cells]
    ];
    for (const [label, counts] of items) {
      const item = document.createElement('div');
      item.className = 'summary-pill changed';
      const strong = document.createElement('strong');
      strong.textContent = formatNumber(totalChanges(counts));
      const copy = document.createElement('div');
      const span = document.createElement('span');
      span.textContent = label;
      const detail = document.createElement('em');
      detail.textContent = `+${counts.added} / ~${counts.changed} / −${counts.removed}`;
      copy.append(span, detail);
      setTooltip(item, `${label}: ${counts.added} added · ${counts.changed} ${label === 'Column structure' ? 'renamed' : 'modified'} · ${counts.removed} removed`);
      item.append(strong, copy);
      elements.summary.append(item);
    }
  }

  function getVisibleSheets() {
    if (!state.summary) {
      return [];
    }
    return state.showUnchangedSheets
      ? state.summary.sheets
      : state.summary.sheets.filter((sheet) => sheet.status !== 'unchanged');
  }

  function renderSheetSelector() {
    const sheets = getVisibleSheets();
    elements.sheetSelect.replaceChildren();
    for (const sheet of sheets) {
      const option = document.createElement('option');
      option.value = sheet.name;
      const changedRows = totalChanges(sheet.rowChanges);
      const changedCells = totalChanges(sheet.cellChanges);
      const changeLabel = changedRows
        ? `${formatNumber(changedRows)} ${pluralize('row', changedRows)} · ${formatNumber(changedCells)} ${pluralize('cell', changedCells)}`
        : 'unchanged';
      option.textContent = sheet.name;
      option.dataset.tooltip = `${sheet.name} · ${formatNumber(sheet.rows)} rows × ${formatNumber(sheet.columns)} columns · ${changeLabel}`;
      option.selected = sheet.name === state.sheet;
      elements.sheetSelect.append(option);
    }
  }

  function selectSheet(name, resetScroll) {
    const sheet = state.summary.sheets.find((candidate) => candidate.name === name);
    if (!sheet) {
      return;
    }
    if (name !== state.sheet) { saveSheetPosition(); }
    state.sheet = name;
    const saved = state.sheetViews[name];
    const canRestore = saved && saved.filter === state.filter && saved.query === state.query;
    state.expandedRows = canRestore ? saved.expandedRows || [] : [];
    state.expandedColumns = canRestore ? saved.expandedColumns || [] : [];
    if (resetScroll) { state.offset = canRestore ? saved.offset : 0; }
    restoreIntra = canRestore ? saved.intra || 0 : 0;
    restoreHorizontal = canRestore ? saved.left || 0 : 0;
    restoreSelection = canRestore ? saved.selectedCell : null;
    elements.sheetSelect.value = name;
    const changedRows = totalChanges(sheet.rowChanges);
    const changedCells = totalChanges(sheet.cellChanges);
    elements.sheetDimensions.textContent = changedRows
      ? `${formatNumber(sheet.rows)} × ${formatNumber(sheet.columns)} · ${formatNumber(changedRows)} changed ${pluralize('row', changedRows)} · ${formatNumber(changedCells)} ${pluralize('cell', changedCells)}`
      : `${formatNumber(sheet.rows)} × ${formatNumber(sheet.columns)} · unchanged`;
    const structural = sheet.columnChanges;
    if (totalChanges(structural)) {
      elements.sheetDimensions.textContent += ` · columns +${structural.added} ~${structural.changed} −${structural.removed}`;
    }
    setTooltip(elements.sheetDimensions, elements.sheetDimensions.textContent);
    setTooltip(
      elements.sheetSelect,
      elements.sheetSelect.selectedOptions[0]?.dataset.tooltip || elements.sheetSelect.selectedOptions[0]?.textContent || ''
    );
    clearInspector();
    const selection = canRestore && sheetSelections.get(name);
    if (selection) { state.selectedRow = selection.row; state.selectedColumns = selection.columns; }
    persistState();
    requestRows();
  }

  const rowStream = new WorksheetRowStream((offset, limit) => {
    vscode.postMessage({
      type: 'requestRows', requestId: state.dataRequestId, sheet: state.sheet,
      offset, limit, columns: state.columnView?.columns.map((column) => column.index),
      filter: state.filter, query: state.query, ...viewOptions()
    });
  });
  let viewportFrame = null;
  let viewportKey = '';
  let restoreOffset = null;
  let preserveViewport = false;
  let rowExpansionAnchor = null;

  function viewOptions() {
    return {
      freezeRows: state.freezeRows, freezeColumns: state.freezeColumns,
      focusChanges: state.focusChanges, expandedRows: state.expandedRows,
      expandedColumns: state.expandedColumns
    };
  }

  function activeGrid() {
    return state.diffMode === 'unified' ? elements.unifiedGrid : state.activeSide === 'left' ? elements.leftGrid : elements.rightGrid;
  }

  function scrollViewportHeight() {
    const grid = activeGrid();
    const pinned = parseFloat(grid.style.scrollPaddingTop) || 29;
    return Math.max(32, grid.clientHeight - pinned);
  }

  function writeScroll(grid, top, left) {
    grid.scrollTop = top;
    if (left !== undefined) { grid.scrollLeft = left; }
    programmaticScroll.set(grid, { top: grid.scrollTop, left: grid.scrollLeft });
  }

  function moveScroll(top) {
    if (!rowStream.metadata) { return; }
    logicalTop = rowStream.metrics(top, scrollViewportHeight()).logical;
    scheduleViewport();
  }

  function saveSheetPosition() {
    if (!state.sheet || !rowStream.metadata) { return; }
    const offset = rowStream.indexAt(logicalTop);
    if (state.selectedCell && state.selectedRow?.index === state.selectedCell.row) {
      sheetSelections.set(state.sheet, { row: state.selectedRow, columns: state.selectedColumns });
    } else { sheetSelections.delete(state.sheet); }
    state.sheetViews = { ...state.sheetViews, [state.sheet]: {
      filter: state.filter, query: state.query, offset,
      intra: logicalTop - rowStream.heightBefore(offset), left: activeGrid().scrollLeft,
      selectedCell: state.selectedCell, expandedRows: state.expandedRows, expandedColumns: state.expandedColumns
    } };
  }

  function requestRows(keepViewport = false) {
    if (!state.sheet) { return; }
    preserveViewport = keepViewport;
    if (!keepViewport) { rowExpansionAnchor = null; }
    hideTooltip();
    state.requestId += 1;
    state.dataRequestId += 1;
    state.navigationRequestId += 1;
    state.findRequestId += 1;
    state.locationRequestId += 1;
    state.rowData = null;
    state.columnView = null;
    state.changePosition = null;
    viewportKey = '';
    restoreOffset = state.offset;
    rowStream.reset();
    elements.retryRows.hidden = true;
    elements.findStatus.textContent = '';
    for (const grid of [elements.leftGrid, elements.rightGrid, elements.unifiedGrid]) { grid.setAttribute('aria-busy', 'true'); }
    elements.rowLoading.hidden = false;
    rowStream.ensure(state.offset, state.offset + 1);
  }

  function receiveRows(batch) {
    if (batch.sheet !== state.sheet || batch.filter !== state.filter || batch.query !== state.query) { return; }
    const firstBatch = !rowStream.metadata;
    rowStream.receive(batch);
    if (firstBatch) {
      state.allColumns = batch.allColumns || batch.columns;
      updateFilterButtons(batch.filterCounts);
      const sheet = state.summary.sheets.find((entry) => entry.name === state.sheet);
      elements.filterSummary.textContent = `${batch.totalRows < sheet.rows ? `${formatNumber(batch.totalRows)} of ${formatNumber(sheet.rows)} rows · ` : ''}${state.allColumns.length < batch.totalColumns ? `${state.allColumns.length}/${batch.totalColumns}` : batch.totalColumns} columns`;
      const hiddenColumns = batch.totalColumns - state.allColumns.length;
      if (hiddenColumns > 0) {
        const showColumns = document.createElement('button');
        showColumns.className = 'show-hidden-columns';
        showColumns.textContent = `${hiddenColumns} columns hidden · Show all`;
        showColumns.addEventListener('click', () => {
          captureAnchor();
          state.expandedColumns = Array.from({ length: batch.totalColumns }, (_, index) => index);
          requestRows();
        });
        elements.filterSummary.append(' · ', showColumns);
      }
      updateChangePosition();
      if (restoreSelection) {
        state.selectedCell = restoreSelection;
        restoreSelection = null;
        renderInspector(getCellComparison(state.selectedCell.row, state.selectedCell.column));
        state.pendingFocus = { ...state.selectedCell };
      } else if (pendingSheetDirection) {
        const direction = pendingSheetDirection;
        pendingSheetDirection = null;
        requestChange(direction);
      } else if (!preserveViewport && state.findText.trim()) { requestFind('next', true); }
    }
    const range = state.rowData?.range;
    if (!range || (batch.offset < range.end && batch.offset + batch.entries.length > range.start) || batch.frozenRows.length && !state.rowData.frozenRows.length) {
      viewportKey = '';
      scheduleViewport();
    }
  }

  function scheduleViewport() {
    if (viewportFrame !== null) { return; }
    viewportFrame = requestAnimationFrame(() => {
      viewportFrame = null;
      renderViewport();
    });
  }

  function renderViewport() {
    if (!rowStream.metadata || cellResize) { return; }
    const startedAt = performance.now();
    const grid = activeGrid();
    if (restoreOffset !== null) {
      state.offset = Math.max(0, Math.min(restoreOffset, Math.max(0, rowStream.metadata.totalEntries - 1)));
      logicalTop = rowStream.heightBefore(state.offset) + restoreIntra;
      if (preserveViewport) {
        rowStream.trailingSpace = Math.max(0,
          logicalTop + scrollViewportHeight() - rowStream.heightBefore(rowStream.metadata.totalEntries));
      }
      restoreOffset = null;
      restoreIntra = 0;
    }
    logicalTop = rowStream.metrics(logicalTop, scrollViewportHeight()).logical;
    columnWindow.setColumns(state.allColumns, currentSizes().column, state.diffMode === 'unified' ? 100 : 48, state.freezeColumns);
    const width = state.diffMode === 'unified' ? grid.clientWidth : Math.max(elements.leftGrid.clientWidth, elements.rightGrid.clientWidth);
    const columns = columnWindow.visible(restoreHorizontal ?? grid.scrollLeft, width);
    if (columns.key !== state.columnView?.key) {
      state.columnView = columns;
      state.dataRequestId += 1;
      rowStream.clearData();
      rowStream.metadata.frozenRows = [];
      rowStream.batchSize = Math.max(4, Math.min(128, Math.floor(6000 / Math.max(1, columns.columns.length * 2))));
      viewportKey = '';
    } else { state.columnView = columns; }
    const range = rowStream.range(logicalTop, scrollViewportHeight());
    rowStream.ensure(range.start, range.end);
    const key = `${range.start}:${range.end}:${columns.key}:${state.diffMode}:${state.findText}`;
    if (viewportKey === key) {
      updateVirtualSpacers(state.rowData);
      syncPhysicalScroll();
      updateRowRange(range);
      persistState();
      return;
    }
    const entries = [];
    for (let position = range.start; position < range.end; position += 1) {
      entries.push({ ...(rowStream.entry(position) || { kind: 'loading' }), position });
    }
    const loading = entries.some((entry) => entry.kind === 'loading');
    // Keep the current table visible until the expanded view can replace it in one frame.
    if (preserveViewport && loading) { return; }
    viewportKey = key;
    const rows = entries.filter((entry) => entry.kind === 'row').map((entry) => entry.row);
    state.rowData = { ...rowStream.metadata, columns: columns.columns, slots: columns.slots, entries, rows,
      contextRows: entries.filter((entry) => entry.kind === 'row' && entry.context).map((entry) => entry.row), range };
    renderGrids(state.rowData);
    elements.rowLoading.hidden = !loading;
    if (elements.rowLoading.hidden) { preserveViewport = false; rowExpansionAnchor = null; }
    for (const pane of [elements.leftGrid, elements.rightGrid, elements.unifiedGrid]) { pane.removeAttribute('aria-busy'); }
    elements.app.classList.remove('loading');
    updateRowRange(range);
    persistState();
    if (!firstRowsRendered) {
      firstRowsRendered = true;
      vscode.postMessage({ type: 'timing', stage: 'firstRowsRender', durationMs: performance.now() - startedAt });
    }
  }

  function syncPhysicalScroll() {
    const metrics = rowStream.metrics(logicalTop, scrollViewportHeight());
    logicalTop = metrics.logical;
    const left = restoreHorizontal ?? activeGrid().scrollLeft;
    for (const grid of [elements.leftGrid, elements.rightGrid, elements.unifiedGrid]) {
      if (grid.clientWidth) {
        const headerVisible = state.rowData?.frozenRows.some((row) => row.index === 0) || state.rowData?.entries.some((entry) =>
          entry.kind === 'row' && entry.row.index === 0 && rowStream.heightBefore(entry.position + 1) > logicalTop);
        grid.classList.toggle('header-visible', Boolean(headerVisible));
        writeScroll(grid, metrics.physical, left);
      }
    }
    restoreHorizontal = null;
  }

  function renderGrids(data) {
    const focused = document.activeElement;
    const handle = focused?.closest('.cell-resizer');
    const focusedGrid = focused?.closest('.grid-scroll');
    const anchor = rowStream.indexAt(logicalTop);
    const intra = logicalTop - rowStream.heightBefore(anchor);
    const metrics = rowStream.metrics(logicalTop, scrollViewportHeight());
    const atBottom = !preserveViewport && metrics.logicalMax > 0 && metrics.logicalMax - logicalTop < 2;
    if (state.diffMode === 'unified') { updateTable(data, 'unified', elements.unifiedGrid); }
    else {
      updateTable(data, 'left', elements.leftGrid);
      updateTable(data, 'right', elements.rightGrid);
    }
    renderEmptyState(data);
    applyCellSizes();
    for (const row of activeGrid().querySelectorAll('tr[data-position]')) {
      rowStream.measure(Number(row.dataset.position), row.getBoundingClientRect().height);
    }
    applyFrozenPanes();
    logicalTop = atBottom ? rowStream.metrics(Infinity, scrollViewportHeight()).logicalMax
      : rowStream.heightBefore(anchor) + intra;
    updateVirtualSpacers(data);
    syncPhysicalScroll();
    restoreRowExpansionAnchor();
    if (state.pendingFocus) { focusSelectedCell(data); }
    highlightSelection();
    if (handle && focusedGrid && !handle.isConnected) {
      focusedGrid.querySelector(`[data-resize-kind="${handle.dataset.resizeKind}"][data-resize-index="${handle.dataset.resizeIndex}"]`)
        ?.focus({ preventScroll: true });
    }
  }

  function highlightSelection() {
    for (const cell of elements.gridShell.querySelectorAll('.selected, .selected-row')) {
      cell.classList.remove('selected', 'selected-row');
    }
    const target = state.selectedCell;
    if (!target) { return; }
    const selector = target.unit === 'row' ? `td[data-row="${target.row}"]`
      : `td[data-row="${target.row}"][data-column="${target.column}"]`;
    for (const cell of elements.gridShell.querySelectorAll(selector)) {
      if (target.unit === 'row') { cell.parentElement.classList.add('selected-row'); }
      if (Number(cell.dataset.column) === target.column) { cell.classList.add('selected'); }
    }
  }

  function renderEmptyState(data) {
    const empty = data.totalRows === 0;
    elements.emptyState.hidden = !empty;
    updateChangePosition();
    if (!empty) { return; }
    const sheet = state.summary.sheets.find((candidate) => candidate.name === data.sheet);
    const hasChanges = sheet && sheet.status !== 'unchanged';
    const searching = data.query.trim().length > 0;
    const unchanged = sheet && !hasChanges && !searching && data.filter !== 'all';
    elements.emptyState.classList.toggle('unchanged', Boolean(unchanged));
    elements.emptyIcon.textContent = unchanged ? '✓' : '⌕';
    const filterLabels = { modified: 'modified values', added: 'additions', removed: 'removals', changed: 'changes', all: 'rows' };
    elements.emptyTitle.textContent = unchanged ? 'This worksheet has no changes'
      : searching ? 'No results for this search and filter'
      : data.filter === 'all' ? 'This worksheet has no rows'
      : `No ${filterLabels[data.filter]} match this filter`;
    const changes = [];
    if (hasChanges) {
      for (const [key, label] of [['added', 'added'], ['removed', 'removed'], ['changed', 'renamed']]) {
        const count = sheet.columnChanges[key];
        if (count) { changes.push(`${count} ${label} ${pluralize('column', count)}`); }
      }
      for (const [key, label] of [['added', 'added'], ['removed', 'removed'], ['changed', 'modified']]) {
        const count = sheet.cellChanges[key];
        if (count) { changes.push(`${count} ${label} ${pluralize('cell', count)}`); }
      }
      if (!changes.length) { changes.push(`${totalChanges(sheet.rowChanges)} changed rows`); }
    }
    const explanation = data.filter === 'modified' ? 'Modified only includes edits to existing values.'
      : data.filter === 'added' ? 'Added includes new rows, columns, and cell values.'
      : data.filter === 'removed' ? 'Removed includes deleted rows, columns, and cell values.' : '';
    elements.emptyDetail.textContent = hasChanges
      ? `This worksheet still has ${changes.join(' · ')}. ${searching ? 'Clear the search or change the filter.' : explanation}`
      : unchanged ? 'The compared worksheet values are identical.'
      : searching ? 'Clear the search or change the filter.' : 'There are no populated rows to display.';
    elements.emptyShowChanges.hidden = !hasChanges;
  }

  function normalizeFreeze(value) {
    return Number.isFinite(Number(value)) ? Math.max(0, Math.min(20, Math.trunc(Number(value)))) : 0;
  }

  function displayRows(data) {
    return [...data.frozenRows, ...data.rows];
  }

  function findRow(rowIndex) {
    return (state.rowData && displayRows(state.rowData).find((row) => row.index === rowIndex)) ||
      (state.selectedRow?.index === rowIndex ? state.selectedRow : null);
  }

  function matchesCellFilter(status) {
    return state.filter === 'all' || state.filter === 'changed' || status === 'unchanged' ||
      status === (state.filter === 'modified' ? 'changed' : state.filter);
  }

  function applyFrozenPanes() {
    let limited = false;
    for (const grid of [elements.leftGrid, elements.rightGrid, elements.unifiedGrid]) {
      const table = grid.querySelector('table');
      if (!table || grid.clientWidth === 0) { continue; }
      for (const cell of table.querySelectorAll('.frozen-column')) {
        cell.classList.remove('frozen-column');
        cell.style.left = '';
      }
      const head = table.tHead;
      let left = head.rows[0].cells[0].getBoundingClientRect().width;
      let columnsFull = false;
      for (const th of head.querySelectorAll('th[data-column]')) {
        const column = Number(th.dataset.column);
        if (column >= state.freezeColumns) { continue; }
        const width = th.getBoundingClientRect().width;
        if (columnsFull || left + width > grid.clientWidth - 80) {
          columnsFull = true;
          limited = true;
          continue;
        }
        for (const cell of table.querySelectorAll(`[data-column="${column}"]`)) {
          cell.classList.add('frozen-column');
          cell.style.left = `${left}px`;
        }
        left += width;
      }
      let top = head.getBoundingClientRect().height;
      let rowsFull = false;
      for (const row of table.querySelectorAll('tbody tr[data-frozen-row]')) {
        const height = row.getBoundingClientRect().height;
        const fits = !rowsFull && top + height <= grid.clientHeight - 48;
        row.classList.toggle('frozen-row', fits);
        for (const cell of row.cells) { cell.style.top = fits ? `${top}px` : ''; }
        if (fits) { top += height; }
        else { rowsFull = true; limited = true; }
      }
      grid.style.scrollPaddingTop = `${top}px`;
      grid.style.scrollPaddingLeft = `${left}px`;
    }
    elements.freezeNote.textContent = limited ? 'Freeze limited to visible pane size' : '';
  }

  function focusSelectedCell(data) {
    const target = state.pendingFocus;
    if (!target || !data.columns.some((column) => column.index === target.column) ||
      !displayRows(data).some((row) => row.index === target.row)) { return; }
    if (target.unit === 'row') { inspectRow(target.row, target.column, target.side); }
    else { inspectCell(target.row, target.column, target.side); }
    if (target.keyboard) { activeGrid().focus({ preventScroll: true }); }
    state.pendingFocus = null;
  }

  function currentSizes() {
    if (!Object.hasOwn(state.sheetSizes, state.sheet)) {
      Object.defineProperty(state.sheetSizes, state.sheet, { value: { column: {}, row: {} }, enumerable: true, configurable: true, writable: true });
    }
    return state.sheetSizes[state.sheet];
  }

  function createResizeHandle(kind, index) {
    const handle = document.createElement('span');
    handle.className = `cell-resizer ${kind}-resizer`;
    handle.dataset.resizeKind = kind;
    handle.dataset.resizeIndex = String(index);
    handle.tabIndex = -1;
    handle.setAttribute('role', 'separator');
    handle.setAttribute('aria-orientation', kind === 'column' ? 'vertical' : 'horizontal');
    handle.setAttribute('aria-label', `Resize ${kind}; drag or use arrow keys, double-click to ${kind === 'column' ? 'fit contents' : 'reset height'}`);
    return handle;
  }

  function applyCellSizes() {
    const sizes = currentSizes();
    for (const grid of [elements.leftGrid, elements.rightGrid, elements.unifiedGrid]) {
      for (const cell of grid.querySelectorAll('[data-column]')) {
        const width = sizes.column[cell.dataset.column];
        for (const property of ['width', 'minWidth', 'maxWidth']) { cell.style[property] = width ? `${width}px` : ''; }
      }
      for (const row of grid.querySelectorAll('tbody tr[data-row]')) {
        const height = sizes.row[row.dataset.row];
        row.classList.toggle('user-sized-row', Boolean(height));
        row.style.setProperty('--custom-row-height', height ? `${height}px` : 'var(--row-height)');
        for (const cell of row.cells) { cell.style.height = height ? `${height}px` : ''; }
      }
    }
  }

  function updateCellSize(kind, index, size) {
    currentSizes()[kind][index] = Math.round(Math.max(kind === 'column' ? 64 : 24, Math.min(kind === 'column' ? 1200 : 600, size)));
    if (cellResizeFrame === null) {
      cellResizeFrame = window.requestAnimationFrame(() => {
        cellResizeFrame = null;
        applyCellSizes();
        applyFrozenPanes();
        viewportKey = '';
        scheduleViewport();
      });
    }
  }

  function expandRange(kind, start, end) {
    if (!rowStream.metadata || !state.rowData) { return; }
    captureAnchor();
    if (kind === 'rows') { captureRowExpansionAnchor(start, end); }
    const key = kind === 'rows' ? 'expandedRows' : 'expandedColumns';
    const expanded = new Set(state[key]);
    for (let index = start; index < end; index += 1) { expanded.add(index); }
    state[key] = [...expanded];
    clearInspector();
    requestRows(true);
  }

  function captureRowExpansionAnchor(start, end) {
    const gap = state.rowData.entries.find((entry) => entry.kind === 'gap' && entry.start === start);
    const grid = activeGrid();
    const bounds = grid.getBoundingClientRect();
    const top = bounds.top + (parseFloat(grid.style.scrollPaddingTop) || 29);
    // Keep the first visible matching row in place, even when headers precede the gap.
    const anchor = state.rowData.entries.find((entry) => {
      if (entry.kind !== 'row' || entry.context) { return false; }
      const row = grid.querySelector(`tr[data-position="${entry.position}"][data-row]`);
      if (!row) { return false; }
      const rect = row.getBoundingClientRect();
      return rect.bottom > top && rect.top < bounds.bottom;
    });
    if (anchor) {
      state.offset = anchor.position;
      restoreIntra = logicalTop - rowStream.heightBefore(state.offset);
      const row = grid.querySelector(`tr[data-row="${anchor.row.index}"]`);
      rowExpansionAnchor = { row: anchor.row.index, top: row.getBoundingClientRect().top - bounds.top };
    }
    // The gap becomes N rows, plus a remaining gap for a partial expansion.
    if (gap.position < state.offset) {
      state.offset += end - start - (end === gap.end ? 1 : 0);
    }
  }

  function restoreRowExpansionAnchor() {
    if (!rowExpansionAnchor) { return; }
    const grid = activeGrid();
    const row = grid.querySelector(`tr[data-position][data-row="${rowExpansionAnchor.row}"]`);
    if (!row) { return; }
    const delta = row.getBoundingClientRect().top - grid.getBoundingClientRect().top - rowExpansionAnchor.top;
    if (Math.abs(delta) < 0.5) { return; }
    logicalTop += delta;
    // Preserve any blank area below the old view instead of snapping to the end.
    rowStream.trailingSpace = Math.max(rowStream.trailingSpace,
      logicalTop + scrollViewportHeight() - rowStream.heightBefore(rowStream.metadata.totalEntries));
    updateVirtualSpacers(state.rowData);
    syncPhysicalScroll();
  }

  function gapControls(kind, start, end) {
    const controls = document.createElement('span');
    controls.className = 'gap-controls';
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'expand-gap';
    const count = end - start;
    const label = document.createElement('span');
    label.className = 'gap-label';
    label.textContent = `${formatNumber(count)} hidden ${pluralize(kind === 'rows' ? 'row' : 'column', count)}`;
    const action = document.createElement('span');
    action.className = 'gap-action';
    action.textContent = count > 50 ? 'Show next 50' : 'Show';
    button.append(label, action);
    button.setAttribute('aria-label', `Expand ${kind} ${start + 1} through ${Math.min(end, start + 50)}`);
    setTooltip(button, kind === 'rows'
      ? 'Rows hidden by the current filter. Expand to see their values without changing the matching counts.'
      : `${count} columns outside this focus hidden. Click to expand${count > 50 ? ' the next 50' : ''} and see their original values.`);
    button.addEventListener('click', () => expandRange(kind, start, Math.min(end, start + 50)));
    controls.append(button);
    if (count > 50) {
      const showAll = document.createElement('button');
      showAll.type = 'button';
      showAll.className = 'expand-gap gap-action';
      showAll.textContent = 'Show all';
      showAll.setAttribute('aria-label', `Expand all hidden ${kind} ${start + 1} through ${end}`);
      setTooltip(showAll, `Show all ${formatNumber(count)} hidden ${kind} in this section.`);
      showAll.addEventListener('click', () => expandRange(kind, start, end));
      controls.append(showAll);
    }
    return controls;
  }

  function updateVirtualSpacers(data) {
    if (!data) { return; }
    const metrics = rowStream.metrics(logicalTop, scrollViewportHeight());
    const top = rowStream.heightBefore(data.range.start) - metrics.shift;
    const bottom = metrics.extent - (rowStream.heightBefore(data.range.end) - metrics.shift);
    for (const [grid, renderer] of gridRenderers) { if (grid.clientWidth) { renderer.spacers(top, bottom); } }
  }

  function columnSpacer(width, tag = 'td') {
    const cell = document.createElement(tag);
    cell.className = 'column-spacer';
    for (const property of ['width', 'minWidth', 'maxWidth']) { cell.style[property] = `${width}px`; }
    cell.setAttribute('aria-hidden', 'true');
    return cell;
  }

  function updateTable(data, side, grid) {
    const slots = data.slots;
    const schema = `${data.sheet}:${side}:${slots.map((slot) => slot.column ? slot.column.index : `w${slot.width}`).join(',')}`;
    const entries = [
      ...data.frozenRows.map((row) => ({ kind: 'row', row, frozen: true })),
      { kind: 'spacer', edge: 'top' }, ...data.entries, { kind: 'spacer', edge: 'bottom' }
    ];
    gridRenderers.get(grid).render(schema, `${state.filter}:${state.findText}`, entries,
      () => createTableHeader(data, side), (entry, count) => createTableRow(entry, data, side, count), slots.length + 1);
  }

  function createTableHeader(data, side) {
    const head = document.createElement('thead');
    const row = document.createElement('tr');
    const corner = document.createElement('th');
    corner.className = 'row-number';
    corner.textContent = '#';
    row.append(corner);
    for (const slot of data.slots) {
      if (!slot.column) { row.append(columnSpacer(slot.width, 'th')); continue; }
      const column = slot.column;
      const cell = document.createElement('th');
      cell.className = `data-column column-${columnHeaderStatus(column)}`;
      cell.dataset.column = String(column.index);
      const address = document.createElement('span');
      address.textContent = side === 'unified' ? column.label : column[`${side}Label`] ?? '∅';
      cell.append(address);
      if (column.title) {
        const title = document.createElement('span');
        title.className = 'column-title';
        title.textContent = column.title;
        cell.append(title);
      }
      setTooltip(cell, `${columnTooltip(column)}${column.title ? ` · ${column.title}` : ''}`);
      cell.append(createResizeHandle('column', column.index));
      row.append(cell);
    }
    head.append(row);
    return head;
  }

  function createTableRow(entry, data, side, columnCount) {
    const tr = document.createElement('tr');
    if (entry.kind !== 'row') {
      const cell = document.createElement('td');
      cell.colSpan = columnCount;
      if (entry.kind === 'spacer') { tr.className = 'virtual-spacer'; tr.dataset.spacer = entry.edge; tr.setAttribute('aria-hidden', 'true'); }
      else if (entry.kind === 'gap') { tr.className = 'row-gap'; tr.dataset.position = String(entry.position); cell.append(gapControls('rows', entry.start, entry.end)); }
      else {
        tr.className = 'loading-row';
        cell.textContent = rowStream.failed.has(Math.floor(entry.position / rowStream.batchSize) * rowStream.batchSize) ? 'Could not load rows. Use Retry.' : 'Loading rows…';
        cell.style.height = `${rowStream.heights[entry.position] || rowStream.defaultHeight}px`;
      }
      tr.append(cell);
      return tr;
    }
    const row = entry.row;
    tr.dataset.row = String(row.index);
    tr.dataset.status = rowHeaderStatus(row);
    const number = document.createElement('th');
    number.className = `row-number row-${rowHeaderStatus(row)}`;
    number.scope = 'row';
    const before = row.leftIndex === undefined ? '∅' : String(row.leftIndex + 1);
    const after = row.rightIndex === undefined ? '∅' : String(row.rightIndex + 1);
    if (side === 'unified') {
      if (row.leftIndex === undefined) { number.textContent = `+ ${after}`; }
      else if (row.rightIndex === undefined) { number.textContent = `− ${before}`; }
      else { number.textContent = before === after ? before : `${before} → ${after}`; }
    } else {
      number.textContent = side === 'left' ? before : after;
    }
    setTooltip(number, rowAddress(row));
    number.append(createResizeHandle('row', row.index));
    tr.append(number);
    for (const slot of data.slots) {
      if (!slot.column) { tr.append(columnSpacer(slot.width)); continue; }
      const index = slot.position;
      const column = slot.column;
      const status = row.cells[index] || 'unchanged';
      const cell = document.createElement('td');
      const missing = side !== 'unified' && (row[`${side}Index`] === undefined || column[`${side}Index`] === undefined);
      cell.className = `data-column ${status}${side === 'unified' ? ' unified-cell' : ''}${missing ? ' missing-side' : ''}`;
      if (!matchesCellFilter(status)) { cell.classList.add('filter-context'); }
      cell.dataset.row = String(row.index);
      cell.dataset.column = String(column.index);
      cell.dataset.side = side;
      const query = state.findText.trim().toLocaleLowerCase();
      if (query && [row.left[index]?.display, row.right[index]?.display, row.left[index]?.formula, row.right[index]?.formula]
        .some((text) => text?.toLocaleLowerCase().includes(query))) { cell.classList.add('search-match'); }
      setCellTooltip(cell, column, row, index);
      if (side === 'unified') {
        if (status === 'unchanged') { cell.append(createUnifiedValue(row.right[index] || row.left[index], 'current-value', '')); }
        else {
          if (row.left[index]) { cell.append(createUnifiedValue(row.left[index], 'before-value', '−')); }
          if (row.right[index]) { cell.append(createUnifiedValue(row.right[index], 'after-value', '+')); }
        }
      } else {
        const content = document.createElement('div');
        content.className = 'cell-content';
        const text = document.createElement('span');
        appendHighlightedText(text, row[side][index]?.display || '');
        content.append(text);
        if (row[side][index]?.formula) {
          const formula = document.createElement('span'); formula.className = 'formula-mark'; formula.textContent = 'fx'; content.append(formula);
        }
        cell.append(content);
      }
      tr.append(cell);
    }
    return tr;
  }

  function appendHighlightedText(element, text) {
    const query = state.findText.trim();
    if (!query) { element.textContent = text; return; }
    const lower = text.toLocaleLowerCase();
    const needle = query.toLocaleLowerCase();
    let position = 0;
    let match;
    while ((match = lower.indexOf(needle, position)) >= 0) {
      element.append(document.createTextNode(text.slice(position, match)));
      const mark = document.createElement('mark');
      mark.textContent = text.slice(match, match + query.length);
      element.append(mark);
      position = match + query.length;
    }
    element.append(document.createTextNode(text.slice(position)));
  }

  function createUnifiedValue(value, className, prefix) {
    const content = document.createElement('div');
    content.className = `unified-value ${className}`;
    if (prefix) {
      const marker = document.createElement('span');
      marker.className = 'change-marker';
      marker.textContent = prefix;
      content.append(marker);
    }
    const text = document.createElement('span');
    appendHighlightedText(text, value?.display || '');
    content.append(text);
    if (value?.formula) {
      const formula = document.createElement('span');
      formula.className = 'formula-mark';
      formula.textContent = 'fx';
      content.append(formula);
    }
    return content;
  }

  function inspectCell(rowIndex, columnIndex, side) {
    const source = cellSource(rowIndex, columnIndex);
    if (!source) { return; }
    const comparison = cellComparison(source.columns[source.columnPosition], source.row, source.columnPosition);
    if (state.changePosition && (state.changePosition.row !== rowIndex ||
      state.navigationUnit === 'cell' && state.changePosition.column !== columnIndex)) {
      state.changePosition = null;
      updateChangePosition();
    }
    for (const selected of document.querySelectorAll('.diff-table td.selected')) {
      selected.classList.remove('selected');
    }
    for (const selectedRow of document.querySelectorAll('.diff-table tr.selected-row')) {
      selectedRow.classList.remove('selected-row');
    }
    for (const cell of document.querySelectorAll(
      `.diff-table td[data-row="${rowIndex}"][data-column="${columnIndex}"]`
    )) {
      cell.classList.add('selected');
    }
    state.selectedRow = source.row;
    state.selectedColumns = source.columns;
    state.activeSide = side === 'left' ? 'left' : 'right';
    state.selectedCell = {
      row: rowIndex,
      column: columnIndex,
      unit: 'cell',
      side: side || (state.diffMode === 'unified' ? 'unified' : 'right')
    };

    renderInspector(comparison);
    persistState();
  }

  function renderInspector(comparison) {
    if (!comparison) { return; }
    elements.cellInspector.replaceChildren();
    const addressElement = document.createElement('strong');
    addressElement.textContent = comparison.address;
    elements.cellInspector.append(
      addressElement,
      document.createTextNode(`   Before: ${comparison.left}   →   After: ${comparison.right}`)
    );
    elements.cellInspector.classList.add('has-selection');
    setComparisonTooltip(elements.cellInspector, comparison);
    renderDetails();
  }

  function inspectRow(rowIndex, columnIndex, side) {
    inspectCell(rowIndex, columnIndex, side);
    state.selectedCell.unit = 'row';
    for (const row of document.querySelectorAll(`.diff-table td[data-row="${rowIndex}"]`)) {
      row.parentElement?.classList.add('selected-row');
    }
  }

  function describeCell(cell, includeType = false) {
    if (!cell) { return '∅'; }
    const details = [];
    if (cell.raw !== undefined) { details.push(`raw: ${cell.raw}`); }
    if (cell.formula) { details.push(cell.formula); }
    if (includeType && cell.type) {
      const names = { n: 'number', s: 'text', b: 'boolean', d: 'date', e: 'error', z: 'blank' };
      details.push(`type: ${names[cell.type] || cell.type}`);
    }
    const value = cell.display === '' ? '""' : cell.display;
    return details.length ? `${value}  [${details.join(' · ')}]` : value;
  }

  function cellComparison(column, row, position) {
    const left = row.left[position];
    const right = row.right[position];
    const includeType = left && right && left.type !== right.type;
    return {
      address: comparisonAddress(column, row),
      left: describeCell(left, includeType),
      right: describeCell(right, includeType)
    };
  }

  function setCellTooltip(cell, column, row, position) {
    const comparison = cellComparison(column, row, position);
    if (row.cells[position] !== 'unchanged') {
      if (![row.left[position], row.right[position]].some((value) => value && (value.display || value.formula))) {
        setTooltip(cell, `${comparison.address} · Empty cell`);
        return;
      }
      setComparisonTooltip(cell, comparison);
      return;
    }
    const value = row.right[position] || row.left[position];
    if (!value) { return; }
    setTooltip(cell, `${comparison.address}\n${describeCell(value)}`);
    if (!value.formula && value.raw === undefined) { cell.dataset.tooltipOverflow = 'true'; }
  }

  function cellSource(rowIndex, columnIndex) {
    const data = state.rowData;
    let row = data && displayRows(data).find((entry) => entry.index === rowIndex);
    let columns = data?.columns || [];
    if (!row || !columns.some((column) => column.index === columnIndex)) {
      row = state.selectedRow?.index === rowIndex ? state.selectedRow : null;
      columns = state.selectedColumns;
    }
    const columnPosition = columns.findIndex((column) => column.index === columnIndex);
    return row && columnPosition >= 0 ? { row, columns, columnPosition } : null;
  }

  function getCellComparison(rowIndex, columnIndex) {
    const source = cellSource(rowIndex, columnIndex);
    return source ? cellComparison(source.columns[source.columnPosition], source.row, source.columnPosition) : null;
  }

  function openCellComparison(rowIndex, columnIndex) {
    const comparison = getCellComparison(rowIndex, columnIndex);
    if (!comparison) {
      return;
    }
    showCellComparison(comparison);
  }

  function showCellComparison(comparison) {
    hideTooltip();
    activeDialogComparison = comparison;
    elements.cellComparisonAddress.textContent = comparison.address;
    renderCellComparisonDialog();
    if (!elements.cellComparisonDialog.open) {
      elements.cellComparisonDialog.showModal();
    }
  }

  function renderCellComparisonDialog() {
    if (!activeDialogComparison) {
      return;
    }
    elements.cellComparisonBody.replaceChildren(
      createTextComparisonLayout(activeDialogComparison, 'dialog')
    );
  }

  function selectCellContents(cell) {
    const selection = window.getSelection();
    if (!selection) {
      return;
    }
    const range = document.createRange();
    range.selectNodeContents(cell);
    selection.removeAllRanges();
    selection.addRange(range);
  }

  function selectedCellCopyText() {
    const selected = state.selectedCell;
    const data = state.rowData;
    if (!selected || !data) {
      return null;
    }
    const source = cellSource(selected.row, selected.column);
    if (!source) { return null; }
    const { row, columnPosition } = source;

    const left = row.left[columnPosition];
    const right = row.right[columnPosition];
    if (selected.side === 'left') {
      return left?.display || '';
    }
    if (selected.side === 'right') {
      return right?.display || '';
    }
    if (row.cells[columnPosition] === 'unchanged') {
      return (right || left)?.display || '';
    }
    return `Before: ${left?.display || ''}\nAfter: ${right?.display || ''}`;
  }

  function selectionIsInsideSelectedCell(selection) {
    const toElement = (node) => node instanceof Element ? node : node?.parentElement;
    const anchorCell = toElement(selection.anchorNode)?.closest('.diff-table td.selected');
    const focusCell = toElement(selection.focusNode)?.closest('.diff-table td.selected');
    return Boolean(anchorCell && focusCell);
  }

  function shouldKeepNativeCopy() {
    const activeElement = document.activeElement;
    if (
      activeElement instanceof HTMLElement &&
      (activeElement.matches('input, textarea, select') || activeElement.isContentEditable)
    ) {
      return true;
    }
    const selection = window.getSelection();
    return Boolean(selection && !selection.isCollapsed && !selectionIsInsideSelectedCell(selection));
  }

  function updateRowRange(range) {
    const data = state.rowData;
    if (!data || data.totalRows === 0) { elements.rowRange.textContent = 'Rows 0 of 0'; return; }
    const grid = activeGrid();
    const bounds = grid.getBoundingClientRect();
    const top = bounds.top + (parseFloat(grid.style.scrollPaddingTop) || 29);
    const visible = [...grid.querySelectorAll('tr[data-position][data-row]')].filter((row) => {
      const rect = row.getBoundingClientRect();
      return rect.bottom > top && rect.top < bounds.bottom;
    });
    const first = visible[0] ? findRow(Number(visible[0].dataset.row)) : data.frozenRows[0];
    const last = visible.length ? findRow(Number(visible[visible.length - 1].dataset.row)) : data.frozenRows[data.frozenRows.length - 1];
    const sheet = state.summary.sheets.find((sheet) => sheet.name === state.sheet);
    elements.rowRange.textContent = first && last
      ? `Rows ${formatNumber(first.index + 1)}–${formatNumber(last.index + 1)} of ${formatNumber(sheet.rows)}`
      : `${formatNumber(data.totalRows)} matching rows`;
    state.offset = visible[0] ? Number(visible[0].dataset.position) : range.first;
  }

  function requestChange(direction) {
    if (!rowStream.metadata) { return; }
    hideTooltip();
    state.navigationRequestId += 1;
    vscode.postMessage({
      type: 'requestChange',
      ...viewOptions(),
      requestId: state.navigationRequestId,
      viewRequestId: state.requestId,
      sheet: state.sheet,
      row: state.selectedCell?.row ?? state.rowData?.rows[0]?.index,
      column: state.selectedCell?.column,
      direction,
      unit: state.navigationUnit,
      filter: state.filter,
      query: state.query
    });
  }

  function receiveNavigation(target) {
    if (!target) { announce('No changes match this view. Try another filter or worksheet.'); return; }
    state.changePosition = { ordinal: target.ordinal, total: target.total, row: target.row, column: target.column };
    updateChangePosition();
    if (target.wrapped) { announce(target.ordinal === 1 ? 'Back to the first change.' : 'Back to the last change.'); }
    jumpToTarget(target, 'change');
  }

  function applyTheme(theme) {
    state.theme = theme === 'light' ? 'light' : 'dark';
    document.documentElement.dataset.theme = state.theme;
    elements.themeSelect.value = state.theme;
    persistState();
  }

  function applyDiffMode(mode, rerender = true) {
    if (rerender && rowStream.metadata) { captureAnchor(); }
    state.diffMode = mode === 'unified' ? 'unified' : 'sideBySide';
    if (state.selectedCell) {
      state.selectedCell.side = state.diffMode === 'unified'
        ? 'unified'
        : state.selectedCell.side === 'left' ? 'left' : 'right';
    }
    if (state.pendingFocus) {
      state.pendingFocus.side = state.diffMode === 'unified'
        ? 'unified'
        : state.pendingFocus.side === 'left' ? 'left' : 'right';
    }
    for (const button of elements.diffModeSwitch.querySelectorAll('[data-mode]')) {
      button.setAttribute('aria-pressed', String(button.dataset.mode === state.diffMode));
    }
    elements.gridShell.classList.toggle('unified-mode', state.diffMode === 'unified');
    elements.columnLabels.classList.toggle('unified-mode', state.diffMode === 'unified');
    if (state.diffMode === 'sideBySide') {
      applySplitRatio();
    }
    if (rerender && rowStream.metadata) {
      const selected = state.selectedCell;
      restoreSelection = selected;
      requestRows();
    }
    persistState();
  }

  function normalizeTextDiffGranularity(value) {
    return value === 'word' || value === 'line' ? value : 'character';
  }

  function normalizeTextDiffLayout(value) {
    return value === 'inline' || value === 'stacked' ? value : 'sideBySide';
  }

  function normalizeCellHoverDelay(value) {
    return Number.isFinite(value) ? Math.max(0, Math.min(2000, value)) : 150;
  }

  function syncTextDiffControls() {
    elements.cellComparisonGranularity.value = state.textDiffGranularity;
    elements.cellComparisonLayout.value = state.textDiffLayout;
  }

  function updateTextDiffSetting(setting, value) {
    if (setting === 'textDiffGranularity') {
      state.textDiffGranularity = normalizeTextDiffGranularity(value);
    } else {
      state.textDiffLayout = normalizeTextDiffLayout(value);
    }
    syncTextDiffControls();
    persistState();
    refreshTextDiffViews();
    vscode.postMessage({ type: 'updateSetting', key: setting, value: state[setting] });
  }

  function refreshTextDiffViews() {
    renderDetails();
    if (elements.cellComparisonDialog.open && activeDialogComparison) {
      renderCellComparisonDialog();
    }
    if (!activeTooltipTarget || elements.hoverTooltip.hidden) {
      return;
    }
    const comparison = comparisonTooltips.get(activeTooltipTarget);
    if (!comparison) {
      return;
    }
    elements.hoverTooltip.replaceChildren(...createComparisonTooltipContent(comparison));
    positionTooltip(activeTooltipTarget);
  }

  function applyNavigationUnit(unit) {
    state.navigationUnit = unit === 'row' ? 'row' : 'cell';
    state.changePosition = null;
    updateChangePosition();
    elements.navigationUnitSelect.value = state.navigationUnit;
    const label = state.navigationUnit === 'row' ? 'changed row' : 'changed cell';
    setTooltip(elements.previousChange, `Previous ${label}`);
    setTooltip(elements.nextChange, `Next ${label}`);
    persistState();
  }

  function updateFilterButtons(counts) {
    // Counts depend on the worksheet/search, not the active category. Keep them
    // while switching filters so button widths and disabled styles stay stable.
    if (!counts && state.rowData?.sheet === state.sheet && state.rowData.query === state.query) {
      counts = state.rowData.filterCounts;
    }
    for (const button of document.querySelectorAll('.filter')) {
      const filter = button.dataset.filter;
      button.classList.toggle('active', filter === state.filter);
      button.setAttribute('aria-pressed', String(filter === state.filter));
      const label = { all: 'All', changed: 'Changes', modified: 'Edits', added: 'Added', removed: 'Removed' }[filter];
      button.replaceChildren(document.createTextNode(label));
      if (counts) {
        const count = document.createElement('span');
        count.className = 'filter-count';
        count.textContent = formatNumber(counts[filter]);
        button.append(count);
      }
      button.disabled = Boolean(counts && counts[filter] === 0 && filter !== state.filter);
      if (!button.dataset.baseTooltip) { button.dataset.baseTooltip = button.dataset.tooltip || label; }
      setTooltip(button, button.dataset.baseTooltip + (counts ? ` · ${counts[filter]} matching rows` : ''));
    }
  }

  function clearInspector() {
    hideTooltip();
    state.selectedCell = null;
    state.selectedRow = null;
    state.selectedColumns = [];
    state.pendingFocus = null;
    elements.cellInspector.textContent = 'Select a cell for details';
    elements.cellInspector.classList.remove('has-selection');
    setTooltip(elements.cellInspector, '');
    renderDetails();
  }

  function showError(message) {
    elements.errorBanner.textContent = message;
    elements.errorBanner.hidden = false;
    window.setTimeout(() => {
      elements.errorBanner.hidden = true;
    }, 7000);
  }

  function captureAnchor() {
    if (!rowStream.metadata) { return; }
    state.offset = rowStream.indexAt(logicalTop);
    restoreIntra = logicalTop - rowStream.heightBefore(state.offset);
    restoreHorizontal = activeGrid().scrollLeft;
  }

  function cancelPendingNavigation() {
    state.pendingFocus = null;
    state.navigationRequestId += 1;
    state.locationRequestId += 1;
    state.findRequestId += 1;
    if (elements.findStatus.textContent === 'Finding…') { elements.findStatus.textContent = ''; }
  }

  function jumpToTarget(target, source) {
    const side = state.diffMode === 'unified' ? 'unified' : state.activeSide;
    state.selectedCell = { row: target.row, column: target.column, side, unit: source === 'change' ? state.navigationUnit : 'cell' };
    state.pendingFocus = { ...state.selectedCell, keyboard: source === 'location' };
    columnWindow.setColumns(state.allColumns, currentSizes().column, state.diffMode === 'unified' ? 100 : 48, state.freezeColumns);
    const grid = activeGrid();
    const left = columnWindow.leftOf(target.column);
    const width = currentSizes().column[target.column] || 156;
    const pinned = parseFloat(grid.style.scrollPaddingLeft) || 48;
    if (target.column >= state.freezeColumns && (left < grid.scrollLeft + pinned || left + width > grid.scrollLeft + grid.clientWidth)) {
      restoreHorizontal = Math.max(0, left - pinned);
    }
    if (target.offset >= 0) {
      const top = rowStream.heightBefore(target.offset);
      const bottom = rowStream.heightBefore(target.offset + 1);
      if (top < logicalTop) { logicalTop = top; }
      else if (bottom > logicalTop + scrollViewportHeight()) { logicalTop = bottom - scrollViewportHeight(); }
    }
    restoreOffset = null;
    viewportKey = '';
    scheduleViewport();
  }

  function requestLocation(location) {
    if (!rowStream.metadata) { return; }
    state.locationRequestId += 1;
    vscode.postMessage({ type: 'requestLocate', requestId: state.locationRequestId, viewRequestId: state.requestId,
      sheet: state.sheet, location, filter: state.filter, query: state.query, ...viewOptions() });
  }

  function requestFind(direction, includeCurrent = false) {
    if (!rowStream.metadata || !state.findText.trim()) { return; }
    state.findRequestId += 1;
    elements.findStatus.textContent = 'Finding…';
    vscode.postMessage({ type: 'requestFind', requestId: state.findRequestId, viewRequestId: state.requestId,
      sheet: state.sheet, text: state.findText, row: state.selectedCell?.row ?? state.rowData?.rows[0]?.index,
      column: state.selectedCell?.column, direction, includeCurrent, filter: state.filter, query: state.query, ...viewOptions() });
  }

  function applyMatchFilter() {
    captureAnchor();
    state.query = state.matchOnly ? state.findText : '';
    state.offset = 0;
    restoreIntra = 0;
    state.expandedRows = [];
    state.expandedColumns = [];
    clearInspector();
    requestRows();
  }

  function syncFocusButton() {
    const label = state.focusChanges ? 'Restore the rows and columns allowed by this filter' : 'Hide unrelated rows and columns';
    elements.focusChanges.setAttribute('aria-pressed', String(state.focusChanges));
    elements.focusChanges.setAttribute('aria-label', label);
    setTooltip(elements.focusChanges, label);
  }

  function updateChangePosition() {
    const changes = rowStream.metadata?.changes;
    const unit = state.navigationUnit === 'row' ? 'row' : 'cell';
    const total = state.navigationUnit === 'row' ? changes?.rows : changes?.cells;
    elements.previousChange.disabled = elements.nextChange.disabled = !total;
    elements.changePosition.textContent = !total ? 'No changes' : state.changePosition
      ? `${state.changePosition.ordinal} / ${formatNumber(total)} ${pluralize(unit, total)}`
      : `${formatNumber(total)} changed ${pluralize(unit, total)}`;
  }

  function changeSheet(direction) {
    const sheets = getVisibleSheets();
    const index = sheets.findIndex((sheet) => sheet.name === state.sheet);
    const step = direction === 'next' ? 1 : -1;
    for (let distance = 1; distance < sheets.length; distance += 1) {
      const next = sheets[(index + step * distance + sheets.length) % sheets.length];
      const counts = state.filter === 'modified' ? next.cellChanges.changed : state.filter === 'added' ? next.cellChanges.added + next.rowChanges.added
        : state.filter === 'removed' ? next.cellChanges.removed + next.rowChanges.removed : totalChanges(next.cellChanges) + totalChanges(next.rowChanges);
      if (counts) {
        pendingSheetDirection = direction;
        selectSheet(next.name, true);
        restoreSelection = null;
        announce(`Worksheet: ${next.name}`);
        return;
      }
    }
    announce('No other worksheets match this change filter.');
  }

  function announce(message) {
    window.clearTimeout(noticeTimer);
    elements.navigationNotice.textContent = message;
    elements.navigationNotice.hidden = false;
    noticeTimer = window.setTimeout(() => { elements.navigationNotice.hidden = true; }, 4000);
  }

  function setDetailsOpen(open) {
    const selected = state.selectedCell;
    const grid = activeGrid();
    const cell = selected && grid.querySelector(`td[data-row="${selected.row}"][data-column="${selected.column}"]`);
    const bounds = cell?.getBoundingClientRect();
    const gridBounds = grid.getBoundingClientRect();
    const wasVisible = bounds && bounds.bottom > gridBounds.top && bounds.top < gridBounds.bottom;
    const position = state.rowData?.entries.find((entry) => entry.kind === 'row' && entry.row.index === selected?.row)?.position;
    state.detailsOpen = open;
    elements.detailsPanel.hidden = !open;
    elements.toggleDetails.setAttribute('aria-pressed', String(open));
    renderDetails();
    if (open && wasVisible && position !== undefined) {
      logicalTop = Math.max(logicalTop, rowStream.heightBefore(position + 1) - scrollViewportHeight());
      viewportKey = '';
    }
    scheduleViewport();
    persistState();
  }

  function renderDetails() {
    if (!state.detailsOpen) { return; }
    const selected = state.selectedCell;
    const comparison = selected && getCellComparison(selected.row, selected.column);
    elements.detailsAddress.textContent = comparison?.address || 'Select a cell';
    elements.detailsContent.replaceChildren();
    if (comparison) { elements.detailsContent.append(createTextComparisonLayout(comparison, 'dialog')); }
    else { elements.detailsContent.textContent = 'Select a cell to compare its before and after values.'; }
  }

  function handleGridKey(event) {
    if (event.target.closest('.cell-resizer') || event.altKey || !rowStream.metadata) { return; }
    state.activeSide = event.currentTarget === elements.leftGrid ? 'left' : 'right';
    if (event.key === 'Enter' && state.selectedCell) {
      event.preventDefault(); openCellComparison(state.selectedCell.row, state.selectedCell.column); return;
    }
    const keys = ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'PageUp', 'PageDown', 'Home', 'End'];
    if (!keys.includes(event.key)) { return; }
    event.preventDefault();
    cancelPendingNavigation();
    const selected = state.selectedCell;
    const row = selected?.row ?? state.rowData?.rows.find((entry) => rowStream.entry(state.offset)?.row?.index === entry.index)?.index ?? state.rowData?.rows[0]?.index;
    const column = selected?.column ?? state.columnView?.columns[0]?.index;
    const pageRows = Math.max(1, Math.floor(scrollViewportHeight() / rowStream.defaultHeight) - 1);
    const rowDelta = event.key === 'ArrowUp' ? -1 : event.key === 'ArrowDown' ? 1 : event.key === 'PageUp' ? -pageRows : event.key === 'PageDown' ? pageRows : 0;
    const columnDelta = event.key === 'ArrowLeft' ? -1 : event.key === 'ArrowRight' ? 1 : event.key === 'Home' ? -state.allColumns.length : event.key === 'End' ? state.allColumns.length : 0;
    requestLocation({ row, column, rowDelta, columnDelta,
      ...((event.ctrlKey || event.metaKey) && (event.key === 'Home' || event.key === 'End') ? { edge: event.key === 'Home' ? 'first' : 'last' } : {}) });
  }

  function persistState() {
    window.clearTimeout(persistTimer);
    persistTimer = window.setTimeout(flushState, 120);
  }

  function flushState() {
    saveSheetPosition();
    vscode.setState({
      sheet: state.sheet,
      offset: state.offset,
      filter: state.filter,
      query: state.query,
      splitRatio: state.splitRatio,
      theme: state.theme,
      diffMode: state.diffMode,
      textDiffGranularity: state.textDiffGranularity,
      textDiffLayout: state.textDiffLayout,
      navigationUnit: state.navigationUnit,
      freezeRows: state.freezeRows,
      freezeColumns: state.freezeColumns,
      focusChanges: state.focusChanges,
      focusPreferenceVersion: 2,
      sheetSizes: state.sheetSizes,
      sheetViews: state.sheetViews, findText: state.findText, matchOnly: state.matchOnly, detailsOpen: state.detailsOpen
    });
  }

  function formatNumber(value) {
    return new Intl.NumberFormat().format(value);
  }

  function formatFileTooltip(file) {
    return [file.name, file.detail, file.revision, file.path].filter(Boolean).join('\n');
  }

  function setTooltip(element, text) {
    if (!element) {
      return;
    }
    element.removeAttribute('title');
    delete element.dataset.tooltipKind;
    comparisonTooltips.delete(element);
    if (text) {
      element.dataset.tooltip = text;
    } else {
      delete element.dataset.tooltip;
      if (activeTooltipTarget === element) {
        hideTooltip();
      }
    }
  }

  function setComparisonTooltip(element, comparison) {
    element.removeAttribute('title');
    element.dataset.tooltip = 'Cell comparison';
    element.dataset.tooltipKind = 'comparison';
    comparisonTooltips.set(element, comparison);
  }

  function createComparisonTooltipContent(comparison) {
    const header = document.createElement('div');
    header.className = 'tooltip-comparison-header';
    const address = document.createElement('strong');
    address.className = 'tooltip-comparison-address';
    address.textContent = comparison.address;
    const expand = document.createElement('button');
    expand.className = 'tooltip-expand';
    expand.type = 'button';
    expand.textContent = 'Full comparison ↗';
    expand.addEventListener('click', () => showCellComparison(comparison));
    header.append(address, expand);
    return [header, createTextComparisonLayout(comparison, 'tooltip')];
  }

  function createTextComparisonLayout(comparison, variant) {
    const tooltip = variant === 'tooltip';
    const container = document.createElement('div');
    container.className = tooltip ? 'tooltip-comparison-grid side-by-side-layout' : `cell-comparison-content ${textDiffLayoutClass()}`;
    if (!tooltip && state.textDiffLayout === 'inline') {
      container.append(createInlineComparisonPane(comparison, tooltip));
      return container;
    }

    for (const [className, label, side, dotClass] of [
      ['before-comparison', 'Before', 'left', 'removed'],
      ['after-comparison', 'After', 'right', 'added']
    ]) {
      const pane = document.createElement('section');
      pane.className = `${tooltip ? 'tooltip-comparison-pane' : 'cell-comparison-pane'} ${className}`;
      if (tooltip) {
        const heading = document.createElement('strong');
        heading.textContent = label;
        pane.append(heading);
      } else {
        pane.append(createDialogComparisonHeading(label, dotClass));
      }
      const content = document.createElement('pre');
      renderTextDiff(content, comparison, side);
      pane.append(content);
      container.append(pane);
    }
    return container;
  }

  function createInlineComparisonPane(comparison, tooltip) {
    const pane = document.createElement('section');
    pane.className = `${tooltip ? 'tooltip-comparison-pane' : 'cell-comparison-pane'} inline-comparison`;
    if (tooltip) {
      const heading = document.createElement('strong');
      heading.textContent = 'Inline diff';
      pane.append(heading);
    } else {
      const heading = document.createElement('div');
      heading.className = 'cell-comparison-pane-heading inline-comparison-heading';
      const removedDot = document.createElement('span');
      removedDot.className = 'legend-dot removed';
      const removedLabel = document.createElement('strong');
      removedLabel.textContent = 'Removed';
      const addedDot = document.createElement('span');
      addedDot.className = 'legend-dot added';
      const addedLabel = document.createElement('strong');
      addedLabel.textContent = 'Added';
      heading.append(removedDot, removedLabel, addedDot, addedLabel);
      pane.append(heading);
    }
    const content = document.createElement('pre');
    renderTextDiff(content, comparison, 'inline');
    pane.append(content);
    return pane;
  }

  function createDialogComparisonHeading(label, dotClass) {
    const heading = document.createElement('div');
    heading.className = 'cell-comparison-pane-heading';
    const dot = document.createElement('span');
    dot.className = `legend-dot ${dotClass}`;
    const text = document.createElement('strong');
    text.textContent = label;
    heading.append(dot, text);
    return heading;
  }

  function textDiffLayoutClass() {
    return state.textDiffLayout === 'inline'
      ? 'inline-layout'
      : state.textDiffLayout === 'stacked'
        ? 'stacked-layout'
        : 'side-by-side-layout';
  }

  function renderTextDiff(element, comparison, side) {
    const fragments = getTextDiff(comparison)[side];
    element.replaceChildren();
    for (const fragment of fragments) {
      if (fragment.type === 'equal') {
        element.append(document.createTextNode(fragment.text));
        continue;
      }
      const highlight = document.createElement('span');
      const changeClass = fragment.type === 'delete' ? 'removed' : 'added';
      highlight.className = `text-diff-fragment text-diff-${changeClass}`;
      if (side === 'inline' && fragment.type === 'delete') {
        highlight.classList.add('text-diff-inline-removed');
      }
      highlight.textContent = fragment.text;
      element.append(highlight);
    }
  }

  function getTextDiff(comparison) {
    if (!comparison.textDiff) {
      comparison.textDiff = {};
    }
    if (!comparison.textDiff[state.textDiffGranularity]) {
      comparison.textDiff[state.textDiffGranularity] = createTextDiff(
        comparison.left,
        comparison.right,
        state.textDiffGranularity
      );
    }
    return comparison.textDiff[state.textDiffGranularity];
  }

  function createTextDiff(before, after, granularity) {
    const beforeUnits = splitTextForDiff(before, granularity);
    const afterUnits = splitTextForDiff(after, granularity);
    let prefixLength = 0;
    while (
      prefixLength < beforeUnits.length &&
      prefixLength < afterUnits.length &&
      beforeUnits[prefixLength] === afterUnits[prefixLength]
    ) {
      prefixLength += 1;
    }

    let suffixLength = 0;
    while (
      suffixLength < beforeUnits.length - prefixLength &&
      suffixLength < afterUnits.length - prefixLength &&
      beforeUnits[beforeUnits.length - suffixLength - 1] ===
        afterUnits[afterUnits.length - suffixLength - 1]
    ) {
      suffixLength += 1;
    }

    const beforeMiddle = beforeUnits.slice(prefixLength, beforeUnits.length - suffixLength);
    const afterMiddle = afterUnits.slice(prefixLength, afterUnits.length - suffixLength);
    const middleOperations = createMiddleDiff(beforeMiddle, afterMiddle);
    const operations = [];
    appendTextDiffOperation(operations, 'equal', beforeUnits.slice(0, prefixLength));
    for (const operation of middleOperations) {
      appendTextDiffOperation(operations, operation.type, operation.units);
    }
    if (suffixLength > 0) {
      appendTextDiffOperation(operations, 'equal', beforeUnits.slice(beforeUnits.length - suffixLength));
    }

    return {
      left: createSideDiffFragments(operations, 'delete'),
      right: createSideDiffFragments(operations, 'insert'),
      inline: operations.map((operation) => ({
        text: operation.units.join(''),
        type: operation.type
      }))
    };
  }

  function splitTextForDiff(value, granularity) {
    if (granularity === 'line') {
      return value.match(/[^\r\n]*(?:\r\n|\r|\n)|[^\r\n]+$/g) || [];
    }
    if (granularity === 'word') {
      return wordSegmenter
        ? Array.from(wordSegmenter.segment(value), (part) => part.segment)
        : value.match(/\s+|[\p{L}\p{N}_]+|[^\p{L}\p{N}_\s]+/gu) || [];
    }
    return graphemeSegmenter
      ? Array.from(graphemeSegmenter.segment(value), (part) => part.segment)
      : Array.from(value);
  }

  function createMiddleDiff(beforeUnits, afterUnits) {
    if (beforeUnits.length === 0) {
      return afterUnits.length > 0 ? [{ type: 'insert', units: afterUnits }] : [];
    }
    if (afterUnits.length === 0) {
      return [{ type: 'delete', units: beforeUnits }];
    }
    if (beforeUnits.length * afterUnits.length > textDiffMatrixLimit) {
      return [
        { type: 'delete', units: beforeUnits },
        { type: 'insert', units: afterUnits }
      ];
    }

    const width = afterUnits.length + 1;
    const lengths = new Uint32Array((beforeUnits.length + 1) * width);
    for (let beforeIndex = beforeUnits.length - 1; beforeIndex >= 0; beforeIndex -= 1) {
      const rowOffset = beforeIndex * width;
      const nextRowOffset = (beforeIndex + 1) * width;
      for (let afterIndex = afterUnits.length - 1; afterIndex >= 0; afterIndex -= 1) {
        lengths[rowOffset + afterIndex] = beforeUnits[beforeIndex] === afterUnits[afterIndex]
          ? lengths[nextRowOffset + afterIndex + 1] + 1
          : Math.max(lengths[nextRowOffset + afterIndex], lengths[rowOffset + afterIndex + 1]);
      }
    }

    const operations = [];
    let beforeIndex = 0;
    let afterIndex = 0;
    while (beforeIndex < beforeUnits.length && afterIndex < afterUnits.length) {
      if (beforeUnits[beforeIndex] === afterUnits[afterIndex]) {
        appendTextDiffOperation(operations, 'equal', [beforeUnits[beforeIndex]]);
        beforeIndex += 1;
        afterIndex += 1;
      } else if (
        lengths[(beforeIndex + 1) * width + afterIndex] >=
        lengths[beforeIndex * width + afterIndex + 1]
      ) {
        appendTextDiffOperation(operations, 'delete', [beforeUnits[beforeIndex]]);
        beforeIndex += 1;
      } else {
        appendTextDiffOperation(operations, 'insert', [afterUnits[afterIndex]]);
        afterIndex += 1;
      }
    }
    appendTextDiffOperation(operations, 'delete', beforeUnits.slice(beforeIndex));
    appendTextDiffOperation(operations, 'insert', afterUnits.slice(afterIndex));
    return operations;
  }

  function appendTextDiffOperation(operations, type, units) {
    if (units.length === 0) {
      return;
    }
    const previous = operations[operations.length - 1];
    if (previous?.type === type) {
      previous.units.push(...units);
    } else {
      operations.push({ type, units: [...units] });
    }
  }

  function createSideDiffFragments(operations, changedType) {
    const fragments = [];
    for (const operation of operations) {
      if (operation.type !== 'equal' && operation.type !== changedType) {
        continue;
      }
      const text = operation.units.join('');
      const type = operation.type;
      const previous = fragments[fragments.length - 1];
      if (previous?.type === type) {
        previous.text += text;
      } else {
        fragments.push({ text, type });
      }
    }
    return fragments;
  }

  function scheduleTooltipShow(target, clientX) {
    window.clearTimeout(tooltipHideTimer);
    if (target === activeTooltipTarget || target === pendingTooltipTarget) { return; }
    const isCell = target.matches('.diff-table td[data-row][data-column]');
    const switchCellImmediately = isCell && !elements.hoverTooltip.hidden &&
      activeTooltipTarget?.matches('.diff-table td[data-row][data-column]');
    hideTooltip();
    if (target.dataset.tooltipOverflow) {
      const text = target.querySelector('.cell-content > span, .unified-value > span');
      if (!text || text.scrollWidth <= text.clientWidth) { return; }
    }
    if (switchCellImmediately || (isCell && state.cellHoverDelay === 0)) {
      showTooltip(target, clientX);
      return;
    }
    pendingTooltipTarget = target;
    tooltipShowTimer = window.setTimeout(() => {
      pendingTooltipTarget = null;
      if (target.isConnected && (target.matches(':hover') || target.matches(':focus-visible'))) {
        showTooltip(target, clientX);
      }
    }, isCell ? state.cellHoverDelay : 300);
  }

  function showTooltip(target, clientX) {
    const content = target.dataset.tooltip;
    if (!content) {
      return;
    }
    window.clearTimeout(tooltipHideTimer);
    if (activeTooltipTarget === target && !elements.hoverTooltip.hidden) {
      return;
    }
    activeTooltipTarget = target;
    const comparison = comparisonTooltips.get(target);
    elements.hoverTooltip.classList.toggle('comparison-tooltip', Boolean(comparison));
    if (comparison) {
      elements.hoverTooltip.replaceChildren(...createComparisonTooltipContent(comparison));
    } else {
      elements.hoverTooltip.textContent = content;
    }
    elements.hoverTooltip.hidden = false;
    positionTooltip(target, clientX);
  }

  function positionTooltip(target, clientX) {
    if (elements.hoverTooltip.hidden) {
      return;
    }
    const margin = 10;
    const overlap = 2;
    const targetBounds = target.getBoundingClientRect();
    const bounds = elements.hoverTooltip.getBoundingClientRect();
    const anchorX = Number.isFinite(clientX)
      ? clientX
      : targetBounds.left + targetBounds.width / 2;
    let left = anchorX - Math.min(24, bounds.width / 2);
    const spaceBelow = window.innerHeight - targetBounds.bottom - margin + overlap;
    const spaceAbove = targetBounds.top - margin + overlap;
    let top = bounds.height <= spaceBelow || spaceBelow >= spaceAbove
      ? targetBounds.bottom - overlap
      : targetBounds.top - bounds.height + overlap;
    if (left + bounds.width > window.innerWidth - margin) {
      left = window.innerWidth - bounds.width - margin;
    }
    left = Math.max(margin, left);
    top = Math.max(margin, Math.min(window.innerHeight - bounds.height - margin, top));
    elements.hoverTooltip.style.left = `${left}px`;
    elements.hoverTooltip.style.top = `${top}px`;
  }

  function hideTooltip() {
    window.clearTimeout(tooltipHideTimer);
    window.clearTimeout(tooltipShowTimer);
    pendingTooltipTarget = null;
    activeTooltipTarget = null;
    elements.hoverTooltip.hidden = true;
  }

  function scheduleTooltipHide() {
    window.clearTimeout(tooltipShowTimer);
    pendingTooltipTarget = null;
    window.clearTimeout(tooltipHideTimer);
    tooltipHideTimer = window.setTimeout(hideTooltip, 100);
  }

  function totalChanges(counts) {
    return counts.changed + counts.added + counts.removed;
  }

  function pluralize(word, count) {
    return count === 1 ? word : `${word}s`;
  }

  function applySplitRatio() {
    if (state.diffMode !== 'sideBySide') {
      return;
    }
    const availableWidth = Math.max(0, elements.gridShell.clientWidth - elements.splitter.offsetWidth);
    if (availableWidth === 0) {
      return;
    }
    const paneMinimum = Math.min(160, availableWidth * 0.4);
    const minimumRatio = paneMinimum / availableWidth;
    state.splitRatio = Math.max(minimumRatio, Math.min(1 - minimumRatio, state.splitRatio));
    elements.app.style.setProperty('--left-pane-width', `${availableWidth * state.splitRatio}px`);
    elements.splitter.setAttribute('aria-valuenow', String(Math.round(state.splitRatio * 100)));
  }

  function updateSplitFromPointer(event) {
    const bounds = elements.gridShell.getBoundingClientRect();
    const availableWidth = Math.max(1, bounds.width - elements.splitter.offsetWidth);
    const paneMinimum = Math.min(160, availableWidth * 0.4);
    const leftWidth = Math.max(paneMinimum, Math.min(availableWidth - paneMinimum, event.clientX - bounds.left));
    state.splitRatio = leftWidth / availableWidth;
    applySplitRatio();
  }

  function comparisonAddress(column, row) {
    const before = column.leftLabel === undefined || row.leftIndex === undefined ? '∅' : `${column.leftLabel}${row.leftIndex + 1}`;
    const after = column.rightLabel === undefined || row.rightIndex === undefined ? '∅' : `${column.rightLabel}${row.rightIndex + 1}`;
    return before === after ? before : before === '∅' ? `${after} · Added` : after === '∅' ? `${before} · Removed` : `${before} → ${after}`;
  }

  function columnHeaderStatus(column) {
    return column.status === 'unchanged' && column.leftIndex !== column.rightIndex ? 'shifted' : column.status;
  }

  function rowHeaderStatus(row) {
    return row.status === 'unchanged' && row.leftIndex !== row.rightIndex ? 'shifted' : row.status;
  }

  function rowAddress(row) {
    const before = row.leftIndex === undefined ? '∅' : row.leftIndex + 1;
    const after = row.rightIndex === undefined ? '∅' : row.rightIndex + 1;
    const kind = row.status === 'added' ? 'Added row' : row.status === 'removed' ? 'Removed row'
      : row.status === 'changed' ? 'Modified row' : before !== after ? 'Row position changed' : 'Row';
    return `${kind} · Before: ${before} · After: ${after}`;
  }

  function columnTooltip(column) {
    const label = column.status === 'added' ? 'Added column' : column.status === 'removed'
      ? 'Removed column' : column.status === 'changed' ? 'Renamed column'
      : column.leftIndex !== column.rightIndex ? 'Column position changed' : 'Column';
    return `${label} · Before: ${column.leftLabel ?? '∅'} · After: ${column.rightLabel ?? '∅'}`;
  }

  for (const kind of ['click', 'dblclick', 'contextmenu']) {
    elements.gridShell.addEventListener(kind, (event) => {
      if (event.target.closest('.cell-resizer')) { return; }
      const cell = event.target.closest('td[data-row][data-column]');
      if (!cell) { return; }
      const row = Number(cell.dataset.row), column = Number(cell.dataset.column);
      if (kind === 'dblclick') { openCellComparison(row, column); }
      else {
        cancelPendingNavigation();
        inspectCell(row, column, cell.dataset.side);
        if (kind === 'contextmenu') { selectCellContents(cell); }
        else { activeGrid().focus({ preventScroll: true }); }
      }
    });
  }

  elements.gridShell.addEventListener('pointerdown', (event) => {
    const handle = event.target.closest?.('.cell-resizer');
    if (!handle || event.button !== 0) { return; }
    event.preventDefault();
    event.stopPropagation();
    hideTooltip();
    const kind = handle.dataset.resizeKind;
    const bounds = (kind === 'column' ? handle.parentElement : handle.closest('tr')).getBoundingClientRect();
    cellResize = { handle, kind, index: Number(handle.dataset.resizeIndex),
      origin: kind === 'column' ? event.clientX : event.clientY,
      size: kind === 'column' ? bounds.width : bounds.height };
    handle.setPointerCapture(event.pointerId);
    document.body.classList.add(`resizing-${kind}`);
  });
  elements.gridShell.addEventListener('pointermove', (event) => {
    if (!cellResize) { return; }
    const position = cellResize.kind === 'column' ? event.clientX : event.clientY;
    updateCellSize(cellResize.kind, cellResize.index, cellResize.size + position - cellResize.origin);
  });
  const finishCellResize = (event) => {
    if (!cellResize) { return; }
    const handle = cellResize.handle;
    cellResize = null;
    if (handle.hasPointerCapture(event.pointerId)) { handle.releasePointerCapture(event.pointerId); }
    document.body.classList.remove('resizing-column', 'resizing-row');
    viewportKey = '';
    scheduleViewport();
    persistState();
  };
  elements.gridShell.addEventListener('pointerup', finishCellResize);
  elements.gridShell.addEventListener('pointercancel', finishCellResize);
  elements.gridShell.addEventListener('lostpointercapture', finishCellResize);
  elements.gridShell.addEventListener('dblclick', (event) => {
    const handle = event.target.closest?.('.cell-resizer');
    if (!handle) { return; }
    event.preventDefault();
    event.stopPropagation();
    const kind = handle.dataset.resizeKind;
    const index = Number(handle.dataset.resizeIndex);
    if (kind === 'column') {
      const cells = [...activeGrid().querySelectorAll(`[data-column="${index}"] .cell-content > span:first-child, [data-column="${index}"] .unified-value > span:not(.change-marker), th[data-column="${index}"]`)];
      const measure = document.createElement('span');
      measure.className = 'column-measure';
      document.body.append(measure);
      let width = 64;
      for (const cell of cells) {
        measure.style.font = getComputedStyle(cell).font;
        measure.textContent = cell.textContent;
        width = Math.max(width, measure.getBoundingClientRect().width + 28);
      }
      measure.remove();
      updateCellSize('column', index, Math.min(600, width));
    } else { delete currentSizes().row[index]; }
    applyCellSizes();
    applyFrozenPanes();
    viewportKey = '';
    scheduleViewport();
    persistState();
  });
  elements.gridShell.addEventListener('keydown', (event) => {
    const handle = event.target.closest?.('.cell-resizer');
    if (!handle) { return; }
    const kind = handle.dataset.resizeKind;
    const keys = kind === 'column' ? ['ArrowLeft', 'ArrowRight'] : ['ArrowUp', 'ArrowDown'];
    if (!keys.includes(event.key)) { return; }
    event.preventDefault();
    event.stopPropagation();
    const bounds = (kind === 'column' ? handle.parentElement : handle.closest('tr')).getBoundingClientRect();
    updateCellSize(kind, Number(handle.dataset.resizeIndex), (kind === 'column' ? bounds.width : bounds.height) + (event.key === keys[0] ? -10 : 10));
    persistState();
  });

  for (const [element, key] of [[elements.freezeRows, 'freezeRows'], [elements.freezeColumns, 'freezeColumns']]) {
    element.addEventListener('change', () => {
      captureAnchor();
      state[key] = normalizeFreeze(element.value);
      element.value = state[key];
      persistState();
      requestRows();
    });
  }
  elements.focusChanges.addEventListener('click', () => {
    state.focusChanges = !state.focusChanges;
    syncFocusButton();
    vscode.postMessage({ type: 'updateSetting', key: 'focusChanges', value: state.focusChanges });
    state.offset = 0;
    state.expandedRows = [];
    state.expandedColumns = [];
    clearInspector();
    persistState();
    requestRows();
  });

  elements.emptyShowChanges.addEventListener('click', () => {
    state.expandedRows = [];
    state.expandedColumns = [];
    window.clearTimeout(searchTimer);
    state.query = '';
    state.findText = '';
    elements.search.value = '';
    elements.findStatus.textContent = '';
    state.filter = 'changed';
    state.offset = 0;
    updateFilterButtons();
    clearInspector();
    vscode.postMessage({ type: 'updateSetting', key: 'rowFilter', value: state.filter });
    requestRows();
  });

  document.querySelectorAll('.filter').forEach((button) => {
    button.addEventListener('click', () => {
      if (state.filter === button.dataset.filter) { return; }

      state.expandedRows = [];
      state.expandedColumns = [];
      state.filter = button.dataset.filter;
      state.offset = 0;
      updateFilterButtons();
      clearInspector();
      vscode.postMessage({
        type: 'updateSetting',
        key: 'rowFilter',
        value: state.filter
      });
      requestRows();
    });
  });

  elements.search.addEventListener('input', () => {
    window.clearTimeout(searchTimer);
    state.findText = elements.search.value;
    state.findRequestId += 1;
    elements.findStatus.textContent = state.findText.trim() ? 'Finding…' : '';
    elements.search.closest('.search-box').classList.toggle('has-query', Boolean(state.findText.trim()));
    elements.findPrevious.disabled = elements.findNext.disabled = !state.findText.trim();
    viewportKey = '';
    scheduleViewport();
    searchTimer = window.setTimeout(() => {
      if (state.matchOnly) { applyMatchFilter(); }
      else if (state.findText.trim()) { requestFind('next', true); }
      persistState();
    }, 260);
  });
  elements.search.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      window.clearTimeout(searchTimer);
      if (state.matchOnly && state.query !== state.findText) { applyMatchFilter(); }
      else { requestFind(event.shiftKey ? 'previous' : 'next'); }
    }
    if (event.key === 'Escape') { event.preventDefault(); activeGrid().focus(); }
  });
  elements.findPrevious.addEventListener('click', () => requestFind('previous'));
  elements.findNext.addEventListener('click', () => requestFind('next'));
  elements.matchOnly.addEventListener('change', () => { state.matchOnly = elements.matchOnly.checked; applyMatchFilter(); });
  elements.goTo.addEventListener('keydown', (event) => {
    if (event.key !== 'Enter') { return; }
    event.preventDefault();
    const address = elements.goTo.value.trim();
    if (!/^(?:[a-z]+)?[1-9][0-9]*$/i.test(address)) {
      announce('Enter a row number such as 218, or a cell address such as C218.');
      return;
    }
    requestLocation({ address, column: state.selectedCell?.column, side: state.activeSide });
    elements.displayOptions.hidePopover();
  });
  elements.retryRows.addEventListener('click', () => { elements.retryRows.hidden = true; rowStream.retry(); viewportKey = ''; scheduleViewport(); });
  elements.previousSheetChange.addEventListener('click', () => { elements.displayOptions.hidePopover(); changeSheet('previous'); });
  elements.nextSheetChange.addEventListener('click', () => { elements.displayOptions.hidePopover(); changeSheet('next'); });
  elements.displayOptions.addEventListener('beforetoggle', (event) => {
    if (event.newState === 'open') {
      const bounds = elements.displayOptionsButton.getBoundingClientRect();
      elements.displayOptions.style.top = `${bounds.bottom + 6}px`;
      elements.displayOptions.style.right = `${Math.max(8, window.innerWidth - bounds.right)}px`;
      elements.displayOptions.style.maxHeight = `${window.innerHeight - bounds.bottom - 14}px`;
    }
    elements.displayOptionsButton.setAttribute('aria-expanded', String(event.newState === 'open'));
  });
  elements.toggleDetails.addEventListener('click', () => setDetailsOpen(!state.detailsOpen));
  elements.closeDetails.addEventListener('click', () => setDetailsOpen(false));

  elements.sheetSelect.addEventListener('change', () => {
    selectSheet(elements.sheetSelect.value, true);
  });

  elements.themeSelect.addEventListener('change', () => {
    applyTheme(elements.themeSelect.value);
    vscode.postMessage({ type: 'updateSetting', key: 'theme', value: state.theme });
  });

  elements.openLocalFile.addEventListener('click', () => {
    vscode.postMessage({ type: 'openLocalFile' });
  });

  elements.diffModeSwitch.addEventListener('click', (event) => {
    const button = event.target.closest('[data-mode]');
    if (!button || button.dataset.mode === state.diffMode) { return; }
    applyDiffMode(button.dataset.mode);
    vscode.postMessage({ type: 'updateSetting', key: 'diffMode', value: state.diffMode });
  });

  elements.previousChange.addEventListener('click', () => requestChange('previous'));
  elements.nextChange.addEventListener('click', () => requestChange('next'));

  elements.cellInspector.addEventListener('dblclick', (event) => {
    if (!state.selectedCell) {
      return;
    }
    event.preventDefault();
    openCellComparison(state.selectedCell.row, state.selectedCell.column);
  });

  elements.cellInspector.addEventListener('keydown', (event) => {
    if (event.key === 'Enter' && state.selectedCell) {
      event.preventDefault();
      openCellComparison(state.selectedCell.row, state.selectedCell.column);
    }
  });

  elements.closeCellComparison.addEventListener('click', () => elements.cellComparisonDialog.close());
  elements.cellComparisonGranularity.addEventListener('change', () => {
    updateTextDiffSetting('textDiffGranularity', elements.cellComparisonGranularity.value);
  });
  elements.cellComparisonLayout.addEventListener('change', () => {
    updateTextDiffSetting('textDiffLayout', elements.cellComparisonLayout.value);
  });
  elements.cellComparisonDialog.addEventListener('click', (event) => {
    if (event.target === elements.cellComparisonDialog) {
      elements.cellComparisonDialog.close();
    }
  });
  elements.cellComparisonDialog.addEventListener('close', () => {
    activeDialogComparison = null;
  });

  elements.navigationUnitSelect.addEventListener('change', () => {
    applyNavigationUnit(elements.navigationUnitSelect.value);
    vscode.postMessage({
      type: 'updateSetting',
      key: 'navigationUnit',
      value: state.navigationUnit
    });
  });

  elements.splitter.addEventListener('pointerdown', (event) => {
    if (event.button !== 0) {
      return;
    }
    event.preventDefault();
    elements.splitter.setPointerCapture(event.pointerId);
    document.body.classList.add('resizing-panes');
    updateSplitFromPointer(event);
  });

  elements.splitter.addEventListener('pointermove', (event) => {
    if (elements.splitter.hasPointerCapture(event.pointerId)) {
      updateSplitFromPointer(event);
    }
  });

  const finishSplitResize = (event) => {
    if (elements.splitter.hasPointerCapture(event.pointerId)) {
      elements.splitter.releasePointerCapture(event.pointerId);
    }
    document.body.classList.remove('resizing-panes');
    persistState();
  };

  elements.splitter.addEventListener('pointerup', finishSplitResize);
  elements.splitter.addEventListener('pointercancel', finishSplitResize);
  elements.splitter.addEventListener('dblclick', () => {
    state.splitRatio = 0.5;
    applySplitRatio();
    persistState();
  });
  elements.splitter.addEventListener('keydown', (event) => {
    if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') {
      return;
    }
    event.preventDefault();
    const direction = event.key === 'ArrowLeft' ? -1 : 1;
    state.splitRatio += direction * (event.shiftKey ? 0.1 : 0.02);
    applySplitRatio();
    persistState();
  });

  const splitResizeObserver = new ResizeObserver(() => { applySplitRatio(); applyFrozenPanes(); });
  splitResizeObserver.observe(elements.gridShell);

  document.addEventListener('pointerover', (event) => {
    if (event.pointerType === 'touch' || event.buttons || elements.cellComparisonDialog.open) { return; }
    if (elements.hoverTooltip.contains(event.target)) {
      window.clearTimeout(tooltipHideTimer);
      return;
    }
    const target = event.target instanceof Element ? event.target.closest('[data-tooltip]') : null;
    if (target) {
      scheduleTooltipShow(target, event.clientX);
    } else {
      scheduleTooltipHide();
    }
  });

  document.addEventListener('pointerout', (event) => {
    const target = activeTooltipTarget || pendingTooltipTarget;
    if (!target) { return; }
    const related = event.relatedTarget;
    if (!(related instanceof Node)) {
      hideTooltip();
    } else if (!target.contains(related) && !elements.hoverTooltip.contains(related)) {
      scheduleTooltipHide();
    }
  });

  document.addEventListener('focusin', (event) => {
    if (elements.hoverTooltip.contains(event.target)) {
      window.clearTimeout(tooltipHideTimer);
      return;
    }
    const target = event.target instanceof Element ? event.target.closest('[data-tooltip]') : null;
    if (target?.matches(':focus-visible') && !elements.cellComparisonDialog.open) {
      scheduleTooltipShow(target);
    }
  });

  document.addEventListener('focusout', (event) => {
    if (event.relatedTarget instanceof Node && elements.hoverTooltip.contains(event.relatedTarget)) { return; }
    if (activeTooltipTarget?.contains(event.target) || pendingTooltipTarget?.contains(event.target) ||
      elements.hoverTooltip.contains(event.target)) {
      scheduleTooltipHide();
    }
  });

  document.addEventListener('pointerdown', (event) => {
    if (!elements.hoverTooltip.contains(event.target)) { hideTooltip(); }
  });
  document.addEventListener('scroll', (event) => {
    if (!(event.target instanceof Node) || !elements.hoverTooltip.contains(event.target)) { hideTooltip(); }
  }, true);
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) { hideTooltip(); }
  });
  window.addEventListener('blur', hideTooltip);
  window.addEventListener('resize', hideTooltip);
  document.documentElement.addEventListener('pointerleave', hideTooltip);

  for (const grid of [elements.leftGrid, elements.rightGrid, elements.unifiedGrid]) {
    grid.addEventListener('scroll', () => {
      if (!rowStream.metadata || !grid.clientWidth) { return; }
      const expected = programmaticScroll.get(grid);
      const programmed = expected && Math.abs(expected.top - grid.scrollTop) <= 1 && Math.abs(expected.left - grid.scrollLeft) <= 1;
      if (!programmed) {
        state.activeSide = grid === elements.leftGrid ? 'left' : 'right';
        logicalTop = rowStream.logicalFromPhysical(grid.scrollTop, scrollViewportHeight());
      }
      programmaticScroll.delete(grid);
      if (!programmed && state.diffMode !== 'unified') { synchronizeScroll(grid, grid === elements.leftGrid ? elements.rightGrid : elements.leftGrid); }
      scheduleViewport();
    }, { passive: true });
    grid.addEventListener('wheel', (event) => {
      if (!rowStream.metadata || !event.deltaY || event.shiftKey || event.ctrlKey || event.metaKey || Math.abs(event.deltaX) > Math.abs(event.deltaY)) { return; }
      event.preventDefault();
      cancelPendingNavigation();
      state.activeSide = grid === elements.leftGrid ? 'left' : 'right';
      const factor = event.deltaMode === 1 ? 31 : event.deltaMode === 2 ? scrollViewportHeight() : 1;
      moveScroll(logicalTop + event.deltaY * factor);
      if (event.deltaX) { grid.scrollLeft += event.deltaX; }
    }, { passive: false });
    grid.addEventListener('keydown', handleGridKey);
    grid.addEventListener('pointerdown', () => cancelPendingNavigation());
  }
  new ResizeObserver(scheduleViewport).observe(elements.gridShell);
  window.addEventListener('pagehide', flushState);

  document.addEventListener('copy', (event) => {
    if (shouldKeepNativeCopy()) {
      return;
    }
    const text = selectedCellCopyText();
    if (text === null || !event.clipboardData) {
      return;
    }
    event.clipboardData.setData('text/plain', text);
    event.preventDefault();
  });

  function synchronizeScroll(source, target) {
    if (syncingScroll) {
      return;
    }
    syncingScroll = true;
    writeScroll(target, source.scrollTop, source.scrollLeft);
    window.requestAnimationFrame(() => {
      syncingScroll = false;
    });
  }

  window.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') { hideTooltip(); cancelPendingNavigation(); }
    if (elements.cellComparisonDialog.open) { return; }
    if ((event.metaKey || event.ctrlKey) && event.key.toLocaleLowerCase() === 'f') {
      event.preventDefault();
      elements.displayOptions.hidePopover();
      elements.search.focus();
      elements.search.select();
    } else if ((event.metaKey || event.ctrlKey) && event.key.toLocaleLowerCase() === 'g') {
      event.preventDefault();
      elements.displayOptions.showPopover();
      elements.goTo.focus();
      elements.goTo.select();
    } else if (event.key === 'F7') {
      event.preventDefault();
      requestChange(event.shiftKey ? 'previous' : 'next');
    } else if (event.altKey && event.key === 'ArrowLeft' && !event.target.matches('input, textarea, select')) {
      event.preventDefault();
      requestChange('previous');
    } else if (event.altKey && event.key === 'ArrowRight' && !event.target.matches('input, textarea, select')) {
      event.preventDefault();
      requestChange('next');
    }
  });

  vscode.postMessage({ type: 'timing', stage: 'startup', durationMs: performance.now() });
  vscode.postMessage({ type: 'ready' });
})();
