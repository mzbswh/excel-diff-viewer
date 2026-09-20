import * as path from 'node:path';
import * as vscode from 'vscode';
import * as XLSX from 'xlsx';
import { alignColumns, type ColumnView } from './columns';
import { alignRows, type RowAlignment } from './rows';

export type DiffStatus = 'unchanged' | 'changed' | 'added' | 'removed';
export type RowFilter = 'all' | 'changed' | 'modified' | 'added' | 'removed';

export interface FileDescriptor {
  name: string;
  detail: string;
  uri: string;
}

export interface CellView {
  display: string;
  raw?: string;
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
  columnChanges: ChangeCounts;
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
  leftIndex?: number;
  rightIndex?: number;
  status: DiffStatus;
  left: Array<CellView | null>;
  right: Array<CellView | null>;
  cells: DiffStatus[];
}

export interface SheetPage {
  sheet: string;
  columns: ColumnView[];
  rows: RowView[];
  frozenRows: RowView[];
  contextRows: RowView[];
  filterCounts: Record<RowFilter, number>;
  totalColumns: number;
  sheetRows: number;
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

interface SheetModel {
  name: string;
  left?: XLSX.WorkSheet;
  right?: XLSX.WorkSheet;
  columns: ColumnView[];
  rows: RowAlignment[];
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
    query: string,
    options: { freezeRows?: number; freezeColumns?: number; focusChanges?: boolean; expandedRows?: number[]; expandedColumns?: number[] } = {}
  ): SheetPage {
    const sheet = this.sheets.get(sheetName);
    if (!sheet) {
      throw new Error(`Worksheet not found: ${sheetName}`);
    }

    const normalizedQuery = query.trim().toLocaleLowerCase();
    const rowIndexes = selectViewRows(sheet, filter, normalizedQuery, options.focusChanges === true);
    const totalRows = rowIndexes === undefined
      ? sheet.rows.length
      : rowIndexes.length;
    const totalPages = Math.max(1, Math.ceil(totalRows / pageSize));
    const safePage = Math.max(0, Math.min(Math.trunc(page), totalPages - 1));
    const offset = safePage * pageSize;
    const count = Math.min(pageSize, Math.max(0, totalRows - offset));
    const visibleRows: number[] = [];

    if (rowIndexes === undefined) {
      const start = offset;
      for (let index = 0; index < count; index += 1) {
        visibleRows.push(start + index);
      }
    } else {
      visibleRows.push(...rowIndexes.slice(offset, offset + count));
    }

    const filterCounts = Object.fromEntries(
      (['all', 'changed', 'modified', 'added', 'removed'] as const).map((candidate) =>
        [candidate, selectRows(sheet, candidate, normalizedQuery)?.length ?? sheet.rows.length])
    ) as Record<RowFilter, number>;
    const freezeRows = Math.min(sheet.rows.length, Math.max(0, Math.min(20, Math.trunc(options.freezeRows ?? 0))));
    const freezeColumns = Math.max(0, Math.min(20, Math.trunc(options.freezeColumns ?? 0)));
    let columns = sheet.columns;
    if (options.focusChanges && totalRows > 0) {
      const selected = rowIndexes === undefined ? undefined : new Set(rowIndexes);
      const matches = new Set(sheet.changedCells.filter((cell) => (!selected || selected.has(cell.row)) &&
        (filter === 'all' || filter === 'changed' || cell.status === (filter === 'modified' ? 'changed' : filter))).map((cell) => cell.column));
      for (const column of sheet.columns) {
        if ((column.status === 'added' || column.status === 'removed') && (filter === 'all' || filter === 'changed' ||
          column.status === (filter === 'modified' ? 'changed' : filter))) { matches.add(column.index); }
      }
      const includesStructuralRow = sheet.rows.some((row, index) =>
        (!selected || selected.has(index)) &&
        ((row.leftIndex === undefined && (filter === 'all' || filter === 'changed' || filter === 'added')) ||
         (row.rightIndex === undefined && (filter === 'all' || filter === 'changed' || filter === 'removed'))));
      const expanded = new Set(options.expandedColumns);
      if (!includesStructuralRow && matches.size) {
        columns = sheet.columns.filter((column, index) => index < freezeColumns || matches.has(column.index) ||
          expanded.has(column.index));
      }
    }

    const makeRow = (rowIndex: number): RowView => {
      const alignment = sheet.rows[rowIndex]!;
      const left: Array<CellView | null> = [];
      const right: Array<CellView | null> = [];
      const cells: DiffStatus[] = [];
      for (const column of columns) {
        const leftCell = readCell(sheet.left, alignment.leftIndex, column.leftIndex);
        const rightCell = readCell(sheet.right, alignment.rightIndex, column.rightIndex);
        left.push(toCellView(leftCell));
        right.push(toCellView(rightCell));
        cells.push(alignment.leftIndex === undefined ? 'added' : alignment.rightIndex === undefined ? 'removed'
          : compareCells(leftCell, rightCell, this.ignoreWhitespace));
      }
      return {
        index: rowIndex,
        ...alignment,
        status: sheet.rowStatuses.get(rowIndex) ?? 'unchanged',
        left,
        right,
        cells
      };
    };
    const context = new Set<number>();
    if ((filter !== 'all' || options.focusChanges) && totalRows > 0) {
      // Headers explain the values; surrounding records are only shown on request.
      const headerCount = detectHeaderRows(sheet);
      for (let row = 0; row < headerCount; row += 1) { context.add(row); }
      for (const row of options.expandedRows ?? []) {
        if (Number.isInteger(row) && row >= 0 && row < sheet.rows.length) { context.add(row); }
      }
    }
    const rows = visibleRows.map(makeRow);
    const frozenRows = Array.from({ length: freezeRows }, (_, row) => makeRow(row));

    return {
      sheet: sheetName,
      columns,
      rows,
      frozenRows,
      contextRows: [...context].sort((a, b) => a - b).map(makeRow),
      filterCounts,
      totalColumns: sheet.columns.length,
      sheetRows: sheet.rows.length,
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
    query: string,
    focusChanges = false
  ): ChangeNavigationTarget | undefined {
    const sheet = this.sheets.get(sheetName);
    if (!sheet) {
      return undefined;
    }
    const normalizedQuery = query.trim().toLocaleLowerCase();
    const selectedRows = selectViewRows(sheet, filter, normalizedQuery, focusChanges);
    const visibleRows = selectedRows === undefined ? undefined : new Set(selectedRows);
    const candidates = sheet.changedCells.filter((location) => {
      const matchesFilter = filter === 'all' || filter === 'changed' ||
        location.status === (filter === 'modified' ? 'changed' : filter);
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
      ? target.row
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
  const cellFingerprint = (cell: XLSX.CellObject) => fingerprint(cell, ignoreWhitespace);
  let columns = alignColumns(left, right, cellFingerprint);
  let rows = alignRows(left, right, columns, cellFingerprint);
  if (columns.some((column) => column.status === 'added') && columns.some((column) => column.status === 'removed')) {
    // Row insertions can obscure a column rename in the initial content sample.
    columns = alignColumns(left, right, cellFingerprint, rows);
    rows = alignRows(left, right, columns, cellFingerprint);
  }
  const addresses = new Set<string>();
  const leftRows = new Set<number>();
  const rightRows = new Set<number>();
  for (const [sheet, side, occupied] of [[left, 'leftIndex', leftRows], [right, 'rightIndex', rightRows]] as const) {
    const mapping = new Map(columns.flatMap((column) =>
      column[side] === undefined ? [] : [[column[side]!, column.index] as const]));
    const rowMapping = new Map(rows.flatMap((row, index) => row[side] === undefined ? [] : [[row[side]!, index] as const]));
    for (const address of cellAddresses(sheet)) {
      const decoded = tryDecodeCell(address);
      if (!decoded) { continue; }
      const row = rowMapping.get(decoded.r);
      if (row === undefined) { continue; }
      if (!isEmpty(sheet?.[address] as XLSX.CellObject | undefined)) { occupied.add(row); }
      const column = mapping.get(decoded.c);
      if (column !== undefined) { addresses.add(XLSX.utils.encode_cell({ r: row, c: column })); }
    }
  }
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
    const column = columns[decoded.c]!;
    const alignment = rows[decoded.r]!;
    const status = compareCells(
      readCell(left, alignment.leftIndex, column.leftIndex),
      readCell(right, alignment.rightIndex, column.rightIndex),
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
    rowStatuses.set(decoded.r, alignment.leftIndex === undefined ? 'added'
      : alignment.rightIndex === undefined ? 'removed' : 'changed');
  }

  rows.forEach((row, index) => {
    if (row.leftIndex !== undefined && row.rightIndex !== undefined) { return; }
    const status = row.leftIndex === undefined ? 'added' : 'removed';
    rowStatuses.set(index, status);
    occupiedRows.add(index);
    // Blank inserted/deleted rows still need a navigation target.
    if (!leftRows.has(index) && !rightRows.has(index) && columns.length) {
      changedCells.push({ row: index, column: 0, status });
    }
  });

  let status: DiffStatus = 'unchanged';
  if (!left && right) {
    status = 'added';
  } else if (left && !right) {
    status = 'removed';
  } else if (rowStatuses.size > 0) {
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
    columns,
    rows,
    rowStatuses,
    occupiedRows: [...occupiedRows].sort((a, b) => a - b),
    changedCells: changedCells.sort((a, b) => a.row - b.row || a.column - b.column),
    summary: {
      name,
      status,
      rowChanges,
      cellChanges: { changed, added, removed },
      rows: rows.length,
      columnChanges: {
        added: columns.filter((column) => column.status === 'added').length,
        removed: columns.filter((column) => column.status === 'removed').length,
        changed: columns.filter((column) => column.status === 'changed').length
      },
      columns: columns.length
    }
  };
}

function detectHeaderRows(sheet: SheetModel): number {
  if (!sheet.rows.length) { return 0; }
  // Game configuration sheets commonly use field names, descriptions, then types.
  // Require a mostly typed row near the top rather than treating all text as headers.
  for (let index = 1; index < Math.min(5, sheet.rows.length); index += 1) {
    const row = sheet.rows[index]!;
    const values = sheet.columns.map((column) => readCell(sheet.right, row.rightIndex, column.rightIndex)?.v ??
      readCell(sheet.left, row.leftIndex, column.leftIndex)?.v).filter((value) => value !== undefined && value !== '');
    const types = values.filter((value) => typeof value === 'string' &&
      /^(int(?:32|64)?|long|short|float|double|decimal|number|bool(?:ean)?|string|text|date(?:time)?|enum|json)(?:\[\])?$/i.test(value.trim()));
    if (values.length >= 2 && types.length / values.length >= 0.7) { return index + 1; }
  }
  return 1;
}

// Keep page selection and navigation on the same logical row set.
function selectViewRows(sheet: SheetModel, filter: RowFilter, query: string, focus: boolean): number[] | undefined {
  if (!focus) { return selectRows(sheet, filter, query); }
  const structuralColumns = sheet.columns.some((column) =>
    (column.status === 'added' || column.status === 'removed') &&
    (filter === 'all' || filter === 'changed' || filter === column.status));
  if (structuralColumns) {
    return sheet.rows.flatMap((_, index) => !query || rowMatches(sheet, index, query) ? [index] : []);
  }
  if (filter === 'all' && sheet.summary.status === 'unchanged') { return selectRows(sheet, filter, query); }
  return selectRows(sheet, filter === 'all' ? 'changed' : filter, query);
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
  } else if (filter === 'changed') {
    candidates = [...sheet.rowStatuses.keys()].sort((a, b) => a - b);
  } else {
    const cellStatus = filter === 'modified' ? 'changed' : filter;
    const matchingRows = new Set(sheet.changedCells
      .filter((cell) => cell.status === cellStatus)
      .map((cell) => cell.row));
    // Include structural rows even if they contain no populated cells.
    if (filter !== 'modified') {
      for (const [row, status] of sheet.rowStatuses) {
        if (status === filter) { matchingRows.add(row); }
      }
    }
    candidates = [...matchingRows].sort((a, b) => a - b);
  }

  if (normalizedQuery.length === 0) {
    return candidates;
  }

  return candidates.filter((row) => rowMatches(sheet, row, normalizedQuery));
}

function rowMatches(sheet: SheetModel, row: number, query: string): boolean {
  const alignment = sheet.rows[row];
  if (!alignment) { return false; }
  for (const column of sheet.columns) {
    const left = toCellView(readCell(sheet.left, alignment.leftIndex, column.leftIndex));
    const right = toCellView(readCell(sheet.right, alignment.rightIndex, column.rightIndex));
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
    ...(cell.v !== undefined && rawValue(cell.v) !== display ? { raw: rawValue(cell.v) } : {}),
    ...(cell.f ? { formula: `=${cell.f}` } : {}),
    ...(cell.t ? { type: cell.t } : {})
  };
}

function readCell(sheet: XLSX.WorkSheet | undefined, row: number | undefined, column: number | undefined): XLSX.CellObject | undefined {
  return row === undefined || column === undefined ? undefined : sheet?.[XLSX.utils.encode_cell({ r: row, c: column })] as XLSX.CellObject | undefined;
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
