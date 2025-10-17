import { MessageToExtension } from '../../shared/message';
import { ExcelFileDiff } from '../../utils/excelDiffTypes';

export class DiffTable {
  private app: any;
  private currentDiff: ExcelFileDiff | null = null;
  private currentSheetIndex: number = 0;
  private diffCells: Array<{ rowIndex: number; colIndex: number; type: string }> = [];
  private navigationIndex: number = 0;
  private collapsedRegions: Set<number> = new Set();  // 存储折叠的区域ID

  constructor(app: any) {
    this.app = app;
  }

  public initialize(): void {
    this.bindEvents();
  }

  private bindEvents(): void {
    // 导航按钮
    document.addEventListener('click', (event) => {
      const target = event.target as HTMLElement;
      
      // 使用 closest 查找最近的按钮，以处理点击按钮内部元素的情况
      const prevDiff = target.closest('#prev-diff');
      const nextDiff = target.closest('#next-diff');
      
      if (prevDiff) {
        this.navigateToPrevious();
      } else if (nextDiff) {
        this.navigateToNext();
      }
      
      // 监听折叠区域点击展开
      const collapsedRow = target.closest('.collapsed-region');
      if (collapsedRow) {
        const regionId = parseInt(collapsedRow.getAttribute('data-region-id') || '0');
        this.toggleRegion(regionId);
      }
    });

    // 监听diff模式变化
    document.addEventListener('diffModeChanged', () => {
      this.renderCurrentSheet();
    });

    // 监听折叠状态切换
    document.addEventListener('unchangedRowsToggled', () => {
      // 清空已展开的区域记录，因为全局折叠/展开状态改变了
      this.collapsedRegions.clear();
      this.renderCurrentSheet();
    });

    // 监听diff模式选择器变化
    const diffModeSelect = document.getElementById('diff-mode');
    if (diffModeSelect) {
      diffModeSelect.addEventListener('change', () => {
        this.renderCurrentSheet();
      });
    }
  }

  public render(diff: ExcelFileDiff, oldFilePath?: string, newFilePath?: string): void {
    this.currentDiff = diff;
    this.renderFileInfo(oldFilePath, newFilePath);
    this.renderSummary(diff.summary);
    this.renderTabs(diff.sheets);
    this.renderCurrentSheet();
  }

  private renderFileInfo(oldFilePath?: string, newFilePath?: string): void {
    const oldPathEl = document.querySelector('.file-old .file-path');
    const newPathEl = document.querySelector('.file-new .file-path');
    
    if (oldPathEl && oldFilePath) {
      oldPathEl.textContent = this.getFileName(oldFilePath);
    }
    if (newPathEl && newFilePath) {
      newPathEl.textContent = this.getFileName(newFilePath);
    }
  }

  private renderSummary(summary: any): void {
    const addedEl = document.querySelector('.summary-item.added .summary-value');
    const deletedEl = document.querySelector('.summary-item.removed .summary-value');
    const modifiedEl = document.querySelector('.summary-item.modified .summary-value');
    
    if (addedEl) {
      addedEl.textContent = (summary.totalAdded || 0).toString();
    }
    if (deletedEl) {
      deletedEl.textContent = (summary.totalDeleted || 0).toString();
    }
    if (modifiedEl) {
      modifiedEl.textContent = (summary.totalModified || 0).toString();
    }
  }

  private renderTabs(sheetDiffs: any[]): void {
    const tabListEl = document.querySelector('.tab-list');
    if (!tabListEl) {
      return;
    }

    tabListEl.innerHTML = '';

    sheetDiffs.forEach((sheetDiff, index) => {
      const tabEl = document.createElement('div');
      tabEl.className = `tab-item ${sheetDiff.type}`;
      tabEl.textContent = sheetDiff.sheetName;
      
      // 添加徽章显示差异数量
      const badge = this.createBadge(sheetDiff);
      if (badge) {
        tabEl.appendChild(badge);
      }

      tabEl.addEventListener('click', () => {
        this.switchToSheet(index);
      });

      tabListEl.appendChild(tabEl);
    });

    // 激活第一个标签
    if (sheetDiffs.length > 0) {
      this.switchToSheet(0);
    }
  }

