import * as path from 'node:path';
import * as vscode from 'vscode';
import * as XLSX from 'xlsx';

export type DiffStatus = 'unchanged' | 'changed' | 'added' | 'removed';
export type RowFilter = 'all' | 'changed' | 'added' | 'removed';

export interface FileDescriptor {
  name: string;
  detail: string;
  uri: string;
}

export interface CellView {
  display: string;
  formula?: string;
  type?: string;
}

export interface ChangeCounts {
  changed: number;
  added: number;
  removed: number;
}

export interface SheetSummary {
  name: string;
  status: DiffStatus;
  rowChanges: ChangeCounts;
  cellChanges: ChangeCounts;
  rows: number;
  columns: number;
}

export interface WorkbookSummary {
  left: FileDescriptor;
  right: FileDescriptor;
  sheets: SheetSummary[];
  totals: {
    rows: ChangeCounts;
    cells: ChangeCounts;
    sheets: number;
  };
}

export interface RowView {
  index: number;
  status: DiffStatus;
  left: Array<CellView | null>;
  right: Array<CellView | null>;
  cells: DiffStatus[];
}

export interface SheetPage {
  sheet: string;
  columns: Array<{ index: number; label: string }>;
  rows: RowView[];
  page: number;
  pageSize: number;
  totalRows: number;
  totalPages: number;
  filter: RowFilter;
  query: string;
}

export interface ChangeNavigationTarget {
  row: number;
  column: number;
  page: number;
}

interface ChangeLocation {
  row: number;
  column: number;
  status: Exclude<DiffStatus, 'unchanged'>;
}

interface Bounds {
  startRow: number;
  endRow: number;
  startColumn: number;
  endColumn: number;
}

interface SheetModel {
  name: string;
  left?: XLSX.WorkSheet;
  right?: XLSX.WorkSheet;
  bounds?: Bounds;
  summary: SheetSummary;
  rowStatuses: Map<number, DiffStatus>;
  occupiedRows: number[];
  changedCells: ChangeLocation[];
}

export class WorkbookComparison {
  readonly summary: WorkbookSummary;

  private constructor(
    private readonly sheets: Map<string, SheetModel>,
    summary: WorkbookSummary,
    private readonly ignoreWhitespace: boolean
  ) {
    this.summary = summary;
  }

  static async create(
    leftUri: vscode.Uri,
    rightUri: vscode.Uri,
    ignoreWhitespace: boolean
  ): Promise<WorkbookComparison> {
    const [leftBytes, rightBytes] = await Promise.all([
      vscode.workspace.fs.readFile(leftUri),
      vscode.workspace.fs.readFile(rightUri)
    ]);

    let leftBook: XLSX.WorkBook;
    let rightBook: XLSX.WorkBook;
    try {
      leftBook = XLSX.read(leftBytes, {
        type: 'array',
        cellDates: true,
        cellFormula: true,
        cellNF: true
      });
      rightBook = XLSX.read(rightBytes, {
        type: 'array',
        cellDates: true,
        cellFormula: true,
        cellNF: true
      });
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      throw new Error(`Unable to parse one of the Excel files. ${detail}`);
    }

    const sheetNames = [...leftBook.SheetNames];
    for (const name of rightBook.SheetNames) {
      if (!sheetNames.includes(name)) {
        sheetNames.push(name);
      }
    }

    const sheets = new Map<string, SheetModel>();
    const sheetSummaries: SheetSummary[] = [];
    const totals = {
      rows: { changed: 0, added: 0, removed: 0 },
      cells: { changed: 0, added: 0, removed: 0 },
      sheets: 0
    };

    for (const name of sheetNames) {
      const left = leftBook.Sheets[name];
      const right = rightBook.Sheets[name];
      const model = buildSheetModel(name, left, right, ignoreWhitespace);
      sheets.set(name, model);
      sheetSummaries.push(model.summary);
      totals.rows.changed += model.summary.rowChanges.changed;
      totals.rows.added += model.summary.rowChanges.added;
      totals.rows.removed += model.summary.rowChanges.removed;
      totals.cells.changed += model.summary.cellChanges.changed;
      totals.cells.added += model.summary.cellChanges.added;
      totals.cells.removed += model.summary.cellChanges.removed;
      if (model.summary.status !== 'unchanged') {
        totals.sheets += 1;
      }
    }

    return new WorkbookComparison(
      sheets,
      {
        left: describeUri(leftUri),
        right: describeUri(rightUri),
        sheets: sheetSummaries,
        totals
      },
      ignoreWhitespace
    );
  }

