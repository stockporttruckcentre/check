/* Each function here is a generator function from the design pack, rebuilt with the
   same name, the same arguments and the same output. The style strings are the pack's
   own, so any one of them can be checked against the source file side by side.
   Where the pack draws a static element, the rebuilt one adds the handler it needs
   (onClick and so on) through the options object and nothing else. */
import type { ReactNode, MouseEvent } from 'react';
import { css } from './css';
import { ic } from './icons';
import { N, N7, N5, N1, N05, R, R7, R1, PA, W, G, G1, A, A1, MU, SU, BD, BL, PT, IN, MO } from './tokens';

export { ic };
type Click = (e: MouseEvent) => void;

/* Pressed and focus states from source/02 S_buttons, applied by class because inline
   styles cannot express :active or :focus-visible. */
const STATES = `
.k-btn{cursor:pointer;-webkit-tap-highlight-color:transparent;transition:transform 50ms}
.k-btn:active{transform:scale(0.98)}
.k-btn-p:active{background:${N7}!important;border-color:${N7}!important}
.k-btn:focus-visible{outline:none;box-shadow:0 0 0 4px ${W},0 0 0 7px ${N5}}
.k-tap{cursor:pointer;-webkit-tap-highlight-color:transparent}
.k-tap:focus-visible{outline:3px solid ${N5};outline-offset:2px}
button.k-reset{font:inherit;color:inherit;margin:0;text-align:inherit;letter-spacing:inherit}
@keyframes k-spin{to{transform:rotate(360deg)}}
@keyframes k-pulse{50%{opacity:.55}}
`;
if (typeof document !== 'undefined' && !document.getElementById('k-states')) {
  const el = document.createElement('style');
  el.id = 'k-states';
  el.textContent = STATES;
  document.head.appendChild(el);
}

/* status glyphs: shape + colour, never colour alone */
export function sg(k: string, s?: number) {
  s = s || 28;
  const m = ({ done: [G, W, 'tick', 'circle'], todo: [W, N, null, 'ring'], miss: [R, W, 'alert', 'circle'], warn: [A, W, 'alert', 'circle'], pend: [N5, W, 'clock', 'circle'], off: ['#5B5B56', W, 'off', 'circle'], lock: ['#7A7A74', W, 'lock', 'circle'], na: ['#EFEFEC', SU, 'cross', 'circle'] } as Record<string, (string | null)[]>)[k];
  if (m[3] === 'ring') return <span style={css('flex:none;width:' + s + 'px;height:' + s + 'px;border-radius:50%;border:3px solid ' + N + ';box-sizing:border-box;display:inline-block')} aria-hidden="true" />;
  return <span style={css('flex:none;width:' + s + 'px;height:' + s + 'px;border-radius:50%;background:' + m[0] + ';color:' + m[1] + ';display:inline-flex;align-items:center;justify-content:center')} aria-hidden="true">{ic(m[2] as string, Math.round(s * 0.62), m[1] as string, 2.8)}</span>;
}

export function card(inner: ReactNode, c?: string) {
  return <div style={css('background:' + W + ';border:1px solid ' + BL + ';border-radius:8px;padding:24px;' + (c || ''))}>{inner}</div>;
}
export function lab(t: ReactNode) {
  return <div style={css('font-family:' + MO + ';font-size:12px;letter-spacing:0.04em;color:' + SU + ';text-transform:uppercase;margin-bottom:10px')}>{t}</div>;
}

export type SaveState = 'saved' | 'saving' | 'off' | 'fail';
export function saveInd(k: SaveState) {
  const m = ({ saved: [G, 'tick', 'Saved'], saving: [N5, 'sync', 'Saving'], off: ['#5B5B56', 'off', 'Saved on phone'], fail: [R, 'alert', 'Not saved'] } as Record<string, string[]>)[k];
  return <span role="status" style={css('display:inline-flex;align-items:center;gap:6px;height:32px;padding:0 10px;border-radius:999px;background:' + (k === 'fail' ? R1 : k === 'off' ? '#EFEFEC' : k === 'saved' ? G1 : N05) + ';color:' + m[0] + ';font-size:13px;font-weight:700;white-space:nowrap')}>{ic(m[1], 16, m[0], 2.6)}{m[2]}</span>;
}
export function progbar(p: number, l?: ReactNode) {
  return (
    <div style={css('margin-top:6px;padding:0 4px')}>
      <div style={css('display:flex;justify-content:space-between;font-size:13px;font-weight:600;color:' + MU + ';margin-bottom:6px')}><span>{l || ''}</span><span>{p}%</span></div>
      <div style={css('height:8px;border-radius:4px;background:' + N1)} role="progressbar" aria-valuenow={p} aria-valuemin={0} aria-valuemax={100}><div style={css('width:' + p + '%;height:100%;border-radius:4px;background:' + N)} /></div>
    </div>
  );
}

