/* The PDF report: one A4 page, like the paper sheet it replaces. Built from the parts of
   source/08 S_output (the navy band, the details grid, the drawings with pins, the damage
   table), drawn at 520px wide and scaled by 210/520 mm per px.

   From the business, after the first version: one page, general checks before damage, the
   checks in two columns, tyres on a diagram, the STC number in the header and first in the
   asset box, thinner rules, the STC logo. A check with a lot of damage carries its damage
   table onto a second page. */
import { jsPDF, GState } from 'jspdf';
import type { Check, Config, PhotoMeta } from '../../data/types';
import type { View, Drawing } from '../../kit/drawings';
import { assetSVGString, VIEWS } from '../../kit/drawings';
import { N, R, PA, SU, W, G, A } from '../../kit/tokens';
import { dirWord, stcLabel, drawingFor, itemsFor, readingsFor, strapsApply, tyreKeys } from '../check';
import { num } from '../format';
import {
  VIEW_ORDER, when, dateTime, typeLine, rateShort, assetShort, accountOrder, livePins, photoRefs, oldNote,
  answerWord,
} from './text';

const VIEW_NAMES = Object.fromEntries(VIEWS) as Record<View, string>;

/* ---------------- Geometry, in pack px ---------------- */

const K = 210 / 520; // mm per pack px
const PAGE_H = 520 * 297 / 210; // 735.42, the pack's aspect-ratio:210/297
const X0 = 21; // 1px frame + 20px padding
const CW = 478; // 520 less the frame and 40px of padding
const HEAD_H = 44; // the navy band: 1px frame + 14 + 15 line + 14
const TOP = HEAD_H + 14; // content padding-top
const FOOT_Y = PAGE_H - 1 - 14 - 10; // the footer line box: frame, padding-bottom, 10px line
const LIMIT = FOOT_Y - 10; // the column gap before the footer
const GAP = 10; // the content column's gap
const OLD = '#8A8F99'; // old pin grey, from pin() in source/08
const BD_ALPHA = 0.35; // rules lighter than the pack's BD, from the business: "table borders too thick"
const LETTER = -0.16; // letter-spacing:-0.01em on the reference page's root, 16px

/* Line heights the pack's text gets at line-height:normal, measured from its render. */
const LH: Record<string, number> = { 'b7': 8, 'b8': 10, 'b8.5': 10, 'b9': 11, 'b10': 12, 'm7': 8, 'm8.5': 10, 'm9': 10, 'p12': 14, 'p13': 15, 'p14': 17 };
const lh = (fam: 'b' | 'm' | 'p', size: number) => LH[fam + size] ?? Math.round(size * 1.2);

const mm = (px: number) => px * K;
const pt = (px: number) => px * K * 72 / 25.4;
/** Baseline of a line of text whose line box starts at `top`. */
const base = (top: number, lineH: number, size: number) => top + lineH / 2 + size * 0.36;

/* ---------------- Fonts ---------------- */

/* Inter and Panton only, from the business. Inter is embedded (public/fonts, Google's latin
   cut, OFL); Panton is drawn as an image (below). 'm' was the pack's mono; it is Inter now. */
type Fam = 'b' | 'm';
let interOn = false;
let interState: Promise<{ r: string; b: string } | null> | null = null;
function interFiles() {
  if (interState) return interState;
  const b64 = async (u: string) => {
    const r = await fetch(u);
    if (!r.ok) throw new Error('font');
    const blob = await r.blob();
    const url = await new Promise<string>((ok, fail) => { const fr = new FileReader(); fr.onload = () => ok(fr.result as string); fr.onerror = fail; fr.readAsDataURL(blob); });
    return url.slice(url.indexOf(',') + 1);
  };
  interState = (async () => { try { return { r: await b64('/fonts/Inter-Regular.ttf'), b: await b64('/fonts/Inter-Bold.ttf') }; } catch { return null; } })();
  return interState;
}
async function useInter(doc: jsPDF) {
  const f = await interFiles();
  interOn = !!f;
  if (!f) return;
  doc.addFileToVFS('Inter-Regular.ttf', f.r); doc.addFont('Inter-Regular.ttf', 'Inter', 'normal');
  doc.addFileToVFS('Inter-Bold.ttf', f.b); doc.addFont('Inter-Bold.ttf', 'Inter', 'bold');
}
function font(doc: jsPDF, _fam: Fam, bold: boolean, size: number, color: string) {
  doc.setFont(interOn ? 'Inter' : 'helvetica', bold ? 'bold' : 'normal');
  doc.setFontSize(pt(size));
  doc.setTextColor(color);
}
/** A field label: Inter, small capitals spaced out, in SU. */
function label(doc: jsPDF, t: string, x: number, top: number) {
  font(doc, 'b', false, 6.5, SU);
  doc.setCharSpace(mm(0.35));
  doc.text(t.toUpperCase(), mm(x), mm(base(top, lh('m', 7), 6.5)));
  doc.setCharSpace(0);
}
const width = (doc: jsPDF, s: string) => doc.getTextWidth(s) / K;

let pantonState: Promise<boolean> | null = null;
/** Panton ExtraBold for the canvas. jsPDF cannot embed it (the .otf is CFF outlines, and
    jsPDF reads TrueType only), so Panton text is drawn on a canvas and placed as an image
    with an invisible copy of the words on top, which keeps the PDF searchable. */
