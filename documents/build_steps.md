# Excel Diff Viewer 扩展构建步骤

## 项目概述
实现 Excel 文件的可视化差异对比功能，支持在文件资源管理器中右键对比，以及集成到 VS Code 的 diff 编辑器。
支持Vscode Web

## 开发优先级
1. **高优先级**: Excel 解析和差异比较核心功能
2. **中优先级**: 可视化界面和用户体验
3. **低优先级**: 高级功能和优化

## 注意事项
- 确保支持大文件处理
- 考虑内存使用优化
- 提供清晰的错误信息
- 保持界面响应性
- webview界面需要美观且现代化，布局简洁完整
- 不添加非必要的判断和功能
- 不自动生成文档
- 保持代码、文件、目录结构清晰
- 禁止硬编码html文件
- 需要关注大的excel文件加载优化，可以考虑如流式加载等方案

- 可以参考vscode-diff-viewer-main示例项目里的webpack方案, 输出为extension和webview两个js文件或者其他更优更适合的方案
- 参考示例项目的webview实现方案
- 可以借助现有的一些库方便开发

## 构建步骤

### Step 1: 基础环境搭建
- [x] 创建项目目录结构
- [x] 配置 VS Code 扩展基础框架
- [x] 设置 TypeScript 编译环境
- [x] 配置调试环境

### Step 2: Excel 文件解析工具
- [x] 安装 Excel 解析依赖库 (xlsx, xls)
- [x] 创建 `src/utils/excelReader.ts` - Excel 文件读取工具类
- [x] 实现 Excel 文件内容解析功能
- [x] 支持 xls 和 xlsx 格式
- [x] 创建 Excel 数据结构接口定义

### Step 3: Excel 差异比较算法
- [x] 创建 `src/utils/excelComparator.ts` - Excel 差异比较工具类
- [x] 实现单元格级别的差异检测
- [x] 实现行/列级别的差异检测
- [x] 实现工作表级别的差异检测
- [x] 创建差异结果数据结构

### Step 4: 可视化界面开发
- [x] 创建 `src/webview/index.ts` - 主界面控制器
- [x] 创建 `src/extension/skeleton.ts` - 动态HTML骨架生成器
- [x] 创建 `src/webview/styles/main.css` - 现代化CSS样式文件
- [x] 创建 `src/webview/components/fileSelector.ts` - 文件选择组件
- [x] 创建 `src/webview/components/toolbar.ts` - 工具栏组件
- [x] 创建 `src/webview/components/diffTable.ts` - 差异表格组件
- [x] 实现表格差异高亮显示（渐变背景、动画效果）
- [x] 实现差异导航功能（前后差异跳转）
- [x] 集成到extension.ts中，注册webview提供者
- [x] 现代化UI设计（渐变、阴影、动画、响应式）
- [x] 添加主题切换功能（自动/浅色/深色）
- [x] 添加设置面板（高亮模式、字体大小等）
- [x] 重新设计文件选择界面（专业三栏布局）
  - [x] 顶部菜单栏（文件/编辑/视图/帮助菜单）
  - [x] 左右文件选择区（拖拽支持）
  - [x] 底部状态栏（文件计数、大小、对比按钮）
  - [x] 文件信息详细展示（名称、路径、大小、时间）
- [x] 添加拖拽文件支持
- [x] 添加加载和错误状态的精美展示
- [x] 实现流畅的页面过渡动画
- [x] 移动端响应式优化

### Step 5: 文件资源管理器集成
- [x] 在 `package.json` 中配置右键菜单
- [x] 实现 "选择以对比" 功能
- [x] 实现 "与已选择的文件对比" 功能
- [x] 创建文件选择状态管理
- [x] 实现文件路径验证

### Step 6: VS Code Diff 编辑器集成
- [ ] 配置 diff 编辑器提供者
- [ ] 实现 Excel 文件 diff 内容提供者
- [ ] 集成到 Git diff 功能
- [ ] 处理二进制文件差异显示

### Step 7: 命令和快捷键
- [ ] 添加 "Open Excel Diff Viewer" 命令
- [ ] 添加 "Compare Selected Excel Files" 命令
- [ ] 配置快捷键绑定
- [ ] 添加命令面板集成

### Step 8: 错误处理和用户体验
- [ ] 实现文件格式验证
- [ ] 添加错误提示和用户反馈
- [ ] 实现加载状态指示
- [ ] 添加文件大小限制处理

### Step 9: 测试和优化
- [ ] 创建单元测试
- [ ] 创建集成测试
- [ ] 性能优化
- [ ] 内存泄漏检查

### Step 10: 打包和发布
- [ ] 配置打包脚本
- [ ] 创建发布版本
- [ ] 编写用户文档
- [ ] 发布到 VS Code 市场

## 技术栈
- **后端**: TypeScript, VS Code Extension API
- **Excel 解析**: xlsx, xls 库
- **前端**: HTML, CSS, JavaScript
- **测试**: Mocha, VS Code Test API

## 文件结构（旧）
```
src/
├── extension.ts                 # 主扩展入口
├── utils/
│   ├── excelReader.ts          # Excel 文件读取
│   └── excelComparator.ts      # Excel 差异比较
├── webview/
│   ├── excelDiffViewer.ts      # 界面控制器
│   ├── diffViewer.html         # 界面模板
│   ├── diffViewer.css          # 样式文件
│   └── diffViewer.js           # 前端逻辑
└── test/
    └── extension.test.ts       # 测试文件
```

## 补充修改
### 1. 修改1
- [x] 差异对比菜单增加功能：折叠未改变的区域，仅显示差异行