export interface TopbarOpts { sub?: ReactNode; back?: boolean; close?: boolean; save?: SaveState; prog?: number; progLabel?: ReactNode; onBack?: () => void; right?: ReactNode }
export function topbar(title: ReactNode, o: TopbarOpts = {}) {
  return (
    <div style={css('flex:none;background:' + W + ';border-bottom:1px solid ' + BL + ';padding:8px 12px 10px')}>
      <div style={css('display:flex;align-items:center;gap:8px;min-height:48px')}>
        {o.back !== false
          ? <button type="button" className="k-tap k-reset" onClick={o.onBack} aria-label={o.close ? 'Close' : 'Back'} style={css('width:48px;height:48px;display:flex;align-items:center;justify-content:center;color:' + N + ';background:transparent;border:0;padding:0')}>{ic(o.close ? 'cross' : 'back', 26)}</button>
          : <span style={css('width:8px')} />}
        <div style={css('flex:1;min-width:0')}>
          <h1 style={css('margin:0;font-family:' + PT + ';font-weight:800;font-size:20px;letter-spacing:-0.03em;line-height:1.1;text-wrap:balance')}>{title}</h1>
          {o.sub ? <div style={css('font-size:13px;color:' + MU + ';margin-top:2px')}>{o.sub}</div> : null}
        </div>
        {o.save ? saveInd(o.save) : null}
        {o.right || null}
      </div>
      {o.prog != null ? progbar(o.prog, o.progLabel) : null}
    </div>
  );
}

