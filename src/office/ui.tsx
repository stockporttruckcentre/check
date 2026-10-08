/* Office pieces shared by every screen. Each style string is the pack's own
   (source/07 dk, dh, the Add a person and Undo dialogs; source/06 inp; source/03
   the selection sheet), kept verbatim so it can be checked against the file. */
import { useEffect, useState, useSyncExternalStore, type ReactNode, type ChangeEvent, type KeyboardEvent } from 'react';
import { css } from '../kit/css';
import { ic, sg, toast as kitToast, sheet, type ToastKind } from '../kit/kit';
import { N, R, W, MU, BL, PT } from '../kit/tokens';
import { PERM_LABELS, type Perms } from '../data/types';

/* Focus state for the typed fields: README, Input border focus 3px #09163A. */
const FOCUS = `.o-inp:focus{outline:none;border:3px solid ${N}!important}.o-inp::placeholder{color:#7A7A74}`;
if (typeof document !== 'undefined' && !document.getElementById('o-states')) {
  const el = document.createElement('style');
  el.id = 'o-states';
  el.textContent = FOCUS;
  document.head.appendChild(el);
}

/* ---------- source/07 dh() ---------- */
export function dh(t: ReactNode, sub?: ReactNode, acts?: ReactNode) {
  return (
    <div style={css('display:flex;align-items:flex-end;justify-content:space-between;gap:20px;margin-bottom:18px')}>
      <div>
        <h1 style={css('margin:0;font-family:' + PT + ';font-weight:800;font-size:26px;letter-spacing:-0.03em')}>{t}</h1>
        {sub ? <div style={css('font-size:14px;color:' + MU + ';margin-top:4px')}>{sub}</div> : null}
      </div>
      <div style={css('display:flex;gap:10px')}>{acts || null}</div>
    </div>
  );
}

/* ---------- source/06 inp(), with a real field inside ---------- */
export function inp(label: ReactNode, control: ReactNode, o: { req?: boolean; tag?: ReactNode } = {}) {
  return (
    <label style={css('display:flex;flex-direction:column;gap:6px;min-width:0')}>
      <div style={css('display:flex;justify-content:space-between;align-items:center;gap:8px')}>
        <span style={css('font-weight:700;font-size:15px')}>{label}{o.req ? <> <span style={css('color:' + R)}>*</span></> : null}</span>
        {o.tag || null}
      </div>
      {control}
    </label>
  );
}
const BOX = 'min-height:56px;display:flex;align-items:center;padding:0 14px;border-radius:8px;background:' + W + ';border:2px solid #A3A39D;font-size:18px';
export function Field(p: { value: string; onChange: (v: string) => void; ph?: string; type?: string; mono?: boolean; disabled?: boolean; autoFocus?: boolean; onEnter?: () => void; label?: string }) {
  return (
    <input className="o-inp" value={p.value} placeholder={p.ph} type={p.type || 'text'} disabled={p.disabled} autoFocus={p.autoFocus} aria-label={p.label}
      onChange={(e: ChangeEvent<HTMLInputElement>) => p.onChange(e.target.value)}
      onKeyDown={(e: KeyboardEvent<HTMLInputElement>) => { if (e.key === 'Enter' && p.onEnter) p.onEnter(); }}
      style={{ ...css(BOX + ';box-sizing:border-box;width:100%;color:' + N + ';font-family:inherit' + (p.mono ? ';font-family:ui-monospace,Menlo,Consolas,monospace;font-weight:800' : '')), padding: '0 14px' }} />
  );
}
/** A choice shown in the inp() box, opening the pack's selection sheet (source/03 S_overlays). */
export function Choice<T extends string>(p: { value: T; options: [T, string][]; onChange: (v: T) => void; title: string; disabled?: boolean; disabledTitle?: string }) {
  const [open, setOpen] = useState(false);
  const cur = p.options.find((o) => o[0] === p.value);
  return (
    <>
      <button type="button" className="k-tap k-reset o-inp" disabled={p.disabled} title={p.disabled ? p.disabledTitle : undefined} onClick={() => setOpen(true)}
        style={{ ...css(BOX + ';box-sizing:border-box;width:100%;gap:10px;color:' + N), cursor: p.disabled ? 'not-allowed' : 'pointer' }}>
        <span style={css('flex:1;text-align:left')}>{cur ? cur[1] : ''}</span>{ic('down', 20, MU)}
      </button>
      {open ? <SelectSheet title={p.title} options={p.options} value={p.value} onPick={(v) => { setOpen(false); p.onChange(v); }} onClose={() => setOpen(false)} /> : null}
    </>
  );
}
export function SelectSheet<T extends string>(p: { title: string; options: [T, string][]; value: T; onPick: (v: T) => void; onClose: () => void }) {
  return sheet(
    <>
      <div style={css('font-family:' + PT + ';font-weight:800;font-size:22px')}>{p.title}</div>
      {p.options.map(([v, t]) => {
        const on = v === p.value;
        return (
          <button key={v} type="button" className="k-tap k-reset" onClick={() => p.onPick(v)} aria-pressed={on}
            style={css('min-height:60px;display:flex;align-items:center;gap:14px;padding:0 6px;border:0;border-bottom:1px solid ' + BL + ';background:transparent;color:' + N + ';font-size:18px;font-weight:' + (on ? 800 : 500))}>
            {on ? sg('done', 26) : <span style={css('width:26px;height:26px;border-radius:50%;border:2px solid #A3A39D;box-sizing:border-box;flex:none')} />}{t}
          </button>
        );
      })}
    </>,
    { onClose: p.onClose, label: p.title },
  );
}

