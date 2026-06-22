/**
 * 批量模板覆盖工具 - 主入口
 */
import { loadImage, renderThumbnail, composite, checkSizeMismatch, renderBlobToCanvas } from './engine.js';
import { generateFilename, generatePreview, downloadBlob, blobToUint8Array, getExtension } from './utils.js';
import JSZip from 'jszip';

// ===== 状态 =====
const state = {
  template: null,       // { img, w, h }
  targets: [],          // [{ file, img, w, h, name }]
  results: [],          // [{ blob, name }]
  mismatchConfirmed: false,
};

// ===== DOM 引用 =====
const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => document.querySelectorAll(sel);

const dom = {
  themeToggle: $('#themeToggle'),
  templateUploadArea: $('#templateUploadArea'),
  templateInput: $('#templateInput'),
  templatePreview: $('#templatePreview'),
  templateCanvas: $('#templateCanvas'),
  templateSize: $('#templateSize'),
  removeTemplate: $('#removeTemplate'),
  targetUploadArea: $('#targetUploadArea'),
  targetInput: $('#targetInput'),
  targetList: $('#targetList'),
  targetCount: $('#targetCount'),
  targetGrid: $('#targetGrid'),
  targetGridWrapper: $('#targetGridWrapper'),
  targetExpandBtn: $('#targetExpandBtn'),
  targetToggle: $('#targetToggle'),
  targetArrow: $('#targetArrow'),
  targetBody: $('#targetBody'),
  clearTargets: $('#clearTargets'),
  sizeWarnings: $('#sizeWarnings'),
  previewSection: $('#previewSection'),
  previewToggle: $('#previewToggle'),
  previewArrow: $('#previewArrow'),
  previewBody: $('#previewBody'),
  resultGrid: $('#resultGrid'),
  resultGridWrapper: $('#resultGridWrapper'),
  resultExpandBtn: $('#resultExpandBtn'),
  processBtn: $('#processBtn'),
  downloadBtn: $('#downloadBtn'),
  // 进度条 & toast
  progressContainer: $('#progressContainer'),
  progressFill: $('#progressFill'),
  progressText: $('#progressText'),
  toastContainer: $('#toastContainer'),
  // 设置
  outputFormat: $('#outputFormat'),
  qualityRow: $('#qualityRow'),
  qualitySlider: $('#qualitySlider'),
  qualityValue: $('#qualityValue'),
  namePrefix: $('#namePrefix'),
  nameSuffix: $('#nameSuffix'),
  nameStart: $('#nameStart'),
  renamePreview: $('#renamePreview'),
  borderToggle: $('#borderToggle'),
  borderOptions: $('#borderOptions'),
  borderColor: $('#borderColor'),
  borderWidth: $('#borderWidth'),
  borderRadius: $('#borderRadius'),
};

// ===== 折叠/展开 =====
function toggleCollapse(body, arrow) {
  const collapsed = body.classList.contains('collapsed');
  if (collapsed) {
    body.classList.remove('collapsed');
    arrow.classList.add('expanded');
  } else {
    body.classList.add('collapsed');
    arrow.classList.remove('expanded');
  }
}

function collapseSection(body, arrow) {
  body.classList.add('collapsed');
  arrow.classList.remove('expanded');
}

// ===== Grid 行折叠 =====
/**
 * 初始化 grid 行折叠：默认只展示一行，超出部分折叠
 * @param {HTMLElement} wrapper - grid 包装器
 * @param {HTMLElement} grid - grid 容器
 * @param {HTMLElement} expandBtn - 展开按钮
 */
function initGridClamp(wrapper, grid, expandBtn) {
  const items = grid.children;
  if (items.length === 0) {
    wrapper.classList.remove('collapsed-rows');
    expandBtn.classList.add('hidden');
    return;
  }

  // 等待布局完成后再测量
  requestAnimationFrame(() => {
    const firstItem = items[0];
    const firstHeight = firstItem.offsetHeight;
    const gridStyle = getComputedStyle(grid);
    const rowGap = parseFloat(gridStyle.rowGap) || parseFloat(gridStyle.gap) || 0;

    // 一行的最大高度 = 一个 item 的高度 + 可能的边框/内边距
    const oneRowHeight = firstHeight + rowGap + 4; // 4px 缓冲

    // 计算所有行需要的总高度（用于判断是否需要折叠）
    const containerWidth = wrapper.clientWidth;
    const itemsPerRow = estimateItemsPerRow(grid, containerWidth);
    const totalRows = Math.ceil(items.length / itemsPerRow);

    if (totalRows <= 1) {
      // 只有一行，不需要折叠
      wrapper.classList.remove('collapsed-rows');
      wrapper.style.maxHeight = '';
      expandBtn.classList.add('hidden');
    } else {
      wrapper.style.maxHeight = oneRowHeight + 'px';
      wrapper.classList.add('collapsed-rows');
      expandBtn.classList.remove('hidden');
      updateExpandBtn(expandBtn, true);
    }
  });
}

