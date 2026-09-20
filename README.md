# Excel Diff Viewer

Compare Excel workbooks directly in Visual Studio Code with a spreadsheet-aware side-by-side diff.

Excel Diff Viewer reads workbook versions exposed by Visual Studio Code Source Control, the Explorer, or the file picker. It compares worksheets and cells without converting the workbook to text.

## Features

- Compare `.xlsx`, `.xlsm`, `.xlsb`, and `.xls` workbooks.
- Automatically replace compatible Excel SCM diff tabs with the Excel Diff Viewer.
- Compare two arbitrary files from the Command Palette.
- Select one workbook in the Explorer and compare it with another.
- Switch between side-by-side and unified views.
- Browse worksheet, row, and cell change summaries.
- Navigate to the previous or next changed cell or row.
- Filter added, removed, or changed rows and search the active worksheet.
- Page through large worksheets instead of rendering every row at once.
- Choose a dedicated light or dark viewer theme.

## Installation

### Visual Studio Marketplace

1. Open the Extensions view in Visual Studio Code.
2. Search for **Excel Diff Viewer**.
3. Select **Install**.

You can also install it from the Command Palette with **Extensions: Install Extensions**.

### VSIX package

Download the `.vsix` file from the matching [GitHub Release](https://github.com/mzbswh/excel-diff-viewer/releases), then run:

```bash
code --install-extension excel-diff-viewer-1.0.2.vsix
```

## Usage

### Compare a Git or SCM change

Open an Excel change from the Source Control view. When both sides resolve to supported Excel workbooks, Excel Diff Viewer captures both URIs, immediately closes the original binary diff tab, and opens its workbook-aware view.

When automatic takeover is enabled, Excel Diff Viewer adds explicit Excel entries to the profile's `workbench.diffEditorAssociations`. This makes Excel diff tabs use VS Code's default diff editor before takeover. Existing explicit Excel diff associations are preserved. Regular workbook tabs continue to use the viewer selected in `workbench.editorAssociations`.

Automatic takeover can be disabled with `excelDiffViewer.autoOpenScmDiff`.

### Compare two files

Run **Excel Diff Viewer: Compare Two Files** from the Command Palette and choose exactly two supported workbooks.

### Compare from the Explorer

1. Right-click the first workbook and select **Excel Diff Viewer: Select for Compare**.
2. Right-click a different workbook and select **Excel Diff Viewer: Compare with Selected**.
3. Use **Excel Diff Viewer: Clear Selected File** to clear the saved selection.

## Comparison behavior

Worksheets are matched by name. Columns are aligned by a complete, unique text header in the first used row when enough shared fields retain their order. Inserted and deleted columns no longer shift subsequent comparisons. Renamed columns can be matched conservatively using sampled contents between shared fields; the changed header remains highlighted. Column headings and cell previews show the original Before/After addresses. Other layouts fall back to address-based comparison. Values, formulas, and cell types participate in equality. Rows are aligned using unique `id`/`key` values when available, otherwise shared row contents and local similarity. Inserting or deleting rows does not shift subsequent comparisons; blank inserted rows are also shown. An existing row with added or removed cells counts as modified, not as an added or removed row. The overview separates affected rows, column structure, and cell changes. Position-only changes use amber row/column labels without highlighting unchanged contents.

Use **Modified** to focus on changed values and navigate past added/deleted cells when a structural change affects many rows. **Changed** includes every difference; **Added** and **Removed** select rows containing additions/removals, including inserted/deleted columns and individual cell values. Empty filtered results explain the remaining worksheet changes and offer **Show all changes**; they do not imply the workbook is unchanged. Cell details include original values when formatting masks precision, and distinguish text from numeric values when types differ.

**Focus changes** is off by default and remembers your last selection across comparison tabs and restarts (`excelDiffViewer.focusChanges`). When enabled, it shows the records and fields relevant to the current change filter. Added/removed columns retain all records; added/removed rows retain all fields; modified cells retain only matching rows and columns. Header-only changes retain the header area. ID/key, name, and neighboring rows/columns are not automatically retained; columns are shown only when involved in the selected changes, explicitly frozen, or manually expanded. Recognized headers and explicitly frozen rows/columns remain visible. Hidden columns leave no placeholder in the table: use **columns hidden · Show all** beside the counts to restore them. Row separators let you explicitly expand context (up to 50 rows at a time), without altering matching counts. Column selection is stable across pages and original Before/After addresses are retained. Filter, search, worksheet, or Focus changes settings reset expanded context.

Use **Freeze rows** and **Cols** in the toolbar to pin the first 0–20 aligned rows/columns. Frozen rows remain visible across pages; frozen columns remain available in focused views. These controls work in both views and are remembered for the comparison tab. Small panes limit freezing to leave scrolling space; a notice appears when the requested amount cannot fit. Set both to 0 to unfreeze (the row-number and column-letter headings remain sticky).

Drag the right edge of a column heading to resize its width, or the bottom edge of a row number to resize its height. Both comparison panes update together and frozen offsets are recalculated. Custom row heights allow wrapped text. Sizes are remembered per worksheet within the comparison tab; double-click an edge to restore the default. Focus a resize edge and use arrow keys for keyboard adjustment.

Excel Diff Viewer is read-only. It does not modify either workbook.

## Settings

| Setting | Default | Description |
| --- | --- | --- |
| `excelDiffViewer.autoOpenScmDiff` | `true` | Replace compatible Excel SCM diff tabs automatically. |
| `excelDiffViewer.theme` | `dark` | Use the viewer's `dark` or `light` theme. |
| `excelDiffViewer.diffMode` | `sideBySide` | Use `sideBySide` or `unified` comparison. |
| `excelDiffViewer.textDiffGranularity` | `character` | Highlight cell text changes by `character`, `word`, or `line`. |
| `excelDiffViewer.textDiffLayout` | `sideBySide` | Show cell text changes as `sideBySide`, `inline`, or `stacked`. |
| `excelDiffViewer.navigationUnit` | `cell` | Navigate by changed `cell` or changed `row`. |
| `excelDiffViewer.rowFilter` | `all` | Initially select `all`, `changed`, `modified`, `added`, or `removed` differences. |
| `excelDiffViewer.pageSize` | `200` | Render between 50 and 1,000 worksheet rows per page. |
| `excelDiffViewer.ignoreWhitespace` | `false` | Ignore leading, trailing, and repeated whitespace in text cells. |
| `excelDiffViewer.showUnchangedSheets` | `true` | Include unchanged worksheets in the sheet navigator. |

## Requirements

- Visual Studio Code 1.120.0 or later.
- An SCM integration that opens a standard `TabInputTextDiff` when automatic takeover is used.

The extension runs on macOS, Windows, and Linux wherever the selected workbook URIs can be read by the VS Code file system provider.

## Known limitations

- Formatting-only changes, charts, images, pivot tables, and VBA content are not compared.
- Blank, duplicate, merged, reordered, or unrecognizable headers use address-based column comparison. Ambiguous row replacements and large unmatched regions fall back to local position pairing; repeated identical rows cannot always be assigned a unique insertion position. Ambiguous column renames may appear as a removed and an added column. Formula references are compared literally, even when columns move.
- Password-protected or unsupported workbook content may fail to parse.
- Automatic takeover requires a standard Visual Studio Code text diff tab.
- Very large workbooks are parsed in full before pages are rendered.

## Privacy

Workbook contents are read and compared inside the VS Code extension host. Excel Diff Viewer does not upload workbook contents, collect telemetry, or make runtime network requests. See [PRIVACY.md](PRIVACY.md).

## Support

Report defects and feature requests through [GitHub Issues](https://github.com/mzbswh/excel-diff-viewer/issues). See [SUPPORT.md](SUPPORT.md) for the information to include.

## License

Excel Diff Viewer is released under the [MIT License](LICENSE). Bundled third-party software is documented in [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).