export type BtnKind = 'p' | 's' | 'd' | 'g' | 'ok' | 'dis' | 'dg';
export interface BtnOpts { h?: number; w?: string; ic?: string; css?: string; onClick?: Click; title?: string; loading?: boolean; type?: 'button' | 'submit'; label?: string }
export function btn(t: ReactNode, k?: BtnKind, o: BtnOpts = {}) {
  const kind = k || 'p';
  const s = ({ p: [N, W, N], s: [W, N, N], d: [R, W, R], g: ['transparent', N, 'transparent'], ok: [G, W, G], dis: ['#E2E2DE', '#7A7A74', '#E2E2DE'], dg: [W, R, R] } as Record<string, string[]>)[kind];
  const h = o.h || 64;
  const disabled = kind === 'dis' || o.loading;
  const style = css('height:' + h + 'px;' + (o.w ? 'width:' + o.w + ';' : '') + 'display:flex;align-items:center;justify-content:center;gap:10px;padding:0 20px;border-radius:8px;background:' + s[0] + ';color:' + s[1] + ';border:2px solid ' + s[2] + ';box-sizing:border-box;font-family:' + IN + ';font-weight:700;font-size:' + (h >= 64 ? 19 : 17) + 'px;letter-spacing:-0.01em;white-space:nowrap;' + (o.css || ''));
  return (
    <button type={o.type || 'button'} className={'k-btn k-reset k-btn-' + kind} style={{ ...style, cursor: disabled ? 'default' : 'pointer' }}
      onClick={disabled ? undefined : o.onClick} disabled={kind === 'dis'} title={o.title} aria-busy={o.loading || undefined} aria-label={o.label}>
      {o.loading
        ? <span style={{ ...css('width:22px;height:22px;border-radius:50%;border:3px solid rgba(255,255,255,0.35);border-top-color:#fff;box-sizing:border-box'), animation: 'k-spin 0.8s linear infinite' }} />
        : (o.ic ? ic(o.ic, 24, s[1], 2.4) : null)}
      {t}
    </button>
  );
}
export function footer(inner: ReactNode) {
  return <div style={css('flex:none;margin-top:auto;background:' + W + ';border-top:1px solid ' + BL + ';padding:12px 16px 22px;display:flex;flex-direction:column;gap:10px')}>{inner}</div>;
}
export function scroll(inner: ReactNode, c?: string) {
  return <div data-scroll-area="true" style={css('flex:1;min-height:0;overflow-y:auto;scrollbar-width:none;padding:16px;display:flex;flex-direction:column;gap:12px;' + (c || ''))}>{inner}</div>;
}
export function bnav(a: number, o: { go: (i: number) => void; unfinished?: number }) {
  const items: [string, string][] = [['home', 'Home'], ['plus', 'New check'], ['draft', 'Unfinished'], ['list', 'History']];
  return (
    <nav style={css('flex:none;margin-top:auto;background:' + W + ';border-top:1px solid ' + BL + ';display:grid;grid-template-columns:repeat(4,1fr);padding:6px 6px 20px')}>
      {items.map((x, i) => {
        const on = i === a;
        return (
          <button key={x[1]} type="button" className="k-tap k-reset" onClick={() => o.go(i)} aria-current={on ? 'page' : undefined}
            style={css('height:60px;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:4px;color:' + (on ? N : SU) + ';font-size:12px;font-weight:' + (on ? 800 : 600) + ';background:transparent;border:0;padding:0')}>
            {i === 1
              ? <span style={css('width:44px;height:30px;border-radius:15px;background:' + R + ';color:#fff;display:flex;align-items:center;justify-content:center')}>{ic('plus', 22, '#fff', 2.8)}</span>
              : <span style={css('position:relative')}>{ic(x[0], 26, on ? N : SU, on ? 2.6 : 2)}{i === 2 && o.unfinished ? <span style={css('position:absolute;right:-10px;top:-6px;min-width:20px;height:20px;border-radius:10px;background:' + R + ';color:#fff;font-size:11px;font-weight:800;display:flex;align-items:center;justify-content:center')}>{o.unfinished}</span> : null}</span>}
            {x[1]}
          </button>
        );
      })}
    </nav>
  );
}
export function plate(t: ReactNode, s?: number) {
  s = s || 1;
  return <span style={css('display:inline-flex;align-items:center;height:' + (44 * s) + 'px;padding:0 ' + (14 * s) + 'px;border-radius:6px;background:#F7D117;border:2px solid #111;font-family:' + MO + ';font-weight:800;font-size:' + (24 * s) + 'px;letter-spacing:0.06em;color:#111')}>{t}</span>;
}
export function fleet(t: ReactNode, c?: string) {
  return <span style={css('display:inline-flex;align-items:center;height:40px;padding:0 14px;border-radius:6px;background:' + N + ';color:#fff;font-family:' + MO + ';font-weight:800;font-size:22px;letter-spacing:0.04em;' + (c || ''))}>{t}</span>;
}
export interface PhotoOpts { w?: string; ar?: string; bg?: string; st?: string; src?: string; css?: string; onClick?: Click; label?: string }
export function photo(label: ReactNode, o: PhotoOpts = {}) {
  const bg = o.bg || 'linear-gradient(135deg,#8C95A6,#5B6476)';
  const style = css('position:relative;' + (o.w ? 'width:' + o.w + ';' : '') + 'aspect-ratio:' + (o.ar || '4/3') + ';border-radius:6px;overflow:hidden;background:' + bg + ';display:flex;align-items:flex-end;' + (o.css || ''));
  const inner = (
    <>
      {o.src ? <img src={o.src} alt="" style={css('position:absolute;inset:0;width:100%;height:100%;object-fit:cover')} /> : null}
      {label ? <span style={css('position:relative;margin:6px;padding:3px 7px;border-radius:4px;background:rgba(0,0,0,0.6);color:#fff;font-size:11px;font-weight:700')}>{label}</span> : null}
      {o.st ? <span style={css('position:absolute;right:6px;top:6px')}>{sg(o.st, 24)}</span> : null}
    </>
  );
  if (o.onClick) return <button type="button" className="k-tap k-reset" onClick={o.onClick} aria-label={o.label} style={{ ...style, border: 0, padding: 0, width: o.w || '100%' }}>{inner}</button>;
  return <div style={style}>{inner}</div>;
}

