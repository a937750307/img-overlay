/**
 * 图片处理引擎 - Canvas 合并、水印、边框
 */

/**
 * 从 File 加载图片
 * @param {File} file
 * @returns {Promise<{img: HTMLImageElement, w: number, h: number}>}
 */
export function loadImage(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => resolve({ img, w: img.naturalWidth, h: img.naturalHeight });
      img.onerror = () => reject(new Error('图片加载失败'));
      img.src = e.target.result;
    };
    reader.onerror = () => reject(new Error('文件读取失败'));
    reader.readAsDataURL(file);
  });
}

/**
 * 从 HTMLImageElement 渲染缩略图到 Canvas
 * @param {HTMLImageElement} img
 * @param {HTMLCanvasElement} canvas
 * @param {number} maxW
 * @param {number} maxH
 */
export function renderThumbnail(img, canvas, maxW = 200, maxH = 150) {
  const ctx = canvas.getContext('2d');
  const ratio = Math.min(maxW / img.naturalWidth, maxH / img.naturalHeight);
  const w = Math.round(img.naturalWidth * ratio);
  const h = Math.round(img.naturalHeight * ratio);
  canvas.width = w;
  canvas.height = h;
  ctx.clearRect(0, 0, w, h);
  ctx.drawImage(img, 0, 0, w, h);
}

/**
 * 绘制圆角矩形路径
 */
function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.arcTo(x + w, y, x + w, y + r, r);
  ctx.lineTo(x + w, y + h - r);
  ctx.arcTo(x + w, y + h, x + w - r, y + h, r);
  ctx.lineTo(x + r, y + h);
  ctx.arcTo(x, y + h, x, y + h - r, r);
  ctx.lineTo(x, y + r);
  ctx.arcTo(x, y, x + r, y, r);
  ctx.closePath();
}

/**
 * 核心：将模板覆盖到目标图片上，支持水印和边框
 *
 * @param {HTMLImageElement} targetImg - 目标图片
 * @param {HTMLImageElement} templateImg - 模板图片
 * @param {object} options
 * @param {string} options.format - 输出格式 'image/png' | 'image/jpeg' | 'image/webp'
 * @param {number} options.quality - JPEG/WebP 质量 0-1
 * @param {object|null} options.border - 边框配置
 * @param {string} options.border.color
 * @param {number} options.border.width
 * @param {number} options.border.radius
 * @returns {Promise<Blob>}
 */
export function composite(targetImg, templateImg, options = {}) {
  const {
    format = 'image/png',
    quality = 0.85,
    border = null,
  } = options;

  // 使用目标图片尺寸作为画布尺寸
  const w = targetImg.naturalWidth;
  const h = targetImg.naturalHeight;

  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');

  // 第1层：绘制目标图片
  ctx.drawImage(targetImg, 0, 0, w, h);

  // 第2层：模板图片拉伸铺满（置顶图层）
  ctx.drawImage(templateImg, 0, 0, w, h);

  // 第3层：边框（内侧绘制）
  if (border && border.width > 0) {
    const bw = border.width;
    const br = Math.min(border.radius, w / 2, h / 2);
    const inset = bw / 2;

    ctx.save();
    if (br > 0) {
      // 圆角边框 - 使用裁剪路径
      ctx.beginPath();
      roundRect(ctx, inset, inset, w - bw, h - bw, br);
      ctx.clip();

      // 在裁剪区域内绘制边框线
      ctx.strokeStyle = border.color;
      ctx.lineWidth = bw;
      ctx.beginPath();
      roundRect(ctx, inset, inset, w - bw, h - bw, br);
      ctx.stroke();
    } else {
      // 直角边框
      ctx.strokeStyle = border.color;
      ctx.lineWidth = bw;
      ctx.strokeRect(inset, inset, w - bw, h - bw);
    }
    ctx.restore();
  }

  // 导出为 Blob
  return new Promise((resolve) => {
    if (format === 'image/png') {
      canvas.toBlob((blob) => resolve(blob), 'image/png');
    } else if (format === 'image/jpeg') {
      canvas.toBlob((blob) => resolve(blob), 'image/jpeg', quality);
    } else if (format === 'image/webp') {
      canvas.toBlob((blob) => resolve(blob), 'image/webp', quality);
    } else {
      canvas.toBlob((blob) => resolve(blob), 'image/png');
    }
  });
}

/**
 * 检查模板与目标图片的尺寸是否一致
 * @param {{w: number, h: number}} templateSize
 * @param {Array<{w: number, h: number, name: string}>} targetSizes
 * @returns {Array<{name: string, tw: number, th: number, sw: number, sh: number}>} 不匹配的列表
 */
export function checkSizeMismatch(templateSize, targetSizes) {
  const mismatches = [];
  for (const t of targetSizes) {
    if (t.w !== templateSize.w || t.h !== templateSize.h) {
      mismatches.push({
        name: t.name,
        tw: t.w,
        th: t.h,
        sw: templateSize.w,
        sh: templateSize.h,
      });
    }
  }
  return mismatches;
}

/**
 * 将 Blob 渲染到 Canvas 上预览
 * @param {Blob} blob
 * @param {HTMLCanvasElement} canvas
 * @param {number} maxW
 * @param {number} maxH
 */
export function renderBlobToCanvas(blob, canvas, maxW = 300, maxH = 225) {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(blob);
    const img = new Image();
    img.onload = () => {
      renderThumbnail(img, canvas, maxW, maxH);
      URL.revokeObjectURL(url);
      resolve();
    };
    img.src = url;
  });
}
