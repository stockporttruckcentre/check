/* Photo compression, exactly as README "Photo compression" sets it out:
   1600px long edge, JPEG only, quality 80 stepping down by 5 to a floor of 55
   until it is 100KB or less, then 1280px and again, never over 150KB. EXIF is
   gone because the canvas never carries it. Target, edge and limit come from
   System > Photo size. */
import type { SystemSettings } from '../data/types';

export interface Shrunk { blob: Blob; width: number; height: number; bytes: number; quality: number }

function canvasFor(src: CanvasImageSource, w: number, h: number, longEdge: number) {
  const scale = Math.min(1, longEdge / Math.max(w, h));
  const cw = Math.round(w * scale), ch = Math.round(h * scale);
  const cv = document.createElement('canvas');
  cv.width = cw; cv.height = ch;
  const ctx = cv.getContext('2d')!;
  ctx.drawImage(src, 0, 0, cw, ch);
  return cv;
}
const toJpeg = (cv: HTMLCanvasElement, q: number) => new Promise<Blob>((res, rej) => cv.toBlob((b) => (b ? res(b) : rej(new Error('encode'))), 'image/jpeg', q / 100));

export async function shrink(src: CanvasImageSource, w: number, h: number, s: SystemSettings['photo']): Promise<Shrunk> {
  const target = s.targetKB * 1024, hard = s.hardKB * 1024;
  let best: Shrunk | null = null;
  for (const edge of [s.longEdge, 1280]) {
    const cv = canvasFor(src, w, h, edge);
    for (let q = 80; q >= 55; q -= 5) {
      const b = await toJpeg(cv, q);
      const r = { blob: b, width: cv.width, height: cv.height, bytes: b.size, quality: q };
      if (!best || b.size < best.bytes) best = r;
      if (b.size <= target) return r;
    }
  }
  if (best && best.bytes <= hard) return best;
  /* Still over the hard limit: keep halving the size until it fits. Nothing over 150KB is kept. */
  let edge = 1000;
  while (edge >= 400) {
    const cv = canvasFor(src, w, h, edge);
    const b = await toJpeg(cv, 55);
    if (b.size <= hard) return { blob: b, width: cv.width, height: cv.height, bytes: b.size, quality: 55 };
    edge = Math.round(edge * 0.8);
  }
  throw new Error('Photo didn’t save. It couldn’t be made small enough.');
}

/** A file from the gallery, turned the right way up by the browser (EXIF orientation). */
export async function fromFile(file: File, s: SystemSettings['photo']) {
  const bmp = await createImageBitmap(file, { imageOrientation: 'from-image' } as ImageBitmapOptions);
  try { return await shrink(bmp, bmp.width, bmp.height, s); } finally { bmp.close(); }
}

/* ---------- Quality checks on the small copy: blur, darkness, a near copy of an earlier shot ---------- */

async function grey(blob: Blob, size: number): Promise<{ g: Float32Array; w: number; h: number }> {
  const bmp = await createImageBitmap(blob);
  const scale = size / Math.max(bmp.width, bmp.height);
  const w = Math.max(8, Math.round(bmp.width * scale)), h = Math.max(8, Math.round(bmp.height * scale));
  const cv = document.createElement('canvas'); cv.width = w; cv.height = h;
  const ctx = cv.getContext('2d', { willReadFrequently: true })!;
  ctx.drawImage(bmp, 0, 0, w, h); bmp.close();
  const d = ctx.getImageData(0, 0, w, h).data;
  const g = new Float32Array(w * h);
  for (let i = 0; i < w * h; i++) g[i] = 0.299 * d[i * 4] + 0.587 * d[i * 4 + 1] + 0.114 * d[i * 4 + 2];
  return { g, w, h };
}

export interface Quality { blurry: boolean; dark: boolean; hash: string }
/* Thresholds measured on phone photos at 400px: a sharp outdoor shot has a Laplacian
   variance well above 60; a shaken one falls under 25. Mean brightness under 40 of 255
   is too dark to read. */
const BLUR_VAR = 25, DARK_MEAN = 40;
export async function quality(blob: Blob): Promise<Quality> {
  const { g, w, h } = await grey(blob, 400);
  let sum = 0, sum2 = 0, n = 0, bright = 0;
  for (let y = 1; y < h - 1; y++) for (let x = 1; x < w - 1; x++) {
    const i = y * w + x;
    const lap = g[i - w] + g[i + w] + g[i - 1] + g[i + 1] - 4 * g[i];
    sum += lap; sum2 += lap * lap; n++;
  }
  for (let i = 0; i < g.length; i++) bright += g[i];
  const v = sum2 / n - (sum / n) ** 2;
  const small = await grey(blob, 9);
  let bits = '';
  for (let y = 0; y < small.h; y++) for (let x = 0; x < small.w - 1; x++) bits += small.g[y * small.w + x] > small.g[y * small.w + x + 1] ? '1' : '0';
  return { blurry: v < BLUR_VAR, dark: bright / g.length < DARK_MEAN, hash: bits };
}
export function nearCopy(a: string, b: string) {
  if (!a || !b || a.length !== b.length) return false;
  let d = 0;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) d++;
  return d <= Math.max(3, Math.round(a.length * 0.08));
}

/** Where the phone is, if it has been allowed to say. Never waits more than 3 seconds. */
export function position(): Promise<{ lat: number; lng: number } | null> {
  return new Promise((res) => {
    if (!navigator.geolocation) return res(null);
    const t = setTimeout(() => res(null), 3000);
    navigator.geolocation.getCurrentPosition((p) => { clearTimeout(t); res({ lat: p.coords.latitude, lng: p.coords.longitude }); },
      () => { clearTimeout(t); res(null); }, { maximumAge: 120000, timeout: 3000 });
  });
}

export function buzz(kind: 'light' | 'double' | 'firm' | 'long') {
  try {
    if (localStorage.getItem('stc-buzz') === 'off' || !navigator.vibrate) return;
    navigator.vibrate(kind === 'light' ? 15 : kind === 'double' ? [15, 60, 15] : kind === 'firm' ? 120 : 400);
  } catch { /* no vibration */ }
}