/**
 * 估算每行 item 数量
 */
function estimateItemsPerRow(grid, containerWidth) {
  const gridStyle = getComputedStyle(grid);
  const colGap = parseFloat(gridStyle.columnGap) || parseFloat(gridStyle.gap) || 0;
  // 从 grid-template-columns 中提取 min 值
  const templateCols = gridStyle.gridTemplateColumns;
  const match = templateCols.match(/minmax\((\d+)px/);
  const minColWidth = match ? parseInt(match[1]) : 150;
  return Math.max(1, Math.floor((containerWidth + colGap) / (minColWidth + colGap)));
}

/**
 * 切换 grid 行折叠状态
 */
function toggleGridRows(wrapper, grid, expandBtn) {
  const collapsed = wrapper.classList.contains('collapsed-rows');
  if (collapsed) {
    wrapper.classList.remove('collapsed-rows');
    wrapper.style.maxHeight = grid.scrollHeight + 'px';
    updateExpandBtn(expandBtn, false);
  } else {
    wrapper.classList.add('collapsed-rows');
    // 重新计算一行高度
    const items = grid.children;
    if (items.length > 0) {
      const firstHeight = items[0].offsetHeight;
      const gridStyle = getComputedStyle(grid);
      const rowGap = parseFloat(gridStyle.rowGap) || parseFloat(gridStyle.gap) || 0;
      wrapper.style.maxHeight = (firstHeight + rowGap + 4) + 'px';
    }
    updateExpandBtn(expandBtn, true);
  }
}

/**
 * 更新展开按钮的文字和箭头
 */
function updateExpandBtn(btn, collapsed) {
  if (collapsed) {
    btn.innerHTML = '展开全部 <span class="expand-arrow"></span>';
    btn.classList.remove('expanded');
  } else {
    btn.innerHTML = '收起 <span class="expand-arrow"></span>';
    btn.classList.add('expanded');
  }
}

// ===== Toast 通知 =====
function showToast(message, duration = 5000) {
  const toast = document.createElement('div');
  toast.className = 'toast';
  toast.textContent = message;
  // 动态设置退出动画延迟，与 duration 联动
  toast.style.animationDelay = '0s, ' + (duration / 1000) + 's';
  dom.toastContainer.appendChild(toast);

  setTimeout(() => {
    if (toast.parentNode) {
      toast.remove();
    }
  }, duration + 500);
}

// ===== 进度条 =====
function showProgress() {
  dom.progressContainer.classList.remove('hidden');
  dom.progressFill.style.width = '0%';
  dom.progressText.textContent = '处理中...';
}

function updateProgress(current, total) {
  const pct = Math.round((current / total) * 100);
  dom.progressFill.style.width = pct + '%';
  dom.progressText.textContent = `处理中... ${current}/${total}`;
}

function hideProgress() {
  dom.progressContainer.classList.add('hidden');
}

// ===== 主题切换 =====
function initTheme() {
  const saved = localStorage.getItem('theme') || 'light';
  applyTheme(saved);

  dom.themeToggle.addEventListener('click', () => {
    const current = document.documentElement.getAttribute('data-theme') || 'light';
    const next = current === 'dark' ? 'light' : 'dark';
    applyTheme(next);
    localStorage.setItem('theme', next);
  });
}

function applyTheme(theme) {
  if (theme === 'dark') {
    document.documentElement.setAttribute('data-theme', 'dark');
    dom.themeToggle.textContent = '浅色模式';
  } else {
    document.documentElement.removeAttribute('data-theme');
    dom.themeToggle.textContent = '深色模式';
  }
}

// ===== 上传处理 =====
function setupUpload(area, input, handler, isMultiple = false) {
  // 点击上传
  area.addEventListener('click', (e) => {
    if (e.target === input || e.target.closest('.target-item-remove')) return;
    input.click();
  });

  input.addEventListener('change', (e) => {
    const files = Array.from(e.target.files);
    if (files.length > 0) {
      handler(files);
    }
    input.value = '';
  });

  // 拖拽上传
  area.addEventListener('dragover', (e) => {
    e.preventDefault();
    area.classList.add('drag-over');
  });

  area.addEventListener('dragleave', () => {
    area.classList.remove('drag-over');
  });

  area.addEventListener('drop', (e) => {
    e.preventDefault();
    area.classList.remove('drag-over');
    const files = Array.from(e.dataTransfer.files).filter(f => f.type.startsWith('image/'));
    if (files.length > 0) {
      if (isMultiple) {
        handler(files);
      } else {
        handler([files[0]]);
      }
    }
  });
}

// ===== 模板上传 =====
async function handleTemplate(files) {
  const file = files[0];
  try {
    const { img, w, h } = await loadImage(file);
    state.template = { img, w, h };
    state.mismatchConfirmed = false;
    state.results = [];

    renderThumbnail(img, dom.templateCanvas, 200, 150);
    dom.templateSize.textContent = `${w} x ${h}`;
    dom.templatePreview.classList.remove('hidden');
    dom.templateUploadArea.classList.add('hidden');

    checkAllSizes();
    updateButtons();
    updateRenamePreview();
  } catch (err) {
    alert('模板图片加载失败: ' + err.message);
  }
}

dom.removeTemplate.addEventListener('click', (e) => {
  e.stopPropagation();
  state.template = null;
  state.mismatchConfirmed = false;
  state.results = [];
  dom.templatePreview.classList.add('hidden');
  dom.templateUploadArea.classList.remove('hidden');
  dom.sizeWarnings.innerHTML = '';
  dom.previewSection.classList.add('hidden');
  dom.resultGrid.innerHTML = '';
  updateButtons();
});

// ===== 目标图片上传 =====
async function handleTargets(files) {
  for (const file of files) {
    try {
      const { img, w, h } = await loadImage(file);
      state.targets.push({ file, img, w, h, name: file.name });
    } catch (err) {
      console.error('图片加载失败:', file.name, err);
    }
  }
  state.results = [];
  dom.previewSection.classList.add('hidden');
  dom.resultGrid.innerHTML = '';
  renderTargetList();
  checkAllSizes();
  updateButtons();
  showToast('目标文件已上传');
}

function renderTargetList() {
  if (state.targets.length === 0) {
    dom.targetList.classList.add('hidden');
    return;
  }

  dom.targetList.classList.remove('hidden');
  dom.targetCount.textContent = `${state.targets.length} 张图片`;
  dom.targetGrid.innerHTML = '';

  state.targets.forEach((t, idx) => {
    const item = document.createElement('div');
    item.className = 'target-item';

    const canvas = document.createElement('canvas');
    renderThumbnail(t.img, canvas, 200, 150);

    const info = document.createElement('div');
    info.className = 'target-item-info';
    info.textContent = `${t.w}x${t.h}`;
    info.title = t.name;

    const removeBtn = document.createElement('button');
    removeBtn.className = 'target-item-remove';
    removeBtn.textContent = 'x';
    removeBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      state.targets.splice(idx, 1);
      state.results = [];
      dom.previewSection.classList.add('hidden');
      dom.resultGrid.innerHTML = '';
      renderTargetList();
      checkAllSizes();
      updateButtons();
    });

    item.appendChild(canvas);
    item.appendChild(info);
    item.appendChild(removeBtn);
    dom.targetGrid.appendChild(item);
  });

  // 默认折叠
  collapseSection(dom.targetBody, dom.targetArrow);
  initGridClamp(dom.targetGridWrapper, dom.targetGrid, dom.targetExpandBtn);
}

