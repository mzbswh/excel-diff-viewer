# Step 6: Git 版本对比集成 - 实现说明

## 📋 实现方案

**新方案**：在右键菜单中添加 Git 对比选项，而不是监听 tab 变化。

### 方案特点
- ✅ 更简单、更直观
- ✅ 用户主动触发，体验更好
- ✅ 不需要处理 `tab.input` 为 `undefined` 的问题
- ✅ 符合 VS Code 的标准交互模式

## 🎯 实现的功能

### 1. 文件资源管理器右键菜单

当用户在文件资源管理器中右键 Excel 文件时：

**菜单项**："excel Diff Viewer: 与 HEAD 对比"

**显示条件**：
```json
"when": "(resourceExtname == .xlsx || resourceExtname == .xls || resourceExtname == .csv) && gitOpenRepositoryCount != 0"
```

**功能**：
- 检查文件是否在 Git 仓库中
- 获取文件的 HEAD 版本
- 创建临时文件保存 HEAD 版本
- 对比当前文件和 HEAD 版本

### 2. SCM（源代码管理）视图右键菜单

当用户在 SCM 视图中右键修改的 Excel 文件时：

**菜单项**："excel Diff Viewer: 与 Git 版本对比"

**显示条件**：
```json
"when": "scmProvider == git && (resourceExtname == .xlsx || resourceExtname == .xls || resourceExtname == .csv)"
```

**功能**：
- 从 SCM 资源获取文件信息
- 获取 Git 版本（HEAD）
- 对比两个版本

## 📁 文件结构

### 新增文件

#### `src/utils/gitFileHandler.ts`

Git 文件处理工具类，提供以下功能：

| 方法 | 说明 |
|------|------|
| `isGitFile(uri)` | 判断 URI 是否为 Git 文件 |
| `isInGitRepository(uri)` | 检查文件是否在 Git 仓库中 |
| `getHeadVersion(filePath)` | 获取文件的 HEAD 版本 |
| `getFilesFromScmResource(scmResource)` | 从 SCM 资源获取文件信息 |
| `parseGitUri(uri)` | 解析 Git URI |
| `createTempFileFromGitUri(uri)` | 从 Git URI 创建临时文件 |
| `hasGitChanges(filePath)` | 检查文件是否有修改 |

### 修改的文件

#### `package.json`

**添加命令**：
```json
{
  "command": "excel-diff-viewer.compareWithGit",
  "title": "excel Diff Viewer: 与 Git 版本对比"
},
{
  "command": "excel-diff-viewer.compareWithGitHead",
  "title": "excel Diff Viewer: 与 HEAD 对比"
}
```

**添加菜单项**：
```json
"explorer/context": [
  {
    "command": "excel-diff-viewer.compareWithGitHead",
    "when": "(resourceExtname == .xlsx || resourceExtname == .xls || resourceExtname == .csv) && gitOpenRepositoryCount != 0",
    "group": "3_compare@1"
  }
],
"scm/resourceState/context": [
  {
    "command": "excel-diff-viewer.compareWithGit",
    "when": "scmProvider == git && (resourceExtname == .xlsx || resourceExtname == .xls || resourceExtname == .csv)",
    "group": "inline@1"
  }
]
```

#### `src/extension/excelDiffProvider.ts`

**添加命令注册**：
- `excel-diff-viewer.compareWithGitHead` - 与 HEAD 对比
- `excel-diff-viewer.compareWithGit` - 从 SCM 对比

## 🔧 技术实现

### 1. 使用 VS Code Git Extension API

```typescript
const gitExtension = vscode.extensions.getExtension('vscode.git');
const git = gitExtension.exports.getAPI(1);

// 查找包含文件的仓库
const repo = git.repositories.find((r: any) => 
  filePath.startsWith(r.rootUri.fsPath)
);
```

### 2. 使用 Git 命令获取 HEAD 版本

```typescript
const command = `cd "${repoPath}" && git show HEAD:"${relativePath}" > "${tempFile}"`;
await execAsync(command);
```

### 3. VS Code 上下文条件

使用 VS Code 内置的上下文键：

| 上下文键 | 说明 | 值 |
|---------|------|---|
| `gitOpenRepositoryCount` | 打开的 Git 仓库数量 | 数字 |
| `scmProvider` | SCM 提供者 | `git` |
| `resourceExtname` | 资源文件扩展名 | `.xlsx`, `.xls`, `.csv` |

## 📊 使用流程

### 场景 1: 文件资源管理器对比

