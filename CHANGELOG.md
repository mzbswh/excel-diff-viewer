# Changelog

All notable changes to Excel Diff Viewer are documented in this file.

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