dom.clearTargets.addEventListener('click', () => {
  state.targets = [];
  state.results = [];
  dom.previewSection.classList.add('hidden');
  dom.resultGrid.innerHTML = [];
  renderTargetList();
  checkAllSizes();
  updateButtons();
});

// ===== 尺寸检测 =====
function checkAllSizes() {
  if (!state.template || state.targets.length === 0) {
    dom.sizeWarnings.innerHTML = '';
    return;
  }

  const targetSizes = state.targets.map(t => ({ w: t.w, h: t.h, name: t.name }));
  const mismatches = checkSizeMismatch({ w: state.template.w, h: state.template.h }, targetSizes);

  if (mismatches.length > 0 && !state.mismatchConfirmed) {
    renderWarnings(mismatches);
  } else if (state.mismatchConfirmed) {
    // 已确认缩放，显示提示
    dom.sizeWarnings.innerHTML = '';
    if (mismatches.length > 0) {
      const info = document.createElement('div');
      info.className = 'warning-item';
      info.style.background = 'var(--success-bg)';
      info.style.borderColor = 'transparent';
      info.style.color = 'var(--success-text)';
      info.textContent = `${mismatches.length} 张图片尺寸不一致，将自动拉伸/缩放到模板尺寸 (${state.template.w}x${state.template.h})`;
      dom.sizeWarnings.appendChild(info);
    }
  } else {
    dom.sizeWarnings.innerHTML = '';
  }

  // 标记目标列表中不匹配的项
  const items = dom.targetGrid.querySelectorAll('.target-item');
  items.forEach((item, idx) => {
    const target = state.targets[idx];
    if (target && state.template &&
        (target.w !== state.template.w || target.h !== state.template.h)) {
      item.classList.add('mismatch');
    } else {
      item.classList.remove('mismatch');
    }
  });
}