function pantonReady(): Promise<boolean> {
  if (pantonState) return pantonState;
  pantonState = (async () => {
    if (typeof document === 'undefined' || !document.fonts) return false;
    const loaded = () => [...document.fonts].some((f) => /panton/i.test(f.family) && String(f.weight) === '800' && f.status === 'loaded');
    try { await document.fonts.load('800 14px Panton'); } catch { /* fall through to fetching it */ }
    if (loaded()) return true;
    try {
      const res = await fetch('/fonts/Panton-ExtraBold.otf');
      if (!res.ok) return false;
      const face = new FontFace('Panton', await res.arrayBuffer(), { weight: '800' });
      await face.load();
      document.fonts.add(face);
      return true;
    } catch {
      return false;
    }
  })();
  return pantonState;
}

function canvas(w: number, h: number): CanvasRenderingContext2D | null {
  if (typeof document === 'undefined') return null;
  const el = document.createElement('canvas');
  el.width = Math.max(1, Math.ceil(w));
  el.height = Math.max(1, Math.ceil(h));
  return el.getContext('2d');
}
function spacing(ctx: CanvasRenderingContext2D, px: number) {
  const c = ctx as CanvasRenderingContext2D & { letterSpacing?: string };
  if ('letterSpacing' in c) c.letterSpacing = px + 'px';
}

const TS = 8; // canvas px per pack px for Panton text, sharp at print size

interface Part { t: string; color: string }
/** Panton 800 text. `x` is the left edge, or the right edge when align is 'right'. */
async function panton(doc: jsPDF, parts: Part[], x: number, top: number, size: number, align: 'left' | 'right' = 'left') {
  const lineH = lh('p', size);
  const all = parts.map((p) => p.t).join('');
  const ok = await pantonReady();
  const ctx = ok ? canvas(1, 1) : null;
  if (ctx) {
    ctx.font = '800 ' + size * TS + 'px Panton';
    spacing(ctx, LETTER * TS);
    const widths = parts.map((p) => ctx.measureText(p.t).width);
    const total = widths.reduce((a, b) => a + b, 0);
    const c2 = canvas(total + 2 * TS, lineH * TS);
    if (c2) {
      c2.font = ctx.font;
      spacing(c2, LETTER * TS);
      const m = c2.measureText(all);
      const asc = m.fontBoundingBoxAscent ?? size * TS * 0.8;
      const desc = m.fontBoundingBoxDescent ?? size * TS * 0.2;
      const by = (lineH * TS) / 2 + (asc - desc) / 2;
      let cx = 0;
      parts.forEach((p, i) => { c2.fillStyle = p.color; c2.fillText(p.t, cx, by); cx += widths[i]; });
      const wPx = (total + 2 * TS) / TS;
      const left = align === 'right' ? x - total / TS : x;
      doc.addImage(c2.canvas.toDataURL('image/png'), 'PNG', mm(left), mm(top), mm(wPx), mm(lineH));
      font(doc, 'b', true, size, N);
      doc.text(all, mm(left), mm(base(top, lineH, size)), { renderingMode: 'invisible' });
      return;
    }
  }
  /* No Panton: Helvetica bold in the same place. */
  font(doc, 'b', true, size, N);
  const total = parts.reduce((a, p) => a + width(doc, p.t), 0);
  let cx = align === 'right' ? x - total : x;
  for (const p of parts) {
    doc.setTextColor(p.color);
    doc.text(p.t, mm(cx), mm(base(top, lineH, size)));
    cx += width(doc, p.t);
  }
}

/* ---------------- Lines in BD ---------------- */

function bd(doc: jsPDF) {
  doc.setGState(new GState({ 'stroke-opacity': BD_ALPHA }));
  doc.setDrawColor(N);
  doc.setLineWidth(mm(0.5));
}
const hline = (doc: jsPDF, x0: number, x1: number, y: number) => doc.line(mm(x0), mm(y), mm(x1), mm(y));
const vline = (doc: jsPDF, x: number, y0: number, y1: number) => doc.line(mm(x), mm(y0), mm(x), mm(y1));

/* ---------------- Page furniture ---------------- */

let logoState: Promise<string | null> | null = null;
/** The STC logo, from public/stc-logo.png, cached for the session and offline by the app. */
function logo(): Promise<string | null> {
  if (logoState) return logoState;
  logoState = (async () => {
    try {
      const r = await fetch('/stc-logo.png');
      if (!r.ok) return null;
      const b = await r.blob();
      return await new Promise<string>((ok, fail) => { const fr = new FileReader(); fr.onload = () => ok(fr.result as string); fr.onerror = fail; fr.readAsDataURL(b); });
    } catch { return null; }
  })();
  return logoState;
}
const LOGO_H = 34, LOGO_W = LOGO_H * 330 / 200;

