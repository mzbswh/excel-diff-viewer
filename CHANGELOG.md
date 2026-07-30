# Changelog

All notable changes to Excel Diff Viewer are documented in this file.

## 1.0.1 - 2026-07-30

- Fixed Excel SCM diffs intermittently opening in another installed Excel viewer instead of Excel Diff Viewer.
- Added explicit Excel diff associations, removed URI-based time throttling, and closed the native binary diff before VS Code's custom-editor fallback runs.

## 1.0.0 - 2026-07-30

- Initial public release.
- Added side-by-side and unified worksheet comparison views.
- Added worksheet, row, and cell change summaries.
- Added change navigation, filtering, search, and pagination.
- Added Explorer two-step file comparison.
- Added automatic takeover of Excel diff tabs opened by built-in Git, GitLens, and compatible SCM extensions.
- Added configurable themes, navigation units, whitespace handling, and unchanged-sheet visibility.