  getPage(
    sheetName: string,
    page: number,
    pageSize: number,
    filter: RowFilter,
    query: string
  ): SheetPage {
    const sheet = this.sheets.get(sheetName);
    if (!sheet) {
      throw new Error(`Worksheet not found: ${sheetName}`);
    }

    const normalizedQuery = query.trim().toLocaleLowerCase();
    const rowIndexes = selectRows(sheet, filter, normalizedQuery);
    const totalRows = rowIndexes === undefined
      ? Math.max(0, (sheet.bounds?.endRow ?? -1) - (sheet.bounds?.startRow ?? 0) + 1)
      : rowIndexes.length;
    const totalPages = Math.max(1, Math.ceil(totalRows / pageSize));
    const safePage = Math.max(0, Math.min(Math.trunc(page), totalPages - 1));
    const offset = safePage * pageSize;
    const count = Math.min(pageSize, Math.max(0, totalRows - offset));
    const visibleRows: number[] = [];

    if (rowIndexes === undefined) {
      const start = (sheet.bounds?.startRow ?? 0) + offset;
      for (let index = 0; index < count; index += 1) {
        visibleRows.push(start + index);
      }
    } else {
      visibleRows.push(...rowIndexes.slice(offset, offset + count));
    }

    const columns: Array<{ index: number; label: string }> = [];
    if (sheet.bounds) {
      for (let column = sheet.bounds.startColumn; column <= sheet.bounds.endColumn; column += 1) {
        columns.push({ index: column, label: XLSX.utils.encode_col(column) });
      }
    }

    const rows = visibleRows.map((rowIndex) => {
      const left: Array<CellView | null> = [];
      const right: Array<CellView | null> = [];
      const cells: DiffStatus[] = [];
      for (const column of columns) {
        const address = XLSX.utils.encode_cell({ r: rowIndex, c: column.index });
        const leftCell = sheet.left?.[address] as XLSX.CellObject | undefined;
        const rightCell = sheet.right?.[address] as XLSX.CellObject | undefined;
        left.push(toCellView(leftCell));
        right.push(toCellView(rightCell));
        cells.push(compareCells(leftCell, rightCell, this.ignoreWhitespace));
      }
      return {
        index: rowIndex,
        status: sheet.rowStatuses.get(rowIndex) ?? 'unchanged',
        left,
        right,
        cells
      } satisfies RowView;
    });

    return {
      sheet: sheetName,
      columns,
      rows,
      page: safePage,
      pageSize,
      totalRows,
      totalPages,
      filter,
      query
    };
  }

  getNavigationTarget(
    sheetName: string,
    currentRow: number | undefined,
    currentColumn: number | undefined,
    direction: 'previous' | 'next',
    unit: 'row' | 'cell',
    pageSize: number,
    filter: RowFilter,
    query: string
  ): ChangeNavigationTarget | undefined {
    const sheet = this.sheets.get(sheetName);
    if (!sheet) {
      return undefined;
    }
    const normalizedQuery = query.trim().toLocaleLowerCase();
    const selectedRows = selectRows(sheet, filter, normalizedQuery);
    const visibleRows = selectedRows === undefined ? undefined : new Set(selectedRows);
    const candidates = sheet.changedCells.filter((location) => {
      const matchesFilter = filter === 'all' || filter === 'changed' || location.status === filter;
      const rowIsVisible = visibleRows === undefined || visibleRows.has(location.row);
      return matchesFilter && rowIsVisible;
    });
    if (candidates.length === 0) {
      return undefined;
    }
    const navigationCandidates = unit === 'row'
      ? candidates.filter((location, index) => index === 0 || candidates[index - 1]?.row !== location.row)
      : candidates;

    let targetIndex: number;
    const hasCurrent = currentRow !== undefined && (unit === 'row' || currentColumn !== undefined);
    const exactIndex = !hasCurrent
      ? -1
      : navigationCandidates.findIndex(
          (location) => location.row === currentRow && (unit === 'row' || location.column === currentColumn)
        );
    if (exactIndex >= 0) {
      targetIndex = direction === 'next'
        ? (exactIndex + 1) % navigationCandidates.length
        : (exactIndex - 1 + navigationCandidates.length) % navigationCandidates.length;
    } else if (hasCurrent) {
      if (direction === 'next') {
        const nextIndex = navigationCandidates.findIndex(
          (location) => location.row > currentRow || (
            unit === 'cell' && location.row === currentRow && location.column > (currentColumn ?? -1)
          )
        );
        targetIndex = nextIndex >= 0 ? nextIndex : 0;
      } else {
        let previousIndex = -1;
        for (let index = navigationCandidates.length - 1; index >= 0; index -= 1) {
          const location = navigationCandidates[index];
          if (location && (location.row < currentRow || (
            unit === 'cell' && location.row === currentRow && location.column < (currentColumn ?? Number.MAX_SAFE_INTEGER)
          ))) {
            previousIndex = index;
            break;
          }
        }
        targetIndex = previousIndex >= 0 ? previousIndex : navigationCandidates.length - 1;
      }
    } else {
      targetIndex = direction === 'next' ? 0 : navigationCandidates.length - 1;
    }

    const target = navigationCandidates[targetIndex];
    if (!target) {
      return undefined;
    }
    const rowPosition = selectedRows === undefined
      ? target.row - (sheet.bounds?.startRow ?? 0)
      : selectedRows.indexOf(target.row);
    return {
      row: target.row,
      column: target.column,
      page: Math.max(0, Math.floor(Math.max(0, rowPosition) / pageSize))
    };
  }
}

