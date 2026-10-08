/* The damage marker's own generator functions from source/08-damage-output-compression.js
   (lbar, pinItem, rail, the DK letter grid, the photo slot, the loupe, the turn sideways
   picture) and the notes field from source/02. Style strings are the pack's own. Where the
   pack draws a static element, the handler it needs is added through the options object. */
import type { ReactNode, MouseEvent } from 'react';
import { css } from '../../kit/css';
import { ic, sg, btn } from '../../kit/kit';
import { trailerSVG, type View, type Drawing } from '../../kit/drawings';
import { N, R, R1, W, MU, SU, BL, N05, PT, MO } from '../../kit/tokens';

type Click = (e: MouseEvent) => void;

/* Placeholder colour for the note fields: field() in source/02 draws empty text in #7A7A74. */
if (typeof document !== 'undefined' && !document.getElementById('dk-states')) {
  const el = document.createElement('style');
  el.id = 'dk-states';
  el.textContent = '.dk-in::placeholder{color:#7A7A74;opacity:1}.dk-in{outline:none}';
  document.head.appendChild(el);
}

export function lbar(t: ReactNode, s?: ReactNode, right?: ReactNode, onBack?: () => void) {
  return (
    <div style={css('display:flex;align-items:center;gap:10px;min-height:44px')}>
      <button type="button" className="k-tap k-reset" onClick={onBack} aria-label="Back"
        style={{ ...css('width:44px;height:44px;border-radius:8px;display:flex;align-items:center;justify-content:center'), background: 'transparent', border: 0, padding: 0, color: N, flex: 'none' }}>{ic('back', 22)}</button>
      <div style={css('flex:1;min-width:0')}>
        <div style={css('font-family:' + PT + ';font-weight:800;font-size:18px;letter-spacing:-0.02em')}>{t}</div>
        {s ? <div style={css('font-size:12px;color:' + MU)}>{s}</div> : null}
      </div>
      {right || null}
    </div>
  );
}

export function pinItem(n: ReactNode, t: ReactNode, where: ReactNode, ph: ReactNode, o: { on?: boolean; old?: boolean; onClick?: Click; label?: string } = {}) {
  const style = css('display:flex;align-items:center;gap:10px;padding:8px;border-radius:8px;background:' + (o.on ? N05 : W) + ';border:' + (o.on ? 2 : 1) + 'px solid ' + (o.on ? N : BL));
  const inner = (
    <>
      <span style={css('flex:none;width:26px;height:26px;border-radius:50%;background:' + (o.old ? '#8A8F99' : R) + ';color:#fff;font-weight:800;font-size:13px;display:flex;align-items:center;justify-content:center')}>{n}</span>
      <div style={css('flex:1;min-width:0')}>
        <div style={css('font-weight:700;font-size:13px')}>{t}</div>
        <div style={css('font-size:11px;color:' + MU)}>{where}{ph ? <> &middot; {ph}</> : null}</div>
      </div>
    </>
  );
  if (o.onClick) return <button type="button" className="k-tap k-reset" onClick={o.onClick} aria-label={o.label} aria-pressed={o.on || undefined} style={{ ...style, width: '100%', color: N, flex: 'none' }}>{inner}</button>;
  return <div style={{ ...style, flex: 'none' }}>{inner}</div>;
}

export function rail(items: ReactNode, btnTxt: ReactNode, onBtn: () => void, title?: string) {
  return (
    <div style={css('width:200px;flex:none;background:' + W + ';border-left:1px solid ' + BL + ';padding:12px;display:flex;flex-direction:column;gap:8px')}>
      <div style={css('font-family:' + MO + ';font-size:11px;letter-spacing:0.04em;color:' + SU)}>MARKS</div>
      <div style={{ flex: '0 1 auto', minHeight: 0, overflowY: 'auto', scrollbarWidth: 'none', display: 'flex', flexDirection: 'column', gap: 8 }}>{items}</div>
      <div style={css('margin-top:auto')}>{btn(<span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{btnTxt}</span>, 'p', { h: 52, w: '100%', css: 'font-size:15px;padding:0 10px', onClick: onBtn, title })}</div>
    </div>
  );
}

/* "What kind?" letters. The list and its order come from the office (Lists and wording). */
export function kinds(list: { code: string; name: string }[], on: string | null, pick: (code: string) => void) {
  return (
    <div role="radiogroup" aria-label="What kind?" style={css('display:grid;grid-template-columns:repeat(4,1fr);gap:6px')}>
      {list.map((k) => {
        const a = k.code === on;
        return (
          <button key={k.code} type="button" role="radio" aria-checked={a} className="k-tap k-reset" onClick={() => pick(k.code)}
            style={{ ...css('min-height:44px;display:flex;align-items:center;gap:6px;padding:0 8px;border-radius:8px;border:' + (a ? 3 : 2) + 'px solid ' + (a ? R : '#A3A39D') + ';background:' + (a ? R1 : W) + ';font-weight:700;font-size:13px'), color: N }}>
            <span style={css('min-width:24px;height:22px;border-radius:4px;background:' + (a ? R : N) + ';color:#fff;font-family:' + MO + ';font-size:11px;display:flex;align-items:center;justify-content:center')}>{k.code}</span>{k.name}
          </button>
        );
      })}
    </div>
  );
}