/* source/03 */
export function stepRow(t: ReactNode, s: ReactNode, k: string, o: { cur?: boolean; r?: ReactNode; onClick?: Click } = {}) {
  const bg = k === 'miss' ? R1 : W, bd = k === 'miss' ? R : o.cur ? N : BL;
  const style = css('min-height:64px;display:flex;align-items:center;gap:14px;padding:10px 14px;border-radius:8px;background:' + bg + ';border:' + (o.cur || k === 'miss' ? 2 : 1) + 'px solid ' + bd);
  const inner = (
    <>
      {sg(k, 30)}
      <div style={css('flex:1;min-width:0')}>
        <div style={css('font-weight:700;font-size:17px')}>{t}</div>
        {s ? <div style={css('font-size:14px;color:' + (k === 'miss' ? R7 : MU) + ';margin-top:2px;' + (k === 'miss' ? 'font-weight:600' : ''))}>{s}</div> : null}
      </div>
      {o.r !== undefined ? o.r : ic('chev', 22, MU)}
    </>
  );
  if (o.onClick) return <button type="button" className="k-tap k-reset" onClick={o.onClick} style={{ ...style, width: '100%', color: N }}>{inner}</button>;
  return <div style={style}>{inner}</div>;
}
export function sheet(inner: ReactNode, o: { center?: boolean; onClose?: () => void; label?: string } = {}) {
  return (
    <div role="dialog" aria-modal="true" aria-label={o.label} onClick={o.onClose ? (e) => { if (e.target === e.currentTarget) o.onClose!(); } : undefined}
      style={css('position:fixed;inset:0;z-index:50;background:rgba(9,22,58,0.55);display:flex;flex-direction:column;justify-content:' + (o.center ? 'center' : 'flex-end') + ';padding:' + (o.center ? '0 18px' : '0'))}>
      <div style={css('background:' + W + ';border-radius:' + (o.center ? '16px' : '20px 20px 0 0') + ';padding:' + (o.center ? '24px 20px 20px' : '10px 18px 26px') + ';display:flex;flex-direction:column;gap:12px;max-height:92dvh;overflow-y:auto;width:100%;max-width:560px;margin:0 auto;box-sizing:border-box')}>
        {o.center ? null : <button type="button" className="k-reset" aria-label="Close" onClick={o.onClose} style={css('width:44px;height:5px;border-radius:3px;background:#CBCBC6;margin:0 auto 8px;border:0;padding:0;flex:none')} />}
        {inner}
      </div>
    </div>
  );
}
export type ToastKind = 'ok' | 'err' | 'warn' | 'info' | 'off';
export function toast(k: ToastKind, t: ReactNode, o: { act?: string; onAct?: () => void } = {}) {
  const m = ({ ok: [G, 'tick'], err: [R, 'alert'], warn: [A, 'alert'], info: [N, 'info'], off: ['#43433F', 'off'] } as Record<string, string[]>)[k];
  return (
    <div role="status" aria-live="polite" style={css('display:flex;align-items:center;gap:12px;min-height:60px;padding:10px 14px;border-radius:10px;background:' + m[0] + ';color:#fff;box-shadow:0 8px 20px rgba(9,22,58,0.22)')}>
      {ic(m[1], 24, '#fff', 2.6)}<span style={css('flex:1;font-weight:700;font-size:16px;line-height:1.3')}>{t}</span>
      {o.act ? <button type="button" className="k-tap k-reset" onClick={o.onAct} style={css('font-weight:800;font-size:16px;text-decoration:underline;padding:8px 4px;background:transparent;border:0;color:#fff')}>{o.act}</button> : null}
    </div>
  );
}
export type BannerKind = 'off' | 'warn' | 'err' | 'info' | 'ok';
export function banner(k: BannerKind, t: ReactNode, s?: ReactNode, act?: string, onAct?: () => void) {
  const m = ({ off: ['#EFEFEC', '#43433F', 'off'], warn: [A1, A, 'alert'], err: [R1, R7, 'alert'], info: [N05, N, 'info'], ok: [G1, G, 'tick'] } as Record<string, string[]>)[k];
  return (
    <div role={k === 'err' ? 'alert' : 'status'} style={css('display:flex;gap:12px;padding:14px;border-radius:8px;background:' + m[0] + ';border:1px solid ' + m[1] + ';color:' + N)}>
      {ic(m[2], 24, m[1], 2.6)}
      <div style={css('flex:1')}>
        <div style={css('font-weight:800;font-size:16px;color:' + m[1])}>{t}</div>
        {s ? <div style={css('font-size:15px;line-height:1.4;margin-top:2px')}>{s}</div> : null}
        {act ? <button type="button" className="k-tap k-reset" onClick={onAct} style={css('margin-top:10px;font-weight:800;font-size:16px;color:' + m[1] + ';text-decoration:underline;background:transparent;border:0;padding:0')}>{act}</button> : null}
      </div>
    </div>
  );
}
export function chip(t: ReactNode, on: boolean, o: { n?: number | null; h?: number; onClick?: Click } = {}) {
  return (
    <button type="button" className="k-tap k-reset" onClick={o.onClick} aria-pressed={on}
      style={css('min-height:' + (o.h || 48) + 'px;display:inline-flex;align-items:center;gap:8px;padding:0 16px;border-radius:999px;border:2px solid ' + (on ? N : '#A3A39D') + ';background:' + (on ? N : W) + ';color:' + (on ? W : N) + ';font-weight:700;font-size:16px;white-space:nowrap')}>
      {on ? ic('tick', 18, W, 3) : null}{t}
      {o.n != null ? <span style={css('min-width:24px;height:24px;border-radius:12px;background:' + (on ? W : N) + ';color:' + (on ? N : W) + ';font-size:13px;display:inline-flex;align-items:center;justify-content:center')}>{o.n}</span> : null}
    </button>
  );
}
export function badge(t: ReactNode, k: string) {
  const m = ({ ok: [G1, G], miss: [R1, R7], warn: [A1, A], pend: [N05, N5], off: ['#EFEFEC', '#43433F'], draft: ['#EFEFEC', N], out: [N, W], in: [W, N] } as Record<string, string[]>)[k];
  return <span style={css('display:inline-flex;align-items:center;gap:6px;height:30px;padding:0 10px;border-radius:6px;background:' + m[0] + ';color:' + m[1] + ';font-weight:800;font-size:13px;letter-spacing:0.02em;' + (k === 'in' ? 'border:2px solid ' + N : ''))}>{t}</span>;
}