function buildSheetModel(
  name: string,
  left: XLSX.WorkSheet | undefined,
  right: XLSX.WorkSheet | undefined,
  ignoreWhitespace: boolean
): SheetModel {
  const bounds = unionBounds(readBounds(left), readBounds(right));
  const addresses = new Set<string>([...cellAddresses(left), ...cellAddresses(right)]);
  const rowStatuses = new Map<number, DiffStatus>();
  const changedCells: ChangeLocation[] = [];
  const occupiedRows = new Set<number>();
  let changed = 0;
  let added = 0;
  let removed = 0;

  for (const address of addresses) {
    const decoded = tryDecodeCell(address);
    if (!decoded) {
      continue;
    }
    occupiedRows.add(decoded.r);
    const status = compareCells(
      left?.[address] as XLSX.CellObject | undefined,
      right?.[address] as XLSX.CellObject | undefined,
      ignoreWhitespace
    );
    if (status === 'unchanged') {
      continue;
    }
    changedCells.push({ row: decoded.r, column: decoded.c, status });
    if (status === 'changed') {
      changed += 1;
    } else if (status === 'added') {
      added += 1;
    } else {
      removed += 1;
    }
    rowStatuses.set(decoded.r, mergeRowStatus(rowStatuses.get(decoded.r), status));
  }

  let status: DiffStatus = 'unchanged';
  if (!left && right) {
    status = 'added';
  } else if (left && !right) {
    status = 'removed';
  } else if (changed + added + removed > 0) {
    status = 'changed';
  }

  const rowChanges: ChangeCounts = { changed: 0, added: 0, removed: 0 };
  for (const rowStatus of rowStatuses.values()) {
    if (rowStatus !== 'unchanged') {
      rowChanges[rowStatus] += 1;
    }
  }

  return {
    name,
    left,
    right,
    bounds,
    rowStatuses,
    occupiedRows: [...occupiedRows].sort((a, b) => a - b),
    changedCells: changedCells.sort((a, b) => a.row - b.row || a.column - b.column),
    summary: {
      name,
      status,
      rowChanges,
      cellChanges: { changed, added, removed },
      rows: bounds ? bounds.endRow - bounds.startRow + 1 : 0,
      columns: bounds ? bounds.endColumn - bounds.startColumn + 1 : 0
    }
  };
}

function selectRows(
  sheet: SheetModel,
  filter: RowFilter,
  normalizedQuery: string
): number[] | undefined {
  if (filter === 'all' && normalizedQuery.length === 0) {
    return undefined;
  }

  let candidates: number[];
  if (filter === 'all') {
    candidates = sheet.occupiedRows;
  } else {
    candidates = [...sheet.rowStatuses.entries()]
      .filter(([, status]) => filter === 'changed' ? status !== 'unchanged' : status === filter)
      .map(([row]) => row)
      .sort((a, b) => a - b);
  }

  if (normalizedQuery.length === 0) {
    return candidates;
  }

  return candidates.filter((row) => rowMatches(sheet, row, normalizedQuery));
}

function rowMatches(sheet: SheetModel, row: number, query: string): boolean {
  if (!sheet.bounds) {
    return false;
  }
  for (let column = sheet.bounds.startColumn; column <= sheet.bounds.endColumn; column += 1) {
    const address = XLSX.utils.encode_cell({ r: row, c: column });
    const left = toCellView(sheet.left?.[address] as XLSX.CellObject | undefined);
    const right = toCellView(sheet.right?.[address] as XLSX.CellObject | undefined);
    if (
      left?.display.toLocaleLowerCase().includes(query) ||
      left?.formula?.toLocaleLowerCase().includes(query) ||
      right?.display.toLocaleLowerCase().includes(query) ||
      right?.formula?.toLocaleLowerCase().includes(query)
    ) {
      return true;
    }
  }
  return false;
}

