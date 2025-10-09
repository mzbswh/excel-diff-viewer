/**
 * Excel Diff Viewer 前端逻辑
 */

class ExcelDiffViewer {
	constructor() {
		this.state = null;
		this.currentSheetIndex = 0;
		this.currentDiff = null;
		this.navigationIndex = 0;
		this.diffCells = [];
		this.vscode = null;
		this.currentTheme = 'auto';
		this.currentDiffMode = 'unified';
		
		this.init();
	}

	init() {
		// 获取VS Code API
		this.vscode = acquireVsCodeApi();
		
		// 立即显示文件选择界面，不等待状态
		this.showFileSelection();
		
		// 监听来自扩展的消息
		window.addEventListener('message', (event) => {
			const message = event.data;
			switch (message.type) {
				case 'updateState':
					this.updateState(message.state);
					break;
				case 'highlightCell':
					this.highlightCell(message.rowIndex, message.colIndex);
					break;
				case 'fileSelected':
					this.handleFileSelected(message.fileType, message.filePath, message.fileName);
					break;
				case 'error':
					this.showError(message.message);
					break;
			}
		});

		// 等待DOM完全加载后再绑定事件
		if (document.readyState === 'loading') {
			document.addEventListener('DOMContentLoaded', () => {
				this.bindEvents();
				this.initializeSettings();
			});
		} else {
			this.bindEvents();
			this.initializeSettings();
		}
	}

	bindEvents() {
		console.log('Binding events...');
		
		// 文件选择相关事件
		document.addEventListener('click', (event) => {
			console.log('Click event on:', event.target.id);
			
			if (event.target.id === 'select-old-file') {
				this.selectFile('old');
			} else if (event.target.id === 'select-new-file') {
				this.selectFile('new');
			} else if (event.target.id === 'clear-files') {
				this.clearFileSelection();
			} else if (event.target.id === 'start-compare') {
				this.startComparison();
			} else if (event.target.id === 'change-files') {
				this.changeFiles();
			} else if (event.target.id === 'refresh-compare') {
				this.refreshComparison();
			} else if (event.target.id === 'theme-toggle') {
				console.log('Theme toggle clicked');
				this.toggleTheme();
			} else if (event.target.id === 'settings-toggle') {
				console.log('Settings toggle clicked');
				this.toggleSettings();
			} else if (event.target.id === 'close-settings') {
				this.closeSettings();
			} else if (event.target.id === 'reset-settings') {
				this.resetSettings();
			}
		});

		// 设置相关事件
		document.addEventListener('change', (event) => {
			console.log('Change event on:', event.target.id, 'value:', event.target.value);
			
			if (event.target.id === 'diff-mode') {
				this.changeDiffMode(event.target.value);
			} else if (event.target.id === 'theme-select') {
				this.changeTheme(event.target.value);
			} else if (event.target.id === 'highlight-mode') {
				this.changeHighlightMode(event.target.value);
			} else if (event.target.id === 'font-size') {
				this.changeFontSize(event.target.value);
			}
		});

		// 直接绑定特定元素的事件
		const themeToggle = document.getElementById('theme-toggle');
		if (themeToggle) {
			themeToggle.addEventListener('click', () => {
				console.log('Theme toggle direct click');
				this.toggleTheme();
			});
		}

		const settingsToggle = document.getElementById('settings-toggle');
		if (settingsToggle) {
			settingsToggle.addEventListener('click', () => {
				console.log('Settings toggle direct click');
				this.toggleSettings();
			});
		}

		const diffModeSelect = document.getElementById('diff-mode');
		if (diffModeSelect) {
			diffModeSelect.addEventListener('change', (event) => {
				console.log('Diff mode direct change:', event.target.value);
				this.changeDiffMode(event.target.value);
			});
		}
	}

	initializeSettings() {
		console.log('Initializing settings...');
		this.loadSettings();
		this.updateTheme();
		this.updateDiffMode();
	}

