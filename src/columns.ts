import * as XLSX from 'xlsx';
import type { RowAlignment } from './rows';

export interface ColumnView {
  index: number;
  label: string;
  leftIndex?: number;
  rightIndex?: number;
  leftLabel?: string;
  rightLabel?: string;
  status: 'unchanged' | 'changed' | 'added' | 'removed';
}

// Alignment is deliberately conservative: only a complete, unique text header
// shared by both sheets can establish column identity. Other layouts use addresses.
export function alignColumns(
  left: XLSX.WorkSheet | undefined,
  right: XLSX.WorkSheet | undefined,
  fingerprint: (cell: XLSX.CellObject) => string,
  alignedRows?: RowAlignment[]
): ColumnView[] {
  const range = (sheet: XLSX.WorkSheet | undefined) => {
    try {
      return sheet?.['!ref'] ? XLSX.utils.decode_range(sheet['!ref']) : undefined;
    } catch {
      return undefined;
    }
  };
  const l = range(left);
  const r = range(right);
  if (!l && !r) { return []; }
  const columns: ColumnView[] = [];
  const append = (leftIndex?: number, rightIndex?: number, renamed = false) => {
    const leftLabel = leftIndex === undefined ? undefined : XLSX.utils.encode_col(leftIndex);
    const rightLabel = rightIndex === undefined ? undefined : XLSX.utils.encode_col(rightIndex);
    columns.push({
      index: columns.length,
      label: leftLabel === rightLabel ? leftLabel! : `${leftLabel ?? '∅'} → ${rightLabel ?? '∅'}`,
      leftIndex, rightIndex, leftLabel, rightLabel,
      status: leftIndex === undefined ? 'added' : rightIndex === undefined ? 'removed' : renamed ? 'changed' : 'unchanged'
    });
  };
  const positional = () => {
    for (let c = Math.min(l?.s.c ?? r!.s.c, r?.s.c ?? l!.s.c);
      c <= Math.max(l?.e.c ?? -1, r?.e.c ?? -1); c += 1) {
      append(left ? c : undefined, right ? c : undefined);
    }
    return columns;
  };
  if (!l || !r || !left || !right || l.s.r !== r.s.r) { return positional(); }
  const headerRow = l.s.r;
  const readHeader = (sheet: XLSX.WorkSheet, bounds: XLSX.Range): string[] | undefined => {
    if (sheet['!merges']?.some((merge) => merge.s.r <= headerRow && merge.e.r >= headerRow)) {
      return undefined;
    }
    const names: string[] = [];
    for (let c = bounds.s.c; c <= bounds.e.c; c += 1) {
      const cell = sheet[XLSX.utils.encode_cell({ r: headerRow, c })] as XLSX.CellObject | undefined;
      if (!cell || typeof cell.v !== 'string' || !cell.v.trim() || cell.f) { return undefined; }
      names.push(fingerprint(cell));
    }
    return new Set(names).size === names.length ? names : undefined;
  };
  const before = readHeader(left, l);
  const after = readHeader(right, r);
  if (!before || !after) { return positional(); }
  const afterPositions = new Map(after.map((name, i) => [name, i + r.s.c]));
  const anchors = before.flatMap((name, i) => {
    const c = afterPositions.get(name);
    return c === undefined ? [] : [{ left: i + l.s.c, right: c }];
  });
  // Reordered or weakly related headers are not treated as insertion evidence.
  if (anchors.length < 2 || anchors.length / Math.min(before.length, after.length) < 0.5 ||
    anchors.some((anchor, i) => i > 0 && anchor.right <= anchors[i - 1]!.right)) {
    return positional();
  }

  let samples: RowAlignment[] | undefined;
  const similarity = (lc: number, rc: number) => {
    if (!samples) {
      let candidates = alignedRows?.filter((row) => row.leftIndex !== undefined && row.rightIndex !== undefined &&
        row.leftIndex > headerRow && row.rightIndex > headerRow);
      if (!candidates) {
        const rows = new Set<number>();
        for (const sheet of [left, right]) {
          for (const address of Object.keys(sheet)) {
            if (/^[A-Z]+\d+$/.test(address)) {
              const row = XLSX.utils.decode_cell(address).r;
              if (row > headerRow) { rows.add(row); }
            }
          }
        }
        candidates = [...rows].sort((a, b) => a - b).map((row) => ({ leftIndex: row, rightIndex: row }));
      }
      samples = candidates.length <= 32 ? candidates :
        Array.from({ length: 32 }, (_, i) => candidates![Math.floor(i * (candidates!.length - 1) / 31)]!);
    }
    let matches = 0;
    let count = 0;
    for (const row of samples) {
      const a = left[XLSX.utils.encode_cell({ r: row.leftIndex!, c: lc })] as XLSX.CellObject | undefined;
      const b = right[XLSX.utils.encode_cell({ r: row.rightIndex!, c: rc })] as XLSX.CellObject | undefined;
      const aEmpty = !a || (a.v === undefined && !a.f);
      const bEmpty = !b || (b.v === undefined && !b.f);
      if (aEmpty && bEmpty) { continue; }
      count += 1;
      if (!aEmpty && !bEmpty && fingerprint(a!) === fingerprint(b!)) { matches += 1; }
    }
    return matches >= 2 ? matches / count : 0;
  };
  const appendGap = (ls: number, le: number, rs: number, re: number) => {
    // A renamed column needs a strong, unambiguous content match within the
    // surrounding named anchors. Cap work for very wide unmatched regions.
    const candidates: Array<{ left: number; right: number; score: number }> = [];
    if ((le - ls) * (re - rs) <= 4096) {
      for (let lc = ls; lc < le; lc += 1) {
        for (let rc = rs; rc < re; rc += 1) {
          const score = similarity(lc, rc);
          if (score >= 0.7) { candidates.push({ left: lc, right: rc, score }); }
        }
      }
    }
    const matches = candidates.filter((candidate) => !candidates.some((other) =>
      other !== candidate && (other.left === candidate.left || other.right === candidate.right) &&
      other.score >= candidate.score - 0.15
    )).sort((a, b) => a.left - b.left);
    const ordered = matches.every((match, i) => i === 0 || match.right > matches[i - 1]!.right);
    let lc = ls;
    let rc = rs;
    for (const match of ordered ? matches : []) {
      while (lc < match.left) { append(lc++, undefined); }
      while (rc < match.right) { append(undefined, rc++); }
      append(lc++, rc++, true);
    }
    while (lc < le) { append(lc++, undefined); }
    while (rc < re) { append(undefined, rc++); }
  };
  let lc = l.s.c;
  let rc = r.s.c;
  for (const anchor of anchors) {
    appendGap(lc, anchor.left, rc, anchor.right);
    append(anchor.left, anchor.right);
    lc = anchor.left + 1;
    rc = anchor.right + 1;
  }
  appendGap(lc, l.e.c + 1, rc, r.e.c + 1);
  return columns;
}
