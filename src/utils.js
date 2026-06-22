/**
 * 工具函数 - 重命名、下载
 */

/**
 * 根据输出格式获取文件扩展名
 * @param {string} format - MIME 类型
 * @returns {string}
 */
export function getExtension(format) {
  const map = {
    'image/png': 'png',
    'image/jpeg': 'jpg',
    'image/webp': 'webp',
  };
  return map[format] || 'png';
}

/**
 * 生成批量重命名后的文件名
 * @param {object} options
 * @param {string} options.prefix - 前缀
 * @param {string} options.suffix - 后缀
 * @param {number} options.start - 起始序号
 * @param {number} options.index - 当前索引 (0-based)
 * @param {number} options.total - 总数（用于补零位数）
 * @param {string} options.format - MIME 类型
 * @returns {string}
 */
export function generateFilename({ prefix, suffix, start, index, total, format }) {
  const num = start + index;
  const pad = Math.max(2, String(total + start - 1).length);
  const numStr = String(num).padStart(pad, '0');
  const ext = getExtension(format);
  const p = prefix || '';
  const s = suffix || '';
  return `${p}${numStr}${s}.${ext}`;
}

/**
 * 生成重命名预览示例
 * @param {object} options
 * @returns {string}
 */
export function generatePreview({ prefix, suffix, start, format }) {
  const num = String(start).padStart(2, '0');
  const ext = getExtension(format);
  const p = prefix || '';
  const s = suffix || '';
  return `${p}${num}${s}.${ext}`;
}

/**
 * 触发浏览器下载单个文件
 * @param {Blob} blob
 * @param {string} filename
 */
export function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/**
 * 将 Blob 转换为 Uint8Array (供 JSZip 使用)
 * @param {Blob} blob
 * @returns {Promise<Uint8Array>}
 */
export function blobToUint8Array(blob) {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = () => resolve(new Uint8Array(reader.result));
    reader.readAsArrayBuffer(blob);
  });
}
