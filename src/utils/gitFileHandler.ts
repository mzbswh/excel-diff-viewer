import * as vscode from 'vscode';
import { promises as fsPromises } from 'fs';
import { Logger } from './logger';

export interface GitFileInfo {
  scheme: string;
  path: string;
  ref?: string;
  authority: string;
  fullUri: string;
}

export class GitFileHandler {
  /**
   * 判断是否为 Git 相关的文件
   */
  static isGitFile(uri: vscode.Uri): boolean {
    return uri.scheme === 'git' || 
           uri.scheme === 'gitlens' || 
           uri.scheme === 'gitfs';
  }

  /**
   * 检查文件是否在 Git 仓库中
   */
  static async isInGitRepository(uri: vscode.Uri): Promise<boolean> {
    if (uri.scheme !== 'file') {
      return false;
    }

    try {
      const gitExtension = vscode.extensions.getExtension('vscode.git');
      if (!gitExtension) {
        return false;
      }

      const git = gitExtension.isActive 
        ? gitExtension.exports.getAPI(1)
        : await gitExtension.activate().then(() => gitExtension.exports.getAPI(1));

      // 查找包含此文件的仓库
      const repo = git.repositories.find((r: any) => 
        uri.fsPath.startsWith(r.rootUri.fsPath)
      );

      return repo != null;
    } catch (error) {
      Logger.error(`Error checking Git repository: ${error}`, 'GitFileHandler');
      return false;
    }
  }

  /**
   * 获取文件的 HEAD 版本内容
   */
  static async getHeadVersion(filePath: string): Promise<string | null> {
    try {
      const { exec } = await import('child_process');
      const { promisify } = await import('util');
      const execAsync = promisify(exec);
      const os = await import('os');
      const path = await import('path');

      const gitExtension = vscode.extensions.getExtension('vscode.git');
      if (!gitExtension) {
        throw new Error('Git extension not found');
      }

      const git = gitExtension.isActive 
        ? gitExtension.exports.getAPI(1)
        : await gitExtension.activate().then(() => gitExtension.exports.getAPI(1));

      // 查找包含此文件的仓库
      const repo = git.repositories.find((r: any) => 
        filePath.startsWith(r.rootUri.fsPath)
      );

      if (!repo) {
        throw new Error('File not in Git repository');
      }

      // 获取相对路径
      const relativePath = path.relative(repo.rootUri.fsPath, filePath);
      
      // 获取 HEAD commit 的 short hash
      let shortHash = 'HEAD';
      try {
        const hashCommand = `cd "${repo.rootUri.fsPath}" && git rev-parse --short HEAD`;
        const { stdout } = await execAsync(hashCommand);
        shortHash = stdout.trim();
      } catch (error) {
        Logger.warn(`Failed to get short hash, using 'HEAD': ${error}`, 'GitFileHandler');
      }
      
      // 创建临时文件 - 格式: filename.ext(hash)
      const tempDir = os.tmpdir();
      const fileName = path.basename(filePath);
      const tempFile = path.join(tempDir, `${fileName}(${shortHash})`);

      // 使用 git show 命令导出 HEAD 版本
      const command = `cd "${repo.rootUri.fsPath}" && git show HEAD:"${relativePath}" > "${tempFile}"`;

      Logger.info(`Executing Git command: ${command}`, 'GitFileHandler');
      
      await execAsync(command);
      
      Logger.info(`Created HEAD version file: ${tempFile}`, 'GitFileHandler');
      return tempFile;

    } catch (error) {
      Logger.error(`Failed to get HEAD version: ${error}`, 'GitFileHandler');
      return null;
    }
  }

  /**
   * 从 SCM 资源获取文件信息
   */
  static async getFilesFromScmResource(scmResource: any): Promise<{ original: string; modified: string } | null> {
    try {
      if (!scmResource || !scmResource.resourceUri) {
        return null;
      }

      const modifiedFile = scmResource.resourceUri.fsPath;
      Logger.info(`SCM Resource: ${modifiedFile}`, 'GitFileHandler');

      // 获取 HEAD 版本
      const originalFile = await this.getHeadVersion(modifiedFile);
      
      if (!originalFile) {
        return null;
      }

      return {
        original: originalFile,
        modified: modifiedFile
      };

    } catch (error) {
      Logger.error(`Failed to get files from SCM resource: ${error}`, 'GitFileHandler');
      return null;
    }
  }

  /**
   * 解析 Git URI
   */
  static parseGitUri(uri: vscode.Uri): GitFileInfo | null {
    if (!this.isGitFile(uri)) {
      return null;
    }

    const query = new URLSearchParams(uri.query);

    return {
      scheme: uri.scheme,
      path: uri.fsPath,
      ref: query.get('ref') || query.get('revision') || undefined,
      authority: uri.authority,
      fullUri: uri.toString()
    };
  }

  /**
   * 从 Git URI 创建临时文件
   */
  static async createTempFileFromGitUri(uri: vscode.Uri): Promise<string | null> {
    try {
      const document = await vscode.workspace.openTextDocument(uri);
      const content = document.getText();

      const os = await import('os');
      const path = await import('path');

      const gitInfo = this.parseGitUri(uri);
      const tempDir = os.tmpdir();
      const fileName = path.basename(uri.fsPath);
      const ref = gitInfo?.ref || 'unknown';
      const tempFile = path.join(tempDir, `${fileName}(${ref})`);

      await fsPromises.writeFile(tempFile, content);
      Logger.info(`Created temp file from Git URI: ${tempFile}`, 'GitFileHandler');

      return tempFile;

    } catch (error) {
      Logger.error(`Failed to create temp file from Git URI: ${error}`, 'GitFileHandler');
      return null;
    }
  }

  /**
   * 检查文件是否有 Git 修改
   */
  static async hasGitChanges(filePath: string): Promise<boolean> {
    try {
      const gitExtension = vscode.extensions.getExtension('vscode.git');
      if (!gitExtension) {
        return false;
      }

      const git = gitExtension.isActive 
        ? gitExtension.exports.getAPI(1)
        : await gitExtension.activate().then(() => gitExtension.exports.getAPI(1));

      const repo = git.repositories.find((r: any) => 
        filePath.startsWith(r.rootUri.fsPath)
      );

      if (!repo) {
        return false;
      }

      const path = await import('path');
      const relativePath = path.relative(repo.rootUri.fsPath, filePath);

      // 检查工作区状态
      const changes = repo.state.workingTreeChanges || [];
      const indexChanges = repo.state.indexChanges || [];

      return changes.some((c: any) => c.uri.fsPath.endsWith(relativePath)) ||
             indexChanges.some((c: any) => c.uri.fsPath.endsWith(relativePath));

    } catch (error) {
      Logger.error(`Failed to check Git changes: ${error}`, 'GitFileHandler');
      return false;
    }
  }
}