async function header(doc: jsPDF, c: Check) {
  doc.setFillColor(N);
  doc.rect(0, 0, mm(520), mm(HEAD_H), 'F');
  const img = await logo();
  let x = X0;
  if (img) { doc.addImage(img, 'PNG', mm(X0), mm((HEAD_H - LOGO_H) / 2), mm(LOGO_W), mm(LOGO_H)); x = X0 + LOGO_W + 8; }
  await panton(doc, [{ t: 'STOCKPORT ', color: W }, { t: 'TRUCK CENTRE', color: R }], x, 15, 13);
  /* The stock number heads the report, from the business. */
  await panton(doc, [{ t: dirWord(c.direction).toUpperCase() + ' · ' + stcLabel(c.stcNo), color: W }], X0 + CW, 15, 13, 'right');
  bd(doc);
}

function footer(doc: jsPDF, left: string, right: string) {
  font(doc, 'b', false, 8, SU);
  const y = mm(base(FOOT_Y, lh('b', 8), 8));
  doc.text(left, mm(X0), y);
  doc.text(right, mm(X0 + CW), y, { align: 'right' });
}

/** The section heading: "Damage" in Panton 12px, 3px padding, 1px BD rule under it. */
async function heading(doc: jsPDF, text: string, y: number, x = X0, w = CW): Promise<number> {
  await panton(doc, [{ t: text, color: N }], x, y, 12);
  const h = lh('p', 12) + 3 + 1;
  bd(doc);
  hline(doc, x, x + w, y + h - 0.5);
  return y + h;
}

/* ---------------- The grid cell (page 1 details) ---------------- */

interface GridCell { label: string; value: string }
/** Cells 1px BD, padding 5px 6px, 7px mono label in SU, 9px bold value. Returns the bottom. */
function grid(doc: jsPDF, cells: GridCell[], x: number, y: number, w: number, cols: number, pad = 5, minH = 0): number {
  const g = 6;
  const cw = (w - g * (cols - 1)) / cols;
  const inner = cw - 12;
  let top = y;
  for (let r = 0; r < cells.length; r += cols) {
    const row = cells.slice(r, r + cols);
    font(doc, 'b', true, 9, N);
    const lines = row.map((cell) => (cell.value ? (doc.splitTextToSize(cell.value, mm(inner)) as string[]) : ['']));
    const n = Math.max(...lines.map((l) => l.length));
    const h = Math.max(minH, 1 + pad + lh('m', 7) + n * lh('b', 9) + pad + 1);
    row.forEach((cell, i) => {
      const cx = x + i * (cw + g);
      bd(doc);
      doc.rect(mm(cx + 0.5), mm(top + 0.5), mm(cw - 1), mm(h - 1), 'S');
      label(doc, cell.label, cx + 7, top + 1 + pad);
      font(doc, 'b', true, 9, N);
      lines[i].forEach((t, j) => doc.text(t, mm(cx + 7), mm(base(top + 1 + pad + lh('m', 7) + j * lh('b', 9), lh('b', 9), 9))));
    });
    top += h + g;
  }
  return top - g;
}

/* ---------------- The table ---------------- */

interface Cell { t: string; color?: string; bold?: boolean; mono?: boolean }
const TF = 8.5; // font-size:8.5px
const TP = 2; // tighter than the pack's 4px, to keep the report to one page

function cellFont(doc: jsPDF, c: Cell, head: boolean) {
  font(doc, c.mono ? 'm' : 'b', head || !!c.bold, TF, c.color || N);
}
/** The browser's automatic table layout: each column gets its widest content, and any
    room left over is shared in proportion; when there is not enough room, columns
    shrink towards their longest word. */
function columns(doc: jsPDF, head: Cell[], rows: Cell[][], w: number, flex?: number): number[] {
  const extra = TP * 2 + 1 + 0.5; // half a px over, so a word measured to fit is never split
  const mins = head.map(() => 0), maxs = head.map(() => 0);
  [head, ...rows].forEach((row, ri) => row.forEach((c, i) => {
    cellFont(doc, c, ri === 0);
    const full = width(doc, c.t) + extra;
    const word = Math.max(0, ...c.t.split(/\s+/).map((s) => width(doc, s))) + extra;
    maxs[i] = Math.max(maxs[i], full);
    mins[i] = Math.max(mins[i], word);
  }));
  const sumMax = maxs.reduce((a, b) => a + b, 0);
  /* A flexible column (the note) takes whatever the others leave once each is as wide as its longest content. */
  if (flex != null) {
    const others = maxs.reduce((a, b, i) => (i === flex ? a : a + b), 0);
    if (w - others >= mins[flex]) return maxs.map((m, i) => (i === flex ? w - others : m));
  }
  if (sumMax <= w) return maxs.map((m) => m + (w - sumMax) * (m / sumMax));
  const sumMin = mins.reduce((a, b) => a + b, 0);
  if (sumMin >= w) return mins.map((m) => (m * w) / sumMin);
  const spread = maxs.map((m, i) => m - mins[i]);
  const sumSpread = spread.reduce((a, b) => a + b, 0) || 1;
  return mins.map((m, i) => m + ((w - sumMin) * spread[i]) / sumSpread);
}

interface Flow { doc: jsPDF; c: Check; y: number; newPage: () => Promise<void> }

/** border-collapse table, 1px BD rules, header row on PA. Breaks across pages and
    repeats the header row. */
