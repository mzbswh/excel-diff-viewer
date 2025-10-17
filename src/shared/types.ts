// 共享类型定义

export interface AppConfig {
  theme: 'auto' | 'light' | 'dark';
  diffMode: 'unified' | 'split' | 'side-by-side';
  highlightMode: 'enhanced' | 'minimal' | 'colorful';
  fontSize: 'small' | 'medium' | 'large';
}

export interface ViewSettings {
  showLineNumbers: boolean;
  showWhitespace: boolean;
  wrapLines: boolean;
  tabSize: number;
}

export interface DiffNavigation {
  currentIndex: number;
  totalCount: number;
  canNavigatePrevious: boolean;
  canNavigateNext: boolean;
}

export interface FileInfo {
  name: string;
  path: string;
  size: number;
  lastModified: Date;
}

export interface DiffSummary {
  totalAddedCells: number;
  totalRemovedCells: number;
  totalModifiedCells: number;
  totalUnchangedCells: number;
  totalSheets: number;
  changedSheets: number;
}

export interface VirtualScrollConfig {
  itemHeight: number;
  containerHeight: number;
  overscan: number;
  threshold: number;
}

export interface RenderConfig {
  maxRowsPerPage: number;
  enableVirtualScroll: boolean;
  enableLazyLoading: boolean;
  animationDuration: number;
}
