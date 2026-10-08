/* The PDF report. Page 1 is source/08 S_output, the `pdf` block, drawn at 520px
   wide for A4. Every length below is the pack's own px value, or the position the
   pack's markup puts a box at when rendered, and is scaled by 210/520 mm per px.

   The pages after page 1 are not drawn in the pack. The README says only that they
   "hold the general items, tyres and signature", so they reuse page 1's parts: the
   same header band, the same section heading, the same table and the same grid cell. */
import { jsPDF, GState } from 'jspdf';
import type { Check, Config, PhotoMeta } from '../../data/types';
import type { View, Drawing } from '../../kit/drawings';
import { assetSVGString } from '../../kit/drawings';
import { N, R, PA, SU, W } from '../../kit/tokens';
import { dirWord, fleetTag, drawingFor, itemsFor, readingsFor, strapsApply, tyreKeys } from '../check';
import { num } from '../format';
import {
  VIEW_ORDER, when, dateTime, typeLine, rateShort, assetShort, accountOrder, livePins, typeCell, photoRefs, oldNote,
  tyreName, isLow, answerWord,
} from './text';

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
const ORANGE = '#FF8A73'; // "TRUCK CENTRE"
const BD_ALPHA = 0x9e / 255; // BD is #09163a9e: navy at 62%
const LETTER = -0.16; // letter-spacing:-0.01em on the reference page's root, 16px

/* Line heights the pack's text gets at line-height:normal, measured from its render. */
const LH: Record<string, number> = { 'b7': 8, 'b8': 10, 'b8.5': 10, 'b9': 11, 'b10': 12, 'm7': 8, 'm8.5': 10, 'm9': 10, 'p12': 14, 'p13': 15, 'p14': 17 };
const lh = (fam: 'b' | 'm' | 'p', size: number) => LH[fam + size] ?? Math.round(size * 1.2);

const mm = (px: number) => px * K;
const pt = (px: number) => px * K * 72 / 25.4;
/** Baseline of a line of text whose line box starts at `top`. */
const base = (top: number, lineH: number, size: number) => top + lineH / 2 + size * 0.36;

/* ---------------- Fonts ---------------- */

type Fam = 'b' | 'm'; // body (Inter in the pack), mono
function font(doc: jsPDF, fam: Fam, bold: boolean, size: number, color: string) {
  doc.setFont(fam === 'm' ? 'courier' : 'helvetica', bold ? 'bold' : 'normal');
  doc.setFontSize(pt(size));
  doc.setTextColor(color);
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
  doc.setLineWidth(mm(1));
}
const hline = (doc: jsPDF, x0: number, x1: number, y: number) => doc.line(mm(x0), mm(y), mm(x1), mm(y));
const vline = (doc: jsPDF, x: number, y0: number, y1: number) => doc.line(mm(x), mm(y0), mm(x), mm(y1));

/* ---------------- Page furniture ---------------- */

async function header(doc: jsPDF, c: Check) {
  doc.setFillColor(N);
  doc.rect(0, 0, mm(520), mm(HEAD_H), 'F');
  /* padding:14px 20px inside the 1px frame: line box at y 15, text from x 21 to 499. */
  await panton(doc, [{ t: 'STOCKPORT ', color: W }, { t: 'TRUCK CENTRE', color: ORANGE }], X0, 15, 13);
  await panton(doc, [{ t: dirWord(c.direction).toUpperCase() + ' · ' + fleetTag(c), color: W }], X0 + CW, 15, 13, 'right');
  bd(doc);
}

function footer(doc: jsPDF, left: string, right: string) {
  font(doc, 'b', false, 8, SU);
  const y = mm(base(FOOT_Y, lh('b', 8), 8));
  doc.text(left, mm(X0), y);
  doc.text(right, mm(X0 + CW), y, { align: 'right' });
}

