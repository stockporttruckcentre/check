/* stage() from source/08 with the hands added: a tap anywhere on the drawing reports
   where, as a point on the drawing (0 to 1 each way), never as screen pixels. With
   pinch on (the upright view), two fingers zoom and pan it. */
import { useRef, useState, type CSSProperties, type ReactNode, type RefObject, type PointerEvent as RPointerEvent, type MouseEvent } from 'react';
import { css } from '../../kit/css';
import { trailerSVG, pin, type View, type Drawing, type PinKind } from '../../kit/drawings';

export interface BoardPin { key: string; n: ReactNode; x: number; y: number; k?: PinKind; onPointerDown?: (e: RPointerEvent) => void; onClick?: (e: MouseEvent) => void; label?: string }
interface Props {
  view: View; drawing: Drawing; pins: BoardPin[]; w?: string; extra?: ReactNode;
  onTap?: (x: number, y: number) => void; pinch?: boolean; stageRef: RefObject<HTMLDivElement | null>;
}

const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));
export const unit = (v: number) => clamp(v, 0, 1);

export default function Board(p: Props) {
  const pts = useRef(new Map<number, { x: number; y: number }>());
  const tap = useRef<{ id: number; sx: number; sy: number; multi: boolean } | null>(null);
  const zoom = useRef<{ s0: number; tx0: number; ty0: number; mx0: number; my0: number; d0: number } | null>(null);
  const outer = useRef<HTMLDivElement>(null);
  const [tf, setTf] = useState({ s: 1, tx: 0, ty: 0 });
  const tfRef = useRef(tf);
  tfRef.current = tf;

  function two() {
    const [a, b] = [...pts.current.values()];
    return { mx: (a.x + b.x) / 2, my: (a.y + b.y) / 2, d: Math.hypot(a.x - b.x, a.y - b.y) || 1 };
  }
  function down(e: RPointerEvent<HTMLDivElement>) {
    pts.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    try { e.currentTarget.setPointerCapture(e.pointerId); } catch { /* already gone */ }
    if (pts.current.size === 1) tap.current = { id: e.pointerId, sx: e.clientX, sy: e.clientY, multi: false };
    else {
      if (tap.current) tap.current.multi = true;
      if (p.pinch && pts.current.size === 2) {
        const t = two();
        zoom.current = { s0: tfRef.current.s, tx0: tfRef.current.tx, ty0: tfRef.current.ty, mx0: t.mx, my0: t.my, d0: t.d };
      }
    }
  }
  function move(e: RPointerEvent<HTMLDivElement>) {
    if (!pts.current.has(e.pointerId)) return;
    pts.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    const z = zoom.current, o = outer.current;
    if (!z || !o || pts.current.size < 2) return;
    const r = o.getBoundingClientRect();
    const t = two();
    const s = clamp(z.s0 * (t.d / z.d0), 1, 4);
    const cx = (z.mx0 - r.left - z.tx0) / z.s0, cy = (z.my0 - r.top - z.ty0) / z.s0;
    let tx = t.mx - r.left - cx * s, ty = t.my - r.top - cy * s;
    tx = clamp(tx, r.width - r.width * s, 0); ty = clamp(ty, r.height - r.height * s, 0);
    setTf(s === 1 ? { s: 1, tx: 0, ty: 0 } : { s, tx, ty });
  }
  function up(e: RPointerEvent<HTMLDivElement>, cancel = false) {
    pts.current.delete(e.pointerId);
    if (pts.current.size < 2) zoom.current = null;
    const t = tap.current;
    if (!cancel && t && t.id === e.pointerId && !t.multi && Math.hypot(e.clientX - t.sx, e.clientY - t.sy) < 10 && p.onTap) {
      const r = p.stageRef.current?.getBoundingClientRect();
      if (r && r.width && r.height) p.onTap(unit((e.clientX - r.left) / r.width), unit((e.clientY - r.top) / r.height));
    }
    if (!pts.current.size) tap.current = null;
  }

  const zoomed = tf.s !== 1;
  return (
    <div ref={outer} style={{ width: '100%', touchAction: 'none' }}>
      <div ref={p.stageRef} onPointerDown={down} onPointerMove={move} onPointerUp={(e) => up(e)} onPointerCancel={(e) => up(e, true)}
        onContextMenu={(e) => e.preventDefault()}
        style={{
          ...css('position:relative;width:' + (p.w || '100%') + ';margin:0 auto'),
          touchAction: 'none', userSelect: 'none', WebkitUserSelect: 'none', WebkitTouchCallout: 'none', cursor: p.onTap ? 'crosshair' : undefined,
          transform: zoomed ? 'translate(' + tf.tx + 'px,' + tf.ty + 'px) scale(' + tf.s + ')' : undefined, transformOrigin: '0 0',
        } as CSSProperties}>
        {trailerSVG(p.view, p.drawing)}
        {p.pins.map((x) => <div key={x.key}>{pin(x.n, x.x, x.y, x.k, { onPointerDown: x.onPointerDown, onClick: x.onClick, label: x.label })}</div>)}
        {p.extra || null}
      </div>
    </div>
  );
}