function renderWarnings(mismatches) {
  dom.sizeWarnings.innerHTML = '';

  const container = document.createElement('div');
  container.className = 'warning-item';
  container.style.flexDirection = 'column';
  container.style.alignItems = 'flex-start';
  container.style.gap = '8px';

  const text = document.createElement('span');
  const count = mismatches.length;
  const list = mismatches.slice(0, 3).map(m => `${m.name} (${m.tw}x${m.th} != ${m.sw}x${m.sh})`).join('，');
  const extra = mismatches.length > 3 ? ` 等 ${count} 张` : '';
  text.textContent = `以下 ${count} 张图片尺寸与模板不一致: ${list}${extra}`;
  container.appendChild(text);

  const btnRow = document.createElement('div');
  btnRow.style.display = 'flex';
  btnRow.style.gap = '8px';

  const confirmBtn = document.createElement('button');
  confirmBtn.className = 'btn btn-sm';
  confirmBtn.style.background = 'var(--accent)';
  confirmBtn.style.color = 'var(--btn-primary-text)';
  confirmBtn.style.border = 'none';
  confirmBtn.textContent = '确认自动缩放';
  confirmBtn.addEventListener('click', () => {
    state.mismatchConfirmed = true;
    checkAllSizes();
    updateButtons();
  });

  const cancelBtn = document.createElement('button');
  cancelBtn.className = 'btn btn-sm btn-outline';
  cancelBtn.textContent = '忽略';
  cancelBtn.addEventListener('click', () => {
    dom.sizeWarnings.innerHTML = '';
    updateButtons();
  });

  btnRow.appendChild(confirmBtn);
  btnRow.appendChild(cancelBtn);
  container.appendChild(btnRow);
  dom.sizeWarnings.appendChild(container);
}

// ===== 设置联动 =====
function initSettings() {
  // 输出格式切换 -> 显示/隐藏质量滑块
  dom.outputFormat.addEventListener('change', () => {
    const fmt = dom.outputFormat.value;
    dom.qualityRow.classList.toggle('hidden', fmt === 'image/png');
    updateRenamePreview();
  });

  // 质量滑块
  dom.qualitySlider.addEventListener('input', () => {
    dom.qualityValue.textContent = dom.qualitySlider.value + '%';
  });

  // 边框开关
  dom.borderToggle.addEventListener('change', () => {
    dom.borderOptions.classList.toggle('hidden', !dom.borderToggle.checked);
  });

  // 重命名预览实时更新
  [dom.namePrefix, dom.nameSuffix, dom.nameStart].forEach(el => {
    el.addEventListener('input', updateRenamePreview);
  });
}

function updateRenamePreview() {
  const preview = generatePreview({
    prefix: dom.namePrefix.value,
    suffix: dom.nameSuffix.value,
    start: parseInt(dom.nameStart.value) || 1,
    format: dom.outputFormat.value,
  });
  dom.renamePreview.textContent = '示例: ' + preview;
}

function getSettings() {
  const format = dom.outputFormat.value;
  const quality = parseInt(dom.qualitySlider.value) / 100;
  const borderEnabled = dom.borderToggle.checked;

  return {
    format,
    quality,
    border: borderEnabled ? {
      color: dom.borderColor.value,
      width: parseInt(dom.borderWidth.value) || 0,
      radius: parseInt(dom.borderRadius.value) || 0,
    } : null,
    rename: {
      prefix: dom.namePrefix.value,
      suffix: dom.nameSuffix.value,
      start: parseInt(dom.nameStart.value) || 1,
    },
  };
}

