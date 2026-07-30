import * as path from 'node:path';
import * as vscode from 'vscode';
import { WorkbookComparison } from './model';
import { ExcelDiffPanel } from './panel';

const selectedUriKey = 'excelDiffViewer.selectedUri';
const recentAutoDiffs = new Map<string, number>();

export function activate(context: vscode.ExtensionContext): void {
  const status = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 30);
  status.command = 'excelDiffViewer.clearSelected';
  context.subscriptions.push(status);

  const restoreSelected = (): vscode.Uri | undefined => {
    const stored = context.workspaceState.get<string>(selectedUriKey);
    if (!stored) {
      return undefined;
    }
    try {
      return vscode.Uri.parse(stored);
    } catch {
      return undefined;
    }
  };

  const updateSelectionUi = async (uri: vscode.Uri | undefined): Promise<void> => {
    await vscode.commands.executeCommand('setContext', 'excelDiffViewer.hasSelectedFile', Boolean(uri));
    if (!uri) {
      status.hide();
      return;
    }
    status.text = `$(diff) Excel: ${resourceName(uri)} selected`;
    status.tooltip = `Selected for Excel comparison: ${uri.toString()}\nClick to clear.`;
    status.show();
  };

  void updateSelectionUi(restoreSelected());

  context.subscriptions.push(
    vscode.commands.registerCommand('excelDiffViewer.openCompare', async () => {
      const uris = await vscode.window.showOpenDialog({
        title: 'Choose two Excel files to compare',
        canSelectMany: true,
        canSelectFiles: true,
        canSelectFolders: false,
        openLabel: 'Compare selected files',
        filters: { 'Excel workbooks': ['xlsx', 'xlsm', 'xlsb', 'xls'] }
      });
      if (!uris) {
        return;
      }
      if (uris.length !== 2) {
        await vscode.window.showWarningMessage('Select exactly two Excel files to compare.');
        return;
      }
      const left = uris[0];
      const right = uris[1];
      if (left && right) {
        await openComparison(context, left, right, true);
      }
    }),
    vscode.commands.registerCommand(
      'excelDiffViewer.selectForCompare',
      async (resource?: vscode.Uri, selectedResources?: vscode.Uri[]) => {
        const uri = await resolveExcelResource(resource, selectedResources, 'Select Excel file');
        if (!uri) {
          return;
        }
        await context.workspaceState.update(selectedUriKey, uri.toString());
        await updateSelectionUi(uri);
        await vscode.window.showInformationMessage(`${resourceName(uri)} selected for Excel comparison.`);
      }
    ),
    vscode.commands.registerCommand(
      'excelDiffViewer.compareWithSelected',
      async (resource?: vscode.Uri, selectedResources?: vscode.Uri[]) => {
        const left = restoreSelected();
        if (!left) {
          await vscode.window.showWarningMessage('Select an Excel file with “Excel Diff Viewer: Select for Compare” first.');
          return;
        }
        const right = await resolveExcelResource(resource, selectedResources, 'Compare with selected file');
        if (!right) {
          return;
        }
        if (left.toString() === right.toString()) {
          await vscode.window.showWarningMessage('Choose a different Excel file to compare.');
          return;
        }
        await openComparison(context, left, right, true);
      }
    ),
    vscode.commands.registerCommand('excelDiffViewer.clearSelected', async () => {
      await context.workspaceState.update(selectedUriKey, undefined);
      await updateSelectionUi(undefined);
    })
  );

  const inspectTab = (tab: vscode.Tab): void => {
    if (!vscode.workspace.getConfiguration('excelDiffViewer').get<boolean>('autoOpenScmDiff', true)) {
      return;
    }
    const input = tab.input;
    if (!(input instanceof vscode.TabInputTextDiff)) {
      return;
    }
    if (!isExcelUri(input.original) || !isExcelUri(input.modified)) {
      return;
    }

    const key = `${input.original.toString()}\u0000${input.modified.toString()}`;
    const now = Date.now();
    const previous = recentAutoDiffs.get(key) ?? 0;
    if (now - previous < 5000) {
      return;
    }
    recentAutoDiffs.set(key, now);
    for (const [entry, time] of recentAutoDiffs) {
      if (now - time > 30_000) {
        recentAutoDiffs.delete(entry);
      }
    }

    void openComparison(context, input.original, input.modified, false).then(async (opened) => {
      if (opened) {
        await vscode.window.tabGroups.close(tab, true);
      }
    });
  };

  context.subscriptions.push(
    vscode.window.tabGroups.onDidChangeTabs((event) => {
      for (const tab of event.opened) {
        inspectTab(tab);
      }
    })
  );

  for (const group of vscode.window.tabGroups.all) {
    for (const tab of group.tabs) {
      inspectTab(tab);
    }
  }
}

export function deactivate(): void {
  recentAutoDiffs.clear();
}

async function openComparison(
  context: vscode.ExtensionContext,
  left: vscode.Uri,
  right: vscode.Uri,
  showProgress: boolean
): Promise<boolean> {
  const buildComparison = async (): Promise<WorkbookComparison> => {
    const ignoreWhitespace = vscode.workspace
      .getConfiguration('excelDiffViewer')
      .get<boolean>('ignoreWhitespace', false);
    return WorkbookComparison.create(left, right, ignoreWhitespace);
  };

  try {
    const comparison = showProgress
      ? await vscode.window.withProgress(
          {
            location: vscode.ProgressLocation.Notification,
            title: 'Comparing Excel workbooks…'
          },
          buildComparison
        )
      : await buildComparison();
    ExcelDiffPanel.show(context, comparison, `Excel Diff · ${resourceName(right)}`);
    return true;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await vscode.window.showErrorMessage(`Excel comparison failed: ${message}`);
    return false;
  }
}

async function resolveExcelResource(
  resource: vscode.Uri | undefined,
  selectedResources: vscode.Uri[] | undefined,
  title: string
): Promise<vscode.Uri | undefined> {
  if (resource instanceof vscode.Uri && isExcelUri(resource)) {
    return resource;
  }
  const selected = selectedResources?.find(isExcelUri);
  if (selected) {
    return selected;
  }
  const picked = await vscode.window.showOpenDialog({
    title,
    canSelectMany: false,
    canSelectFiles: true,
    canSelectFolders: false,
    filters: { 'Excel workbooks': ['xlsx', 'xlsm', 'xlsb', 'xls'] }
  });
  return picked?.[0];
}

function isExcelUri(uri: vscode.Uri): boolean {
  let candidate = uri.path;
  try {
    candidate = decodeURIComponent(`${uri.path}?${uri.query}`);
  } catch {
    candidate = `${uri.path}?${uri.query}`;
  }
  return /\.(xlsx|xlsm|xlsb|xls)(?:$|[?"'&}])/i.test(candidate);
}

function resourceName(uri: vscode.Uri): string {
  try {
    return path.posix.basename(decodeURIComponent(uri.path)) || 'workbook';
  } catch {
    return path.posix.basename(uri.path) || 'workbook';
  }
}