/* source/06 */
export function kv(rows: [ReactNode, ReactNode, string?][]) {
  return (
    <div style={css('display:grid;grid-template-columns:auto minmax(0,1fr);gap:6px 14px;font-size:14px;margin-top:10px;padding-top:10px;border-top:1px solid ' + BD)}>
      {rows.map((r, i) => [<span key={'k' + i} style={css('color:' + MU)}>{r[0]}</span>, <span key={'v' + i} style={css('font-weight:600;' + (r[2] ? 'color:' + r[2] : ''))}>{r[1]}</span>])}
    </div>
  );
}
export function srcTag(t: ReactNode, auto?: boolean) {
  return <span style={css('display:inline-flex;align-items:center;gap:6px;height:24px;padding:0 10px;border-radius:999px;font-size:12px;font-weight:700;letter-spacing:0.02em;' + (auto ? 'background:' + N05 + ';color:' + N : 'background:#EFEFEC;color:#43433F'))}>{auto ? ic('sync', 14) : ic('edit', 14)}{t}</span>;
}

/* source/07 */
export function pinpad(onKey: (k: string) => void) {
  return (
    <div style={css('display:grid;grid-template-columns:repeat(3,1fr);gap:10px')}>
      {['1', '2', '3', '4', '5', '6', '7', '8', '9', '', '0', '⌫'].map((k, i) => k
        ? <button key={i} type="button" className="k-tap k-reset" onClick={() => onKey(k === '⌫' ? 'back' : k)} aria-label={k === '⌫' ? 'Delete' : k}
          style={css('height:64px;border-radius:12px;background:' + W + ';border:1px solid ' + BL + ';display:flex;align-items:center;justify-content:center;font-family:' + PT + ';font-weight:800;font-size:26px;color:' + N)}>{k}</button>
        : <div key={i} />)}
    </div>
  );
}
export function dots(n: number, err?: boolean) {
  const s: ReactNode[] = [];
  for (let i = 0; i < 4; i++) s.push(<span key={i} style={css('width:20px;height:20px;border-radius:50%;' + (i < n ? 'background:' + (err ? R : N) : 'border:3px solid ' + (err ? R : '#A3A39D')))} />);
  return <div style={css('display:flex;justify-content:center;gap:18px;margin:6px 0')} aria-label={n + ' of 4 digits'}>{s}</div>;
}
export function setRow(t: ReactNode, s: ReactNode, r?: ReactNode, onClick?: Click) {
  const style = css('min-height:60px;display:flex;align-items:center;justify-content:space-between;gap:12px;padding:10px 14px;background:' + W + ';border-bottom:1px solid ' + BD);
  const inner = (
    <>
      <div style={css('min-width:0')}><div style={css('font-weight:700;font-size:16px')}>{t}</div>{s ? <div style={css('font-size:13px;color:' + MU + ';margin-top:2px')}>{s}</div> : null}</div>
      {r !== undefined ? r : ic('chev', 18, SU)}
    </>
  );
  if (onClick) return <button type="button" className="k-tap k-reset" onClick={onClick} style={{ ...style, width: '100%', border: 0, borderBottom: '1px solid ' + BD, color: N }}>{inner}</button>;
  return <div style={style}>{inner}</div>;
}
export function setGrp(t: ReactNode, rows: ReactNode[]) {
  return (
    <>
      <div style={css('flex:none;font-family:' + MO + ';font-size:12px;letter-spacing:0.04em;color:' + SU + ';text-transform:uppercase;margin:6px 0 -4px 4px')}>{t}</div>
      <div style={css('flex:none;border:1px solid ' + BL + ';border-radius:10px;overflow:hidden')}>{rows}</div>
    </>
  );
}
export function sb(t: ReactNode, k?: 'p' | 's' | 'd' | 'ok', o: { h?: number; ic?: string; onClick?: Click; disabled?: boolean; title?: string } = {}) {
  const m = ({ p: [N, W, N], s: [W, N, '#A3A39D'], d: [W, R, R], ok: [G, W, G] } as Record<string, string[]>)[k || 's'];
  return (
    <button type="button" className="k-btn k-reset" onClick={o.disabled ? undefined : o.onClick} disabled={o.disabled} title={o.title}
      style={{ ...css('display:inline-flex;align-items:center;gap:8px;height:' + (o.h || 42) + 'px;padding:0 16px;border-radius:6px;background:' + m[0] + ';color:' + m[1] + ';border:2px solid ' + m[2] + ';font-weight:700;font-size:14px;white-space:nowrap'), opacity: o.disabled ? 0.5 : 1, cursor: o.disabled ? 'not-allowed' : 'pointer' }}>
      {o.ic ? ic(o.ic, 16) : null}{t}
    </button>
  );
}
export function tg(on: boolean, o: { onClick?: Click; label?: string; disabled?: boolean; title?: string } = {}) {
  const inner = <span style={css('position:absolute;top:3px;' + (on ? 'right:3px' : 'left:3px') + ';width:22px;height:22px;border-radius:50%;background:#fff;box-shadow:0 1px 3px rgba(0,0,0,0.3)')} />;
  const style = css('flex:none;width:48px;height:28px;border-radius:999px;background:' + (on ? G : '#CBCBC6') + ';position:relative;display:inline-block');
  if (!o.onClick && !o.disabled) return <span style={style}>{inner}</span>;
  return <button type="button" role="switch" aria-checked={on} aria-label={o.label} title={o.title} className="k-tap k-reset" disabled={o.disabled} onClick={o.disabled ? undefined : o.onClick} style={{ ...style, border: 0, padding: 0, cursor: o.disabled ? 'not-allowed' : 'pointer' }}>{inner}</button>;
}
export function dt(head: ReactNode[], rows: { key: string; cells: ReactNode[]; onClick?: Click; on?: boolean }[], cols: string) {
  return (
    <div style={css('border:1px solid ' + BL + ';border-radius:8px;background:' + W + ';overflow:hidden')}>
      <div style={css('display:grid;grid-template-columns:' + cols + ';gap:14px;padding:12px 16px;background:' + PA + ';border-bottom:1px solid #09163a9e;font-family:' + MO + ';font-size:12px;letter-spacing:0.04em;color:' + SU + ';text-transform:uppercase')}>
        {head.map((h, i) => <span key={i}>{h}</span>)}
      </div>
      {rows.map((r, i) => (
        <div key={r.key} onClick={r.onClick} className={r.onClick ? 'k-tap' : undefined}
          style={css('display:grid;grid-template-columns:' + cols + ';gap:14px;align-items:center;min-height:56px;padding:8px 16px;font-size:14px;' + (i ? 'border-top:1px solid ' + BD : '') + (r.on ? ';background:' + N05 : ''))}>
          {r.cells.map((c, j) => <span key={j} style={css('min-width:0')}>{c}</span>)}
        </div>
      ))}
    </div>
  );
}
export function pill(t: ReactNode, k?: 'ok' | 'warn' | 'err' | 'n' | 'g') {
  const m = ({ ok: [G1, G], warn: [A1, A], err: [R1, R7], n: [N05, N], g: ['#EFEFEC', '#43433F'] } as Record<string, string[]>)[k || 'g'];
  return <span style={css('display:inline-flex;align-items:center;height:26px;padding:0 10px;border-radius:999px;background:' + m[0] + ';color:' + m[1] + ';font-size:12px;font-weight:800;letter-spacing:0.02em;white-space:nowrap')}>{t}</span>;
}
