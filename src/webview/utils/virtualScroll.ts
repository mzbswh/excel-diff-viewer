export interface VirtualScrollConfig {
  itemHeight: number;
  containerHeight: number;
  overscan: number;
  threshold: number;
}

export interface VirtualScrollState {
  scrollTop: number;
  startIndex: number;
  endIndex: number;
  visibleItems: number;
  totalHeight: number;
}

export class VirtualScroll {
  private config: VirtualScrollConfig;
  private state: VirtualScrollState;
  private container: HTMLElement | null = null;
  private items: any[] = [];
  private renderCallback: ((items: any[], startIndex: number, endIndex: number) => void) | null = null;
  private scrollHandler: (() => void) | null = null;

  constructor(config: Partial<VirtualScrollConfig> = {}) {
    this.config = {
      itemHeight: 30,
      containerHeight: 400,
      overscan: 5,
      threshold: 100,
      ...config
    };

    this.state = {
      scrollTop: 0,
      startIndex: 0,
      endIndex: 0,
      visibleItems: 0,
      totalHeight: 0
    };
  }

  public initialize(container: HTMLElement, items: any[], renderCallback: (items: any[], startIndex: number, endIndex: number) => void): void {
    this.container = container;
    this.items = items;
    this.renderCallback = renderCallback;
    
    this.setupScrollListener();
    this.updateState();
    this.render();
  }

  public updateItems(items: any[]): void {
    this.items = items;
    this.updateState();
    this.render();
  }

  public updateConfig(config: Partial<VirtualScrollConfig>): void {
    this.config = { ...this.config, ...config };
    this.updateState();
    this.render();
  }

  public scrollToIndex(index: number): void {
    if (!this.container) {
      return;
    }

    const scrollTop = index * this.config.itemHeight;
    this.container.scrollTop = scrollTop;
  }

  public scrollToTop(): void {
    if (this.container) {
      this.container.scrollTop = 0;
    }
  }

  public scrollToBottom(): void {
    if (this.container) {
      this.container.scrollTop = this.state.totalHeight;
    }
  }

  private setupScrollListener(): void {
    if (!this.container) {
      return;
    }

    this.scrollHandler = () => {
      this.state.scrollTop = this.container!.scrollTop;
      this.updateState();
      this.render();
    };

    this.container.addEventListener('scroll', this.scrollHandler, { passive: true });
  }

  private updateState(): void {
    if (!this.container || this.items.length === 0) {
      return;
    }

    const { itemHeight, containerHeight, overscan } = this.config;
    const { scrollTop } = this.state;

    // 计算可见区域
    const visibleItems = Math.ceil(containerHeight / itemHeight);
    const startIndex = Math.max(0, Math.floor(scrollTop / itemHeight) - overscan);
    const endIndex = Math.min(this.items.length - 1, startIndex + visibleItems + overscan * 2);

    // 计算总高度
    const totalHeight = this.items.length * itemHeight;

    this.state = {
      ...this.state,
      startIndex,
      endIndex,
      visibleItems,
      totalHeight
    };
  }

  private render(): void {
    if (!this.renderCallback || this.items.length === 0) {
      return;
    }

    const { startIndex, endIndex } = this.state;
    const visibleItems = this.items.slice(startIndex, endIndex + 1);
    
    this.renderCallback(visibleItems, startIndex, endIndex);
  }

  public getState(): VirtualScrollState {
    return { ...this.state };
  }

  public getVisibleRange(): { startIndex: number; endIndex: number } {
    return {
      startIndex: this.state.startIndex,
      endIndex: this.state.endIndex
    };
  }

  public isItemVisible(index: number): boolean {
    return index >= this.state.startIndex && index <= this.state.endIndex;
  }

  public getItemOffset(index: number): number {
    return index * this.config.itemHeight;
  }

  public destroy(): void {
    if (this.container && this.scrollHandler) {
      this.container.removeEventListener('scroll', this.scrollHandler);
    }
    this.container = null;
    this.items = [];
    this.renderCallback = null;
    this.scrollHandler = null;
  }
}

// 流式加载工具
export class StreamLoader {
  private batchSize: number;
  private delay: number;
  private loadedItems: any[] = [];
  private isLoading: boolean = false;
  private onProgress: ((loaded: number, total: number) => void) | null = null;
  private onComplete: ((items: any[]) => void) | null = null;

  constructor(batchSize: number = 100, delay: number = 16) {
    this.batchSize = batchSize;
    this.delay = delay;
  }

  public async loadItems(
    items: any[],
    onProgress?: (loaded: number, total: number) => void,
    onComplete?: (items: any[]) => void
  ): Promise<void> {
    this.onProgress = onProgress || null;
    this.onComplete = onComplete || null;
    this.loadedItems = [];
    this.isLoading = true;

    const total = items.length;
    let loaded = 0;

    for (let i = 0; i < total; i += this.batchSize) {
      if (!this.isLoading) {
        break;
      }

      const batch = items.slice(i, i + this.batchSize);
      this.loadedItems.push(...batch);
      loaded = this.loadedItems.length;

      if (this.onProgress) {
        this.onProgress(loaded, total);
      }

      // 使用 requestIdleCallback 或 setTimeout 来避免阻塞主线程
      if (window.requestIdleCallback) {
        await new Promise(resolve => {
          window.requestIdleCallback(() => {
            setTimeout(resolve, this.delay);
          });
        });
      } else {
        await new Promise(resolve => setTimeout(resolve, this.delay));
      }
    }

    this.isLoading = false;
    if (this.onComplete) {
      this.onComplete(this.loadedItems);
    }
  }

  public stop(): void {
    this.isLoading = false;
  }

  public getLoadedItems(): any[] {
    return [...this.loadedItems];
  }

  public isCurrentlyLoading(): boolean {
    return this.isLoading;
  }
}