// ===== 处理图片 =====
async function processImages() {
  if (!state.template || state.targets.length === 0) return;

  const settings = getSettings();
  const results = [];

  // 检查尺寸不匹配且未确认
  const targetSizes = state.targets.map(t => ({ w: t.w, h: t.h, name: t.name }));
  const mismatches = checkSizeMismatch({ w: state.template.w, h: state.template.h }, targetSizes);
  if (mismatches.length > 0 && !state.mismatchConfirmed) {
    alert('存在尺寸不一致的图片，请先确认自动缩放或忽略警告。');
    return;
  }

  showProgress();

  for (let i = 0; i < state.targets.length; i++) {
    const target = state.targets[i];
    const blob = await composite(target.img, state.template.img, {
      format: settings.format,
      quality: settings.quality,
      border: settings.border,
    });

    const filename = generateFilename({
      ...settings.rename,
      index: i,
      total: state.targets.length,
      format: settings.format,
    });

    results.push({ blob, name: filename });
    updateProgress(i + 1, state.targets.length);
  }

  hideProgress();
  state.results = results;
  renderResults();
  updateButtons();
  showToast('文件已处理完成');
}

function renderResults() {
  dom.previewSection.classList.remove('hidden');
  dom.resultGrid.innerHTML = '';

  const promises = state.results.map(async (result) => {
    const item = document.createElement('div');
    item.className = 'result-item';

    const canvas = document.createElement('canvas');
    await renderBlobToCanvas(result.blob, canvas, 300, 225);

    const info = document.createElement('div');
    info.className = 'result-item-info';
    info.textContent = result.name;

    item.appendChild(canvas);
    item.appendChild(info);
    dom.resultGrid.appendChild(item);
  });

  Promise.all(promises).then(() => {
    // 默认折叠
    collapseSection(dom.previewBody, dom.previewArrow);
    initGridClamp(dom.resultGridWrapper, dom.resultGrid, dom.resultExpandBtn);
  });
}

// ===== 打包下载 =====
async function downloadZip() {
  if (state.results.length === 0) return;

  const zip = new JSZip();

  for (const result of state.results) {
    const data = await blobToUint8Array(result.blob);
    zip.file(result.name, data);
  }

  const content = await zip.generateAsync({ type: 'blob' });
  const prefix = dom.namePrefix.value || 'batch';
  downloadBlob(content, `${prefix}output.zip`);
}

// ===== 按钮状态 =====
function updateButtons() {
  const canProcess = state.template !== null && state.targets.length > 0;

  // 检查是否有未确认的尺寸不匹配
  let hasUnconfirmed = false;
  if (state.template && state.targets.length > 0) {
    const mismatches = checkSizeMismatch(
      { w: state.template.w, h: state.template.h },
      state.targets.map(t => ({ w: t.w, h: t.h, name: t.name }))
    );
    hasUnconfirmed = mismatches.length > 0 && !state.mismatchConfirmed;
  }

  dom.processBtn.disabled = !canProcess;
  // 如果有未确认的不匹配，启用处理按钮但需要先弹出警告
  if (hasUnconfirmed && canProcess) {
    dom.processBtn.disabled = false;
  }
  dom.downloadBtn.disabled = state.results.length === 0;
}

// ===== 初始化 =====
function init() {
  initTheme();
  initSettings();
  setupUpload(dom.templateUploadArea, dom.templateInput, handleTemplate, false);
  setupUpload(dom.targetUploadArea, dom.targetInput, handleTargets, true);
  updateRenamePreview();

  // 折叠/展开交互
  dom.targetToggle.addEventListener('click', (e) => {
    if (e.target.closest('#clearTargets')) return;
    toggleCollapse(dom.targetBody, dom.targetArrow);
    // 展开后重新初始化行折叠
    if (!dom.targetBody.classList.contains('collapsed')) {
      setTimeout(() => initGridClamp(dom.targetGridWrapper, dom.targetGrid, dom.targetExpandBtn), 400);
    }
  });
  dom.previewToggle.addEventListener('click', () => {
    toggleCollapse(dom.previewBody, dom.previewArrow);
    if (!dom.previewBody.classList.contains('collapsed')) {
      setTimeout(() => initGridClamp(dom.resultGridWrapper, dom.resultGrid, dom.resultExpandBtn), 400);
    }
  });

  dom.processBtn.addEventListener('click', processImages);
  dom.downloadBtn.addEventListener('click', downloadZip);

  // 行折叠展开按钮
  dom.targetExpandBtn.addEventListener('click', () => {
    toggleGridRows(dom.targetGridWrapper, dom.targetGrid, dom.targetExpandBtn);
  });
  dom.resultExpandBtn.addEventListener('click', () => {
    toggleGridRows(dom.resultGridWrapper, dom.resultGrid, dom.resultExpandBtn);
  });
}

init();
