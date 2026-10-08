/* Asset drawings, pins and view tabs from source/08-damage-output-compression.js.
   The SVG markup is the pack's own string, built the same way, so the drawing on
   the phone, in the office and in the PDF is one drawing. */
import type { ReactNode, PointerEvent as RPointerEvent, MouseEvent } from 'react';
import { css } from './css';
import { N, R, W, SU, MU, PT } from './tokens';

export type View = 'ns' | 'os' | 'front' | 'rear' | 'roof';
export type Drawing = 'trailer' | 'truck' | 'van';
export const VIEWS: [View, string][] = [['ns', 'Nearside'], ['os', 'Offside'], ['front', 'Front'], ['rear', 'Rear'], ['roof', 'Roof']];

export function trailerSVGString(view: View): string {
  const st = 'stroke="' + N + '" stroke-width="3" stroke-linejoin="round"';
  const w = (cx: number) => '<circle cx="' + cx + '" cy="186" r="26" fill="' + N + '"/><circle cx="' + cx + '" cy="186" r="10" fill="#8A919E"/>';
  let g = '';
  if (view === 'ns' || view === 'os') {
    g = '<rect x="20" y="18" width="600" height="132" rx="6" fill="#fff" ' + st + '/>' + [170, 320, 470].map((x) => '<line x1="' + x + '" y1="24" x2="' + x + '" y2="144" stroke="#C9CDD6" stroke-width="2" stroke-dasharray="6 6"/>').join('') + '<rect x="20" y="150" width="600" height="10" fill="' + N + '"/><rect x="44" y="160" width="26" height="8" fill="' + N + '"/><rect x="146" y="160" width="8" height="36" fill="' + N + '"/><rect x="134" y="196" width="32" height="6" fill="' + N + '"/><rect x="200" y="166" width="240" height="14" fill="none" stroke="' + N + '" stroke-width="2"/>' + w(480) + w(536) + w(592) + '<rect x="612" y="138" width="8" height="12" fill="' + R + '"/>';
    if (view === 'os') g = '<g transform="translate(640,0) scale(-1,1)">' + g + '</g>';
  } else if (view === 'rear') {
    g = '<rect x="200" y="10" width="240" height="150" rx="4" fill="#fff" ' + st + '/><line x1="320" y1="10" x2="320" y2="160" stroke="' + N + '" stroke-width="3"/>' + [40, 80, 120].map((y) => '<rect x="206" y="' + y + '" width="8" height="14" fill="' + N + '"/><rect x="426" y="' + y + '" width="8" height="14" fill="' + N + '"/>').join('') + '<line x1="300" y1="60" x2="300" y2="110" stroke="' + N + '" stroke-width="3"/><line x1="340" y1="60" x2="340" y2="110" stroke="' + N + '" stroke-width="3"/><rect x="200" y="160" width="240" height="8" fill="' + N + '"/><rect x="210" y="176" width="220" height="8" fill="' + N + '"/><rect x="214" y="150" width="22" height="10" fill="' + R + '"/><rect x="404" y="150" width="22" height="10" fill="' + R + '"/><rect x="204" y="168" width="40" height="44" rx="6" fill="' + N + '"/><rect x="396" y="168" width="40" height="44" rx="6" fill="' + N + '"/><rect x="290" y="186" width="60" height="20" fill="none" stroke="' + N + '" stroke-width="2"/>';
  } else if (view === 'front') {
    g = '<rect x="200" y="10" width="240" height="150" rx="4" fill="#fff" ' + st + '/><rect x="214" y="24" width="212" height="122" fill="none" stroke="#C9CDD6" stroke-width="2"/><path d="M300 150 q-20 30 10 50 M330 150 q20 30 -10 50" fill="none" stroke="' + R + '" stroke-width="3"/><rect x="200" y="160" width="240" height="8" fill="' + N + '"/><rect x="226" y="168" width="10" height="36" fill="' + N + '"/><rect x="404" y="168" width="10" height="36" fill="' + N + '"/><rect x="214" y="204" width="34" height="6" fill="' + N + '"/><rect x="392" y="204" width="34" height="6" fill="' + N + '"/>';
  } else {
    g = '<rect x="20" y="50" width="600" height="120" rx="6" fill="#fff" ' + st + '/>' + [95, 170, 245, 320, 395, 470, 545].map((x) => '<line x1="' + x + '" y1="56" x2="' + x + '" y2="164" stroke="#C9CDD6" stroke-width="2"/>').join('');
  }
  const lbl = (view === 'ns' || view === 'os' || view === 'roof') ? '<text x="' + (view === 'os' ? 600 : 40) + '" y="14" font-family="ui-monospace,monospace" font-size="12" font-weight="700" fill="' + SU + '" text-anchor="' + (view === 'os' ? 'end' : 'start') + '">FRONT</text>' : '';
  return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 220" width="100%" style="display:block">' + g + lbl + '</svg>';
}
export function truckSVGString(): string {
  const st = 'stroke="' + N + '" stroke-width="3" stroke-linejoin="round"';
  return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 220" width="100%" style="display:block"><path d="M20 160 V60 q0 -20 20 -30 h90 q16 0 22 16 l14 50 V160 Z" fill="#fff" ' + st + '/><rect x="40" y="44" width="70" height="40" rx="4" fill="#E6EAF2" stroke="' + N + '" stroke-width="2"/><rect x="176" y="20" width="444" height="140" rx="4" fill="#fff" ' + st + '/><rect x="20" y="160" width="600" height="10" fill="' + N + '"/>' + [90, 500, 560].map((c) => '<circle cx="' + c + '" cy="188" r="26" fill="' + N + '"/><circle cx="' + c + '" cy="188" r="10" fill="#8A919E"/>').join('') + '</svg>';
}
export function vanSVGString(): string {
  return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 220" width="100%" style="display:block"><path d="M40 168 V70 q0 -40 50 -46 h420 q40 0 60 30 l40 60 V168 Z" fill="#fff" stroke="' + N + '" stroke-width="3" stroke-linejoin="round"/><path d="M450 34 h66 l46 70 h-112 Z" fill="#E6EAF2" stroke="' + N + '" stroke-width="2"/><line x1="440" y1="34" x2="440" y2="168" stroke="#C9CDD6" stroke-width="2"/>' + [140, 500].map((c) => '<circle cx="' + c + '" cy="178" r="28" fill="' + N + '"/><circle cx="' + c + '" cy="178" r="11" fill="#8A919E"/>').join('') + '</svg>';
}