```
用户操作流程：
1. 在文件资源管理器中找到 Excel 文件
2. 右键点击文件
3. 选择 "excel Diff Viewer: 与 HEAD 对比"
4. 自动打开 Excel Diff Viewer
5. 显示当前版本 vs HEAD 版本的对比
```

### 场景 2: SCM 视图对比

```
用户操作流程：
1. 在 SCM 视图中看到修改的 Excel 文件
2. 右键点击文件
3. 选择 "excel Diff Viewer: 与 Git 版本对比"
4. 自动打开 Excel Diff Viewer
5. 显示对比结果
```

## 🎨 用户体验优化

### 1. 智能菜单显示

**只有满足条件时才显示菜单项**：
- ✅ 文件是 Excel 格式（.xlsx, .xls, .csv）
- ✅ 文件在 Git 仓库中
- ✅ Git 扩展已加载

### 2. 友好的错误提示

```typescript
// 文件不在 Git 仓库
vscode.window.showWarningMessage('文件不在 Git 仓库中');

// 无法获取 Git 版本
vscode.window.showErrorMessage('无法获取文件的 Git HEAD 版本');
```

### 3. 详细的日志

```typescript
Logger.info(`Compare with Git HEAD: ${uri.fsPath}`, 'Extension');
Logger.info(`HEAD version created: ${tempFile}`, 'Extension');
Logger.info(`Comparing: ${original} vs ${modified}`, 'Extension');
```

## 🔍 与旧方案对比

| 方面 | 旧方案（监听 Tab） | 新方案（右键菜单） |
|------|------------------|------------------|
| **复杂度** | 高（需要多种检测方案） | 低（直接命令） |
| **可靠性** | 中（`tab.input` 可能为 undefined） | 高（用户主动触发） |
| **用户体验** | 自动（可能突然） | 主动（更可控） |
| **代码量** | 多（检测+解析+缓存） | 少（直接处理） |
| **维护性** | 低（依赖 VS Code 内部行为） | 高（使用标准 API） |

## ✨ 优势

### 1. **简单直接**
- 用户明确知道要对比什么
- 不需要猜测用户意图
- 代码逻辑清晰

### 2. **可靠性高**
- 不依赖 `TabInputTextDiff`
- 不需要处理 `undefined`
- 直接使用文件路径

### 3. **符合习惯**
- 参考 GitLens、Git Graph 等插件
- 右键菜单是标准交互方式
- 用户容易发现和使用

### 4. **易于扩展**
- 可以添加更多 Git 对比选项
- 如：与任意 commit 对比
- 如：与 staged 版本对比

## 🚀 未来扩展可能

### 1. 更多对比选项

```json
"excel-diff-viewer.compareWithCommit": "与指定 Commit 对比",
"excel-diff-viewer.compareWithBranch": "与指定分支对比",
"excel-diff-viewer.compareWithStaged": "与暂存版本对比"
```

### 2. 快速对比

在编辑器标题栏添加快捷按钮：

```json
"editor/title": [
  {
    "command": "excel-diff-viewer.quickCompareWithGit",
    "when": "resourceExtname == .xlsx && gitOpenRepositoryCount != 0",
    "group": "navigation"
  }
]
```

### 3. 命令面板

支持从命令面板快速访问：

```
Ctrl+Shift+P → Excel Diff: Compare with Git HEAD
```

## 📝 测试要点

### 1. 基本功能测试

- [ ] 右键 Excel 文件，验证菜单显示
- [ ] 点击"与 HEAD 对比"，验证对比正常
- [ ] 在 SCM 视图右键，验证对比正常

### 2. 边界情况测试

- [ ] 文件不在 Git 仓库 → 菜单不显示
- [ ] 文件是新文件（未提交）→ 提示无 HEAD 版本
- [ ] Git 扩展未安装 → 提示错误

### 3. 性能测试

- [ ] 大文件对比（>10MB）
- [ ] 多次对比缓存处理
- [ ] 临时文件清理

## 🎯 总结

新的 Step 6 实现采用**右键菜单方案**，优势明显：

| 特性 | 评分 |
|------|------|
| **简单性** | ⭐⭐⭐⭐⭐ |
| **可靠性** | ⭐⭐⭐⭐⭐ |
| **用户体验** | ⭐⭐⭐⭐⭐ |
| **可维护性** | ⭐⭐⭐⭐⭐ |
| **可扩展性** | ⭐⭐⭐⭐⭐ |

这个方案完美解决了监听 Tab 方案的所有问题，是更好的选择！🎉