  private createBadge(sheetDiff: any): HTMLElement | null {
    const { added, deleted, modified } = sheetDiff.stats;
    const totalChanges = added + deleted + modified;
    
    if (totalChanges === 0) {
      return null;
    }

    const badge = document.createElement('span');
    badge.className = 'tab-badge';
    badge.textContent = totalChanges.toString();
    return badge;
  }

  private switchToSheet(index: number): void {
    // 更新标签状态
    document.querySelectorAll('.tab-item').forEach((tab, i) => {
      tab.classList.toggle('active', i === index);
    });

    this.currentSheetIndex = index;
    this.renderCurrentSheet();
  }

  private renderCurrentSheet(): void {
    if (!this.currentDiff) {
      return;
    }

    const sheetDiff = this.currentDiff.sheets[this.currentSheetIndex];
    if (!sheetDiff) {
      return;
    }

    const tabContentEl = document.querySelector('.tab-content');
    if (!tabContentEl) {
      return;
    }

    // 收集所有差异行用于导航
    this.diffCells = [];
    sheetDiff.rows.forEach((row: any) => {
      if (row.type !== 'unchanged') {
        this.diffCells.push({
          rowIndex: row.rowIndex,
          colIndex: 0,
          type: row.type
        });
      }
    });

    // 根据当前diff模式渲染
    const diffMode = this.getDiffMode();
    if (diffMode === 'side-by-side') {
      tabContentEl.innerHTML = this.renderSideBySide(sheetDiff);
    } else {
      tabContentEl.innerHTML = this.renderInline(sheetDiff);
    }
    
    // 添加导航控件
    this.addNavigationControls(tabContentEl);
  }

  private getDiffMode(): 'side-by-side' | 'inline' {
    const diffModeSelect = document.getElementById('diff-mode') as HTMLSelectElement;
    return (diffModeSelect?.value as 'side-by-side' | 'inline') || 'side-by-side';
  }

  /**
   * 渲染并排视图（Side-by-side）
   */
  private renderSideBySide(sheetDiff: any): string {
    const { rows } = sheetDiff;
    if (rows.length === 0) {
      return '<div class="empty-message">工作表为空</div>';
    }

    // 计算最大列数
    const maxCols = Math.max(...rows.map((row: any) => 
      Math.max(
        row.oldRow?.length || 0,
        row.newRow?.length || 0
      )
    ));

    // 根据 showUnchangedRows 决定是否需要分组
    const showUnchanged = this.getShowUnchangedRows();
    const processedRows = showUnchanged ? rows : this.groupUnchangedRows(rows);

    let html = '<div class="side-by-side-container">';
    
    // 左侧面板：原始文件
    html += '<div class="side-by-side-pane left-pane">';
    html += '<div class="pane-header">原始文件</div>';
    html += '<div class="pane-content">';
    html += '<table class="diff-table">';
    html += this.renderTableHeader(maxCols);
    html += '<tbody>';
    
    processedRows.forEach((item: any) => {
      if (item.type === 'collapsed-region') {
        // 渲染折叠区域
        html += this.renderCollapsedRegionSideBySide(item.regionId, item.rows);
      } else if (item.type !== 'added') {
        html += this.renderRowForSideBySide(item, 'old', maxCols);
      }
    });
    
    html += '</tbody></table></div></div>';
    
    // 右侧面板：新文件
    html += '<div class="side-by-side-pane right-pane">';
    html += '<div class="pane-header">新文件</div>';
    html += '<div class="pane-content">';
    html += '<table class="diff-table">';
    html += this.renderTableHeader(maxCols);
    html += '<tbody>';
    
    processedRows.forEach((item: any) => {
      if (item.type === 'collapsed-region') {
        // 渲染折叠区域
        html += this.renderCollapsedRegionSideBySide(item.regionId, item.rows);
      } else if (item.type !== 'deleted') {
        html += this.renderRowForSideBySide(item, 'new', maxCols);
      }
    });
    
    html += '</tbody></table></div></div>';
    html += '</div>';
    
    return html;
  }

