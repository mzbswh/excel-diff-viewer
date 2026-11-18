/* Nearby row data, a bounded request queue, and measured row heights. */
class WorksheetRowStream {
  constructor(request) {
    this.request = request;
    this.reset();
  }

  reset() {
    this.metadata = null;
    this.batchSize = 100;
    this.batches = new Map();
    this.pending = new Set();
    this.needed = [];
    this.failed = new Set();
    this.defaultHeight = 31;
    this.trailingSpace = 0;
    this.heights = new Float32Array(0);
    this.heightTree = new Float64Array(0);
    this.version = 0;
  }

  clearData() {
    this.batches.clear();
    this.pending.clear();
    this.failed.clear();
    this.needed = [];
    this.version += 1;
  }

  receive(batch) {
    this.pending.delete(batch.offset);
    if (!this.metadata) {
      this.metadata = batch;
      this.heights = new Float32Array(batch.totalEntries);
      this.heightTree = new Float64Array(batch.totalEntries + 1);
    }
    if (!this.metadata.frozenRows.length && batch.frozenRows.length) { this.metadata.frozenRows = batch.frozenRows; }
    if (batch.entries.length || batch.frozenRows.length) {
      if (this.needed.includes(batch.offset)) { this.batches.set(batch.offset, batch.entries); }
    }
    this.version += 1;
    this.pump();
  }

  fail(offset) {
    this.pending.delete(offset);
    this.failed.add(offset);
    this.pump();
  }

  retry() {
    this.failed.clear();
    if (!this.metadata) { this.ensure(0, 1); }
    else { this.pump(); }
  }

  ensure(start, end) {
    if (!this.metadata) {
      if (!this.pending.has(0) && !this.failed.has(0)) {
        this.pending.add(0);
        this.request(0, 0);
      }
      return;
    }
    const total = this.metadata.totalEntries;
    const first = Math.floor(start / this.batchSize) * this.batchSize;
    const last = Math.floor(Math.max(start, end - 1) / this.batchSize) * this.batchSize;
    const needed = [];
    for (let offset = first; offset <= last && offset < total; offset += this.batchSize) { needed.push(offset); }
    if (last + this.batchSize < total) { needed.push(last + this.batchSize); }
    if (first > 0) { needed.push(first - this.batchSize); }
    if (!total && this.metadata.totalRows && !this.metadata.frozenRows.length) { needed.push(0); }
    this.needed = needed;
    for (const offset of this.batches.keys()) {
      if (!needed.includes(offset)) { this.batches.delete(offset); }
    }
    this.pump();
  }

  pump() {
    for (const offset of this.needed) {
      if (this.pending.size >= 2) { break; }
      if (!this.batches.has(offset) && !this.pending.has(offset) && !this.failed.has(offset)) {
        this.pending.add(offset);
        this.request(offset, this.batchSize);
      }
    }
  }

  entry(position) {
    const offset = Math.floor(position / this.batchSize) * this.batchSize;
    return this.batches.get(offset)?.[position - offset];
  }

  heightBefore(position) {
    let height = position * this.defaultHeight;
    for (let index = position; index > 0; index -= index & -index) { height += this.heightTree[index]; }
    return height;
  }

  measure(position, height) {
    const previous = this.heights[position] || this.defaultHeight;
    const delta = height - previous;
    if (Math.abs(delta) < 0.5) { return false; }
    this.heights[position] = height;
    for (let index = position + 1; index < this.heightTree.length; index += index & -index) { this.heightTree[index] += delta; }
    return true;
  }

  indexAt(height) {
    let low = 0;
    let high = this.metadata.totalEntries;
    while (low < high) {
      const middle = Math.floor((low + high) / 2);
      if (this.heightBefore(middle + 1) <= height) { low = middle + 1; }
      else { high = middle; }
    }
    return Math.min(low, Math.max(0, this.metadata.totalEntries - 1));
  }

  metrics(logicalTop, viewportHeight) {
    const total = this.heightBefore(this.metadata.totalEntries) + this.trailingSpace;
    const extent = Math.min(total, 8_000_000);
    const logicalMax = Math.max(0, total - viewportHeight);
    const physicalMax = Math.max(0, extent - viewportHeight);
    const logical = Math.max(0, Math.min(logicalTop, logicalMax));
    const physical = logicalMax ? logical / logicalMax * physicalMax : 0;
    return { logical, physical, extent, logicalMax, physicalMax, shift: logical - physical };
  }

  logicalFromPhysical(physical, viewportHeight) {
    const metrics = this.metrics(0, viewportHeight);
    return metrics.physicalMax ? physical / metrics.physicalMax * metrics.logicalMax : 0;
  }

  range(logicalTop, viewportHeight) {
    const first = this.indexAt(logicalTop);
    const last = this.indexAt(logicalTop + viewportHeight);
    return {
      start: Math.max(0, Math.floor((first - 12) / 10) * 10),
      end: Math.min(this.metadata.totalEntries, Math.ceil((last + 16) / 10) * 10), first, last
    };
  }
}
