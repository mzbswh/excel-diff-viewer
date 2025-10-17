import { VirtualScroll, StreamLoader } from './virtualScroll';

export interface RenderOptions {
  enableVirtualScroll: boolean;
  maxRowsPerPage: number;
  enableLazyLoading: boolean;
  animationDuration: number;
}

export class DiffRenderer {
  private virtualScroll: VirtualScroll;
  private streamLoader: StreamLoader;
  private options: RenderOptions;
  private container: HTMLElement | null = null;

  constructor(options: Partial<RenderOptions> = {}) {
    this.options = {
      enableVirtualScroll: true,
      maxRowsPerPage: 1000,
      enableLazyLoading: true,
      animationDuration: 300,
      ...options
    };

    this.virtualScroll = new VirtualScroll({
      itemHeight: 30,
      containerHeight: 400,
      overscan: 10,
      threshold: 100
    });

    this.streamLoader = new StreamLoader(100, 16);
  }

  public initialize(container: HTMLElement): void {
    this.container = container;
    
    if (this.options.enableVirtualScroll) {
      this.setupVirtualScroll();
    }
  }

  private setupVirtualScroll(): void {
    if (!this.container) {
      return;
    }

    // 创建虚拟滚动容器
    const scrollContainer = document.createElement('div');
    scrollContainer.style.height = '400px';
    scrollContainer.style.overflow = 'auto';
    scrollContainer.style.position = 'relative';
    scrollContainer.className = 'virtual-scroll-container';

    // 创建内容容器
    const contentContainer = document.createElement('div');
    contentContainer.className = 'virtual-scroll-content';

    scrollContainer.appendChild(contentContainer);
    this.container.appendChild(scrollContainer);

    this.virtualScroll.initialize(scrollContainer, [], (items, startIndex, endIndex) => {
      this.renderVisibleItems(contentContainer, items, startIndex, endIndex);
    });
  }

  public async renderDiffTable(diffData: any): Promise<void> {
    if (!this.container) {
      return;
    }

    if (this.options.enableVirtualScroll) {
      await this.renderWithVirtualScroll(diffData);
    } else {
      this.renderTraditional(diffData);
    }
  }

  private async renderWithVirtualScroll(diffData: any): Promise<void> {
    if (!this.container) {
      return;
    }

    const rows = this.extractRows(diffData);
    
    if (this.options.enableLazyLoading && rows.length > this.options.maxRowsPerPage) {
      await this.renderWithLazyLoading(rows);
    } else {
      this.virtualScroll.updateItems(rows);
    }
  }

  private async renderWithLazyLoading(rows: any[]): Promise<void> {
    return new Promise((resolve) => {
      this.streamLoader.loadItems(
        rows,
        (loaded, total) => {
          // 显示加载进度
          this.showLoadingProgress(loaded, total);
          
          // 更新虚拟滚动
          const loadedRows = this.streamLoader.getLoadedItems();
          this.virtualScroll.updateItems(loadedRows);
        },
        (allItems) => {
          // 加载完成
          this.hideLoadingProgress();
          this.virtualScroll.updateItems(allItems);
          resolve();
        }
      );
    });
  }

  private renderTraditional(diffData: any): void {
    if (!this.container) {
      return;
    }

    const table = this.createDiffTable(diffData);
    this.container.innerHTML = '';
    this.container.appendChild(table);
  }

  private extractRows(diffData: any): any[] {
    const rows: any[] = [];
    
    if (diffData.sheetDiffs) {
      diffData.sheetDiffs.forEach((sheetDiff: any) => {
        if (sheetDiff.rowDiffs) {
          sheetDiff.rowDiffs.forEach((rowDiff: any, index: number) => {
            rows.push({
              ...rowDiff,
              sheetName: sheetDiff.sheetName,
              rowIndex: index
            });
          });
        }
      });
    }
    
    return rows;
  }