  /**
   * 渲染分栏视图（Inline/Unified）
   */
  private renderInline(sheetDiff: any): string {
    const { rows } = sheetDiff;
    if (rows.length === 0) {
      return '<div class="empty-message">工作表为空</div>';
    }

    // 计算最大列数
    const maxCols = Math.max(...rows.map((row: any) => 
      Math.max(
        row.oldRow?.length || 0,
        row.newRow?.length || 0
      )
    ));

    // 根据 showUnchangedRows 决定是否需要分组
    const showUnchanged = this.getShowUnchangedRows();
    const processedRows = showUnchanged ? rows : this.groupUnchangedRows(rows);

    let html = '<div class="inline-container">';
    html += '<table class="diff-table inline">';
    html += this.renderTableHeaderWithMarker(maxCols);
    html += '<tbody>';
    
    processedRows.forEach((item: any) => {
      if (item.type === 'collapsed-region') {
        // 渲染折叠区域
        html += this.renderCollapsedRegionInline(item.regionId, item.rows, maxCols);
      } else {
        switch (item.type) {
          case 'deleted':
            html += this.renderDeletedRow(item, maxCols);
            break;
          case 'added':
            html += this.renderAddedRow(item, maxCols);
            break;
          case 'modified':
            html += this.renderModifiedRow(item, maxCols);
            break;
          case 'unchanged':
            html += this.renderUnchangedRow(item, maxCols);
            break;
        }
      }
    });
    
    html += '</tbody></table></div>';
    return html;
  }

  private createTableRow(rowDiff: any, rowIndex: number, maxCols: number): string {
    const { type, cellDiffs, oldRow, newRow } = rowDiff;
    
    let html = `<tr class="row-${type}">`;
    
    // 行号
    html += `<td class="row-number">${rowIndex + 1}</td>`;
    
    // 单元格
    for (let col = 0; col < maxCols; col++) {
      const cellDiff = cellDiffs.find((cell: any) => cell.colIndex === col);
      html += this.createTableCell(cellDiff, col, oldRow, newRow);
    }
    
    html += '</tr>';
    return html;
  }

  private createTableCell(cellDiff: any, colIndex: number, oldRow: any, newRow: any): string {
    if (!cellDiff) {
      return '<td class="cell-unchanged"></td>';
    }

    const { type, oldValue, newValue, oldType, newType } = cellDiff;
    const cellClass = `cell-${type}`;
    
    let content = '';
    if (type === 'modified') {
      content = `
        <div class="cell-content">
          <div class="cell-old-value">${this.formatCellValue(oldValue, oldType)}</div>
          <div class="cell-new-value">${this.formatCellValue(newValue, newType)}</div>
        </div>
      `;
    } else if (type === 'added') {
      content = `<div class="cell-content"><div class="cell-new-value">${this.formatCellValue(newValue, newType)}</div></div>`;
    } else if (type === 'removed') {
      content = `<div class="cell-content"><div class="cell-old-value">${this.formatCellValue(oldValue, oldType)}</div></div>`;
    } else {
      content = `<div class="cell-content"><div class="cell-value">${this.formatCellValue(newValue || oldValue, newType || oldType)}</div></div>`;
    }

    return `<td class="${cellClass}" data-row="${cellDiff.rowIndex}" data-col="${colIndex}">${content}</td>`;
  }

  private formatCellValue(value: any, type: string): string {
    if (value === null || value === undefined) {
      return '';
    }
    
    if (type === 'number') {
      return typeof value === 'number' ? value.toString() : value;
    }
    
    if (type === 'date') {
      return value instanceof Date ? value.toLocaleDateString() : value;
    }
    
    return String(value);
  }

  private getColumnName(index: number): string {
    let result = '';
    while (index >= 0) {
      result = String.fromCharCode(65 + (index % 26)) + result;
      index = Math.floor(index / 26) - 1;
    }
    return result;
  }

  private addNavigationControls(container: Element): void {
    if (this.diffCells.length === 0) {
      return;
    }

    const controlsEl = document.createElement('div');
    controlsEl.className = 'navigation-controls';
    controlsEl.innerHTML = `
      <button class="nav-button" id="prev-diff" title="上一个差异">‹</button>
      <button class="nav-button" id="next-diff" title="下一个差异">›</button>
    `;

    container.appendChild(controlsEl);

    // 更新导航按钮状态
    this.updateNavigationButtons();
  }