export function slot(t: string, done: boolean, req: boolean, o: { src?: string | null; onClick?: Click; label?: string } = {}) {
  const style = css('flex:1;height:76px;border-radius:8px;' + (done ? 'background:linear-gradient(135deg,#8C95A6,#5B6476);color:#fff' : 'border:2px dashed #A3A39D;background:' + W) + ';display:flex;flex-direction:column;align-items:center;justify-content:center;gap:2px;font-size:12px;font-weight:700;position:relative');
  const bg = done && o.src ? { backgroundImage: 'url(' + o.src + '),linear-gradient(135deg,#8C95A6,#5B6476)', backgroundSize: 'cover', backgroundPosition: 'center' } : {};
  return (
    <button type="button" className="k-tap k-reset" onClick={o.onClick} aria-label={o.label || t}
      style={{ ...style, ...bg, ...(done ? { border: 0 } : {}), padding: 0, color: done ? '#fff' : N, minWidth: 0 }}>
      {done ? <span style={css('position:absolute;top:6px;right:6px')}>{sg('done', 20)}</span> : ic('cam', 20)}
      <span>{t}{req && !done ? <> <span style={css('color:' + R)}>*</span></> : null}</span>
    </button>
  );
}

/* The magnifier from screen B. The drawing inside is the pack's 700px copy, moved so the
   point under the finger sits under the red dot in the middle. */
export function loupe(view: View, drawing: Drawing, x: number, y: number) {
  const left = 55 - x * 700, top = 55 - y * 700 * (220 / 640);
  return (
    <div style={{ ...css('position:absolute;top:-8%;width:110px;height:110px;border-radius:50%;border:4px solid #fff;box-shadow:0 8px 24px rgba(9,22,58,0.4);overflow:hidden;background:#fff'), left: (x * 100 - 21) + '%', pointerEvents: 'none' }}>
      <div style={{ ...css('position:absolute;width:700px'), left: left + 'px', top: top + 'px' }}>{trailerSVG(view, drawing)}</div>
      <div style={css('position:absolute;left:50%;top:50%;width:14px;height:14px;margin:-7px 0 0 -7px;border-radius:50%;background:' + R + ';border:3px solid #fff')} />
    </div>
  );
}

export function hint(t: ReactNode) {
  return <div style={{ ...css('position:absolute;left:50%;top:6px;transform:translateX(-50%);padding:8px 14px;border-radius:999px;background:' + N + ';color:#fff;font-size:13px;font-weight:700;white-space:nowrap'), pointerEvents: 'none' }}>{t}</div>;
}

export function rotArt() {
  return (
    <div style={css('position:relative;width:150px;height:150px')} aria-hidden="true">
      <div style={css('position:absolute;left:47px;top:15px;width:56px;height:100px;border-radius:12px;border:4px solid ' + N + ';opacity:0.3')} />
      <div style={css('position:absolute;left:25px;top:37px;width:100px;height:56px;border-radius:12px;border:4px solid ' + N + ';background:' + W)} />
      <svg style={css('position:absolute;right:0;top:0')} width="60" height="60" viewBox="0 0 60 60">
        <path d="M14 10 A 36 36 0 0 1 50 40" fill="none" stroke={R} strokeWidth="4" strokeLinecap="round" />
        <path d="M42 40 h10 v-10" fill="none" stroke={R} strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </div>
  );
}

/* field() from source/02, as a real input. Focus draws the 3px navy border the pack gives. */
export function noteBox(value: string, set: (v: string) => void, o: { focus: boolean; onFocus: () => void; onBlur: () => void; ph?: string }) {
  return (
    <div style={css('min-height:60px;display:flex;align-items:center;gap:10px;padding:0 16px;border-radius:8px;background:' + W + ';border:' + (o.focus ? 3 : 2) + 'px solid ' + (o.focus ? N : '#A3A39D') + ';box-sizing:border-box;font-size:19px;color:' + N)}>
      <input className="dk-in" value={value} onChange={(e) => set(e.target.value)} onFocus={o.onFocus} onBlur={o.onBlur} placeholder={o.ph}
        aria-label="Describe the damage" enterKeyHint="done"
        style={{ flex: 1, minWidth: 0, border: 0, background: 'transparent', font: 'inherit', color: 'inherit', padding: 0, minHeight: 56 }} />
    </div>
  );
}
