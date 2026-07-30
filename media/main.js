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
    navigationUnit: 'cell',
    selectedCell: null,
    pendingFocus: null,
    splitRatio: Number.isFinite(previousState.splitRatio)
      ? Math.max(0.1, Math.min(0.9, previousState.splitRatio))
      : 0.5,
    requestId: 0
  };

  const elements = {
    app: document.getElementById('app'),
    leftName: document.getElementById('left-name'),
    leftDetail: document.getElementById('left-detail'),
    rightName: document.getElementById('right-name'),
    rightDetail: document.getElementById('right-detail'),
    summary: document.getElementById('summary'),
    sheetSelect: document.getElementById('sheet-select'),
    sheetDimensions: document.getElementById('sheet-dimensions'),
    themeSelect: document.getElementById('theme-select'),
    diffModeSelect: document.getElementById('diff-mode-select'),
    search: document.getElementById('search'),
    leftGrid: document.getElementById('left-grid'),
    rightGrid: document.getElementById('right-grid'),
    unifiedGrid: document.getElementById('unified-grid'),
    columnLabels: document.querySelector('.column-labels'),
    gridShell: document.getElementById('grid-shell'),
    splitter: document.getElementById('splitter'),
    emptyState: document.getElementById('empty-state'),
    errorBanner: document.getElementById('error-banner'),
    previousPage: document.getElementById('previous-page'),
    nextPage: document.getElementById('next-page'),
    rowRange: document.getElementById('row-range'),
    pageLabel: document.getElementById('page-label'),
    previousChange: document.getElementById('previous-change'),
    nextChange: document.getElementById('next-change'),
    navigationUnitSelect: document.getElementById('navigation-unit-select'),
    cellInspector: document.getElementById('cell-inspector'),
    hoverTooltip: document.getElementById('hover-tooltip')
  };

  let searchTimer;
  let syncingScroll = false;
  let activeTooltipTarget = null;

  window.addEventListener('message', (event) => {
    const message = event.data;
    if (message.type === 'initialize') {
      initialize(
        message.summary,
        message.showUnchangedSheets,
        message.theme,
        message.diffMode,
        message.navigationUnit,
        message.rowFilter
      );
    } else if (message.type === 'page') {
      receivePage(message.page);
    } else if (message.type === 'navigation') {
      receiveNavigation(message.target);
    } else if (message.type === 'error') {
      showError(message.message);
    }
  });

  function initialize(summary, showUnchangedSheets, theme, diffMode, navigationUnit, rowFilter) {
    state.summary = summary;
    state.showUnchangedSheets = showUnchangedSheets;
    state.theme = theme === 'light' ? 'light' : 'dark';
    state.diffMode = diffMode === 'unified' ? 'unified' : 'sideBySide';
    state.navigationUnit = navigationUnit === 'row' ? 'row' : 'cell';
    state.filter = ['all', 'changed', 'added', 'removed'].includes(rowFilter) ? rowFilter : 'all';
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
    renderSummary();
    renderSheetSelector();
    applyTheme(state.theme);
    applyDiffMode(state.diffMode, false);
    applyNavigationUnit(state.navigationUnit);

    const visibleSheets = getVisibleSheets();
    if (!visibleSheets.some((sheet) => sheet.name === state.sheet)) {
      const firstChanged = visibleSheets.find((sheet) => sheet.status !== 'unchanged');
      state.sheet = (firstChanged || visibleSheets[0] || {}).name || '';
      state.page = 0;
    }
    updateFilterButtons();
    applySplitRatio();
    elements.app.classList.remove('loading');
    if (state.sheet) {
      selectSheet(state.sheet, false);
    } else {
      const option = document.createElement('option');
      option.textContent = 'No worksheets';
      elements.sheetSelect.append(option);
      elements.sheetSelect.disabled = true;
      elements.emptyState.hidden = false;
    }
  }

  function renderSummary() {
    elements.summary.replaceChildren();
    const items = [
      ['changed', state.summary.totals.rows.changed, 'Modified rows', state.summary.totals.cells.changed],
      ['added', state.summary.totals.rows.added, 'Added rows', state.summary.totals.cells.added],
      ['removed', state.summary.totals.rows.removed, 'Removed rows', state.summary.totals.cells.removed],
      ['', state.summary.totals.sheets, 'Changed sheets', null]
    ];
    for (const [className, value, label, cells] of items) {
      const item = document.createElement('div');
      item.className = `summary-pill ${className}`;
      const strong = document.createElement('strong');
      strong.textContent = formatNumber(value);
      const copy = document.createElement('div');
      const span = document.createElement('span');
      span.textContent = label;
      copy.append(span);
      if (cells !== null) {
        const detail = document.createElement('em');
        detail.textContent = `${formatNumber(cells)} cells`;
        copy.append(detail);
      }
      setTooltip(item, cells === null
        ? `${label}: ${formatNumber(value)}`
        : `${label}: ${formatNumber(value)} rows · ${formatNumber(cells)} cells`);
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
    if (resetPage) {
      state.page = 0;
    }
    elements.sheetSelect.value = name;
    const changedRows = totalChanges(sheet.rowChanges);
    const changedCells = totalChanges(sheet.cellChanges);
    elements.sheetDimensions.textContent = changedRows
      ? `${formatNumber(sheet.rows)} × ${formatNumber(sheet.columns)} · ${formatNumber(changedRows)} changed ${pluralize('row', changedRows)} · ${formatNumber(changedCells)} cells`
      : `${formatNumber(sheet.rows)} × ${formatNumber(sheet.columns)} · unchanged`;
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
    state.requestId += 1;
    elements.leftGrid.setAttribute('aria-busy', 'true');
    elements.rightGrid.setAttribute('aria-busy', 'true');
    elements.unifiedGrid.setAttribute('aria-busy', 'true');
    vscode.postMessage({
      type: 'requestPage',
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
    state.page = page.page;
    state.pageData = page;
    elements.leftGrid.removeAttribute('aria-busy');
    elements.rightGrid.removeAttribute('aria-busy');
    elements.unifiedGrid.removeAttribute('aria-busy');
    renderGrids(page);
    updatePagination(page);
    persistState();
  }

  function renderGrids(page) {
    if (state.diffMode === 'unified') {
      elements.leftGrid.replaceChildren();
      elements.rightGrid.replaceChildren();
      elements.unifiedGrid.replaceChildren(createUnifiedTable(page));
    } else {
      elements.unifiedGrid.replaceChildren();
      elements.leftGrid.replaceChildren(createTable(page, 'left'));
      elements.rightGrid.replaceChildren(createTable(page, 'right'));
    }
    elements.emptyState.hidden = page.rows.length > 0;
    elements.leftGrid.scrollTop = 0;
    elements.rightGrid.scrollTop = 0;
    elements.leftGrid.scrollLeft = 0;
    elements.rightGrid.scrollLeft = 0;
    elements.unifiedGrid.scrollTop = 0;
    elements.unifiedGrid.scrollLeft = 0;
    const pendingTarget = state.pendingFocus;
    const target = pendingTarget || state.selectedCell;
    if (target && page.rows.some((row) => row.index === target.row)) {
      if (target.unit === 'row') {
        inspectRow(target.row, target.column);
      } else {
        inspectCell(target.row, target.column);
      }
      const cell = document.querySelector(
        `.diff-table td[data-row="${target.row}"][data-column="${target.column}"]`
      );
      cell?.scrollIntoView({ block: 'center', inline: 'center' });
      state.pendingFocus = null;
    }
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
      th.className = 'data-column';
      th.textContent = column.label;
      headRow.append(th);
    }
    head.append(headRow);
    table.append(head);

    const body = document.createElement('tbody');
    for (const row of page.rows) {
      const tr = document.createElement('tr');
      const rowNumber = document.createElement('th');
      rowNumber.scope = 'row';
      rowNumber.className = 'row-number';
      rowNumber.textContent = String(row.index + 1);
      tr.append(rowNumber);

      const cellValues = row[side];
      for (let index = 0; index < page.columns.length; index += 1) {
        const value = cellValues[index];
        const status = row.cells[index] || 'unchanged';
        const cell = document.createElement('td');
        cell.className = `data-column ${status}`;
        cell.dataset.row = String(row.index);
        cell.dataset.column = String(page.columns[index].index);
        cell.dataset.side = side;
        setTooltip(cell, value?.formula || value?.display || '');

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
        cell.addEventListener('click', () => inspectCell(row.index, page.columns[index].index));
        tr.append(cell);
      }
      body.append(tr);
    }
    table.append(body);
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
      th.className = 'data-column';
      th.textContent = column.label;
      headRow.append(th);
    }
    head.append(headRow);
    table.append(head);

    const body = document.createElement('tbody');
    for (const row of page.rows) {
      const tr = document.createElement('tr');
      const rowNumber = document.createElement('th');
      rowNumber.scope = 'row';
      rowNumber.className = 'row-number';
      rowNumber.textContent = String(row.index + 1);
      tr.append(rowNumber);

      for (let index = 0; index < page.columns.length; index += 1) {
        const left = row.left[index];
        const right = row.right[index];
        const status = row.cells[index] || 'unchanged';
        const cell = document.createElement('td');
        cell.className = `data-column unified-cell ${status}`;
        cell.dataset.row = String(row.index);
        cell.dataset.column = String(page.columns[index].index);
        cell.dataset.side = 'unified';
        setTooltip(cell, status === 'unchanged'
          ? right?.formula || right?.display || left?.formula || left?.display || ''
          : `Before: ${describeCell(left)}\nAfter: ${describeCell(right)}`);

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
        cell.addEventListener('click', () => inspectCell(row.index, page.columns[index].index));
        tr.append(cell);
      }
      body.append(tr);
    }
    table.append(body);
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

  function inspectCell(rowIndex, columnIndex) {
    const page = state.pageData;
    const row = page.rows.find((candidate) => candidate.index === rowIndex);
    const columnPosition = page.columns.findIndex((column) => column.index === columnIndex);
    if (!row || columnPosition < 0) {
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
    state.selectedCell = { row: rowIndex, column: columnIndex, unit: 'cell' };

    const address = `${encodeColumn(columnIndex)}${rowIndex + 1}`;
    const left = describeCell(row.left[columnPosition]);
    const right = describeCell(row.right[columnPosition]);
    elements.cellInspector.replaceChildren();
    const addressElement = document.createElement('strong');
    addressElement.textContent = address;
    elements.cellInspector.append(
      addressElement,
      document.createTextNode(`   Before: ${left}   →   After: ${right}`)
    );
    setTooltip(elements.cellInspector, `${address}\nBefore: ${left}\nAfter: ${right}`);
  }

  function inspectRow(rowIndex, columnIndex) {
    inspectCell(rowIndex, columnIndex);
    state.selectedCell = { row: rowIndex, column: columnIndex, unit: 'row' };
    for (const row of document.querySelectorAll(`.diff-table td[data-row="${rowIndex}"]`)) {
      row.parentElement?.classList.add('selected-row');
    }
  }

  function describeCell(cell) {
    if (!cell) {
      return '∅';
    }
    if (cell.formula) {
      return `${cell.display || '∅'}  [${cell.formula}]`;
    }
    return cell.display || '∅';
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
    vscode.postMessage({
      type: 'requestChange',
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
    state.selectedCell = { row: target.row, column: target.column, unit: state.navigationUnit };
    state.pendingFocus = state.selectedCell;
    state.page = target.page;
    requestPage();
  }

  function applyTheme(theme) {
    state.theme = theme === 'light' ? 'light' : 'dark';
    document.documentElement.dataset.theme = state.theme;
    elements.themeSelect.value = state.theme;
    persistState();
  }

  function applyDiffMode(mode, rerender = true) {
    state.diffMode = mode === 'unified' ? 'unified' : 'sideBySide';
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

  function applyNavigationUnit(unit) {
    state.navigationUnit = unit === 'row' ? 'row' : 'cell';
    elements.navigationUnitSelect.value = state.navigationUnit;
    const label = state.navigationUnit === 'row' ? 'changed row' : 'changed cell';
    elements.previousChange.title = `Previous ${label}`;
    elements.nextChange.title = `Next ${label}`;
    persistState();
  }

  function updateFilterButtons() {
    for (const button of document.querySelectorAll('.filter')) {
      button.classList.toggle('active', button.dataset.filter === state.filter);
    }
  }

  function clearInspector() {
    state.selectedCell = null;
    state.pendingFocus = null;
    elements.cellInspector.textContent = 'Select a cell to inspect its value and formula';
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
      navigationUnit: state.navigationUnit
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
    if (text) {
      element.dataset.tooltip = text;
    } else {
      delete element.dataset.tooltip;
      if (activeTooltipTarget === element) {
        hideTooltip();
      }
    }
  }

  function showTooltip(target, clientX, clientY) {
    const content = target.dataset.tooltip;
    if (!content) {
      return;
    }
    activeTooltipTarget = target;
    elements.hoverTooltip.textContent = content;
    elements.hoverTooltip.hidden = false;
    positionTooltip(clientX, clientY);
  }

  function positionTooltip(clientX, clientY) {
    if (elements.hoverTooltip.hidden) {
      return;
    }
    const margin = 10;
    const offset = 14;
    const bounds = elements.hoverTooltip.getBoundingClientRect();
    let left = clientX + offset;
    let top = clientY + offset;
    if (left + bounds.width > window.innerWidth - margin) {
      left = Math.max(margin, clientX - bounds.width - offset);
    }
    if (top + bounds.height > window.innerHeight - margin) {
      top = Math.max(margin, clientY - bounds.height - offset);
    }
    elements.hoverTooltip.style.left = `${left}px`;
    elements.hoverTooltip.style.top = `${top}px`;
  }

  function hideTooltip() {
    activeTooltipTarget = null;
    elements.hoverTooltip.hidden = true;
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

  function encodeColumn(index) {
    let result = '';
    let value = index + 1;
    while (value > 0) {
      const remainder = (value - 1) % 26;
      result = String.fromCharCode(65 + remainder) + result;
      value = Math.floor((value - 1) / 26);
    }
    return result;
  }

  document.querySelectorAll('.filter').forEach((button) => {
    button.addEventListener('click', () => {
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
      state.query = elements.search.value;
      state.page = 0;
      clearInspector();
      requestPage();
    }, 260);
  });

  elements.previousPage.addEventListener('click', () => {
    if (state.page > 0) {
      state.page -= 1;
      requestPage();
    }
  });

  elements.nextPage.addEventListener('click', () => {
    if (state.pageData && state.page < state.pageData.totalPages - 1) {
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

  elements.diffModeSelect.addEventListener('change', () => {
    applyDiffMode(elements.diffModeSelect.value);
    vscode.postMessage({ type: 'updateSetting', key: 'diffMode', value: state.diffMode });
  });

  elements.previousChange.addEventListener('click', () => requestChange('previous'));
  elements.nextChange.addEventListener('click', () => requestChange('next'));

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

  const splitResizeObserver = new ResizeObserver(() => applySplitRatio());
  splitResizeObserver.observe(elements.gridShell);

  document.addEventListener('pointerover', (event) => {
    const target = event.target instanceof Element ? event.target.closest('[data-tooltip]') : null;
    if (target) {
      showTooltip(target, event.clientX, event.clientY);
    }
  });

  document.addEventListener('pointermove', (event) => {
    if (activeTooltipTarget) {
      positionTooltip(event.clientX, event.clientY);
    }
  });

  document.addEventListener('pointerout', (event) => {
    if (!activeTooltipTarget) {
      return;
    }
    const related = event.relatedTarget;
    if (!(related instanceof Node) || !activeTooltipTarget.contains(related)) {
      hideTooltip();
    }
  });

  document.addEventListener('focusin', (event) => {
    const target = event.target instanceof Element ? event.target.closest('[data-tooltip]') : null;
    if (target) {
      const bounds = target.getBoundingClientRect();
      showTooltip(target, bounds.left + Math.min(24, bounds.width / 2), bounds.bottom);
    }
  });

  document.addEventListener('focusout', () => hideTooltip());

  elements.leftGrid.addEventListener('scroll', () => synchronizeScroll(elements.leftGrid, elements.rightGrid));
  elements.rightGrid.addEventListener('scroll', () => synchronizeScroll(elements.rightGrid, elements.leftGrid));

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