	updateState(newState) {
		this.state = newState;
		this.render();
	}

	render() {
		if (!this.state) {
			// 如果没有状态，显示文件选择界面
			this.showFileSelection();
			return;
		}

		const { loading, error, diff, oldFilePath, newFilePath } = this.state;

		// 显示/隐藏文件选择区域
		const fileSelectionEl = document.getElementById('file-selection');
		if (fileSelectionEl) {
			fileSelectionEl.classList.toggle('hidden', !!(diff || loading || error));
		}

		// 显示/隐藏加载状态
		const loadingEl = document.getElementById('loading');
		if (loadingEl) {
			loadingEl.classList.toggle('hidden', !loading);
		}

		// 显示/隐藏错误状态
		const errorEl = document.getElementById('error');
		if (errorEl) {
			const errorMessageEl = errorEl.querySelector('.error-message');
			if (errorMessageEl) {
				errorMessageEl.textContent = error || '';
			}
			errorEl.classList.toggle('hidden', !error);
		}

		// 显示/隐藏差异内容
		const diffContentEl = document.getElementById('diff-content');
		if (diffContentEl) {
			diffContentEl.classList.toggle('hidden', !diff || loading || error);
		}

		if (diff) {
			this.currentDiff = diff;
			this.renderFileInfo(oldFilePath, newFilePath);
			this.renderSummary(diff.summary);
			this.renderTabs(diff.sheetDiffs);
			this.renderCurrentSheet();
		}
	}

	renderFileInfo(oldFilePath, newFilePath) {
		const oldPathEl = document.querySelector('.file-old .file-path');
		const newPathEl = document.querySelector('.file-new .file-path');
		
		if (oldPathEl) {oldPathEl.textContent = this.getFileName(oldFilePath);}
		if (newPathEl) {newPathEl.textContent = this.getFileName(newFilePath);}
	}

	renderSummary(summary) {
		const addedEl = document.querySelector('.summary-item.added .summary-value');
		const removedEl = document.querySelector('.summary-item.removed .summary-value');
		const modifiedEl = document.querySelector('.summary-item.modified .summary-value');
		
		if (addedEl) {addedEl.textContent = summary.totalAddedCells || 0;}
		if (removedEl) {removedEl.textContent = summary.totalRemovedCells || 0;}
		if (modifiedEl) {modifiedEl.textContent = summary.totalModifiedCells || 0;}
	}

	renderTabs(sheetDiffs) {
		const tabListEl = document.querySelector('.tab-list');
		if (!tabListEl) {return;}

		tabListEl.innerHTML = '';

		sheetDiffs.forEach((sheetDiff, index) => {
			const tabEl = document.createElement('div');
			tabEl.className = `tab-item ${sheetDiff.type}`;
			tabEl.textContent = sheetDiff.sheetName;
			
			// 添加徽章显示差异数量
			const badge = this.createBadge(sheetDiff);
			if (badge) {
				tabEl.appendChild(badge);
			}

			tabEl.addEventListener('click', () => {
				this.switchToSheet(index);
			});

			tabListEl.appendChild(tabEl);
		});

		// 激活第一个标签
		if (sheetDiffs.length > 0) {
			this.switchToSheet(0);
		}
	}

	createBadge(sheetDiff) {
		const { addedCells, removedCells, modifiedCells } = sheetDiff.summary;
		const totalChanges = addedCells + removedCells + modifiedCells;
		
		if (totalChanges === 0) {return null;}

		const badge = document.createElement('span');
		badge.className = 'tab-badge';
		badge.textContent = totalChanges;
		return badge;
	}

	switchToSheet(index) {
		// 更新标签状态
		document.querySelectorAll('.tab-item').forEach((tab, i) => {
			tab.classList.toggle('active', i === index);
		});

		this.currentSheetIndex = index;
		this.renderCurrentSheet();
	}