/** The section heading: "Damage" in Panton 12px, 3px padding, 1px BD rule under it. */
async function heading(doc: jsPDF, text: string, y: number): Promise<number> {
  await panton(doc, [{ t: text, color: N }], X0, y, 12);
  const h = lh('p', 12) + 3 + 1;
  bd(doc);
  hline(doc, X0, X0 + CW, y + h - 0.5);
  return y + h;
}

/* ---------------- The grid cell (page 1 details) ---------------- */

interface GridCell { label: string; value: string }
/** Cells 1px BD, padding 5px 6px, 7px mono label in SU, 9px bold value. Returns the bottom. */
function grid(doc: jsPDF, cells: GridCell[], x: number, y: number, w: number, cols: number): number {
  const g = 6;
  const cw = (w - g * (cols - 1)) / cols;
  const inner = cw - 12;
  let top = y;
  for (let r = 0; r < cells.length; r += cols) {
    const row = cells.slice(r, r + cols);
    font(doc, 'b', true, 9, N);
    const lines = row.map((cell) => (cell.value ? (doc.splitTextToSize(cell.value, mm(inner)) as string[]) : ['']));
    const n = Math.max(...lines.map((l) => l.length));
    const h = 1 + 5 + lh('m', 7) + n * lh('b', 9) + 5 + 1;
    row.forEach((cell, i) => {
      const cx = x + i * (cw + g);
      bd(doc);
      doc.rect(mm(cx + 0.5), mm(top + 0.5), mm(cw - 1), mm(h - 1), 'S');
      font(doc, 'm', false, 7, SU);
      doc.text(cell.label.toUpperCase(), mm(cx + 7), mm(base(top + 6, lh('m', 7), 7)));
      font(doc, 'b', true, 9, N);
      lines[i].forEach((t, j) => doc.text(t, mm(cx + 7), mm(base(top + 6 + lh('m', 7) + j * lh('b', 9), lh('b', 9), 9))));
    });
    top += h + g;
  }
  return top - g;
}

/* ---------------- The table ---------------- */

interface Cell { t: string; color?: string; bold?: boolean; mono?: boolean }
const TF = 8.5; // font-size:8.5px
const TP = 4; // padding:4px

function cellFont(doc: jsPDF, c: Cell, head: boolean) {
  font(doc, c.mono ? 'm' : 'b', head || !!c.bold, TF, c.color || N);
}
/** The browser's automatic table layout: each column gets its widest content, and any
    room left over is shared in proportion; when there is not enough room, columns
    shrink towards their longest word. */
