/* Column positions stay separate from the loaded cell values. */
class WorksheetColumnWindow {
  setColumns(columns, sizes, rowNumberWidth, frozenCount) {
    this.columns = columns;
    this.sizes = sizes;
    this.rowNumberWidth = rowNumberWidth;
    this.frozenCount = frozenCount;
    this.offsets = [0];
    for (const column of columns) { this.offsets.push(this.offsets[this.offsets.length - 1] + (sizes[column.index] || 156)); }
  }

  positionAt(left) {
    let low = 0;
    let high = this.columns.length;
    while (low < high) {
      const middle = Math.floor((low + high) / 2);
      if (this.offsets[middle + 1] <= left) { low = middle + 1; } else { high = middle; }
    }
    return Math.min(low, Math.max(0, this.columns.length - 1));
  }

  visible(left, width) {
    const frozen = this.columns.filter((column) => column.index < this.frozenCount).length;
    const start = Math.max(frozen, this.positionAt(Math.max(0, left - this.rowNumberWidth)) - 2);
    const end = Math.min(this.columns.length, this.positionAt(left + width) + 3);
    const indexes = [...Array.from({ length: frozen }, (_, index) => index),
      ...Array.from({ length: Math.max(0, end - start) }, (_, index) => start + index)];
    const columns = indexes.map((index) => this.columns[index]);
    const slots = [];
    for (let position = 0; position < frozen; position += 1) { slots.push({ column: this.columns[position], position }); }
    if (start > frozen) { slots.push({ width: this.offsets[start] - this.offsets[frozen] }); }
    for (let index = start; index < end; index += 1) { slots.push({ column: this.columns[index], position: frozen + index - start }); }
    if (end < this.columns.length) { slots.push({ width: this.offsets[this.columns.length] - this.offsets[end] }); }
    return { columns, slots, key: indexes.join(',') };
  }

  leftOf(columnIndex) {
    const position = this.columns.findIndex((column) => column.index === columnIndex);
    return position < 0 ? 0 : this.offsets[position];
  }
}
