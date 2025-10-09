# excel-diff-viewer拓展全局描述

## 1. 功能描述
实现excel的可视化差异对比
- 可以实现任意两个excel文件的对比差异
    - 在文件Explorer窗口下，当右键一个excel文件时，提供select to compare by excel diff viewer选项，当已经选中一个时，会出现compare by excel diff viewer选项，点击就会打开对比窗口
- 关联vscode的diffEditor窗口，当git对比excel文件差异时，可以自动使用本插件进行excel对比
- 支持xls，xlsx格式的excel文件