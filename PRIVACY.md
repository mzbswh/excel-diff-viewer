# Privacy

Excel Diff Viewer reads the two workbook resources selected by the user or supplied by a compatible VS Code diff tab. Workbook contents are processed locally inside the Visual Studio Code extension host to build the comparison view.

The extension:

- does not upload workbook contents;
- does not collect analytics or telemetry;
- does not use cookies or advertising identifiers;
- does not make runtime network requests; and
- does not persist workbook contents after the comparison panel is closed.

The extension stores only the URI of the workbook selected through **Excel Diff Viewer: Select for Compare** in VS Code workspace state. Use **Excel Diff Viewer: Clear Selected File** to remove that value.

Visual Studio Code, installed SCM extensions, the extension marketplace, and package installation tools have their own privacy policies and may perform network operations independently of Excel Diff Viewer.

Report privacy or security concerns through the repository's [GitHub Issues](https://github.com/mzbswh/excel-diff-viewer/issues).
