# Changelog

All notable changes to Excel Diff Viewer are documented in this file.

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