	renderCurrentSheet() {
		if (!this.currentDiff) {return;}

		const sheetDiff = this.currentDiff.sheetDiffs[this.currentSheetIndex];
		if (!sheetDiff) {return;}

		const tabContentEl = document.querySelector('.tab-content');
		if (!tabContentEl) {return;}

		// 收集所有差异单元格用于导航
		this.diffCells = [];
		sheetDiff.rowDiffs.forEach(rowDiff => {
			rowDiff.cellDiffs.forEach(cellDiff => {
				if (cellDiff.type !== 'unchanged') {
					this.diffCells.push({
						rowIndex: cellDiff.rowIndex,
						colIndex: cellDiff.colIndex,
						type: cellDiff.type
					});
				}
			});
		});

		// 渲染表格
		tabContentEl.innerHTML = this.createDiffTable(sheetDiff);
		
		// 添加导航控件
		this.addNavigationControls(tabContentEl);
	}

	createDiffTable(sheetDiff) {
		const { rowDiffs } = sheetDiff;
		if (rowDiffs.length === 0) {
			return '<div class="text-center">工作表为空</div>';
		}

		// 计算最大列数
		const maxCols = Math.max(...rowDiffs.map(row => 
			Math.max(
				row.oldRow?.cells?.length || 0,
				row.newRow?.cells?.length || 0
			)
		));

		let html = '<table class="diff-table">';
		
		// 表头
		html += '<thead><tr>';
		html += '<th class="row-number">行</th>';
		for (let col = 0; col < maxCols; col++) {
			html += `<th>${this.getColumnName(col)}</th>`;
		}
		html += '</tr></thead>';

		// 表格内容
		html += '<tbody>';
		rowDiffs.forEach((rowDiff, rowIndex) => {
			html += this.createTableRow(rowDiff, rowIndex, maxCols);
		});
		html += '</tbody>';

		html += '</table>';
		return html;
	}

	createTableRow(rowDiff, rowIndex, maxCols) {
		const { type, cellDiffs, oldRow, newRow } = rowDiff;
		
		let html = `<tr class="row-${type}">`;
		
		// 行号
		html += `<td class="row-number">${rowIndex + 1}</td>`;
		
		// 单元格
		for (let col = 0; col < maxCols; col++) {
			const cellDiff = cellDiffs.find(cell => cell.colIndex === col);
			html += this.createTableCell(cellDiff, col, oldRow, newRow);
		}
		
		html += '</tr>';
		return html;
	}

	createTableCell(cellDiff, colIndex, oldRow, newRow) {
		if (!cellDiff) {
			return '<td class="cell-unchanged"></td>';
		}

		const { type, oldValue, newValue, oldType, newType } = cellDiff;
		const cellClass = `cell-${type}`;
		
		let content = '';
		if (type === 'modified') {
			content = `
				<div class="cell-content">
					<div class="cell-old-value">${this.formatCellValue(oldValue, oldType)}</div>
					<div class="cell-new-value">${this.formatCellValue(newValue, newType)}</div>
				</div>
			`;
		} else if (type === 'added') {
			content = `<div class="cell-content"><div class="cell-new-value">${this.formatCellValue(newValue, newType)}</div></div>`;
		} else if (type === 'removed') {
			content = `<div class="cell-content"><div class="cell-old-value">${this.formatCellValue(oldValue, oldType)}</div></div>`;
		} else {
			content = `<div class="cell-content"><div class="cell-value">${this.formatCellValue(newValue || oldValue, newType || oldType)}</div></div>`;
		}

		return `<td class="${cellClass}" data-row="${cellDiff.rowIndex}" data-col="${colIndex}">${content}</td>`;
	}

	formatCellValue(value, type) {
		if (value === null || value === undefined) {return '';}
		
		if (type === 'number') {
			return typeof value === 'number' ? value.toString() : value;
		}
		
		if (type === 'date') {
			return value instanceof Date ? value.toLocaleDateString() : value;
		}
		
		return String(value);
	}