function compareCells(
  left: XLSX.CellObject | undefined,
  right: XLSX.CellObject | undefined,
  ignoreWhitespace: boolean
): DiffStatus {
  const leftEmpty = isEmpty(left);
  const rightEmpty = isEmpty(right);
  if (leftEmpty && rightEmpty) {
    return 'unchanged';
  }
  if (leftEmpty) {
    return 'added';
  }
  if (rightEmpty) {
    return 'removed';
  }
  if (left === undefined || right === undefined) {
    return 'changed';
  }
  return fingerprint(left, ignoreWhitespace) === fingerprint(right, ignoreWhitespace)
    ? 'unchanged'
    : 'changed';
}

function isEmpty(cell: XLSX.CellObject | undefined): boolean {
  return cell === undefined || (cell.v === undefined && !cell.f);
}

function fingerprint(cell: XLSX.CellObject, ignoreWhitespace: boolean): string {
  let value = rawValue(cell.v);
  if (ignoreWhitespace && typeof cell.v === 'string') {
    value = cell.v.trim().replace(/\s+/g, ' ');
  }
  return `${cell.t ?? ''}\u0000${cell.f ?? ''}\u0000${value}`;
}

function rawValue(value: unknown): string {
  if (value instanceof Date) {
    return value.toISOString();
  }
  if (typeof value === 'number' && Object.is(value, -0)) {
    return '-0';
  }
  if (value === undefined) {
    return '';
  }
  if (typeof value === 'object' && value !== null) {
    try {
      return JSON.stringify(value);
    } catch {
      return String(value);
    }
  }
  return String(value);
}

function toCellView(cell: XLSX.CellObject | undefined): CellView | null {
  if (cell === undefined || isEmpty(cell)) {
    return null;
  }
  let display: string;
  try {
    display = XLSX.utils.format_cell(cell);
  } catch {
    display = rawValue(cell.v);
  }
  return {
    display,
    ...(cell.f ? { formula: `=${cell.f}` } : {}),
    ...(cell.t ? { type: cell.t } : {})
  };
}

function mergeRowStatus(current: DiffStatus | undefined, next: DiffStatus): DiffStatus {
  if (!current) {
    return next;
  }
  return current === next ? current : 'changed';
}

function readBounds(sheet: XLSX.WorkSheet | undefined): Bounds | undefined {
  const reference = sheet?.['!ref'];
  if (!reference) {
    return undefined;
  }
  try {
    const range = XLSX.utils.decode_range(reference);
    return {
      startRow: range.s.r,
      endRow: range.e.r,
      startColumn: range.s.c,
      endColumn: range.e.c
    };
  } catch {
    return undefined;
  }
}

function unionBounds(left: Bounds | undefined, right: Bounds | undefined): Bounds | undefined {
  if (!left) {
    return right;
  }
  if (!right) {
    return left;
  }
  return {
    startRow: Math.min(left.startRow, right.startRow),
    endRow: Math.max(left.endRow, right.endRow),
    startColumn: Math.min(left.startColumn, right.startColumn),
    endColumn: Math.max(left.endColumn, right.endColumn)
  };
}

function cellAddresses(sheet: XLSX.WorkSheet | undefined): string[] {
  if (!sheet) {
    return [];
  }
  return Object.keys(sheet).filter((key) => key.charCodeAt(0) !== 33 && /^[A-Z]+\d+$/.test(key));
}

function tryDecodeCell(address: string): XLSX.CellAddress | undefined {
  try {
    return XLSX.utils.decode_cell(address);
  } catch {
    return undefined;
  }
}

function describeUri(uri: vscode.Uri): FileDescriptor {
  const decodedPath = decodeURIComponent(uri.path);
  const name = path.posix.basename(decodedPath) || 'Excel workbook';
  let revision = '';
  if (uri.query) {
    try {
      const query = JSON.parse(uri.query) as Record<string, unknown>;
      const candidate = query.ref ?? query.sha ?? query.revision;
      if (typeof candidate === 'string' && candidate.length > 0) {
        revision = candidate.length > 12 ? candidate.slice(0, 12) : candidate;
      }
    } catch {
      const match = uri.query.match(/[a-f\d]{7,40}/i);
      revision = match?.[0]?.slice(0, 12) ?? '';
    }
  }
  const detail = revision
    ? `${uri.scheme} · ${revision}`
    : uri.scheme === 'file'
      ? vscode.workspace.asRelativePath(uri, false)
      : uri.scheme;
  return { name, detail, uri: uri.toString() };
}
