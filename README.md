# Excel Diff Viewer

Compare Excel workbooks directly in Visual Studio Code with a spreadsheet-aware side-by-side diff.

Excel Diff Viewer reads workbook versions exposed by Visual Studio Code Source Control, the Explorer, or the file picker. It compares worksheets and cells without converting the workbook to text.

## Features

- Compare `.xlsx`, `.xlsm`, `.xlsb`, and `.xls` workbooks.
- Automatically replace compatible Excel SCM diff tabs with the Excel Diff Viewer.
- Compare two arbitrary files from the Command Palette.
- Select one workbook in the Explorer and compare it with another.
- Switch between side-by-side and combined views with the layout buttons.
- Browse worksheet, row, and cell change summaries.
- Navigate to the previous or next changed cell or row.
- Filter added, removed, or changed rows. Find text with highlighted matches and previous/next navigation.
- Scroll continuously through large worksheets. Nearby rows and columns load as needed, with a limited cache and retained visible rows.
- Choose a dedicated light or dark viewer theme.

## Installation

### Visual Studio Marketplace

[Open Excel Diff Viewer in the Visual Studio Marketplace](https://marketplace.visualstudio.com/items?itemName=mzbswh.excel-diff-viewer).

1. Open the Extensions view in Visual Studio Code.
2. Search for **Excel Diff Viewer**.
3. Select **Install**.

You can also install it from the Command Palette with **Extensions: Install Extensions**.

### VSIX package

Download the `.vsix` file from the [latest GitHub Release](https://github.com/mzbswh/excel-diff-viewer/releases/latest), then run:

```bash
code --install-extension excel-diff-viewer-1.3.0.vsix
```

## Usage

### Compare a Git or SCM change

Open an Excel change from the Source Control view. When both sides resolve to supported Excel workbooks, Excel Diff Viewer captures both URIs and opens its loading view in the same editor group before closing the original binary diff tab. The viewer loads and compares the workbooks while the page initializes, using the configured theme from the first render.

When automatic takeover is enabled, Excel Diff Viewer adds explicit Excel entries to the profile's `workbench.diffEditorAssociations`. This makes Excel diff tabs use VS Code's default diff editor before takeover. Existing explicit Excel diff associations are preserved. Regular workbook tabs continue to use the viewer selected in `workbench.editorAssociations`.

Automatic takeover can be disabled with `excelDiffViewer.autoOpenScmDiff`.

### Compare two files

Run **Excel Diff Viewer: Compare Two Files** from the Command Palette and choose exactly two supported workbooks.

### Compare from the Explorer

1. Right-click the first workbook and select **Excel Diff Viewer: Select for Compare**.
2. Right-click a different workbook and select **Excel Diff Viewer: Compare with Selected**.
3. Use **Excel Diff Viewer: Clear Selected File** to clear the saved selection.

## Comparison behavior

Worksheets are matched by name. Columns are aligned by a complete, unique text header in the first used row when enough shared fields retain their order. Inserted and deleted columns no longer shift subsequent comparisons. Renamed columns can be matched conservatively using sampled contents between shared fields; the changed header remains highlighted. Column headings and cell previews show the original Before/After addresses. Field names appear in the column headings after the header row scrolls out of view; pinned headers avoid this repetition. Other layouts fall back to address-based comparison. Values, formulas, and cell types participate in equality. Rows are aligned using unique `id`/`key` values when available, otherwise shared row contents and local similarity. Inserting or deleting rows does not shift subsequent comparisons; blank inserted rows are also shown. An existing row with added or removed cells counts as modified, not as an added or removed row. Worksheet details distinguish affected rows, column structure, and cell changes. Position-only changes use amber row/column labels without highlighting unchanged contents.

Use **Edits** to focus on changed values and navigate past added/deleted cells when a structural change affects many rows. **Changes** includes every difference; **Added** and **Removed** select rows containing additions/removals, including inserted/deleted columns and individual cell values. Filters stay as selected when switching worksheets, including when there are no matching rows. Empty results explain the remaining worksheet changes and offer **Show all changes**. Cell details include original values when formatting masks precision, and distinguish text from numeric values when types differ.

Find text without hiding rows using the search field (**Ctrl/Cmd+F**). Use **Enter** / **Shift+Enter** or the arrows beside it to move between matches. Open **Options** and enable **Show only rows matching the search** to narrow the table. **Go to row or cell** in the same panel accepts an original row number such as `25001` or a cell address such as `C25001`, on the last active Before/After side, within the current view. A row number keeps the selected column, or uses the first visible column if none is selected. **Ctrl/Cmd+G** opens it directly. The table keeps its normal scrollbar.

Use **F7** / **Shift+F7** to move between differences; the toolbar shows your position and whether you are navigating cells or rows, and reports when navigation wraps. Filter counts refer to rows. **Options → Other changed sheets** moves to another worksheet with changes matching the selected category. Focus a table to select cells with arrow keys, Page Up/Down, Home/End, or Ctrl/Cmd+Home/End. Press **Enter** to open the selected cell's comparison, or enable **Details** to keep it visible below the table. Switching worksheets restores each worksheet's scroll position and selection when its row filter and matching-row search are unchanged. Switching between side-by-side and combined views keeps your position and selection.

The **focus button** beside the layout buttons is off by default and remembers your last selection across comparison tabs and restarts (`excelDiffViewer.focusChanges`). Click its inward arrows to hide unrelated rows and columns; the button highlights and changes to outward arrows. Click again to restore the rows and columns allowed by the current filter. Hover or focus the button for an explanation. The row filter stays selected. Added/removed columns retain all records; added/removed rows retain all fields; modified cells retain only matching rows and columns. Header-only changes retain the header area. ID/key, name, and neighboring rows/columns are not automatically retained; columns are shown only when involved in the selected changes, explicitly frozen, or manually expanded. Recognized headers and explicitly frozen rows/columns remain visible. Hidden columns leave no placeholder in the table: use **columns hidden · Show all** beside the counts to restore them. Row separators let you explicitly expand context (up to 50 rows at a time), without altering matching counts. Column selection is stable while scrolling and original Before/After addresses are retained. Changing the row filter, matching-row search, or this setting resets expanded context.

Use **Options → Freeze first** to pin the first 0–20 aligned rows/columns. Frozen rows remain visible while scrolling; frozen columns remain available in focused views. These controls work in both views and are remembered for the comparison tab. Small panes limit freezing to leave scrolling space; a notice appears when the requested amount cannot fit. Set both to 0 to unfreeze (the row-number and column-letter headings remain sticky).

Drag the right edge of a column heading to resize its width, or the bottom edge of a row number to resize its height. Both comparison panes update together and frozen offsets are recalculated. Custom row heights allow wrapped text. Sizes are remembered per worksheet within the comparison tab. Double-click a column edge to fit its currently loaded contents; double-click a row edge to restore the default height. A focused resize edge supports arrow-key adjustment.

Hover a changed cell for a compact before/after preview. Click **Full comparison** or double-click the cell to open the complete comparison with text granularity and layout settings. Empty cells use a short hint.

Workbook parsing and comparison still finish before table data begins loading. Continuous loading reduces the data sent to the viewer and the rows and columns rendered there; it does not stream workbook parsing.

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
| `excelDiffViewer.cellHoverDelay` | `150` | Delay in milliseconds before showing a cell hover preview (0–2,000). Set to `0` for immediate display. |
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
- Workbooks are parsed and compared in full before rows can be displayed. After that, rows are transferred on demand as you scroll, with a limited number kept in the viewer.

## Privacy

Workbook contents are read and compared inside the VS Code extension host. Excel Diff Viewer does not upload workbook contents, collect telemetry, or make runtime network requests. See [PRIVACY.md](PRIVACY.md).

## Support

Report defects and feature requests through [GitHub Issues](https://github.com/mzbswh/excel-diff-viewer/issues). See [SUPPORT.md](SUPPORT.md) for the information to include.

## License

Excel Diff Viewer is released under the [MIT License](LICENSE). Bundled third-party software is documented in [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).