	getColumnName(index) {
		let result = '';
		while (index >= 0) {
			result = String.fromCharCode(65 + (index % 26)) + result;
			index = Math.floor(index / 26) - 1;
		}
		return result;
	}

	addNavigationControls(container) {
		if (this.diffCells.length === 0) {return;}

		const controlsEl = document.createElement('div');
		controlsEl.className = 'navigation-controls';
		controlsEl.innerHTML = `
			<button class="nav-button" id="prev-diff" title="上一个差异">‹</button>
			<button class="nav-button" id="next-diff" title="下一个差异">›</button>
		`;

		container.appendChild(controlsEl);

		// 绑定导航事件
		document.getElementById('prev-diff').addEventListener('click', () => {
			this.navigateToPrevious();
		});

		document.getElementById('next-diff').addEventListener('click', () => {
			this.navigateToNext();
		});

		// 更新导航按钮状态
		this.updateNavigationButtons();
	}

	navigateToPrevious() {
		if (this.diffCells.length === 0) {return;}
		
		this.navigationIndex = (this.navigationIndex - 1 + this.diffCells.length) % this.diffCells.length;
		this.highlightCurrentDiff();
	}

	navigateToNext() {
		if (this.diffCells.length === 0) {return;}
		
		this.navigationIndex = (this.navigationIndex + 1) % this.diffCells.length;
		this.highlightCurrentDiff();
	}

	highlightCurrentDiff() {
		// 清除之前的高亮
		document.querySelectorAll('.diff-table td').forEach(cell => {
			cell.classList.remove('highlighted');
		});

		// 高亮当前差异单元格
		const currentDiff = this.diffCells[this.navigationIndex];
		if (currentDiff) {
			const cell = document.querySelector(`td[data-row="${currentDiff.rowIndex}"][data-col="${currentDiff.colIndex}"]`);
			if (cell) {
				cell.classList.add('highlighted');
				cell.scrollIntoView({ behavior: 'smooth', block: 'center' });
			}
		}

		this.updateNavigationButtons();
	}

	updateNavigationButtons() {
		const prevBtn = document.getElementById('prev-diff');
		const nextBtn = document.getElementById('next-diff');
		
		if (prevBtn) {prevBtn.disabled = this.diffCells.length === 0;}
		if (nextBtn) {nextBtn.disabled = this.diffCells.length === 0;}
	}

	highlightCell(rowIndex, colIndex) {
		const cell = document.querySelector(`td[data-row="${rowIndex}"][data-col="${colIndex}"]`);
		if (cell) {
			// 清除之前的高亮
			document.querySelectorAll('.diff-table td').forEach(c => {
				c.classList.remove('highlighted');
			});
			
			// 高亮指定单元格
			cell.classList.add('highlighted');
			cell.scrollIntoView({ behavior: 'smooth', block: 'center' });
		}
	}

	getFileName(filePath) {
		return filePath ? filePath.split('/').pop() || filePath : '';
	}

	// 文件选择相关方法
	selectFile(fileType) {
		this.postMessage({
			type: 'selectFile',
			fileType: fileType
		});
	}

	handleFileSelected(fileType, filePath, fileName) {
		const panel = document.getElementById(`${fileType}-file-panel`);
		const fileInfo = document.getElementById(`${fileType}-file-info`);
		const fileNameEl = document.getElementById(`${fileType}-file-name`);
		const filePathEl = document.getElementById(`${fileType}-file-path`);
		const description = panel.querySelector('.file-panel-description');

		// 更新文件信息
		fileNameEl.textContent = fileName;
		filePathEl.textContent = filePath;

		// 显示文件信息，隐藏描述
		fileInfo.classList.remove('hidden');
		description.classList.add('hidden');

		// 更新面板样式
		panel.classList.add('has-file');
		panel.querySelector('.file-panel-icon').textContent = '✅';

		// 更新开始对比按钮状态
		this.updateCompareButton();
	}