async function table(f: Flow, head: Cell[], rows: Cell[][], x = X0, w = CW, widths?: number[], flex?: number) {
  const { doc } = f;
  const cols = widths || columns(doc, head, rows, w - 1, flex);
  const lineH = lh('b', TF);
  const wrap = (row: Cell[], isHead: boolean) => row.map((c, i) => {
    cellFont(doc, c, isHead);
    return c.t ? (doc.splitTextToSize(c.t, mm(cols[i] - TP * 2 - 1)) as string[]) : [''];
  });
  const heightOf = (lines: string[][]) => TP * 2 + 1 + Math.max(...lines.map((l) => l.length)) * lineH;
  const drawRow = (row: Cell[], lines: string[][], top: number, isHead: boolean) => {
    const h = heightOf(lines);
    if (isHead) { doc.setFillColor(PA); doc.rect(mm(x + 0.5), mm(top), mm(w - 1), mm(h), 'F'); }
    let cx = x + 0.5;
    row.forEach((c, i) => {
      cellFont(doc, c, isHead);
      lines[i].forEach((t, j) => doc.text(t, mm(cx + 0.5 + TP), mm(base(top + 0.5 + TP + j * lineH, lineH, TF))));
      cx += cols[i];
    });
    return h;
  };
  const rule = (top: number, rowsH: number[]) => {
    bd(doc);
    let y = top;
    hline(doc, x, x + w, y);
    rowsH.forEach((h) => { y += h; hline(doc, x, x + w, y); });
    let cx = x + 0.5;
    vline(doc, cx, top, y);
    cols.forEach((cw, i) => { cx += cw; if (i < cols.length - 1) vline(doc, cx, top, y); });
    vline(doc, x + w - 0.5, top, y);
  };
  const headLines = wrap(head, true);
  let top = f.y + 0.5;
  let segment: number[] = [];
  let segTop = top;
  segment.push(drawRow(head, headLines, top, true));
  top += segment[0];
  for (const row of rows) {
    const lines = wrap(row, false);
    const h = heightOf(lines);
    if (top + h + 0.5 > LIMIT) {
      rule(segTop, segment);
      await f.newPage();
      top = f.y + 0.5;
      segTop = top;
      segment = [drawRow(head, headLines, top, true)];
      top += segment[0];
    }
    segment.push(drawRow(row, lines, top, false));
    top += h;
  }
  rule(segTop, segment);
  f.y = top + 0.5;
}

/* ---------------- The drawings ---------------- */

const STAGE_W = (CW - GAP) / 2; // 234, grid-template-columns:1fr 1fr with gap 10
const STAGE_H = (STAGE_W * 220) / 640; // the drawing's viewBox
const IS = 4; // canvas px per pack px for the drawings
const SPILL = 32; // room around the drawing for pins that stand over its edge

interface StagePin { n: string; x: number; y: number; old: boolean }

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((ok, fail) => {
    const img = new Image();
    img.onload = () => ok(img);
    img.onerror = () => fail(new Error('Drawing did not load'));
    img.src = src;
  });
}

/** A path with corners rounded r, except the bottom left, as border-radius:50% 50% 50% 0. */
function drop(ctx: CanvasRenderingContext2D, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(-h, -h + r);
  ctx.arcTo(-h, -h, -h + r, -h, r);
  ctx.arcTo(h, -h, h, -h + r, r);
  ctx.arcTo(h, h, h - r, h, r);
  ctx.lineTo(-h, h);
  ctx.closePath();
}

/** pin() from source/08: 30px, border-radius 50% 50% 50% 0, rotated -45deg, 3px white
    border, shadow 0 3px 8px rgba(9,22,58,0.35), Panton 800 14px white. The box is
    translate(-50%,-100%), so its bottom middle sits on the point. */
function drawPin(ctx: CanvasRenderingContext2D, p: StagePin, px: number, py: number, panton: boolean) {
  const s = 30;
  const a = -Math.PI / 4;
  ctx.save();
  ctx.translate(px, py - s / 2);
  ctx.rotate(a);
  /* The shadow turns with the box. Canvas shadows are in screen space, so turn the offset. */
  ctx.shadowColor = 'rgba(9,22,58,0.35)';
  ctx.shadowBlur = 8 * IS;
  ctx.shadowOffsetX = -3 * Math.sin(a) * IS;
  ctx.shadowOffsetY = 3 * Math.cos(a) * IS;
  ctx.fillStyle = '#fff';
  drop(ctx, s / 2, s / 2);
  ctx.fill();
  ctx.shadowColor = 'transparent';
  ctx.fillStyle = p.old ? OLD : R;
  drop(ctx, s / 2 - 3, s / 2 - 3);
  ctx.fill();
  ctx.rotate(-a);
  ctx.fillStyle = '#fff';
  ctx.font = (panton ? '800 14px Panton' : 'bold 14px sans-serif');
  spacing(ctx, LETTER);
  ctx.textAlign = 'center';
  const m = ctx.measureText(p.n);
  const asc = m.fontBoundingBoxAscent ?? 11, desc = m.fontBoundingBoxDescent ?? 3;
  ctx.fillText(p.n, 0, (asc - desc) / 2);
  ctx.restore();
}