  private renderVisibleItems(container: HTMLElement, items: any[], startIndex: number, endIndex: number): void {
    container.innerHTML = '';
    
    // 设置总高度
    const totalHeight = items.length * 30; // itemHeight
    container.style.height = `${totalHeight}px`;
    
    // 创建可见项目
    items.forEach((item, index) => {
      const itemElement = this.createRowElement(item, startIndex + index);
      itemElement.style.position = 'absolute';
      itemElement.style.top = `${(startIndex + index) * 30}px`;
      itemElement.style.width = '100%';
      container.appendChild(itemElement);
    });
  }

  private createRowElement(rowData: any, index: number): HTMLElement {
    const row = document.createElement('div');
    row.className = `diff-row row-${rowData.type}`;
    row.style.height = '30px';
    row.style.display = 'flex';
    row.style.alignItems = 'center';
    row.style.padding = '0 8px';
    row.style.borderBottom = '1px solid var(--border-light)';
    
    // 行号
    const rowNumber = document.createElement('div');
    rowNumber.textContent = (index + 1).toString();
    rowNumber.style.width = '60px';
    rowNumber.style.textAlign = 'center';
    rowNumber.style.fontWeight = '600';
    rowNumber.style.color = 'var(--text-secondary)';
    row.appendChild(rowNumber);
    
    // 单元格内容
    const cellContent = document.createElement('div');
    cellContent.style.flex = '1';
    cellContent.style.display = 'flex';
    
    if (rowData.cellDiffs) {
      rowData.cellDiffs.forEach((cellDiff: any) => {
        const cell = this.createCellElement(cellDiff);
        cellContent.appendChild(cell);
      });
    }
    
    row.appendChild(cellContent);
    return row;
  }

  private createCellElement(cellDiff: any): HTMLElement {
    const cell = document.createElement('div');
    cell.className = `diff-cell cell-${cellDiff.type}`;
    cell.style.padding = '4px 8px';
    cell.style.borderRight = '1px solid var(--border-light)';
    cell.style.minWidth = '100px';
    
    if (cellDiff.type === 'modified') {
      cell.innerHTML = `
        <div class="cell-old-value">${this.formatValue(cellDiff.oldValue)}</div>
        <div class="cell-new-value">${this.formatValue(cellDiff.newValue)}</div>
      `;
    } else if (cellDiff.type === 'added') {
      cell.innerHTML = `<div class="cell-new-value">${this.formatValue(cellDiff.newValue)}</div>`;
    } else if (cellDiff.type === 'removed') {
      cell.innerHTML = `<div class="cell-old-value">${this.formatValue(cellDiff.oldValue)}</div>`;
    } else {
      cell.innerHTML = `<div class="cell-value">${this.formatValue(cellDiff.newValue || cellDiff.oldValue)}</div>`;
    }
    
    return cell;
  }

  private createDiffTable(diffData: any): HTMLElement {
    const table = document.createElement('table');
    table.className = 'diff-table';
    
    // 这里实现传统的表格渲染逻辑
    // 为了简化，这里只返回一个基本的表格结构
    table.innerHTML = `
      <thead>
        <tr>
          <th class="row-number">行</th>
          <th>列A</th>
          <th>列B</th>
        </tr>
      </thead>
      <tbody>
        <tr>
          <td class="row-number">1</td>
          <td class="cell-unchanged">示例数据</td>
          <td class="cell-modified">修改的数据</td>
        </tr>
      </tbody>
    `;
    
    return table;
  }

  private formatValue(value: any): string {
    if (value === null || value === undefined) {
      return '';
    }
    return String(value);
  }

  private showLoadingProgress(loaded: number, total: number): void {
    // 实现加载进度显示
    const progress = Math.round((loaded / total) * 100);
    console.log(`Loading progress: ${progress}% (${loaded}/${total})`);
  }

  private hideLoadingProgress(): void {
    // 隐藏加载进度
    console.log('Loading completed');
  }

  public scrollToRow(index: number): void {
    if (this.options.enableVirtualScroll) {
      this.virtualScroll.scrollToIndex(index);
    } else {
      // 传统滚动实现
      const row = this.container?.querySelector(`tr:nth-child(${index + 1})`);
      if (row) {
        row.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
    }
  }

  public destroy(): void {
    this.virtualScroll.destroy();
    this.streamLoader.stop();
    this.container = null;
  }
}
