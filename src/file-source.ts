import * as path from 'node:path';
import * as vscode from 'vscode';

export interface FileDescriptor {
  name: string;
  detail: string;
  path: string;
  uri: string;
  revision?: string;
}

interface GitRepository {
  state: {
    HEAD?: { commit?: string };
    indexChanges: { uri: vscode.Uri }[];
  };
  getCommit(ref: string): Promise<{ hash: string }>;
}

interface GitExtension {
  getAPI(version: 1): {
    getRepository(uri: vscode.Uri): GitRepository | null;
  };
}

export async function describeFile(uri: vscode.Uri, workingTree = false): Promise<FileDescriptor> {
  let filePath = uri.scheme === 'file' || uri.scheme === 'git'
    ? uri.with({ scheme: 'file', query: '', fragment: '' }).fsPath
    : decodeURIComponent(uri.path);
  let ref = '';
  if (uri.query) {
    try {
      const query = JSON.parse(uri.query) as Record<string, unknown>;
      if (uri.scheme === 'git' && typeof query.path === 'string') { filePath = query.path; }
      const candidate = query.ref ?? query.sha ?? query.revision;
      if (typeof candidate === 'string') { ref = candidate; }
    } catch {
      ref = uri.query.match(/[a-f\d]{7,40}/i)?.[0] ?? '';
    }
  }
  const file = { name: path.basename(filePath) || 'Excel workbook', path: filePath, uri: uri.toString() };
  if (uri.scheme === 'file') { return { ...file, detail: workingTree ? 'Working tree' : 'Local file' }; }
  if (uri.scheme !== 'git') {
    return { ...file, detail: ref ? `${uri.scheme} · ${ref.slice(0, 12)}` : uri.scheme };
  }
  if (ref === '') { return { ...file, detail: 'Staged changes' }; }

  try {
    const extension = vscode.extensions.getExtension<GitExtension>('vscode.git');
    const git = extension && (extension.isActive ? extension.exports : await extension.activate());
    const repository = git?.getAPI(1).getRepository(vscode.Uri.file(filePath));
    if (ref === '~' && repository) {
      // Match VS Code Git's resolution of the working-tree comparison base.
      const staged = repository.state.indexChanges.some((change) => change.uri.fsPath === filePath);
      if (staged) { return { ...file, detail: 'Staged changes' }; }
      ref = 'HEAD';
    }
    const hash = ref === 'HEAD' ? repository?.state.HEAD?.commit ?? (await repository?.getCommit(ref))?.hash
      : /^[a-f\d]{40}$/i.test(ref) ? ref : (await repository?.getCommit(ref))?.hash;
    if (hash) { return { ...file, detail: `Git commit · ${hash.slice(0, 12)}`, revision: hash }; }
  } catch {
    // A missing repository or an unavailable ref should not prevent comparison.
  }
  return { ...file, detail: ref === '~' ? 'Git base (source unavailable)' : `Git revision · ${ref.slice(0, 12)}` };
}