async function stageImage(drawing: Drawing, view: View, pins: StagePin[], crop: [number, number] = [0, 1]): Promise<string | null> {
  const ctx = canvas((STAGE_W + SPILL * 2) * IS, (STAGE_H + SPILL * 2) * IS);
  if (!ctx) return null;
  const svg = assetSVGString(drawing, view).replace('width="100%"', 'width="' + STAGE_W * IS + '" height="' + STAGE_H * IS + '"');
  const url = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml' }));
  try {
    const img = await loadImage(url);
    ctx.drawImage(img, SPILL * IS, SPILL * IS, STAGE_W * IS, STAGE_H * IS);
  } finally {
    URL.revokeObjectURL(url);
  }
  const ok = await pantonReady();
  ctx.save();
  ctx.scale(IS, IS);
  for (const p of pins) drawPin(ctx, p, SPILL + p.x * STAGE_W, SPILL + p.y * STAGE_H, ok);
  ctx.restore();
  if (crop[0] === 0 && crop[1] === 1) return ctx.canvas.toDataURL('image/png');
  /* Front and rear are drawn in the middle of the same wide frame: keep that middle part. */
  const cw = ((crop[1] - crop[0]) * STAGE_W + SPILL * 2) * IS;
  const out = canvas(cw, ctx.canvas.height);
  if (!out) return null;
  out.drawImage(ctx.canvas, crop[0] * STAGE_W * IS, 0, cw, ctx.canvas.height, 0, 0, cw, ctx.canvas.height);
  return out.canvas.toDataURL('image/png');
}

/** Pins are stored as fractions of the drawing; a value over 1 is read as a percentage. */
const frac = (v: number) => (v > 1 ? v / 100 : v);

/* ---------------- General checks and tyres ---------------- */

/** A small mark beside each general check: green tick OK, red cross damaged, grey dash not fitted, amber ring not checked. */
function mark(doc: jsPDF, a: string | undefined, x: number, cy: number) {
  doc.setGState(new GState({ 'stroke-opacity': 1 }));
  doc.setLineWidth(mm(1.2));
  if (a === 'ok') {
    doc.setDrawColor(G);
    doc.lines([[mm(2.2), mm(2.2)], [mm(4.3), mm(-5)]], mm(x + 0.5), mm(cy), [1, 1], 'S');
  } else if (a === 'damaged') {
    doc.setDrawColor(R);
    doc.line(mm(x + 1), mm(cy - 3), mm(x + 7), mm(cy + 3));
    doc.line(mm(x + 7), mm(cy - 3), mm(x + 1), mm(cy + 3));
  } else if (a === 'na') {
    doc.setDrawColor(SU);
    doc.line(mm(x + 1), mm(cy), mm(x + 7), mm(cy));
  } else {
    doc.setDrawColor(A);
    doc.circle(mm(x + 4), mm(cy), mm(3), 'S');
  }
}

/* The tyres seen from above, front at the top, nearside on the left. Proportions follow the real
   thing: a 13.6m semi-trailer is about five times as long as it is wide, its king pin sits about a
   metre back from the front, the landing legs a third of the way along, and its axles are 1.31m
   apart with about 1.8m of body behind the last one. A rigid truck has a cab and a steer axle at
   the front; a van has an axle at each end. */
