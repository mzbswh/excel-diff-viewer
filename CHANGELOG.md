# Changelog

All notable changes to Excel Diff Viewer are documented in this file.

## 1.3.0 - 2026-11-18

- Replace worksheet pagination with continuous scrolling, loading nearby rows on demand and keeping rendered rows and cached batches limited.
- Keep change navigation, filters, expanded context, frozen panes, and custom row sizes available while scrolling.
- Load only nearby columns in wide worksheets, retain existing row elements, and limit outstanding row requests to two.
- Correct large-sheet scroll positioning, including the last row and small wheel movements when the scrollbar represents millions of rows.
- Separate finding text from filtering rows, highlight matches, and add previous/next match navigation.
- Add cell-address navigation, keyboard cell selection, difference counts, and worksheet change navigation.
- Accept row numbers as well as cell addresses in Go to row or cell, preserving the current column when jumping to a row.
- Preserve worksheet positions and selections, keep explicit filters, add a persistent cell-details panel, and fit column widths to loaded contents on double-click.
- Add row-loading retry and improve narrow-window controls.
- Simplify the viewer into a two-row toolbar with compact filters and change navigation. Move theme, frozen panes, search filtering, and sheet navigation into Options.
- Remove the separate change overview and its viewport outline, leaving the normal table scrollbar and explicit cell/row navigation counts. Reduce repeated counts, simplify the footer, and add Ctrl/Cmd+G for cell-address navigation.
- Replace the focus checkbox with a collapse/expand button with state-specific tooltips, and use layout buttons for side-by-side or combined views.
- Simplify hidden-row separators and hover previews. Keep text comparison settings in the full comparison, avoid large previews for empty cells, and show field titles only when the original header is out of view.
- Unify dark/light colors, typography, spacing, and controls. Separate blue selection states from difference colors, soften whole-row highlights, and remove the repeated heading from the combined view.
- Give the worksheet a defined work area, align the file header and controls, refine table typography, and group display options. Use quieter comparison headings and dialog backgrounds.
- Remove the `excelDiffViewer.pageSize` setting. Workbook parsing and comparison still finish before row loading begins.

## 1.2.1 - 2026-10-12

- Update visible cell hover previews immediately when moving between cells, applying the configured delay only when opening a new preview.
- Show cell hover previews synchronously when `excelDiffViewer.cellHoverDelay` is set to 0.

## 1.2.0 - 2026-09-24

- Preload Webview scripts and styles during extension activation to shorten the first comparison without opening an extra tab.
- Parse workbook versions concurrently when beneficial, reuse recent comparisons only after validating both file contents, and log open-stage timings and URI schemes.
- Add `excelDiffViewer.cellHoverDelay` to configure when cell hover previews appear.

## 1.1.1 - 2026-09-21

- Open the Excel loading view before closing the native SCM diff, avoiding a temporary switch to an unrelated editor while workbooks load.
- Initialize the viewer alongside workbook loading, apply the configured theme on the first render, and remove the initial opacity transition to reduce flashing.
- Skip unused cell HTML generation and defer formatted cell text generation until needed to reduce parsing work.
- Update installation links and the VSIX installation example in the README.

## 1.1.0 - 2026-09-20

- Align inserted/deleted columns and rows using reliable headers, unique IDs, and shared content, avoiding cascading false modifications. Preserve renamed headers and original Before/After addresses.
- Separate row, column-structure, and cell-change summaries. Add Modified filtering, and include column/cell additions and removals in Added/Removed filters.
- Add Focus changes with selection remembered across comparisons. Show only relevant rows/columns, preserve headers and explicitly frozen regions, and retain all fields for whole-row changes. Hidden columns can be restored with Show all; row context expands on demand.
- Add configurable frozen rows and columns across pages, with pane-size limits.
- Add draggable column widths and row heights, synchronized between panes and remembered per worksheet, with double-click reset and keyboard adjustment.
- Group toolbar controls for responsive layouts, keep freeze controls together, and prevent filter counts and disabled states from flashing during selection.
- Improve hover preview timing and dismissal, explain type/precision differences, preserve original addresses in navigation/search, and ignore stale replies when switching views.

## 1.0.4 - 2026-09-02

- Added character-, word-, and line-level text differences to cell comparison previews and dialogs.
- Added side-by-side, inline, and stacked layouts for cell text comparisons.
- Added a top-bar action that opens the compared local workbook in Visual Studio Code, including URL-encoded file paths.

## 1.0.3 - 2026-09-02

- Improved responsive toolbar and footer layouts so controls remain visible with long cell values.
- Added scrollable cell previews and side-by-side Before/After comparison popups.
- Added an expanded cell comparison dialog that opens by double-clicking a cell or the footer inspector.
- Added cell copying through the context menu and Cmd/Ctrl+C.
- Fixed hover previews disappearing while moving the pointer from After cells into the preview.

## 1.0.2 - 2026-07-31

- Improved documentation and descriptions.

## 1.0.1 - 2026-07-30

- Fixed intermittent Excel SCM diff routing so Excel Diff Viewer opens consistently.
- Added explicit Excel diff associations, removed URI-based time throttling, and closed the native binary diff before VS Code's custom-editor fallback runs.

## 1.0.0 - 2026-07-30

- Initial public release.
- Added side-by-side and unified worksheet comparison views.
- Added worksheet, row, and cell change summaries.
- Added change navigation, filtering, search, and pagination.
- Added Explorer two-step file comparison.
- Added automatic takeover of Excel diff tabs opened from Source Control.
- Added configurable themes, navigation units, whitespace handling, and unchanged-sheet visibility.
