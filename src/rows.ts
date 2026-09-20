import * as XLSX from 'xlsx';
import type { ColumnView } from './columns';

export interface RowAlignment {
  leftIndex?: number;
  rightIndex?: number;
}

// Patience anchors keep large sheets linear in space. Small unmatched gaps use
// LCS to handle repeated rows; replacements between anchors stay paired.
export function alignRows(
  left: XLSX.WorkSheet | undefined,
  right: XLSX.WorkSheet | undefined,
  columns: ColumnView[],
  fingerprint: (cell: XLSX.CellObject) => string
): RowAlignment[] {
  const describe = (sheet: XLSX.WorkSheet | undefined, side: 'leftIndex' | 'rightIndex') => {
    let range: XLSX.Range | undefined;
    try { range = sheet?.['!ref'] ? XLSX.utils.decode_range(sheet['!ref']) : undefined; } catch { /* Empty sheet. */ }
    const values = new Map<number, Array<[number, string]>>();
    const mapping = new Map(columns.flatMap((column) => column.leftIndex !== undefined && column.rightIndex !== undefined
      ? [[column[side]!, column.index] as const] : []));
    for (const address of Object.keys(sheet ?? {})) {
      if (!/^[A-Z]+\d+$/.test(address)) { continue; }
      const cell = sheet![address] as XLSX.CellObject;
      if (cell.v === undefined && !cell.f) { continue; }
      const decoded = XLSX.utils.decode_cell(address);
      const column = mapping.get(decoded.c);
      if (column === undefined) { continue; }
      let row = values.get(decoded.r);
      if (!row) { row = []; values.set(decoded.r, row); }
      row.push([column, fingerprint(cell)]);
    }
    const start = range?.s.r ?? 0;
    const length = range ? range.e.r - start + 1 : 0;
    const tokens = Array.from({ length }, (_, i) => {
      const row = values.get(start + i);
      return JSON.stringify(row?.sort((a, b) => a[0] - b[0]) ?? []);
    });
    return { start, tokens, values };
  };
  const before = describe(left, 'leftIndex');
  const after = describe(right, 'rightIndex');

  // Explicit ID/key fields can retain row identity even when other cells change.
  // Duplicate keys are never used as identities; those rows retain content tokens.
  for (const column of columns) {
    if (!left || !right || column.leftIndex === undefined || column.rightIndex === undefined) { continue; }
    const header = (sheet: XLSX.WorkSheet, row: number, col: number) =>
      String((sheet[XLSX.utils.encode_cell({ r: row, c: col })] as XLSX.CellObject | undefined)?.v ?? '').trim().toLowerCase();
    const name = header(left, before.start, column.leftIndex);
    if (!/^(id|key)$/.test(name) || name !== header(right, after.start, column.rightIndex)) { continue; }
    const keys = (sheet: XLSX.WorkSheet, start: number, length: number, col: number) => {
      const result = new Map<string, number>();
      for (let i = 1; i < length; i += 1) {
        const cell = sheet[XLSX.utils.encode_cell({ r: start + i, c: col })] as XLSX.CellObject | undefined;
        if (!cell || cell.v === undefined || cell.v === '' || cell.f) { continue; }
        const key = fingerprint(cell);
        result.set(key, result.has(key) ? -1 : i);
      }
      return result;
    };
    const a = keys(left, before.start, before.tokens.length, column.leftIndex);
    const b = keys(right, after.start, after.tokens.length, column.rightIndex);
    let matches = 0;
    for (const [key, i] of a) {
      const j = b.get(key);
      if (i < 0 || j === undefined || j < 0) { continue; }
      before.tokens[i] = after.tokens[j] = `key:${key}`;
      matches += 1;
    }
    if (matches > 0) { break; }
  }

  const result: RowAlignment[] = [];
  const append = (a?: number, b?: number) => result.push({
    leftIndex: a === undefined ? undefined : before.start + a,
    rightIndex: b === undefined ? undefined : after.start + b
  });
  const positional = (a: number, ae: number, b: number, be: number) => {
    while (a < ae && b < be) { append(a++, b++); }
    while (a < ae) { append(a++, undefined); }
    while (b < be) { append(undefined, b++); }
  };
  const fallback = (a: number, ae: number, b: number, be: number) => {
    const height = ae - a;
    const width = be - b;
    if (!height || !width || height === width || height * width > 20_000) {
      positional(a, ae, b, be);
      return;
    }
    // In an insertion gap, a modified row should match its similar counterpart,
    // rather than being paired with the newly inserted row just ahead of it.
    const similarity = (i: number, j: number) => {
      const av = before.values.get(before.start + a + i) ?? [];
      const bv = after.values.get(after.start + b + j) ?? [];
      let x = 0;
      let y = 0;
      let equal = 0;
      let count = 0;
      while (x < av.length || y < bv.length) {
        const ac = av[x];
        const bc = bv[y];
        count += 1;
        if (ac && bc && ac[0] === bc[0]) {
          if (ac[1] === bc[1]) { equal += 1; }
          x += 1; y += 1;
        } else if (ac && (!bc || ac[0] < bc[0])) { x += 1; }
        else { y += 1; }
      }
      return count ? equal / count : 0;
    };
    const stride = width + 1;
    const costs = new Float64Array((height + 1) * stride);
    const actions = new Uint8Array(height * width);
    for (let i = 0; i <= height; i += 1) { costs[i * stride + width] = height - i; }
    for (let j = 0; j <= width; j += 1) { costs[height * stride + j] = width - j; }
    for (let i = height - 1; i >= 0; i -= 1) {
      for (let j = width - 1; j >= 0; j -= 1) {
        const score = similarity(i, j);
        const pair = score >= 0.5 ? costs[(i + 1) * stride + j + 1]! + 1 - score / 2 : Infinity;
        const remove = costs[(i + 1) * stride + j]! + 1;
        const add = costs[i * stride + j + 1]! + 1;
        costs[i * stride + j] = Math.min(pair, remove, add);
        actions[i * width + j] = pair <= remove && pair <= add ? 0 : remove <= add ? 1 : 2;
      }
    }
    let i = 0;
    let j = 0;
    while (i < height && j < width) {
      const action = actions[i * width + j];
      if (action === 0) { append(a + i++, b + j++); }
      else if (action === 1) { append(a + i++, undefined); }
      else { append(undefined, b + j++); }
    }
    positional(a + i, ae, b + j, be);
  };
  const gap = (a: number, ae: number, b: number, be: number) => {
    // Trim exact runs before allocating a bounded matrix.
    while (a < ae && b < be && before.tokens[a] === after.tokens[b]) { append(a++, b++); }
    let suffix = 0;
    while (a < ae - suffix && b < be - suffix && before.tokens[ae - suffix - 1] === after.tokens[be - suffix - 1]) { suffix += 1; }
    const endA = ae - suffix;
    const endB = be - suffix;
    const height = endA - a;
    const width = endB - b;
    if (height && width && height * width <= 1_000_000) {
      const stride = width + 1;
      const lengths = new Uint32Array((height + 1) * stride);
      for (let i = height - 1; i >= 0; i -= 1) {
        for (let j = width - 1; j >= 0; j -= 1) {
          lengths[i * stride + j] = before.tokens[a + i] === after.tokens[b + j]
            ? lengths[(i + 1) * stride + j + 1]! + 1
            : Math.max(lengths[(i + 1) * stride + j]!, lengths[i * stride + j + 1]!);
        }
      }
      let i = 0;
      let j = 0;
      let previousA = a;
      let previousB = b;
      while (i < height && j < width) {
        if (before.tokens[a + i] === after.tokens[b + j]) {
          fallback(previousA, a + i, previousB, b + j);
          append(a + i, b + j);
          previousA = a + ++i;
          previousB = b + ++j;
        } else if (lengths[(i + 1) * stride + j]! >= lengths[i * stride + j + 1]!) { i += 1; }
        else { j += 1; }
      }
      fallback(previousA, endA, previousB, endB);
    } else { fallback(a, endA, b, endB); }
    for (let i = 0; i < suffix; i += 1) { append(endA + i, endB + i); }
  };

  const unique = (tokens: string[]) => {
    const indexes = new Map<string, number>();
    tokens.forEach((token, i) => indexes.set(token, indexes.has(token) ? -1 : i));
    return indexes;
  };
  const a = unique(before.tokens);
  const b = unique(after.tokens);
  const candidates: Array<{ left: number; right: number }> = [];
  for (const [token, i] of a) {
    const j = b.get(token);
    if (i >= 0 && j !== undefined && j >= 0) { candidates.push({ left: i, right: j }); }
  }
  candidates.sort((x, y) => x.left - y.left);
  const tails: number[] = [];
  const predecessors: number[] = [];
  candidates.forEach((candidate, i) => {
    let lo = 0;
    let hi = tails.length;
    while (lo < hi) {
      const mid = (lo + hi) >>> 1;
      if (candidates[tails[mid]!]!.right < candidate.right) { lo = mid + 1; } else { hi = mid; }
    }
    predecessors[i] = lo ? tails[lo - 1]! : -1;
    tails[lo] = i;
  });
  const anchors: typeof candidates = [];
  for (let i = tails.at(-1) ?? -1; i >= 0; i = predecessors[i]!) { anchors.push(candidates[i]!); }
  anchors.reverse();
  let ai = 0;
  let bi = 0;
  for (const anchor of anchors) {
    gap(ai, anchor.left, bi, anchor.right);
    append(anchor.left, anchor.right);
    ai = anchor.left + 1;
    bi = anchor.right + 1;
  }
  gap(ai, before.tokens.length, bi, after.tokens.length);
  return result;
}