const PLAN_W = 30, PLAN_L = 144;
function planAxles(drawing: Drawing, axles: number): number[] {
  const L = PLAN_L;
  if (drawing === 'van') return axles <= 1 ? [0.8 * L] : Array.from({ length: axles }, (_, i) => (i === 0 ? 0.17 * L : 0.72 * L + (i - 1) * 0.1 * L));
  if (drawing === 'truck') return Array.from({ length: axles }, (_, i) => (i === 0 ? 0.13 * L : 0.66 * L + (i - 1) * 0.1 * L));
  const pitch = 0.096 * L, last = 0.87 * L;
  return Array.from({ length: axles }, (_, i) => last - (axles - 1 - i) * pitch);
}
function tyreHeight(c: Check): number {
  return tyreKeys(c).length && c.axles ? 14 + PLAN_L + 8 + 14 : 14;
}
async function tyreDiagram(doc: jsPDF, c: Check, config: Config, x: number, y: number, w: number): Promise<number> {
  const keys = tyreKeys(c);
  const axles = c.axles || 0;
  if (!keys.length || !axles) {
    font(doc, 'b', false, 8, SU);
    doc.text('Axles not recorded', mm(x), mm(base(y, 10, 8)));
    return y + 14;
  }
  const drawing = drawingFor(c.trailerType, config);
  const cx = x + w / 2, H = PLAN_W / 2, L = PLAN_L;
  /* Side names where the yard reads them: big, at the top of each side. */
  await panton(doc, [{ t: 'NS', color: N }], x, y, 11);
  await panton(doc, [{ t: 'OS', color: N }], x + w, y, 11, 'right');
  label(doc, 'Front', cx - width(doc, 'FRONT') / 2 - 3, y + 2);
  const top = y + 14;
  doc.setGState(new GState({ 'stroke-opacity': 1 }));
  doc.setLineWidth(mm(0.8));
  doc.setDrawColor(N);
  doc.setFillColor('#EFF2F8');
  if (drawing === 'truck') {
    const cab = 0.17 * L;
    doc.roundedRect(mm(cx - H + 2), mm(top), mm(PLAN_W - 4), mm(cab - 3), mm(4), mm(4), 'FD');
    doc.line(mm(cx - H + 5), mm(top + 5), mm(cx + H - 5), mm(top + 5)); // windscreen
    doc.roundedRect(mm(cx - H), mm(top + cab), mm(PLAN_W), mm(L - cab), mm(2), mm(2), 'FD');
  } else if (drawing === 'van') {
    doc.roundedRect(mm(cx - H + 1), mm(top), mm(PLAN_W - 2), mm(L), mm(7), mm(7), 'FD');
    doc.line(mm(cx - H + 4), mm(top + 0.2 * L), mm(cx + H - 4), mm(top + 0.2 * L)); // windscreen
  } else {
    doc.roundedRect(mm(cx - H), mm(top), mm(PLAN_W), mm(L), mm(2), mm(2), 'FD');
    /* King pin on its plate, landing legs. */
    doc.setLineWidth(mm(0.5));
    doc.rect(mm(cx - 6), mm(top + 0.075 * L - 6), mm(12), mm(12), 'S');
    doc.setFillColor(N);
    doc.circle(mm(cx), mm(top + 0.075 * L), mm(2.2), 'F');
    doc.rect(mm(cx - H + 3), mm(top + 0.3 * L - 2), mm(5), mm(4), 'F');
    doc.rect(mm(cx + H - 8), mm(top + 0.3 * L - 2), mm(5), mm(4), 'F');
  }
  /* Rear lights and the under-run bar. */
  doc.setFillColor(R);
  doc.rect(mm(cx - H + 1), mm(top + L - 2.5), mm(5), mm(2), 'F');
  doc.rect(mm(cx + H - 6), mm(top + L - 2.5), mm(5), mm(2), 'F');
  doc.setFillColor(N);
  doc.rect(mm(cx - H + 3), mm(top + L + 2), mm(PLAN_W - 6), mm(2), 'F');
  label(doc, 'Rear', cx - width(doc, 'REAR') / 2 - 3, top + L + 5);

  const legal = config.limits.legalTread, low = config.limits.lowTread;
  const TW = 6, TL = 13;
  planAxles(drawing, axles).forEach((ay0, i) => {
    const n = i + 1, ay = top + ay0;
    doc.setDrawColor(N); doc.setLineWidth(mm(0.6));
    doc.line(mm(cx - H), mm(ay), mm(cx + H), mm(ay));
    (['ns', 'os'] as const).forEach((side) => {
      const d = c.tyres[side + '_' + n]?.depth;
      const colour = d == null ? SU : d <= legal ? R : d <= low ? A : N;
      const tx = side === 'ns' ? cx - H - TW + 2 : cx + H - 2;
      doc.setFillColor(colour);
      doc.roundedRect(mm(tx), mm(ay - TL / 2), mm(TW), mm(TL), mm(1.5), mm(1.5), 'F');
      const lx = side === 'ns' ? tx - 5 : tx + TW + 5;
      /* One line per tyre, "Axle 1  6mm", so close-set axles never collide. */
      const val = d == null ? 'Not read' : d + 'mm', ax = 'Axle ' + n;
      font(doc, 'b', true, 9, colour);
      const vw = width(doc, val);
      doc.text(val, mm(side === 'ns' ? lx - vw : lx), mm(base(ay - 5.5, 11, 9)));
      font(doc, 'b', false, 7, SU);
      doc.text(ax, mm(side === 'ns' ? lx - vw - 4 - width(doc, ax) : lx + vw + 4), mm(base(ay - 5.5, 11, 7)));
    });
  });
  const ly = top + L + 14;
  font(doc, 'b', false, 7, SU);
  doc.setFillColor(A); doc.rect(mm(x), mm(ly + 2), mm(6), mm(6), 'F');
  doc.text(low + 'mm or less', mm(x + 9), mm(base(ly, 10, 7)));
  doc.setFillColor(R); doc.rect(mm(x + w / 2), mm(ly + 2), mm(6), mm(6), 'F');
  doc.text('Legal limit ' + legal + 'mm', mm(x + w / 2 + 9), mm(base(ly, 10, 7)));
  bd(doc);
  return ly + 12;
}

/* ---------------- The build ---------------- */

export interface PdfOptions {
  recordVersion?: number;
  /** The check's photos, for the "Photos in zip" column. Without them it lists the
      close-up and wide shot every pin has to have. */
  photos?: PhotoMeta[];
}