/* The pack draws the rigid truck and the van side on only. For their other views the
   trailer's own view drawing is used, which is the nearest thing the pack has drawn. */
export function assetSVGString(drawing: Drawing, view: View): string {
  if (drawing === 'truck' && (view === 'ns' || view === 'os')) {
    const s = truckSVGString();
    return view === 'os' ? s.replace('<path', '<g transform="translate(640,0) scale(-1,1)"><path').replace('</svg>', '</g></svg>') : s;
  }
  if (drawing === 'van' && (view === 'ns' || view === 'os')) {
    const s = vanSVGString();
    return view === 'os' ? s.replace('<path', '<g transform="translate(640,0) scale(-1,1)"><path').replace('</svg>', '</g></svg>') : s;
  }
  return trailerSVGString(view);
}

export function trailerSVG(view: View, drawing: Drawing = 'trailer') {
  return <div style={{ display: 'block', lineHeight: 0 }} dangerouslySetInnerHTML={{ __html: assetSVGString(drawing, view) }} />;
}

export type PinKind = 'new' | 'old' | 'act';
export function pin(n: ReactNode, x: number, y: number, k?: PinKind, o: { onPointerDown?: (e: RPointerEvent) => void; onClick?: (e: MouseEvent) => void; label?: string } = {}) {
  const old = k === 'old', act = k === 'act', s = act ? 40 : 30;
  const interactive = !!(o.onPointerDown || o.onClick);
  return (
    <div onPointerDown={o.onPointerDown} onClick={o.onClick} role={interactive ? 'button' : undefined} aria-label={o.label}
      style={{ ...css('position:absolute;left:' + x + '%;top:' + y + '%;transform:translate(-50%,-100%);display:flex;flex-direction:column;align-items:center;pointer-events:' + (interactive ? 'auto' : 'none')), touchAction: 'none', cursor: interactive ? 'pointer' : undefined }}>
      {act ? <div style={css('position:absolute;top:-6px;width:' + (s + 24) + 'px;height:' + (s + 24) + 'px;border-radius:50%;border:3px solid rgba(207,36,23,0.35)')} /> : null}
      <div style={css('width:' + s + 'px;height:' + s + 'px;border-radius:50% 50% 50% 0;transform:rotate(-45deg);background:' + (old ? '#8A8F99' : R) + ';border:3px solid #fff;box-shadow:0 3px 8px rgba(9,22,58,0.35);display:flex;align-items:center;justify-content:center')}>
        <span style={css('transform:rotate(45deg);color:#fff;font-family:' + PT + ';font-weight:800;font-size:' + (act ? 17 : 14) + 'px')}>{n}</span>
      </div>
    </div>
  );
}
export interface StagePin { n: ReactNode; x: number; y: number; k?: PinKind }
export function stage(view: View, pins: StagePin[], o: { w?: string; extra?: ReactNode; drawing?: Drawing } = {}) {
  return (
    <div style={css('position:relative;width:' + (o.w || '100%') + ';margin:0 auto')}>
      {trailerSVG(view, o.drawing)}
      {pins.map((p, i) => <div key={i}>{pin(p.n, p.x, p.y, p.k)}</div>)}
      {o.extra || null}
    </div>
  );
}
export function vtabs(on: View, counts: Partial<Record<View, number>>, o: { onPick?: (v: View) => void; small?: boolean } = {}) {
  return (
    <div role="tablist" style={css('display:flex;gap:4px;padding:4px;border-radius:10px;background:#E6E8EE')}>
      {VIEWS.map((t) => {
        const a = t[0] === on, c = counts[t[0]];
        return (
          <button key={t[0]} type="button" role="tab" aria-selected={a} className="k-tap k-reset" onClick={() => o.onPick && o.onPick(t[0])}
            style={css('flex:1;min-height:40px;display:flex;align-items:center;justify-content:center;gap:6px;border-radius:7px;font-weight:' + (a ? 800 : 600) + ';font-size:' + (o.small ? 11 : 13) + 'px;background:' + (a ? W : 'transparent') + ';box-shadow:' + (a ? '0 1px 3px rgba(9,22,58,0.2)' : 'none') + ';border:0;padding:0;color:' + N)}>
            {t[1]}
            {c ? <span style={css('min-width:20px;height:20px;padding:0 5px;border-radius:999px;background:' + R + ';color:#fff;font-size:11px;font-weight:800;display:inline-flex;align-items:center;justify-content:center')}>{c}</span> : null}
          </button>
        );
      })}
    </div>
  );
}
export function legend() {
  return (
    <div style={css('display:flex;gap:14px;font-size:12px;color:' + MU)}>
      <span style={css('display:flex;align-items:center;gap:6px')}><span style={css('width:12px;height:12px;border-radius:50%;background:' + R)} />New today</span>
      <span style={css('display:flex;align-items:center;gap:6px')}><span style={css('width:12px;height:12px;border-radius:50%;background:#8A8F99')} />Already on record</span>
    </div>
  );
}