/* ---------- Dialog: the pack's Add a person / Undo dialog box (source/07) ---------- */
export function Dialog(p: { title: ReactNode; children: ReactNode; onClose: () => void; w?: number }) {
  useEffect(() => {
    const k = (e: globalThis.KeyboardEvent) => { if (e.key === 'Escape') p.onClose(); };
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, [p]);
  return (
    <div role="dialog" aria-modal="true" onClick={(e) => { if (e.target === e.currentTarget) p.onClose(); }}
      style={css('position:fixed;inset:0;z-index:50;background:rgba(9,22,58,0.55);display:flex;flex-direction:column;justify-content:center;align-items:center;padding:0 18px')}>
      <div style={css('width:' + (p.w || 440) + 'px;max-width:100%;max-height:92dvh;overflow-y:auto;box-sizing:border-box;border-radius:12px;background:' + W + ';box-shadow:0 24px 60px rgba(9,22,58,0.25);border:1px solid ' + BL + ';padding:24px;display:flex;flex-direction:column;gap:14px;color:' + N)}>
        <div style={css('font-family:' + PT + ';font-weight:800;font-size:22px')}>{p.title}</div>
        {p.children}
      </div>
    </div>
  );
}
export const note = (t: ReactNode) => <div style={css('font-size:13px;color:' + MU)}>{t}</div>;
export const body = (t: ReactNode) => <div style={css('font-size:15px;line-height:1.45')}>{t}</div>;
export const acts = (t: ReactNode) => <div style={css('display:flex;justify-content:flex-end;gap:10px')}>{t}</div>;

/* ---------- The dashed "Add an item" box (source/07 S_builder) ---------- */
export function dashed(t: ReactNode, o: { onClick?: () => void; disabled?: boolean; title?: string }) {
  return (
    <button type="button" className="k-tap k-reset" onClick={o.disabled ? undefined : o.onClick} disabled={o.disabled} title={o.title}
      style={{ ...css('min-height:44px;display:flex;align-items:center;justify-content:center;gap:8px;border:2px dashed #A3A39D;border-radius:8px;font-weight:700;font-size:14px;background:transparent;color:' + N), width: '100%', cursor: o.disabled ? 'not-allowed' : 'pointer' }}>
      {ic('plus', 18)}{t}
    </button>
  );
}

/* ---------- Search box (source/07 S_log, source/05 S_admin) ---------- */
export function search(value: string, onChange: (v: string) => void, ph: string, h: number, extra = '') {
  return (
    <label style={css('height:' + h + 'px;border-radius:8px;border:2px solid #A3A39D;display:flex;align-items:center;gap:10px;padding:0 12px;color:' + MU + ';background:' + W + ';box-sizing:border-box;' + extra)}>
      {ic('search', h >= 48 ? 20 : 18, MU)}
      <input value={value} placeholder={ph} aria-label={ph} onChange={(e) => onChange(e.target.value)}
        style={css('flex:1;min-width:0;border:0;outline:none;background:transparent;font:inherit;color:' + N)} />
    </label>
  );
}

/* ---------- Toasts ---------- */
let toasts: { id: number; k: ToastKind; t: string }[] = [];
const tsubs = new Set<() => void>();
let tid = 0;
export function say(k: ToastKind, t: string) {
  const id = ++tid;
  toasts = [...toasts, { id, k, t }];
  tsubs.forEach((f) => f());
  if (k !== 'err') setTimeout(() => dismiss(id), 3000);
}
function dismiss(id: number) { toasts = toasts.filter((x) => x.id !== id); tsubs.forEach((f) => f()); }
export function Toasts() {
  const list = useSyncExternalStore((f) => { tsubs.add(f); return () => tsubs.delete(f); }, () => toasts);
  if (!list.length) return null;
  return (
    <div style={css('position:fixed;left:50%;bottom:24px;transform:translateX(-50%);z-index:60;display:flex;flex-direction:column;gap:10px;width:420px;max-width:calc(100% - 32px)')}>
      {list.map((x) => <div key={x.id}>{kitToast(x.k, x.t, x.k === 'err' ? { act: 'OK', onAct: () => dismiss(x.id) } : {})}</div>)}
    </div>
  );
}

/* ---------- What somebody may do ---------- */
export function need(p: keyof Perms) {
  const l = PERM_LABELS.find((x) => x[0] === p)?.[1] || p;
  return 'Your role doesn’t have the permission: ' + l;
}

/* ---------- Screen settings remembered on this computer ---------- */
export function useRemember<T>(key: string, init: T): [T, (v: T) => void] {
  const k = 'stc-office-' + key;
  const [v, setV] = useState<T>(() => {
    try { const s = localStorage.getItem(k); return s == null ? init : (JSON.parse(s) as T); } catch { return init; }
  });
  const set = (n: T) => { setV(n); try { localStorage.setItem(k, JSON.stringify(n)); } catch { /* private window */ } };
  return [v, set];
}

/* ---------- Files ---------- */
export function saveBlob(blob: Blob, name: string) {
  const u = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = u; a.download = name;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(u), 4000);
}
export function csv(name: string, head: string[], rows: (string | number | null | undefined)[][]) {
  const q = (v: string | number | null | undefined) => { const s = v == null ? '' : String(v); return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; };
  const text = [head, ...rows].map((r) => r.map(q).join(',')).join('\r\n');
  saveBlob(new Blob(['﻿' + text], { type: 'text/csv;charset=utf-8' }), name);
}

export function useWidth() {
  const [w, setW] = useState(() => (typeof window === 'undefined' ? 1280 : window.innerWidth));
  useEffect(() => { const f = () => setW(window.innerWidth); window.addEventListener('resize', f); return () => window.removeEventListener('resize', f); }, []);
  return w;
}

export const mono = (t: ReactNode) => <b style={css('font-family:ui-monospace,Menlo,Consolas,monospace')}>{t}</b>;
export const muted = (t: ReactNode) => <span style={css('color:' + MU)}>{t}</span>;
export const initials = (n: string) => n.split(/\s+/).filter(Boolean).slice(0, 2).map((x) => x[0]).join('').toUpperCase();
