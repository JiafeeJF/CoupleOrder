// 图片工具：上传压缩 + 本地缓存 + 预加载
// 菜品图片以 base64 data-URL 存储，因此以内容哈希作为缓存 key，稳定且抗重名。

import imageCompression from 'browser-image-compression';

const CACHE_NAME = 'coupleorder-menu-images';

function cachedApiSupported() {
  return typeof caches !== 'undefined';
}

/* ---------- 哈希 ---------- */

// 用 SHA-256 生成内容短哈希（用作稳定的缓存 key）
async function contentHash(str) {
  try {
    const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(str));
    return Array.from(new Uint8Array(buf))
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('')
      .slice(0, 24);
  } catch {
    let h = 0;
    for (let i = 0; i < str.length; i += 1) h = (h * 31 + str.charCodeAt(i)) >>> 0;
    return `h${h.toString(16)}`;
  }
}

// 从 data-URL 提取可哈希的负载段
function payloadOf(dataUrl) {
  const idx = dataUrl.indexOf(',');
  return idx === -1 ? dataUrl : dataUrl.slice(idx + 1);
}

async function dataUrlKey(dataUrl) {
  return `item-${await contentHash(payloadOf(dataUrl))}`;
}

/* ---------- 上传压缩 ---------- */

export async function compressImageFile(file) {
  if (!file.type || !file.type.startsWith('image/')) return file;
  if (file.type === 'image/gif') return file; // 保留动画
  try {
    const compressed = await imageCompression(file, {
      maxSizeMB: 0.5,
      maxWidthOrHeight: 1080,
      useWebWorker: true,
      initialQuality: 0.82,
      fileType: 'image/webp',
    });
    return compressed;
  } catch {
    return file;
  }
}

export function fileToDataUrl(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(new Error('读取图片失败'));
    reader.readAsDataURL(blob);
  });
}

// 上传路径完整流程：文件 → 压缩 → data-URL
export async function prepareMenuItemImage(file) {
  const compressed = await compressImageFile(file);
  return fileToDataUrl(compressed);
}

/* ---------- 本地缓存（Cache Storage） ---------- */

export async function cacheDataUrl(dataUrl) {
  if (!dataUrl || !cachedApiSupported()) return;
  try {
    const key = await dataUrlKey(dataUrl);
    const cache = await caches.open(CACHE_NAME);
    await cache.put(new Request(key), new Response(dataUrl, { headers: { 'Content-Type': 'image/webp' } }));
  } catch {
    /* 缓存失败不影响主流程 */
  }
}

// 由 data-URL 读取缓存内容；未命中返回 null
export async function readCachedDataUrl(dataUrl) {
  if (!dataUrl || !cachedApiSupported()) return null;
  try {
    const key = await dataUrlKey(dataUrl);
    const cache = await caches.open(CACHE_NAME);
    const res = await cache.match(new Request(key));
    if (!res) return null;
    return await res.text();
  } catch {
    return null;
  }
}

// 删除某条 data-URL 的缓存
export async function removeCachedDataUrl(dataUrl) {
  if (!dataUrl || !cachedApiSupported()) return;
  try {
    const key = await dataUrlKey(dataUrl);
    const cache = await caches.open(CACHE_NAME);
    await cache.delete(new Request(key));
  } catch {
    /* 忽略 */
  }
}

/* ---------- 预加载 ---------- */

// 单张 data-URL 确保「可用」：有缓存用缓存；否则写缓存后返回原data-URL
async function ensureDataUrlReady(url) {
  if (!/^data:/.test(url)) return url; // http(s) 交给浏览器原生缓存
  const cached = await readCachedDataUrl(url);
  if (cached) return cached;
  await cacheDataUrl(url);
  return url;
}

// 预加载当前菜单所有菜品图片，等待全部就绪后再返回。
// 返回 Map：原 image url → 实际可展示的 data-URL（优先本地缓存）
export async function preloadMenuImages(items) {
  const urls = [...new Set(items.map((i) => i.image).filter(Boolean))];
  const out = new Map();
  for (const url of urls) {
    out.set(url, await ensureDataUrlReady(url)); // 串行，控制内存/请求压力
  }
  return out;
}

/* ---------- 删除菜品时清缓存 ---------- */

export async function purgeItemImageFromCache(image) {
  if (!image) return;
  await removeCachedDataUrl(image);
}