	clearFileSelection() {
		['old', 'new'].forEach(fileType => {
			const panel = document.getElementById(`${fileType}-file-panel`);
			const fileInfo = document.getElementById(`${fileType}-file-info`);
			const description = panel.querySelector('.file-panel-description');

			// 隐藏文件信息，显示描述
			fileInfo.classList.add('hidden');
			description.classList.remove('hidden');

			// 重置面板样式
			panel.classList.remove('has-file');
			panel.querySelector('.file-panel-icon').textContent = '📄';
		});

		this.updateCompareButton();
	}

	updateCompareButton() {
		const startCompareBtn = document.getElementById('start-compare');
		const oldFileInfo = document.getElementById('old-file-info');
		const newFileInfo = document.getElementById('new-file-info');
		
		const canCompare = !oldFileInfo.classList.contains('hidden') && !newFileInfo.classList.contains('hidden');
		
		startCompareBtn.disabled = !canCompare;
		startCompareBtn.textContent = canCompare ? '开始对比' : '请选择两个文件';
	}

	startComparison() {
		const oldFilePath = document.getElementById('old-file-path')?.textContent;
		const newFilePath = document.getElementById('new-file-path')?.textContent;

		if (!oldFilePath || !newFilePath) {
			return;
		}

		this.postMessage({
			type: 'startComparison',
			oldFilePath: oldFilePath,
			newFilePath: newFilePath
		});
	}

	changeFiles() {
		this.postMessage({
			type: 'changeFiles'
		});
	}

	refreshComparison() {
		this.postMessage({
			type: 'refresh'
		});
	}

	showError(message) {
		const errorEl = document.getElementById('error');
		const errorMessageEl = document.querySelector('.error-message');
		
		if (errorEl && errorMessageEl) {
			errorMessageEl.textContent = message;
			errorEl.classList.remove('hidden');
		}
	}

	showFileSelection() {
		// 显示文件选择界面
		const fileSelectionEl = document.getElementById('file-selection');
		const loadingEl = document.getElementById('loading');
		const errorEl = document.getElementById('error');
		const diffContentEl = document.getElementById('diff-content');

		if (fileSelectionEl) fileSelectionEl.classList.remove('hidden');
		if (loadingEl) loadingEl.classList.add('hidden');
		if (errorEl) errorEl.classList.add('hidden');
		if (diffContentEl) diffContentEl.classList.add('hidden');

		// 重置文件选择状态
		this.clearFileSelection();
	}

	// 主题和设置相关方法
	toggleTheme() {
		const themes = ['auto', 'light', 'dark'];
		const currentIndex = themes.indexOf(this.currentTheme);
		const nextIndex = (currentIndex + 1) % themes.length;
		this.changeTheme(themes[nextIndex]);
	}

	changeTheme(theme) {
		console.log('Changing theme to:', theme);
		this.currentTheme = theme;
		this.updateTheme();
		this.saveSettings();
	}

	updateTheme() {
		const container = document.getElementById('excel-diff-container');
		const themeIcon = document.querySelector('.theme-icon');
		
		console.log('Updating theme:', this.currentTheme);
		console.log('Container found:', !!container);
		console.log('Theme icon found:', !!themeIcon);
		
		if (container) {
			if (this.currentTheme === 'auto') {
				container.removeAttribute('data-theme');
				if (themeIcon) themeIcon.textContent = '🌓';
			} else {
				container.setAttribute('data-theme', this.currentTheme);
				if (themeIcon) {
					themeIcon.textContent = this.currentTheme === 'dark' ? '☀️' : '🌙';
				}
			}
		}
		
		// 更新设置面板中的选择
		const themeSelect = document.getElementById('theme-select');
		if (themeSelect) {
			themeSelect.value = this.currentTheme;
		}
	}

	toggleSettings() {
		const settingsPanel = document.getElementById('settings-panel');
		settingsPanel.classList.toggle('hidden');
	}

