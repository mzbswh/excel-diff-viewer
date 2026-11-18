/* Retains headers and existing row nodes as the viewport moves. */
class WorksheetGridRenderer {
  constructor(element) {
    this.element = element;
    this.schema = '';
    this.rows = new Map();
  }

  render(schema, rowVersion, entries, createHeader, createRow, columnCount) {
    if (this.schema !== schema || !this.table) {
      this.schema = schema;
      this.rows.clear();
      this.table = document.createElement('table');
      this.table.className = `diff-table${this.element.id === 'unified-grid' ? ' unified-table' : ''}`;
      this.table.append(createHeader(), document.createElement('tbody'));
      this.element.replaceChildren(this.table);
    }
    const body = this.table.tBodies[0];
    const retained = new Map();
    let cursor = body.firstChild;
    for (const entry of entries) {
      const key = entry.kind === 'row' ? `r${entry.row.index}` : entry.kind === 'gap' ? `g${entry.start}:${entry.end}`
        : entry.kind === 'spacer' ? entry.edge : `l${entry.position}`;
      let record = this.rows.get(key);
      const value = entry.kind === 'row' ? entry.row : key;
      if (!record || record.value !== value || record.version !== rowVersion) {
        const node = createRow(entry, columnCount);
        if (record?.node === cursor) { cursor = cursor.nextSibling; }
        record?.node.remove();
        record = { node, value, version: rowVersion };
      }
      const node = record.node;
      if (entry.kind === 'row') {
        node.classList.toggle('context-row', Boolean(entry.context));
        if (entry.frozen) { node.dataset.frozenRow = 'true'; delete node.dataset.position; }
        else { delete node.dataset.frozenRow; node.dataset.position = String(entry.position); }
      }
      if (node === cursor) { cursor = cursor.nextSibling; }
      else { body.insertBefore(node, cursor); }
      retained.set(key, record);
    }
    for (const [key, record] of this.rows) { if (!retained.has(key)) { record.node.remove(); } }
    this.rows = retained;
    return this.table;
  }

  spacers(top, bottom) {
    for (const [edge, height] of [['top', top], ['bottom', bottom]]) {
      const cell = this.rows.get(edge)?.node.firstElementChild;
      if (cell) { cell.style.height = `${Math.max(0, height)}px`; }
    }
  }
}