  private navigateToPrevious(): void {
    if (this.diffCells.length === 0) {
      return;
    }
    
    this.navigationIndex = (this.navigationIndex - 1 + this.diffCells.length) % this.diffCells.length;
    this.highlightCurrentDiff();
  }

  private navigateToNext(): void {
    if (this.diffCells.length === 0) {
      return;
    }
    
    this.navigationIndex = (this.navigationIndex + 1) % this.diffCells.length;
    this.highlightCurrentDiff();
  }

  private highlightCurrentDiff(): void {
    // 清除之前的高亮
    document.querySelectorAll('.diff-table td').forEach(cell => {
      cell.classList.remove('highlighted');
    });

    // 高亮当前差异单元格
    const currentDiff = this.diffCells[this.navigationIndex];
    if (currentDiff) {
      const cell = document.querySelector(`td[data-row="${currentDiff.rowIndex}"][data-col="${currentDiff.colIndex}"]`);
      if (cell) {
        cell.classList.add('highlighted');
        cell.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
    }

    this.updateNavigationButtons();
  }

  private updateNavigationButtons(): void {
    const prevBtn = document.getElementById('prev-diff') as HTMLButtonElement;
    const nextBtn = document.getElementById('next-diff') as HTMLButtonElement;
    
    if (prevBtn) {
      prevBtn.disabled = this.diffCells.length === 0;
    }
    if (nextBtn) {
      nextBtn.disabled = this.diffCells.length === 0;
    }
  }

  public highlightCell(rowIndex: number, colIndex: number): void {
    const cell = document.querySelector(`td[data-row="${rowIndex}"][data-col="${colIndex}"]`);
    if (cell) {
      // 清除之前的高亮
      document.querySelectorAll('.diff-table td').forEach(c => {
        c.classList.remove('highlighted');
      });
      
      // 高亮指定单元格
      cell.classList.add('highlighted');
      cell.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }

  private getFileName(filePath: string): string {
    return filePath ? filePath.split('/').pop() || filePath : '';
  }

  /**
   * 渲染表头（并排视图使用）
   */
  private renderTableHeader(maxCols: number): string {
    let html = '<thead><tr>';
    html += '<th class="row-marker"></th>'; // 添加标记列
    html += '<th class="row-number">行号</th>';
    for (let col = 0; col < maxCols; col++) {
      html += `<th>${this.getColumnName(col)}</th>`;
    }
    html += '</tr></thead>';
    return html;
  }

  /**
   * 渲染带标记的表头（用于inline视图）
   */
  private renderTableHeaderWithMarker(maxCols: number): string {
    let html = '<thead><tr>';
    html += '<th class="row-marker"></th>';
    html += '<th class="row-number">行号</th>';
    for (let col = 0; col < maxCols; col++) {
      html += `<th>${this.getColumnName(col)}</th>`;
    }
    html += '</tr></thead>';
    return html;
  }

  /**
   * 为并排视图渲染行
   */
  private renderRowForSideBySide(row: any, side: 'old' | 'new', maxCols: number): string {
    const rowData = side === 'old' ? row.oldRow : row.newRow;
    if (!rowData) {
      return ''; // 如果数据不存在，不渲染
    }

    const rowClass = row.type === 'modified' ? 'row-modified' : 
                     row.type === 'deleted' ? 'row-deleted' : 
                     row.type === 'added' ? 'row-added' : 
                     'row-unchanged';

    // 根据行类型和显示侧确定标记符号
    let marker = '';
    if (row.type === 'deleted' && side === 'old') {
      marker = '-';
    } else if (row.type === 'added' && side === 'new') {
      marker = '+';
    } else if (row.type === 'modified') {
      marker = '~';
    }

    let html = `<tr class="${rowClass}" data-row-index="${row.rowIndex}">`;
    html += `<td class="row-marker">${marker}</td>`;
    html += `<td class="row-number">${row.rowIndex + 1}</td>`;

    for (let i = 0; i < maxCols; i++) {
      const cell = rowData[i];
      const cellClass = (row.type === 'modified' && row.modifiedCells?.includes(i)) 
        ? 'cell-modified' 
        : '';
      
      html += `<td class="${cellClass}" data-row="${row.rowIndex}" data-col="${i}">`;
      html += this.formatCellValue(cell);
      html += '</td>';
    }

    html += '</tr>';
    return html;
  }

  /**
   * 渲染删除的行（inline视图）
   */
  private renderDeletedRow(row: any, maxCols: number): string {
    let html = `<tr class="row-deleted" data-row-index="${row.rowIndex}">`;
    html += '<td class="row-marker">-</td>';
    html += `<td class="row-number">${row.rowIndex + 1}</td>`;

    for (let i = 0; i < maxCols; i++) {
      const cell = row.oldRow?.[i];
      html += `<td class="cell-deleted" data-row="${row.rowIndex}" data-col="${i}">`;
      html += this.formatCellValue(cell);
      html += '</td>';
    }

    html += '</tr>';
    return html;
  }

  /**
   * 渲染新增的行（inline视图）
   */
  private renderAddedRow(row: any, maxCols: number): string {
    let html = `<tr class="row-added" data-row-index="${row.rowIndex}">`;
    html += '<td class="row-marker">+</td>';
    html += `<td class="row-number">${row.rowIndex + 1}</td>`;

    for (let i = 0; i < maxCols; i++) {
      const cell = row.newRow?.[i];
      html += `<td class="cell-added" data-row="${row.rowIndex}" data-col="${i}">`;
      html += this.formatCellValue(cell);
      html += '</td>';
    }

    html += '</tr>';
    return html;
  }

  /**
   * 渲染修改的行（inline视图）
   */
  private renderModifiedRow(row: any, maxCols: number): string {
    // 先显示旧行
    let html = `<tr class="row-modified-old" data-row-index="${row.rowIndex}">`;
    html += '<td class="row-marker">-</td>';
    html += `<td class="row-number">${row.rowIndex + 1}</td>`;

    for (let i = 0; i < maxCols; i++) {
      const cell = row.oldRow?.[i];
      const isModified = row.modifiedCells?.includes(i);
      html += `<td class="${isModified ? 'cell-modified' : ''}" data-row="${row.rowIndex}" data-col="${i}">`;
      html += this.formatCellValue(cell);
      html += '</td>';
    }

    html += '</tr>';

    // 再显示新行
    html += `<tr class="row-modified-new" data-row-index="${row.rowIndex}">`;
    html += '<td class="row-marker">+</td>';
    html += `<td class="row-number">${row.rowIndex + 1}</td>`;

    for (let i = 0; i < maxCols; i++) {
      const cell = row.newRow?.[i];
      const isModified = row.modifiedCells?.includes(i);
      html += `<td class="${isModified ? 'cell-modified' : ''}" data-row="${row.rowIndex}" data-col="${i}">`;
      html += this.formatCellValue(cell);
      html += '</td>';
    }

    html += '</tr>';
    return html;
  }

  /**
   * 渲染未修改的行（inline视图）
   */
  private renderUnchangedRow(row: any, maxCols: number): string {
    let html = `<tr class="row-unchanged" data-row-index="${row.rowIndex}">`;
    html += '<td class="row-marker"></td>';
    html += `<td class="row-number">${row.rowIndex + 1}</td>`;

    for (let i = 0; i < maxCols; i++) {
      const cell = row.newRow?.[i] || row.oldRow?.[i];
      html += `<td data-row="${row.rowIndex}" data-col="${i}">`;
      html += this.formatCellValue(cell);
      html += '</td>';
    }

    html += '</tr>';
    return html;
  }

  /**
   * 格式化单元格值
   */
  private formatCellValue(cell: any): string {
    if (!cell || cell.value === null || cell.value === undefined) {
      return '';
    }

    let value = cell.value;
    
    // 如果是数字，保留适当的小数位
    if (typeof value === 'number') {
      if (Number.isInteger(value)) {
        return value.toString();
      } else {
        return value.toFixed(2);
      }
    }
    
    // 如果是字符串，转义HTML并处理换行
    if (typeof value === 'string') {
      return this.escapeHtmlWithLineBreaks(value);
    }
    
    return String(value);
  }

  /**
   * 转义HTML并保留换行符
   */
  private escapeHtmlWithLineBreaks(text: string): string {
    // 先转义HTML特殊字符
    const div = document.createElement('div');
    div.textContent = text;
    let escaped = div.innerHTML;
    
    // 将换行符转换为 <br> 标签
    // 支持 \r\n (Windows)、\n (Unix/Mac)、\r (老Mac)
    escaped = escaped.replace(/\r\n/g, '<br>');
    escaped = escaped.replace(/\n/g, '<br>');
    escaped = escaped.replace(/\r/g, '<br>');
    
    return escaped;
  }

  /**
   * 转义HTML（已废弃，使用 escapeHtmlWithLineBreaks）
   */
  private escapeHtml(text: string): string {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  /**
   * 将连续的未改变行分组
   */
  private groupUnchangedRows(rows: any[]): any[] {
    const grouped: any[] = [];
    let unchangedStart = -1;
    let regionId = 0;

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      
      if (row.type === 'unchanged') {
        if (unchangedStart === -1) {
          unchangedStart = i;
        }
      } else {
        // 遇到非 unchanged 行，结束之前的 unchanged 区域
        if (unchangedStart !== -1) {
          grouped.push({
            type: 'collapsed-region',
            regionId: regionId++,
            startIndex: unchangedStart,
            endIndex: i - 1,
            rows: rows.slice(unchangedStart, i)
          });
          unchangedStart = -1;
        }
        grouped.push(row);
      }
    }

    // 处理最后的 unchanged 区域
    if (unchangedStart !== -1) {
      grouped.push({
        type: 'collapsed-region',
        regionId: regionId++,
        startIndex: unchangedStart,
        endIndex: rows.length - 1,
        rows: rows.slice(unchangedStart)
      });
    }

    return grouped;
  }

  /**
   * 渲染折叠占位符（并排视图）
   */
  private renderCollapsedRegionSideBySide(regionId: number, rows: any[]): string {
    const count = rows.length;
    const isExpanded = this.collapsedRegions.has(regionId);
    
    if (isExpanded) {
      // 展开状态：显示所有行
      let html = '';
      rows.forEach(row => {
        html += this.renderRowForSideBySide(row, 'old', this.getMaxCols());
      });
      return html;
    } else {
      // 折叠状态：VS Code 风格的折叠显示
      return `<tr class="collapsed-region" data-region-id="${regionId}">
        <td colspan="999" class="collapsed-line">
          <div class="collapsed-divider"></div>
          <div class="collapsed-info">
            <span class="collapse-icon">↕</span>
            <span class="collapse-text">${count} 行未改变</span>
          </div>
        </td>
      </tr>`;
    }
  }

  /**
   * 渲染折叠占位符（分栏视图）
   */
  private renderCollapsedRegionInline(regionId: number, rows: any[], maxCols: number): string {
    const count = rows.length;
    const isExpanded = this.collapsedRegions.has(regionId);
    
    if (isExpanded) {
      // 展开状态：显示所有行
      let html = '';
      rows.forEach(row => {
        html += this.renderUnchangedRow(row, maxCols);
      });
      return html;
    } else {
      // 折叠状态：VS Code 风格的折叠显示
      return `<tr class="collapsed-region" data-region-id="${regionId}">
        <td colspan="999" class="collapsed-line">
          <div class="collapsed-divider"></div>
          <div class="collapsed-info">
            <span class="collapse-icon">↕</span>
            <span class="collapse-text">${count} 行未改变</span>
          </div>
        </td>
      </tr>`;
    }
  }

  /**
   * 切换区域展开/折叠状态
   */
  private toggleRegion(regionId: number): void {
    if (this.collapsedRegions.has(regionId)) {
      this.collapsedRegions.delete(regionId);
    } else {
      this.collapsedRegions.add(regionId);
    }
    this.renderCurrentSheet();
  }

  /**
   * 获取最大列数
   */
  private getMaxCols(): number {
    if (!this.currentDiff) return 0;
    const sheetDiff = this.currentDiff.sheets[this.currentSheetIndex];
    if (!sheetDiff) return 0;
    
    return Math.max(...sheetDiff.rows.map((row: any) => 
      Math.max(
        row.oldRow?.length || 0,
        row.newRow?.length || 0
      )
    ));
  }

  /**
   * 获取 toolbar 实例以访问 showUnchangedRows 状态
   */
  private getShowUnchangedRows(): boolean {
    // 通过 app 访问 toolbar
    if (this.app && this.app.toolbar) {
      return this.app.toolbar.getShowUnchangedRows();
    }
    return false;
  }
}