function columns(doc: jsPDF, head: Cell[], rows: Cell[][], w: number): number[] {
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
async function table(f: Flow, head: Cell[], rows: Cell[][], x = X0, w = CW, widths?: number[]) {
  const { doc } = f;
  const cols = widths || columns(doc, head, rows, w - 1);
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
    cols.forEach((cw) => { cx += cw; vline(doc, cx, top, y); });
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

async function stageImage(drawing: Drawing, view: View, pins: StagePin[]): Promise<string | null> {
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
  return ctx.canvas.toDataURL('image/png');
}

/** Pins are stored as fractions of the drawing; a value over 1 is read as a percentage. */
const frac = (v: number) => (v > 1 ? v / 100 : v);

/* ---------------- The build ---------------- */

export interface PdfOptions {
  recordVersion?: number;
  /** The check's photos, for the "Photos in zip" column. Without them it lists the
      close-up and wide shot every pin has to have. */
  photos?: PhotoMeta[];
}

export async function buildPdf(c: Check, config: Config, opts: PdfOptions = {}): Promise<Blob> {
  const doc = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'portrait', compress: true });
  doc.setProperties({ title: dirWord(c.direction) + ' · ' + fleetTag(c) + (c.customer ? ' · ' + c.customer : '') });
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

  /* ---- Page 1 ---- */
  await header(doc, c);

  f.y = grid(doc, [
    { label: 'Date', value: dateTime(when(c)) },
    { label: 'Customer', value: c.customer },
    { label: 'Account / Order', value: accountOrder(c) },
    { label: 'Collecting reg', value: c.collectingReg },
    { label: 'Asset', value: assetShort(c) },
    { label: 'Type', value: typeLine(c, config) },
    { label: 'Rate', value: rateShort(c) },
    { label: 'Checked by', value: c.userName },
  ], X0, TOP, CW, 4) + GAP;

  f.y = (await heading(doc, 'Damage', f.y)) + GAP;

  const live = livePins(c);
  const old = [...c.oldPins].sort((a, b) => a.letter.localeCompare(b.letter));
  if (!live.length && !old.length) {
    /* Not drawn in the pack: a check with nothing marked says so under the heading. */
    font(doc, 'b', true, 9, N);
    doc.text('No damage', mm(X0), mm(base(f.y, lh('b', 9), 9)));
    f.y += lh('b', 9) + GAP;
  } else {
    const drawing = drawingFor(c.trailerType, config);
    const views = VIEW_ORDER.filter((v) => live.some((p) => p.view === v) || old.some((o) => o.view === v));
    for (let i = 0; i < views.length; i += 2) {
      const rowH = lh('m', 9) + 2 + STAGE_H;
      await ensure(rowH);
      for (let j = 0; j < 2 && i + j < views.length; j++) {
        const v = views[i + j];
        const x = X0 + j * (STAGE_W + GAP);
        font(doc, 'm', false, 9, SU);
        doc.text(v.toUpperCase(), mm(x), mm(base(f.y, lh('m', 9), 9)));
        const pins: StagePin[] = [
          ...live.filter((p) => p.view === v).map((p) => ({ n: String(p.number), x: frac(p.x), y: frac(p.y), old: false })),
          ...old.filter((o) => o.view === v).map((o) => ({ n: o.letter, x: frac(o.x), y: frac(o.y), old: true })),
        ];
        let img: string | null = null;
        try { img = await stageImage(drawing, v, pins); } catch { img = null; }
        if (img) doc.addImage(img, 'PNG', mm(x - SPILL), mm(f.y + lh('m', 9) + 2 - SPILL), mm(STAGE_W + SPILL * 2), mm(STAGE_H + SPILL * 2));
      }
      f.y += rowH + GAP;
    }

    const head: Cell[] = ['No', 'Where', 'Type', 'Note', 'Photos in zip'].map((t) => ({ t }));
    const rows: Cell[][] = [
      ...live.map((p) => [
        { t: String(p.number), bold: true, color: R }, { t: p.zone }, { t: typeCell(p.type, config) }, { t: p.note || '' },
        { t: photoRefs(p, opts.photos), mono: true },
      ]),
      ...old.map((o) => [
        { t: o.letter, bold: true, color: OLD }, { t: o.zone }, { t: typeCell(o.type, config) }, { t: oldNote(o) }, { t: '', mono: true },
      ]),
    ];
    await ensure(19 * 2);
    await table(f, head, rows);
    f.y += GAP;
  }

  /* ---- The pages after page 1 (not drawn in the pack) ---- */
  await f.newPage();

  const section = async (title: string) => {
    await ensure(lh('p', 12) + 4 + GAP + 19 * 2);
    f.y = (await heading(doc, title, f.y)) + GAP;
  };

  const items = itemsFor(c, config);
  if (items.length) {
    await section('General items');
    await table(f, [{ t: 'Item' }, { t: 'Answer' }], items.map((i) => {
      const a = c.items[i.id];
      return [{ t: i.name }, { t: answerWord(i, a), bold: a === 'damaged', color: a === 'damaged' ? R : N }];
    }));
    f.y += GAP;
  }

  const keys = tyreKeys(c);
  if (keys.length) {
    await section('Tyres');
    const withMake = keys.some((k) => c.tyres[k]?.make);
    await table(f, [{ t: 'Tyre' }, { t: 'Tread' }, ...(withMake ? [{ t: 'Make' }] : []), { t: 'Note' }], keys.map((k) => {
      const d = c.tyres[k]?.depth;
      const low = isLow(d, config);
      return [
        { t: tyreName(k) }, { t: d == null ? '' : d + 'mm', mono: true, bold: low, color: low ? R : N },
        ...(withMake ? [{ t: c.tyres[k]?.make || '' }] : []), { t: low ? 'Low' : '' },
      ];
    }));
    f.y += GAP;
  }

  const readRows: Cell[][] = readingsFor(c, config).map((r) => {
    const v = c.readings[r.id];
    return [{ t: r.name }, { t: v == null ? '' : num(v) + (r.unit ? ' ' + r.unit : ''), mono: true }, { t: c.readingNotes[r.id] || '' }];
  });
  if (strapsApply(c, config)) readRows.push([{ t: 'Internal straps' }, { t: c.straps == null ? '' : String(c.straps), mono: true }, { t: c.readingNotes.straps || '' }]);
  readRows.push([{ t: 'Seal number' }, { t: c.seal || '', mono: true }, { t: c.readingNotes.seal || '' }]);
  readRows.push([{ t: 'Doors lock' }, { t: c.doorsLock ? 'Yes' : 'No' }, { t: '' }]);
  readRows.push([{ t: 'Cleanliness' }, { t: c.cleanliness || '' }, { t: '' }]);
  await section('Readings');
  await table(f, [{ t: 'Reading' }, { t: 'Value' }, { t: 'Note' }], readRows);
  f.y += GAP;

  if (c.notes && c.notes.trim()) {
    await section('Notes');
    await table(f, [{ t: 'Note' }], [[{ t: c.notes.trim() }]]);
    f.y += GAP;
  }

  if (c.version > 1 && c.reopenReason) {
    await section('Reopened');
    await table(f, [{ t: 'Version' }, { t: 'Reason' }], [[{ t: 'v' + c.version }, { t: c.reopenReason }]]);
    f.y += GAP;
  }

  if (c.corrections.length) {
    await section('Corrections');
    await table(f, [{ t: 'When' }, { t: 'By' }, { t: 'Correction' }], c.corrections.map((x) => [{ t: dateTime(x.at) }, { t: x.by }, { t: x.text }]));
    f.y += GAP;
  }

  /* Signature: the image in a stage sized box, the grid cells beside it. */
  const sigBlock = STAGE_H + 12;
  await ensure(lh('p', 12) + 4 + GAP + sigBlock);
  f.y = (await heading(doc, 'Signature', f.y)) + GAP;
  bd(doc);
  doc.rect(mm(X0 + 0.5), mm(f.y + 0.5), mm(STAGE_W - 1), mm(sigBlock - 1), 'S');
  if (c.signature) {
    try {
      const prop = doc.getImageProperties(c.signature);
      const bw = STAGE_W - 12, bh = sigBlock - 12;
      const s = Math.min(bw / prop.width, bh / prop.height);
      const iw = prop.width * s, ih = prop.height * s;
      doc.addImage(c.signature, 'PNG', mm(X0 + 6 + (bw - iw) / 2), mm(f.y + 6 + (bh - ih) / 2), mm(iw), mm(ih));
    } catch { /* an unreadable signature leaves the box empty, and the grid still names who signed */ }
  }
  grid(doc, [
    { label: 'Signed by', value: c.userName },
    { label: 'Role', value: c.userRole },
    { label: 'Site', value: c.siteName },
    { label: 'Date', value: c.signedAt ? dateTime(c.signedAt) : '' },
  ], X0 + STAGE_W + GAP, f.y, STAGE_W, 2);
  f.y += sigBlock + GAP;

  /* ---- Footers, now the page count is known ---- */
  const pages = doc.getNumberOfPages();
  const right = 'Record v' + (opts.recordVersion ?? c.version) + ' · ' + config.email.footer;
  for (let i = 1; i <= pages; i++) {
    doc.setPage(i);
    footer(doc, 'Page ' + i + ' of ' + pages + (i === 1 && pages > 1 ? ' · General items, tyres and signature follow' : ''), right);
  }
  return doc.output('blob');
}
