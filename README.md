# Excel Diff Viewer

Compare Excel workbooks directly in Visual Studio Code with a spreadsheet-aware side-by-side diff.

Excel Diff Viewer reads workbook versions exposed by built-in Git, GitLens, compatible SCM extensions, the Explorer, or the file picker. It compares worksheets and cells without converting the workbook to text.

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
code --install-extension excel-diff-viewer-1.0.1.vsix
```

## Usage

### Compare a Git or SCM change

Open an Excel change from the Source Control view, GitLens, or another extension that opens a standard VS Code text diff. When both sides resolve to supported Excel workbooks, Excel Diff Viewer captures both URIs, immediately closes the original binary diff tab, and opens its workbook-aware view.

When automatic takeover is enabled, Excel Diff Viewer adds explicit Excel entries to the profile's `workbench.diffEditorAssociations`. This makes Excel diff tabs use VS Code's default diff editor before takeover, even when another extension is configured as the normal editor for Excel files. Existing explicit Excel diff associations are preserved. Regular workbook tabs continue to use the viewer selected in `workbench.editorAssociations`.

Automatic takeover can be disabled with `excelDiffViewer.autoOpenScmDiff`.

### Compare two files

Run **Excel Diff Viewer: Compare Two Files** from the Command Palette and choose exactly two supported workbooks.

### Compare from the Explorer

1. Right-click the first workbook and select **Excel Diff Viewer: Select for Compare**.
2. Right-click a different workbook and select **Excel Diff Viewer: Compare with Selected**.
3. Use **Excel Diff Viewer: Clear Selected File** to clear the saved selection.

## Comparison behavior

The comparison is coordinate-based. Worksheets are matched by name, and cells are matched by address. Values, formulas, and cell types participate in equality. Rows are the primary summary and navigation unit; cell highlights show the exact differences.

Excel Diff Viewer is read-only. It does not modify either workbook.

## Settings

| Setting | Default | Description |
| --- | --- | --- |
| `excelDiffViewer.autoOpenScmDiff` | `true` | Replace compatible Excel SCM diff tabs automatically. |
| `excelDiffViewer.theme` | `dark` | Use the viewer's `dark` or `light` theme. |
| `excelDiffViewer.diffMode` | `sideBySide` | Use `sideBySide` or `unified` comparison. |
| `excelDiffViewer.navigationUnit` | `cell` | Navigate by changed `cell` or changed `row`. |
| `excelDiffViewer.rowFilter` | `all` | Initially show `all`, `changed`, `added`, or `removed` rows. |
| `excelDiffViewer.pageSize` | `200` | Render between 50 and 1,000 worksheet rows per page. |
| `excelDiffViewer.ignoreWhitespace` | `false` | Ignore leading, trailing, and repeated whitespace in text cells. |
| `excelDiffViewer.showUnchangedSheets` | `true` | Include unchanged worksheets in the sheet navigator. |

## Requirements

- Visual Studio Code 1.120.0 or later.
- An SCM integration that opens a standard `TabInputTextDiff` when automatic takeover is used.

The extension runs on macOS, Windows, and Linux wherever the selected workbook URIs can be read by the VS Code file system provider.

## Known limitations

- Formatting-only changes, charts, images, pivot tables, and VBA content are not compared.
- Rows and columns are not structurally aligned after insertions; comparison remains address-based.
- Password-protected or unsupported workbook content may fail to parse.
- Automatic takeover does not apply when another extension uses a nonstandard or custom diff editor.
- Very large workbooks are parsed in full before pages are rendered.

## Privacy

Workbook contents are read and compared inside the VS Code extension host. Excel Diff Viewer does not upload workbook contents, collect telemetry, or make runtime network requests. See [PRIVACY.md](PRIVACY.md).

## Support

Report defects and feature requests through [GitHub Issues](https://github.com/mzbswh/excel-diff-viewer/issues). See [SUPPORT.md](SUPPORT.md) for the information to include.

## License

Excel Diff Viewer is released under the [MIT License](LICENSE). Bundled third-party software is documented in [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).