	closeSettings() {
		const settingsPanel = document.getElementById('settings-panel');
		settingsPanel.classList.add('hidden');
	}

	changeDiffMode(mode) {
		console.log('Changing diff mode to:', mode);
		this.currentDiffMode = mode;
		this.updateDiffMode();
		this.saveSettings();
	}

	updateDiffMode() {
		console.log('Updating diff mode to:', this.currentDiffMode);
		
		// 隐藏所有视图
		const allViews = document.querySelectorAll('.diff-view');
		console.log('Found diff views:', allViews.length);
		
		allViews.forEach(view => {
			view.classList.add('hidden');
		});

		// 显示选中的视图
		const targetView = document.getElementById(`${this.currentDiffMode}-view`);
		console.log('Target view found:', !!targetView);
		
		if (targetView) {
			targetView.classList.remove('hidden');
		}

		// 更新工具栏中的选择
		const diffModeSelect = document.getElementById('diff-mode');
		if (diffModeSelect) {
			diffModeSelect.value = this.currentDiffMode;
		}
	}

	changeHighlightMode(mode) {
		// 实现高亮模式切换
		document.body.setAttribute('data-highlight-mode', mode);
		this.saveSettings();
	}

	changeFontSize(size) {
		// 实现字体大小切换
		const sizeMap = {
			'small': '0.8rem',
			'medium': '1rem',
			'large': '1.2rem'
		};
		document.documentElement.style.setProperty('--base-font-size', sizeMap[size]);
		this.saveSettings();
	}

	loadSettings() {
		// 从localStorage加载设置
		const settings = JSON.parse(localStorage.getItem('excelDiffViewerSettings') || '{}');
		this.currentTheme = settings.theme || 'auto';
		this.currentDiffMode = settings.diffMode || 'unified';
		
		// 应用设置（确保DOM元素存在）
		const themeSelect = document.getElementById('theme-select');
		const diffModeSelect = document.getElementById('diff-mode');
		const highlightModeSelect = document.getElementById('highlight-mode');
		const fontSizeSelect = document.getElementById('font-size');
		
		if (themeSelect) themeSelect.value = this.currentTheme;
		if (diffModeSelect) diffModeSelect.value = this.currentDiffMode;
		if (highlightModeSelect) highlightModeSelect.value = settings.highlightMode || 'enhanced';
		if (fontSizeSelect) fontSizeSelect.value = settings.fontSize || 'medium';
	}

	saveSettings() {
		// 保存设置到localStorage
		const highlightModeSelect = document.getElementById('highlight-mode');
		const fontSizeSelect = document.getElementById('font-size');
		
		const settings = {
			theme: this.currentTheme,
			diffMode: this.currentDiffMode,
			highlightMode: highlightModeSelect ? highlightModeSelect.value : 'enhanced',
			fontSize: fontSizeSelect ? fontSizeSelect.value : 'medium'
		};
		localStorage.setItem('excelDiffViewerSettings', JSON.stringify(settings));
	}

	resetSettings() {
		// 重置设置
		localStorage.removeItem('excelDiffViewerSettings');
		this.currentTheme = 'auto';
		this.currentDiffMode = 'unified';
		this.loadSettings();
		this.updateTheme();
		this.updateDiffMode();
	}

	postMessage(message) {
		// 发送消息给VS Code扩展
		if (this.vscode) {
			this.vscode.postMessage(message);
		} else {
			// 如果VS Code API不可用，显示错误信息
			this.showError('VS Code API not available');
		}
	}
}

// 初始化应用
document.addEventListener('DOMContentLoaded', () => {
	new ExcelDiffViewer();
});

// 如果页面已经加载完成，立即初始化
if (document.readyState === 'loading') {
	document.addEventListener('DOMContentLoaded', () => {
		new ExcelDiffViewer();
	});
} else {
	new ExcelDiffViewer();
}
