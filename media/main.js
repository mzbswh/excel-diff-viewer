(() => {
  const vscode = acquireVsCodeApi();
  const previousState = vscode.getState() || {};
  const state = {
    summary: null,
    sheet: previousState.sheet || '',
    page: Number.isFinite(previousState.page) ? previousState.page : 0,
    filter: previousState.filter || 'all',
    query: previousState.query || '',
    pageData: null,
    showUnchangedSheets: true,
    theme: 'dark',
    diffMode: 'sideBySide',
    textDiffGranularity: normalizeTextDiffGranularity(previousState.textDiffGranularity),
    textDiffLayout: normalizeTextDiffLayout(previousState.textDiffLayout),
    navigationUnit: 'cell',
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
    preserveScroll: null,
    sheetSizes: previousState.sheetSizes || {},
    autoSelectFilter: false
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
    diffModeSelect: document.getElementById('diff-mode-select'),
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
    previousPage: document.getElementById('previous-page'),
    nextPage: document.getElementById('next-page'),
    rowRange: document.getElementById('row-range'),
    pageLabel: document.getElementById('page-label'),
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

  let searchTimer;
  let syncingScroll = false;
  let cellResize = null;
  let cellResizeFrame = null;
  let activeTooltipTarget = null;
  let tooltipHideTimer;
  let tooltipShowTimer;
  let pendingTooltipTarget = null;
  let activeDialogComparison = null;
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
      initialize(
        message.summary,
        message.showUnchangedSheets,
        message.theme,
        message.diffMode,
        message.textDiffGranularity,
        message.textDiffLayout,
        message.navigationUnit,
        message.rowFilter,
        message.focusChanges
      );
    } else if (message.type === 'loadError') {
      elements.app.classList.remove('loading');
      showError(message.message);
    } else if (message.type === 'page') {
      if (message.requestId === state.requestId) { receivePage(message.page); }
    } else if (message.type === 'navigation') {
      if (message.requestId === state.navigationRequestId && message.pageRequestId === state.requestId) {
        receiveNavigation(message.target);
      }
    } else if (message.type === 'error' && message.requestId === state.requestId) {
      elements.app.classList.remove('loading');
      for (const grid of [elements.leftGrid, elements.rightGrid, elements.unifiedGrid]) {
        grid.removeAttribute('aria-busy');
      }
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
    focusChanges
  ) {
    state.summary = summary;
    state.focusChanges = focusChanges === true;
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
    elements.search.value = state.query;
    elements.freezeRows.value = state.freezeRows;
    elements.freezeColumns.value = state.freezeColumns;
    elements.focusChanges.checked = state.focusChanges;
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
      state.page = 0;
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
        ? `${formatNumber(changedRows)} ${pluralize('row', changedRows)} · ${formatNumber(changedCells)} cells`
        : 'unchanged';
      option.textContent = `${sheet.name} — ${changeLabel}`;
      option.dataset.tooltip = `${sheet.name} · ${formatNumber(sheet.rows)} rows × ${formatNumber(sheet.columns)} columns · ${changeLabel}`;
      option.selected = sheet.name === state.sheet;
      elements.sheetSelect.append(option);
    }
  }

  function selectSheet(name, resetPage) {
    const sheet = state.summary.sheets.find((candidate) => candidate.name === name);
    if (!sheet) {
      return;
    }
    state.sheet = name;
    state.expandedRows = [];
    state.expandedColumns = [];
    state.autoSelectFilter = true;
    if (resetPage) {
      state.page = 0;
    }
    elements.sheetSelect.value = name;
    const changedRows = totalChanges(sheet.rowChanges);
    const changedCells = totalChanges(sheet.cellChanges);
    elements.sheetDimensions.textContent = changedRows
      ? `${formatNumber(sheet.rows)} × ${formatNumber(sheet.columns)} · ${formatNumber(changedRows)} changed ${pluralize('row', changedRows)} · ${formatNumber(changedCells)} cells`
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
    persistState();
    requestPage();
  }

  function requestPage() {
    if (!state.sheet) {
      return;
    }
    hideTooltip();
    state.requestId += 1;
    elements.leftGrid.setAttribute('aria-busy', 'true');
    elements.rightGrid.setAttribute('aria-busy', 'true');
    elements.unifiedGrid.setAttribute('aria-busy', 'true');
    vscode.postMessage({
      type: 'requestPage',
      requestId: state.requestId,
      freezeRows: state.freezeRows,
      freezeColumns: state.freezeColumns,
      focusChanges: state.focusChanges,
      expandedRows: state.expandedRows,
      expandedColumns: state.expandedColumns,
      sheet: state.sheet,
      page: state.page,
      filter: state.filter,
      query: state.query
    });
  }

  function receivePage(page) {
    if (
      page.sheet !== state.sheet ||
      page.filter !== state.filter ||
      page.query !== state.query
    ) {
      return;
    }
    if (state.autoSelectFilter) {
      state.autoSelectFilter = false;
      if (page.totalRows === 0 && !state.query.trim() && page.filterCounts.changed > 0) {
        state.filter = page.filterCounts.modified === 0 && page.filterCounts.removed === 0 ? 'added'
          : page.filterCounts.modified === 0 && page.filterCounts.added === 0 ? 'removed' : 'changed';
        state.page = 0;
        updateFilterButtons();
        requestPage();
        return;
      }
    }
    state.page = page.page;
    state.pageData = page;
    updateFilterButtons(page.filterCounts);
    elements.filterSummary.textContent = `${page.totalRows} matching rows · ${page.columns.length}/${page.totalColumns} columns`;
    const hiddenColumns = page.totalColumns - page.columns.length;
    if (hiddenColumns > 0) {
      const showColumns = document.createElement('button');
      showColumns.className = 'show-hidden-columns';
      showColumns.textContent = `${hiddenColumns} columns hidden · Show all`;
      showColumns.addEventListener('click', () => {
        state.expandedColumns = Array.from({ length: page.totalColumns }, (_, index) => index);
        clearInspector();
        requestPage();
      });
      elements.filterSummary.append(' · ', showColumns);
    }
    elements.leftGrid.removeAttribute('aria-busy');
    elements.rightGrid.removeAttribute('aria-busy');
    elements.unifiedGrid.removeAttribute('aria-busy');
    renderGrids(page);
    updatePagination(page);
    elements.app.classList.remove('loading');
    persistState();
  }

  function renderGrids(page) {
    hideTooltip();
    if (state.diffMode === 'unified') {
      elements.leftGrid.replaceChildren();
      elements.rightGrid.replaceChildren();
      elements.unifiedGrid.replaceChildren(createUnifiedTable(page));
    } else {
      elements.unifiedGrid.replaceChildren();
      elements.leftGrid.replaceChildren(createTable(page, 'left'));
      elements.rightGrid.replaceChildren(createTable(page, 'right'));
    }
    renderEmptyState(page);
    elements.leftGrid.scrollTop = 0;
    elements.rightGrid.scrollTop = 0;
    elements.leftGrid.scrollLeft = 0;
    elements.rightGrid.scrollLeft = 0;
    elements.unifiedGrid.scrollTop = 0;
    elements.unifiedGrid.scrollLeft = 0;
    applyCellSizes();
    applyFrozenPanes();
    if (state.preserveScroll) {
      [elements.leftGrid, elements.rightGrid, elements.unifiedGrid].forEach((grid, index) => {
        grid.scrollTop = state.preserveScroll[index].top;
        grid.scrollLeft = state.preserveScroll[index].left;
      });
      state.preserveScroll = null;
    } else { focusSelectedCell(page); }
  }

  function renderEmptyState(page) {
    const empty = page.rows.length === 0;
    elements.emptyState.hidden = !empty;
    elements.previousChange.disabled = empty;
    elements.nextChange.disabled = empty;
    if (!empty) { return; }
    const sheet = state.summary.sheets.find((candidate) => candidate.name === page.sheet);
    const hasChanges = sheet && sheet.status !== 'unchanged';
    const searching = page.query.trim().length > 0;
    const unchanged = sheet && !hasChanges && !searching && page.filter !== 'all';
    elements.emptyState.classList.toggle('unchanged', Boolean(unchanged));
    elements.emptyIcon.textContent = unchanged ? '✓' : '⌕';
    const filterLabels = { modified: 'modified values', added: 'additions', removed: 'removals', changed: 'changes', all: 'rows' };
    elements.emptyTitle.textContent = unchanged ? 'This worksheet has no changes'
      : searching ? 'No results for this search and filter'
      : page.filter === 'all' ? 'This worksheet has no rows'
      : `No ${filterLabels[page.filter]} match this filter`;
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
    const explanation = page.filter === 'modified' ? 'Modified only includes edits to existing values.'
      : page.filter === 'added' ? 'Added includes new rows, columns, and cell values.'
      : page.filter === 'removed' ? 'Removed includes deleted rows, columns, and cell values.' : '';
    elements.emptyDetail.textContent = hasChanges
      ? `This worksheet still has ${changes.join(' · ')}. ${searching ? 'Clear the search or change the filter.' : explanation}`
      : unchanged ? 'The compared worksheet values are identical.'
      : searching ? 'Clear the search or change the filter.' : 'There are no populated rows to display.';
    elements.emptyShowChanges.hidden = !hasChanges;
  }

  function normalizeFreeze(value) {
    return Number.isFinite(Number(value)) ? Math.max(0, Math.min(20, Math.trunc(Number(value)))) : 0;
  }

  function displayRows(page) {
    const frozen = new Set(page.frozenRows.map((row) => row.index));
    const rows = new Map([...page.contextRows, ...page.rows].map((row) => [row.index, row]));
    return [...page.frozenRows, ...[...rows.values()].filter((row) => !frozen.has(row.index)).sort((a, b) => a.index - b.index)];
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

  function focusSelectedCell(page) {
    const target = state.pendingFocus || state.selectedCell;
    if (!target) { return; }
    if (!displayRows(page).some((row) => row.index === target.row) ||
      !page.columns.some((column) => column.index === target.column)) {
      clearInspector();
      return;
    }
    if (target.unit === 'row') {
      inspectRow(target.row, target.column, target.side);
    } else {
      inspectCell(target.row, target.column, target.side);
    }
    for (const grid of [elements.leftGrid, elements.rightGrid, elements.unifiedGrid]) {
      grid.querySelector(`td[data-row="${target.row}"][data-column="${target.column}"]`)
        ?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
    }
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
    handle.tabIndex = 0;
    handle.setAttribute('role', 'separator');
    handle.setAttribute('aria-orientation', kind === 'column' ? 'vertical' : 'horizontal');
    handle.setAttribute('aria-label', `Resize ${kind}; drag or use arrow keys, double-click to reset`);
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
      });
    }
  }

  function expandRange(kind, start, end) {
    const key = kind === 'rows' ? 'expandedRows' : 'expandedColumns';
    const expanded = new Set(state[key]);
    for (let index = start; index < Math.min(end, start + 50); index += 1) { expanded.add(index); }
    state[key] = [...expanded];
    state.preserveScroll = [elements.leftGrid, elements.rightGrid, elements.unifiedGrid]
      .map((grid) => ({ top: grid.scrollTop, left: grid.scrollLeft }));
    clearInspector();
    requestPage();
  }

  function gapButton(kind, start, end) {
    const button = document.createElement('button');
    button.className = 'expand-gap';
    const count = end - start;
    button.textContent = kind === 'columns' ? `+${count}` : `${count} ${kind} hidden · ${count > 50 ? 'Show next 50' : 'Expand'}`;
    button.setAttribute('aria-label', `Expand ${kind} ${start + 1} through ${Math.min(end, start + 50)}`);
    setTooltip(button, kind === 'rows'
      ? 'Rows outside this filter or page. Expanding shows context without changing matching counts.'
      : `${count} columns outside this focus hidden. Click to expand${count > 50 ? ' the next 50' : ''} and see their original values.`);
    button.addEventListener('click', () => expandRange(kind, start, end));
    return button;
  }

  function addCollapsedRanges(table, page) {
    if ((!state.focusChanges && page.filter === 'all') || page.rows.length === 0) { return; }
    const body = table.tBodies[0];
    const displayed = [...body.rows];
    let nextRow = 0;
    const insertGap = (start, end, before) => {
      if (end <= start) { return; }
      const row = document.createElement('tr');
      row.className = 'row-gap';
      const cell = document.createElement('td');
      cell.colSpan = table.tHead.rows[0].cells.length;
      cell.append(gapButton('rows', start, end));
      row.append(cell);
      body.insertBefore(row, before);
    };
    for (const row of displayed) {
      const index = Number(row.dataset.row);
      insertGap(nextRow, index, row);
      nextRow = index + 1;
    }
    insertGap(nextRow, page.sheetRows, null);
  }

  function createTable(page, side) {
    const table = document.createElement('table');
    table.className = 'diff-table';
    const head = document.createElement('thead');
    const headRow = document.createElement('tr');
    const corner = document.createElement('th');
    corner.className = 'row-number';
    corner.textContent = '#';
    headRow.append(corner);
    for (const column of page.columns) {
      const th = document.createElement('th');
      th.className = `data-column column-${columnHeaderStatus(column)}`;
      th.dataset.column = String(column.index);
      th.textContent = column[`${side}Label`] ?? '∅';
      setTooltip(th, columnTooltip(column));
      th.append(createResizeHandle('column', column.index));
      headRow.append(th);
    }
    head.append(headRow);
    table.append(head);

    const body = document.createElement('tbody');
    for (const row of displayRows(page)) {
      const tr = document.createElement('tr');
      tr.dataset.row = String(row.index);
      if (!page.rows.some((match) => match.index === row.index)) { tr.classList.add('context-row'); }
      if (page.frozenRows.some((frozen) => frozen.index === row.index)) { tr.dataset.frozenRow = 'true'; }
      const rowNumber = document.createElement('th');
      rowNumber.scope = 'row';
      rowNumber.className = `row-number row-${rowHeaderStatus(row)}`;
      rowNumber.textContent = row[`${side}Index`] === undefined ? '∅' : String(row[`${side}Index`] + 1);
      setTooltip(rowNumber, rowAddress(row));
      rowNumber.append(createResizeHandle('row', row.index));
      tr.append(rowNumber);

      const cellValues = row[side];
      for (let index = 0; index < page.columns.length; index += 1) {
        const value = cellValues[index];
        const status = row.cells[index] || 'unchanged';
        const cell = document.createElement('td');
        const missingSide = row[`${side}Index`] === undefined || page.columns[index][`${side}Index`] === undefined;
        cell.className = `data-column ${status}${missingSide ? ' missing-side' : ''}`;
        if (!matchesCellFilter(status)) { cell.classList.add('filter-context'); }
        cell.dataset.row = String(row.index);
        cell.dataset.column = String(page.columns[index].index);
        cell.dataset.side = side;
        setCellTooltip(cell, page.columns[index], row, index);

        const content = document.createElement('div');
        content.className = 'cell-content';
        const text = document.createElement('span');
        text.textContent = value?.display || '';
        content.append(text);
        if (value?.formula) {
          const formula = document.createElement('span');
          formula.className = 'formula-mark';
          formula.textContent = 'fx';
          content.append(formula);
        }
        cell.append(content);
        cell.addEventListener('click', () => inspectCell(row.index, page.columns[index].index, side));
        cell.addEventListener('dblclick', () => openCellComparison(row.index, page.columns[index].index));
        cell.addEventListener('contextmenu', () => {
          inspectCell(row.index, page.columns[index].index, side);
          selectCellContents(cell);
        });
        tr.append(cell);
      }
      body.append(tr);
    }
    table.append(body);
    addCollapsedRanges(table, page);
    return table;
  }

  function createUnifiedTable(page) {
    const table = document.createElement('table');
    table.className = 'diff-table unified-table';
    const head = document.createElement('thead');
    const headRow = document.createElement('tr');
    const corner = document.createElement('th');
    corner.className = 'row-number';
    corner.textContent = '#';
    headRow.append(corner);
    for (const column of page.columns) {
      const th = document.createElement('th');
      th.className = `data-column column-${columnHeaderStatus(column)}`;
      th.dataset.column = String(column.index);
      th.textContent = column.label;
      setTooltip(th, columnTooltip(column));
      th.append(createResizeHandle('column', column.index));
      headRow.append(th);
    }
    head.append(headRow);
    table.append(head);

    const body = document.createElement('tbody');
    for (const row of displayRows(page)) {
      const tr = document.createElement('tr');
      tr.dataset.row = String(row.index);
      if (!page.rows.some((match) => match.index === row.index)) { tr.classList.add('context-row'); }
      if (page.frozenRows.some((frozen) => frozen.index === row.index)) { tr.dataset.frozenRow = 'true'; }
      const rowNumber = document.createElement('th');
      rowNumber.scope = 'row';
      rowNumber.className = `row-number row-${rowHeaderStatus(row)}`;
      const beforeRow = row.leftIndex === undefined ? '∅' : String(row.leftIndex + 1);
      const afterRow = row.rightIndex === undefined ? '∅' : String(row.rightIndex + 1);
      rowNumber.textContent = beforeRow === afterRow ? beforeRow : `${beforeRow} → ${afterRow}`;
      setTooltip(rowNumber, rowAddress(row));
      rowNumber.append(createResizeHandle('row', row.index));
      tr.append(rowNumber);

      for (let index = 0; index < page.columns.length; index += 1) {
        const left = row.left[index];
        const right = row.right[index];
        const status = row.cells[index] || 'unchanged';
        const cell = document.createElement('td');
        cell.className = `data-column unified-cell ${status}`;
        if (!matchesCellFilter(status)) { cell.classList.add('filter-context'); }
        cell.dataset.row = String(row.index);
        cell.dataset.column = String(page.columns[index].index);
        cell.dataset.side = 'unified';
        setCellTooltip(cell, page.columns[index], row, index);

        if (status === 'unchanged') {
          cell.append(createUnifiedValue(right || left, 'current-value', ''));
        } else {
          if (left) {
            cell.append(createUnifiedValue(left, 'before-value', '−'));
          }
          if (right) {
            cell.append(createUnifiedValue(right, 'after-value', '+'));
          }
        }
        cell.addEventListener('click', () => inspectCell(row.index, page.columns[index].index, 'unified'));
        cell.addEventListener('dblclick', () => openCellComparison(row.index, page.columns[index].index));
        cell.addEventListener('contextmenu', () => {
          inspectCell(row.index, page.columns[index].index, 'unified');
          selectCellContents(cell);
        });
        tr.append(cell);
      }
      body.append(tr);
    }
    table.append(body);
    addCollapsedRanges(table, page);
    return table;
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
    text.textContent = value?.display || '';
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
    const comparison = getCellComparison(rowIndex, columnIndex);
    if (!comparison) {
      return;
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
    state.selectedCell = {
      row: rowIndex,
      column: columnIndex,
      unit: 'cell',
      side: side || (state.diffMode === 'unified' ? 'unified' : 'right')
    };

    elements.cellInspector.replaceChildren();
    const addressElement = document.createElement('strong');
    addressElement.textContent = comparison.address;
    elements.cellInspector.append(
      addressElement,
      document.createTextNode(`   Before: ${comparison.left}   →   After: ${comparison.right}`)
    );
    elements.cellInspector.classList.add('has-selection');
    setComparisonTooltip(elements.cellInspector, comparison);
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
      setComparisonTooltip(cell, comparison);
      return;
    }
    const value = row.right[position] || row.left[position];
    if (!value) { return; }
    setTooltip(cell, `${comparison.address}\n${describeCell(value)}`);
    if (!value.formula && value.raw === undefined) { cell.dataset.tooltipOverflow = 'true'; }
  }

  function getCellComparison(rowIndex, columnIndex) {
    const page = state.pageData;
    if (!page) {
      return null;
    }
    const row = displayRows(page).find((candidate) => candidate.index === rowIndex);
    const columnPosition = page.columns.findIndex((column) => column.index === columnIndex);
    if (!row || columnPosition < 0) {
      return null;
    }
    return cellComparison(page.columns[columnPosition], row, columnPosition);
  }

  function openCellComparison(rowIndex, columnIndex) {
    const comparison = getCellComparison(rowIndex, columnIndex);
    if (!comparison) {
      return;
    }
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
    const page = state.pageData;
    if (!selected || !page) {
      return null;
    }
    const row = displayRows(page).find((candidate) => candidate.index === selected.row);
    const columnPosition = page.columns.findIndex((column) => column.index === selected.column);
    if (!row || columnPosition < 0) {
      return null;
    }

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

  function updatePagination(page) {
    elements.pageLabel.textContent = `Page ${page.page + 1} of ${page.totalPages}`;
    elements.previousPage.disabled = page.page <= 0;
    elements.nextPage.disabled = page.page >= page.totalPages - 1;
    if (page.totalRows === 0) {
      elements.rowRange.textContent = 'Rows 0 of 0';
    } else {
      const start = page.page * page.pageSize + 1;
      const end = Math.min(page.totalRows, start + page.rows.length - 1);
      elements.rowRange.textContent = `Rows ${formatNumber(start)}–${formatNumber(end)} of ${formatNumber(page.totalRows)}`;
    }
  }

  function requestChange(direction) {
    if (elements.leftGrid.hasAttribute('aria-busy')) { return; }
    hideTooltip();
    state.navigationRequestId += 1;
    vscode.postMessage({
      type: 'requestChange',
      focusChanges: state.focusChanges,
      requestId: state.navigationRequestId,
      pageRequestId: state.requestId,
      sheet: state.sheet,
      row: state.selectedCell?.row,
      column: state.selectedCell?.column,
      direction,
      unit: state.navigationUnit,
      filter: state.filter,
      query: state.query
    });
  }

  function receiveNavigation(target) {
    if (!target) {
      showError('No changed cells match the current worksheet, filter, and search.');
      return;
    }
    state.selectedCell = {
      row: target.row,
      column: target.column,
      unit: state.navigationUnit,
      side: state.selectedCell?.side || (state.diffMode === 'unified' ? 'unified' : 'right')
    };
    state.pendingFocus = state.selectedCell;
    if (state.page !== target.page) { state.expandedRows = []; }
    state.page = target.page;
    if (state.pageData?.page === target.page && state.pageData.sheet === state.sheet &&
      state.pageData.filter === state.filter && state.pageData.query === state.query) {
      focusSelectedCell(state.pageData);
    } else {
      requestPage();
    }
  }

  function applyTheme(theme) {
    state.theme = theme === 'light' ? 'light' : 'dark';
    document.documentElement.dataset.theme = state.theme;
    elements.themeSelect.value = state.theme;
    persistState();
  }

  function applyDiffMode(mode, rerender = true) {
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
    elements.diffModeSelect.value = state.diffMode;
    elements.gridShell.classList.toggle('unified-mode', state.diffMode === 'unified');
    elements.columnLabels.classList.toggle('unified-mode', state.diffMode === 'unified');
    if (state.diffMode === 'sideBySide') {
      applySplitRatio();
    }
    if (rerender && state.pageData) {
      renderGrids(state.pageData);
    }
    persistState();
  }

  function normalizeTextDiffGranularity(value) {
    return value === 'word' || value === 'line' ? value : 'character';
  }

  function normalizeTextDiffLayout(value) {
    return value === 'inline' || value === 'stacked' ? value : 'sideBySide';
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
    elements.navigationUnitSelect.value = state.navigationUnit;
    const label = state.navigationUnit === 'row' ? 'changed row' : 'changed cell';
    setTooltip(elements.previousChange, `Previous ${label}`);
    setTooltip(elements.nextChange, `Next ${label}`);
    persistState();
  }

  function updateFilterButtons(counts) {
    // Counts depend on the worksheet/search, not the active category. Keep them
    // while switching filters so button widths and disabled styles stay stable.
    if (!counts && state.pageData?.sheet === state.sheet && state.pageData.query === state.query) {
      counts = state.pageData.filterCounts;
    }
    for (const button of document.querySelectorAll('.filter')) {
      const filter = button.dataset.filter;
      button.classList.toggle('active', filter === state.filter);
      button.setAttribute('aria-pressed', String(filter === state.filter));
      const label = { all: 'All', changed: 'Changed', modified: 'Modified', added: 'Added', removed: 'Removed' }[filter];
      button.textContent = counts ? `${label} (${counts[filter]})` : label;
      button.disabled = Boolean(counts && counts[filter] === 0 && filter !== state.filter);
      if (!button.dataset.baseTooltip) { button.dataset.baseTooltip = button.dataset.tooltip || label; }
      setTooltip(button, button.dataset.baseTooltip + (counts ? ` · ${counts[filter]} matching rows` : ''));
    }
  }

  function clearInspector() {
    hideTooltip();
    state.selectedCell = null;
    state.pendingFocus = null;
    elements.cellInspector.textContent = 'Select a cell to inspect its value and formula';
    elements.cellInspector.classList.remove('has-selection');
    setTooltip(elements.cellInspector, '');
  }

  function showError(message) {
    elements.errorBanner.textContent = message;
    elements.errorBanner.hidden = false;
    window.setTimeout(() => {
      elements.errorBanner.hidden = true;
    }, 7000);
  }

  function persistState() {
    vscode.setState({
      sheet: state.sheet,
      page: state.page,
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
      sheetSizes: state.sheetSizes
    });
  }

  function formatNumber(value) {
    return new Intl.NumberFormat().format(value);
  }

  function formatFileTooltip(file) {
    return `${file.name}\n${file.detail}\n${file.uri}`;
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
    header.append(address, createTooltipTextDiffControls());
    return [header, createTextComparisonLayout(comparison, 'tooltip')];
  }

  function createTooltipTextDiffControls() {
    const controls = document.createElement('div');
    controls.className = 'text-diff-controls tooltip-text-diff-controls';
    controls.append(
      createTooltipTextDiffControl(
        'Granularity',
        'textDiffGranularity',
        state.textDiffGranularity,
        [
          ['character', 'Characters'],
          ['word', 'Words'],
          ['line', 'Lines']
        ]
      ),
      createTooltipTextDiffControl(
        'Layout',
        'textDiffLayout',
        state.textDiffLayout,
        [
          ['sideBySide', 'Side by side'],
          ['inline', 'Inline'],
          ['stacked', 'Stacked']
        ]
      )
    );
    return controls;
  }

  function createTooltipTextDiffControl(labelText, setting, value, options) {
    const label = document.createElement('label');
    label.className = 'text-diff-control';
    const caption = document.createElement('span');
    caption.textContent = labelText;
    const select = document.createElement('select');
    select.setAttribute('aria-label', `Text diff ${labelText.toLocaleLowerCase()}`);
    for (const [optionValue, optionLabel] of options) {
      const option = document.createElement('option');
      option.value = optionValue;
      option.textContent = optionLabel;
      select.append(option);
    }
    select.value = value;
    select.addEventListener('change', () => updateTextDiffSetting(setting, select.value));
    label.append(caption, select);
    return label;
  }

  function createTextComparisonLayout(comparison, variant) {
    const tooltip = variant === 'tooltip';
    const container = document.createElement('div');
    container.className = `${tooltip ? 'tooltip-comparison-grid' : 'cell-comparison-content'} ${textDiffLayoutClass()}`;
    if (state.textDiffLayout === 'inline') {
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
    hideTooltip();
    if (target.dataset.tooltipOverflow) {
      const text = target.querySelector('.cell-content > span, .unified-value > span');
      if (!text || text.scrollWidth <= text.clientWidth) { return; }
    }
    pendingTooltipTarget = target;
    tooltipShowTimer = window.setTimeout(() => {
      pendingTooltipTarget = null;
      if (target.isConnected && (target.matches(':hover') || target.matches(':focus-visible'))) {
        showTooltip(target, clientX);
      }
    }, 300);
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
    return before === after ? before : `Before ${before} → After ${after}`;
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
    delete currentSizes()[handle.dataset.resizeKind][handle.dataset.resizeIndex];
    applyCellSizes();
    applyFrozenPanes();
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
      state[key] = normalizeFreeze(element.value);
      element.value = state[key];
      persistState();
      requestPage();
    });
  }
  elements.focusChanges.addEventListener('change', () => {
    state.focusChanges = elements.focusChanges.checked;
    vscode.postMessage({ type: 'updateSetting', key: 'focusChanges', value: state.focusChanges });
    state.page = 0;
    state.expandedRows = [];
    state.expandedColumns = [];
    clearInspector();
    persistState();
    requestPage();
  });

  elements.emptyShowChanges.addEventListener('click', () => {
    state.expandedRows = [];
    state.expandedColumns = [];
    window.clearTimeout(searchTimer);
    state.query = '';
    elements.search.value = '';
    state.filter = 'changed';
    state.page = 0;
    updateFilterButtons();
    clearInspector();
    vscode.postMessage({ type: 'updateSetting', key: 'rowFilter', value: state.filter });
    requestPage();
  });

  document.querySelectorAll('.filter').forEach((button) => {
    button.addEventListener('click', () => {
      if (state.filter === button.dataset.filter) { return; }
      state.autoSelectFilter = false;
      state.expandedRows = [];
      state.expandedColumns = [];
      state.filter = button.dataset.filter;
      state.page = 0;
      updateFilterButtons();
      clearInspector();
      vscode.postMessage({
        type: 'updateSetting',
        key: 'rowFilter',
        value: state.filter
      });
      requestPage();
    });
  });

  elements.search.addEventListener('input', () => {
    window.clearTimeout(searchTimer);
    searchTimer = window.setTimeout(() => {
      state.expandedRows = [];
      state.query = elements.search.value;
      state.page = 0;
      clearInspector();
      requestPage();
    }, 260);
  });

  elements.previousPage.addEventListener('click', () => {
    if (state.page > 0) {
      state.expandedRows = [];
      state.page -= 1;
      requestPage();
    }
  });

  elements.nextPage.addEventListener('click', () => {
    if (state.pageData && state.page < state.pageData.totalPages - 1) {
      state.expandedRows = [];
      state.page += 1;
      requestPage();
    }
  });

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

  elements.diffModeSelect.addEventListener('change', () => {
    applyDiffMode(elements.diffModeSelect.value);
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

  elements.leftGrid.addEventListener('scroll', () => synchronizeScroll(elements.leftGrid, elements.rightGrid));
  elements.rightGrid.addEventListener('scroll', () => synchronizeScroll(elements.rightGrid, elements.leftGrid));

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
    target.scrollTop = source.scrollTop;
    target.scrollLeft = source.scrollLeft;
    window.requestAnimationFrame(() => {
      syncingScroll = false;
    });
  }

  window.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') { hideTooltip(); }
    if (elements.cellComparisonDialog.open) { return; }
    if ((event.metaKey || event.ctrlKey) && event.key.toLocaleLowerCase() === 'f') {
      event.preventDefault();
      elements.search.focus();
      elements.search.select();
    } else if (event.altKey && event.key === 'ArrowLeft') {
      event.preventDefault();
      requestChange('previous');
    } else if (event.altKey && event.key === 'ArrowRight') {
      event.preventDefault();
      requestChange('next');
    }
  });

  vscode.postMessage({ type: 'ready' });
})();