export async function buildPdf(c: Check, config: Config, opts: PdfOptions = {}): Promise<Blob> {
  const doc = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'portrait', compress: true });
  await useInter(doc);
  doc.setProperties({ title: dirWord(c.direction) + ' · ' + stcLabel(c.stcNo) + (c.customer ? ' · ' + c.customer : '') });
  const f: Flow = {
    doc, c, y: TOP,
    newPage: async () => {
      doc.addPage('a4', 'portrait');
      /* jsPDF only writes a graphics state when it changes, and a new page starts from
         the default, so set a different one first and the BD rules are written again. */
      doc.setGState(new GState({ 'stroke-opacity': 1 }));
      await header(doc, c);
      f.y = TOP;
    },
  };
  const ensure = async (h: number) => { if (f.y + h > LIMIT) await f.newPage(); };

  await header(doc, c);

  /* ---- Details, then the readings in the same cells ---- */
  f.y = grid(doc, [
    { label: 'Date', value: dateTime(when(c)) },
    { label: 'Customer', value: c.customer },
    { label: 'Account / Order', value: accountOrder(c) },
    { label: 'Collecting reg', value: c.collectingReg },
    { label: 'Asset', value: assetShort(c) },
    { label: 'Type', value: typeLine(c, config) },
    { label: 'Rate', value: rateShort(c) },
    { label: 'Checked by', value: c.userName },
  ], X0, TOP, CW, 4, 3) + 6;
  const reads: GridCell[] = readingsFor(c, config).map((r) => {
    const v = c.readings[r.id];
    return { label: r.name, value: v == null ? '' : num(v) + (r.unit ? ' ' + r.unit : '') };
  });
  if (strapsApply(c, config)) reads.push({ label: 'Internal straps', value: c.straps == null ? '' : String(c.straps) });
  reads.push({ label: 'Seal number', value: c.seal || '' });
  reads.push({ label: 'Doors lock', value: c.doorsLock ? 'Yes' : 'No' });
  reads.push({ label: 'Cleanliness', value: c.cleanliness || '' });
  f.y = grid(doc, reads, X0, f.y, CW, Math.min(5, reads.length), 3) + GAP;

  /* ---- General checks (two columns) beside the tyres ---- */
  const LEFT_W = 300, RX = X0 + LEFT_W + 14, RW = CW - LEFT_W - 14;
  const colTop = f.y;
  let left = await heading(doc, 'General checks', colTop, X0, LEFT_W) + 6;
  const items = itemsFor(c, config);
  const half = Math.ceil(items.length / 2);
  /* Rows spaced to run the length of the tyre drawing beside them, within 12 to 16px. */
  const ROW = Math.max(12, Math.min(16, (tyreHeight(c) - 6) / Math.max(1, half))), SUBW = (LEFT_W - 12) / 2;
  items.forEach((it, i) => {
    const col = i < half ? 0 : 1, r = i < half ? i : i - half;
    const x = X0 + col * (SUBW + 12), y = left + r * ROW;
    const a = c.items[it.id];
    mark(doc, a, x, y + ROW / 2);
    const word = a === 'ok' ? '' : a ? answerWord(it, a) : 'Not checked';
    const bad = a === 'damaged';
    font(doc, 'b', bad, 8, a === 'na' ? SU : bad ? R : N);
    const room = SUBW - 12 - (word ? width(doc, word) + 6 : 0);
    let name = it.name;
    while (name.length > 3 && width(doc, name) > room) name = name.slice(0, -2) + '…';
    doc.text(name, mm(x + 11), mm(base(y, ROW, 8)));
    if (word) {
      font(doc, 'b', true, 7.5, bad ? R : a === 'na' ? SU : A);
      doc.text(word, mm(x + SUBW), mm(base(y, ROW, 7.5)), { align: 'right' });
    }
    bd(doc);
    hline(doc, x, x + SUBW, y + ROW);
  });
  left += half * ROW;

  let rightY = await heading(doc, 'Tyres', colTop, RX, RW) + 6;
  rightY = await tyreDiagram(doc, c, config, RX, rightY, RW);
  f.y = Math.max(left, rightY) + GAP;

  /* ---- Damage ---- */
  await ensure(lh('p', 12) + 4 + GAP + 20);
  f.y = (await heading(doc, 'Damage', f.y)) + GAP;
  const live = livePins(c);
  const old = [...c.oldPins].sort((a, b) => a.letter.localeCompare(b.letter));
  if (!live.length && !old.length) {
    font(doc, 'b', true, 9, N);
    doc.text('No damage', mm(X0), mm(base(f.y, lh('b', 9), 9)));
    f.y += lh('b', 9) + GAP;
  } else {
    const drawing = drawingFor(c.trailerType, config);
    /* Nearside and offside always, so a mark on one side reads against the other; front, rear and roof when marked. */
    const pinsFor = (v: View): StagePin[] => [
      ...live.filter((p) => p.view === v).map((p) => ({ n: String(p.number), x: frac(p.x), y: frac(p.y), old: false })),
      ...old.filter((o) => o.view === v).map((o) => ({ n: o.letter, x: frac(o.x), y: frac(o.y), old: true })),
    ];
    const marked = (v: View) => live.some((p) => p.view === v) || old.some((o) => o.view === v);
    /* Nearside and offside always, full size, so a mark on one side reads against the other.
       Front, rear and roof only when marked, three to a row at a smaller size. */
    /* One row: nearside and offside always, so a mark on one side reads against the other, then
       front, rear and roof when marked. Front and rear keep the middle half of their frame, so every
       drawing in the row stands the same height. */
    const ends = VIEW_ORDER.filter((v) => v !== 'ns' && v !== 'os' && marked(v));
    const END: [number, number] = [0.25, 0.75];
    const half = (v: View) => v === 'front' || v === 'rear';
    const units = 2 + ends.reduce((a, v) => a + (half(v) ? 0.5 : 1), 0);
    const ws = (CW - GAP * (1 + ends.length)) / units;
    const views: View[] = ['ns', 'os', ...ends];
    const sh = (ws * 220) / 640;
    const rowH = lh('p', 11) + 4 + sh;
    await ensure(rowH);
    let vx = X0;
    for (const v of views) {
      const crop: [number, number] = half(v) ? END : [0, 1];
      const vw = ws * (crop[1] - crop[0]);
      await panton(doc, [{ t: VIEW_NAMES[v].toUpperCase(), color: N }], vx, f.y, 11);
      let img: string | null = null;
      try { img = await stageImage(drawing, v, pinsFor(v), crop); } catch { img = null; }
      const k = ws / STAGE_W;
      if (img) doc.addImage(img, 'PNG', mm(vx - SPILL * k), mm(f.y + lh('p', 11) + 4 - SPILL * k), mm(((crop[1] - crop[0]) * STAGE_W + SPILL * 2) * k), mm((STAGE_H + SPILL * 2) * k));
      vx += vw + GAP;
    }
    f.y += rowH + GAP;
    const head: Cell[] = ['No', 'Where', 'Type', 'Note', 'Photos in zip'].map((t) => ({ t }));
    const rows: Cell[][] = [
      ...live.map((p) => [
        { t: String(p.number), bold: true, color: R }, { t: p.zone }, { t: p.type || '', bold: true }, { t: p.note || '' },
        { t: photoRefs(p, opts.photos), mono: true },
      ]),
      ...old.map((o) => [
        { t: o.letter, bold: true, color: OLD }, { t: o.zone }, { t: o.type || '', bold: true }, { t: oldNote(o) }, { t: '', mono: true },
      ]),
    ];
    /* The key to the type letters, once, above the table. */
    await ensure(12 + 16 * 2);
    let kx = X0;
    label(doc, 'Key', kx, f.y + 1); kx += 26;
    for (const t of config.damageTypes) {
      font(doc, 'b', true, 8, N); doc.text(t.code, mm(kx), mm(base(f.y, 10, 8))); kx += width(doc, t.code) + 3;
      font(doc, 'b', false, 8, N); doc.text(t.name, mm(kx), mm(base(f.y, 10, 8))); kx += width(doc, t.name) + 12;
    }
    f.y += 14;
    await table(f, head, rows, X0, CW, undefined, 3);
    f.y += GAP;
  }

  /* ---- Anything else written on the check ---- */
  const extra: Cell[][] = [];
  if (c.notes && c.notes.trim()) extra.push([{ t: 'Notes', bold: true }, { t: c.notes.trim() }]);
  if (c.version > 1 && c.reopenReason) extra.push([{ t: 'Reopened v' + c.version, bold: true }, { t: c.reopenReason }]);
  c.corrections.forEach((x) => extra.push([{ t: 'Correction', bold: true }, { t: dateTime(x.at) + ', ' + x.by + ': ' + x.text }]));
  if (extra.length) {
    await ensure(16 * 2);
    await table(f, [{ t: '' }, { t: '' }], extra, X0, CW, [90, CW - 91]);
    f.y += GAP;
  }

  /* ---- Signature: the box, then who, role, site and when along the same row ---- */
  const SIG_W = 130, SIG_H = 50, SIG_PAD = 6;
  await ensure(SIG_H);
  /* The cells first, at least the box's height, so the box can match them and every label sits on one line. */
  const rowH = grid(doc, [
    { label: 'Signed by', value: c.userName },
    { label: 'Role and site', value: [c.userRole, c.siteName].filter(Boolean).join(', ') },
    { label: 'Signed', value: c.signedAt ? dateTime(c.signedAt) : '' },
  ], X0 + SIG_W + GAP, f.y, CW - SIG_W - GAP, 3, SIG_PAD, SIG_H) - f.y;
  bd(doc);
  doc.rect(mm(X0 + 0.5), mm(f.y + 0.5), mm(SIG_W - 1), mm(rowH - 1), 'S');
  label(doc, 'Signature', X0 + 7, f.y + 1 + SIG_PAD);
  if (c.signature) {
    try {
      const prop = doc.getImageProperties(c.signature);
      const sy = f.y + 1 + SIG_PAD + lh('m', 7) + 2;
      const bw = SIG_W - 14, bh = f.y + rowH - 4 - sy;
      const sc = Math.min(bw / prop.width, bh / prop.height);
      const iw = prop.width * sc, ih = prop.height * sc;
      doc.addImage(c.signature, 'PNG', mm(X0 + 7 + (bw - iw) / 2), mm(sy + (bh - ih) / 2), mm(iw), mm(ih));
    } catch { /* an unreadable signature leaves the box empty, and the cells still name who signed */ }
  }
  f.y += rowH + GAP;

  /* ---- Footers, now the page count is known ---- */
  const pages = doc.getNumberOfPages();
  /* The trailer and what the sheet is, from the business. A reopened check says which version. */
  const v = opts.recordVersion ?? c.version;
  const right = stcLabel(c.stcNo) + ' · ' + dirWord(c.direction) + ' sheet' + (v > 1 ? ' · version ' + v : '');
  for (let i = 1; i <= pages; i++) {
    doc.setPage(i);
    footer(doc, 'Page ' + i + ' of ' + pages + (i === 1 && pages > 1 ? ' · Damage continues' : ''), right);
  }
  return doc.output('blob');
}
