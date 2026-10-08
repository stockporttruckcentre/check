/* The damage step, /check/:id/damage. Screens, all from the pack:
   source/04 s7       Damage: yes or no first (and the marks already recorded)
   source/03 ins      Damage card, for marks made earlier in this check
   source/05 e3       New damage on check in, beside the check out photo
   source/08 rot      8, Turn your phone sideways
   source/08 port     9, Upright fallback, pinch to zoom
   source/08 B        A, Tap to drop a pin
   source/08 C        B, Drag to fine tune, with the magnifier
   source/08 D        C, Details for the pin
   source/08 E        D, the labelled camera (phone/Camera.tsx draws it)
   source/08 F        E, Check before saving
   source/05 e        Gallery and retake, for a pin's photos
   ?item=<itemId> means the person came from General items by answering Damaged: the
   question is skipped and the pins made on this visit carry that item. */
import { useEffect, useRef, useState, type ReactNode, type PointerEvent as RPointerEvent } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { css } from '../../kit/css';
import { ic, sg, btn, footer, scroll, topbar, sheet, toast, banner, badge, photo, sb, card, chip, type ToastKind } from '../../kit/kit';
import { stage, vtabs, legend, type View } from '../../kit/drawings';
import { N, R, R7, W, MU, SU, BL, N05, PT, IN, MO } from '../../kit/tokens';
import type { Check, DamagePin, OldPin, PhotoMeta } from '../../data/types';
import { useConfig, configFor } from '../../lib/config';
import { zoneOf, zoneFileLabel, damageName, drawingFor, typeName, photoFor, photoFileName, fleetTag, dirWord, VIEW_SHORT } from '../../lib/check';
import { dayMon } from '../../lib/format';
import { uuid } from '../../lib/ids';
import { db } from '../../lib/db';
import { buzz } from '../../lib/photo';
import { useCheck, usePhotoUrl } from '../useCheck';
import Camera, { type Taken } from '../Camera';
import Board, { unit, type BoardPin } from './Board';
import { lbar, pinItem, rail, kinds, slot, loupe, hint, rotArt, noteBox } from './parts';
import { useLastCheck, useSignedUrl, lastPinPhoto } from './remote';

type Phase = 'ask' | 'mark' | 'details' | 'gallery';
type Sheet = { k: 'verdict'; id: string } | { k: 'phrases' } | { k: 'delPhoto'; id: string } | null;
interface Toast { kind: ToastKind; text: string; act?: string; onAct?: () => void; key: number }

const PORTRAIT = 'position:relative;height:100dvh;overflow:hidden;background:#F7F7F5;display:flex;flex-direction:column;font-family:' + IN + ';color:' + N + ';letter-spacing:-0.01em';
const LANDSCAPE = 'height:100dvh;width:100%;overflow:hidden;background:#F7F7F5;display:flex;position:relative;color:' + N + ';font-family:' + IN + ';letter-spacing:-0.01em';

function useLandscape() {
  const q = '(orientation: landscape)';
  const [on, setOn] = useState(() => typeof window !== 'undefined' && window.matchMedia(q).matches);
  useEffect(() => {
    const mq = window.matchMedia(q);
    const f = () => setOn(mq.matches);
    mq.addEventListener('change', f);
    return () => mq.removeEventListener('change', f);
  }, []);
  return on;
}

const shotName = (shot: number) => (shot === 1 ? 'Close-up' : shot === 2 ? 'Wide shot' : 'Photo ' + shot);
const camTitle = (shot: number) => (shot === 1 ? 'Close-up' : shot === 2 ? 'Wide shot: show where it is on the trailer' : 'Photo ' + shot);
/** "OS rear" from view os and zone "Offside, rear", as the pack labels a photo tile. */
function shortZone(view: View, zone: string) {
  const rest = zone.includes(',') ? zone.split(',').slice(1).join(',').trim() : '';
  return VIEW_SHORT[view] + (rest ? ' ' + rest : '');
}
const plural = (n: number, one: string, many: string) => n + ' ' + (n === 1 ? one : many);

/* A photo tile showing a photo kept on the phone. */
function PhonePhoto(p: { id?: string | null; label: string; ar?: string; st?: string; bg?: string; onClick?: () => void; aria?: string }) {
  const url = usePhotoUrl(p.id || null);
  return photo(p.label, { ar: p.ar, st: p.st, bg: p.bg, src: url || undefined, onClick: p.onClick, label: p.aria });
}
/* A photo tile showing a photo from the last sent check, or the grey tile with no signal. */
function RemotePhoto(p: { path: string | null; label: string; ar?: string; online: boolean }) {
  const url = useSignedUrl(p.path, p.online);
  return photo(p.label, { ar: p.ar, src: url || undefined });
}
function Slot(p: { t: string; photoId?: string; req: boolean; onClick: () => void; label: string }) {
  const url = usePhotoUrl(p.photoId || null);
  return slot(p.t, !!p.photoId, p.req, { src: url, onClick: p.onClick, label: p.label });
}

export default function DamageStep() {
  const { id } = useParams();
  const [qs] = useSearchParams();
  const item = qs.get('item');
  const nav = useNavigate();
  const { check, photos, update, addPhoto, removePhoto, save, online } = useCheck(id);
  useConfig();
  const config = configFor(check?.configVersion);
  const land = useLandscape();
  const last = useLastCheck(check?.stcNo);

  const [phase, setPhase] = useState<Phase>(item ? 'mark' : 'ask');
  const [upright, setUpright] = useState(false);
  const [view, setView] = useState<View>('ns');
  const [sel, setSel] = useState<string | null>(null);
  const [drag, setDrag] = useState<{ id: string; x: number; y: number; w: string } | null>(null);
  const [cam, setCam] = useState<{ pinId: string; shot: number; earlier: { label: string; hash: string }[] } | null>(null);
  const [gal, setGal] = useState(0);
  const [sh, setSh] = useState<Sheet>(null);
  const [tst, setTst] = useState<Toast | null>(null);
  const [noteFocus, setNoteFocus] = useState(false);
  const toastTimer = useRef<number | undefined>(undefined);
  const stageRef = useRef<HTMLDivElement>(null);
  const itemDone = useRef(false);

  /* Arrived from General items: the answer is yes, straight to the marker. */
  useEffect(() => {
    if (!check || !item || itemDone.current) return;
    itemDone.current = true;
    if (check.damageAnswer !== 'yes') update((c) => { c.damageAnswer = 'yes'; });
  }, [check, item, update]);
  useEffect(() => () => window.clearTimeout(toastTimer.current), []);

  function showToast(kind: ToastKind, text: string, ms: number, act?: string, onAct?: () => void) {
    window.clearTimeout(toastTimer.current);
    const key = Date.now();
    setTst({ kind, text, act, onAct, key });
    toastTimer.current = window.setTimeout(() => setTst((t) => (t && t.key === key ? null : t)), ms);
  }

  if (check === undefined) return <div style={css(PORTRAIT)} />;
  if (check === null) {
    return (
      <div style={css(PORTRAIT)}>
        {topbar('Damage', { onBack: () => nav('/') })}
        {scroll(banner('err', 'This check isn’t on this phone'))}
      </div>
    );
  }
  const c: Check = check;
  const drawing = drawingFor(c.trailerType, config);
  const live = c.pins.filter((p) => !p.removedAt).sort((a, b) => a.number - b.number);
  const dPhotos = (pid: string) => photos.filter((p) => p.section === 'D' && p.refId === pid && !p.removedAt).sort((a, b) => a.shot - b.shot);
  const selPin = live.find((p) => p.id === sel) || null;
  const counts: Partial<Record<View, number>> = {};
  live.forEach((p) => { counts[p.view] = (counts[p.view] || 0) + 1; });
  const back = () => nav('/check/' + c.id);
  const sub = fleetTag(c) + ' · ' + dirWord(c.direction);
  const label = (p: Pick<DamagePin, 'view' | 'zone' | 'type'>) => zoneFileLabel(p.view, p.zone) + '_' + damageName(p.type, config);

  /* ---------- What is left before the marks can be saved (the button names it) ---------- */
  const left: { t: string; pin?: DamagePin; old?: OldPin }[] = [];
  live.forEach((p) => {
    if (!p.type) left.push({ t: 'Damage ' + p.number + ': what kind', pin: p });
    if (!photoFor(photos, 'D', p.id, 1)) left.push({ t: 'Damage ' + p.number + ': close-up', pin: p });
    if (!photoFor(photos, 'D', p.id, 2)) left.push({ t: 'Damage ' + p.number + ': wide shot', pin: p });
  });
  if (c.direction === 'IN') c.oldPins.filter((o) => !o.verdict).forEach((o) => left.push({ t: 'Damage ' + o.letter + ': still there or repaired', old: o }));
  const mainTxt = left.length ? left[0].t : live.length ? 'Save ' + plural(live.length, 'mark', 'marks') : 'Done';
  function onMain() {
    const f = left[0];
    if (f?.pin) { openDetails(f.pin); return; }
    if (f?.old) { setView(f.old.view); setSh({ k: 'verdict', id: f.old.id }); return; }
    if (live.length) { back(); return; }
    /* Yes was answered and nothing was marked: ask the question again rather than record either. */
    update((x) => { if (!x.pins.some((p) => !p.removedAt)) x.damageAnswer = null; });
    setSel(null); setPhase('ask');
  }

  /* ---------- Writes ---------- */
  async function renamePhotos(after: Check, pid: string) {
    const p = after.pins.find((x) => x.id === pid);
    if (!p) return;
    for (const ph of dPhotos(pid)) {
      const fileName = photoFileName(after, 'D', p.number, label(p), ph.shot);
      if (fileName !== ph.fileName) await db.photos.update(ph.id, { fileName });
    }
  }
  function dropPin(x: number, y: number) {
    const pid = uuid();
    update((d) => {
      const n = Math.max(d.nextPin || 1, ...d.pins.map((p) => p.number + 1));
      d.pins.push({ id: pid, number: n, view, x, y, zone: zoneOf(view, x, y, config), type: null, note: '', status: 'new', itemId: item || null, removedAt: null });
      d.nextPin = n + 1;
      d.damageAnswer = 'yes';
    });
    buzz('light');
    setSel(pid);
  }
  async function movePin(pid: string, x: number, y: number) {
    let after: Check | null = null;
    await update((d) => {
      const p = d.pins.find((q) => q.id === pid);
      if (!p) return;
      p.x = x; p.y = y; p.zone = zoneOf(p.view, x, y, config);
      after = d;
    });
    if (after) await renamePhotos(after, pid);
  }
  async function setType(pid: string, code: string) {
    let after: Check | null = null;
    await update((d) => { const p = d.pins.find((q) => q.id === pid); if (p) { p.type = code; after = d; } });
    if (after) await renamePhotos(after, pid);
  }
  function setNote(pid: string, note: string) {
    update((d) => { const p = d.pins.find((q) => q.id === pid); if (p) p.note = note; });
  }
  async function removePin(pid: string) {
    const at = new Date().toISOString();
    const gone = dPhotos(pid).map((p) => p.id);
    await update((d) => { const p = d.pins.find((q) => q.id === pid); if (p) p.removedAt = at; });
    for (const ph of gone) await db.photos.update(ph, { removedAt: at });
    setSel(null); setPhase('mark');
    showToast('ok', 'Damage deleted', 8000, 'Undo', async () => {
      setTst(null);
      await update((d) => { const p = d.pins.find((q) => q.id === pid); if (p) p.removedAt = null; });
      for (const ph of gone) await removePhoto(ph, true);
    });
  }
  function setVerdict(oid: string, v: 'still_there' | 'repaired') {
    update((d) => { const o = d.oldPins.find((q) => q.id === oid); if (o) o.verdict = v; });
    setSh(null);
  }

  /* ---------- Moving between screens ---------- */
  function openDetails(p: DamagePin) { setView(p.view); setSel(p.id); setPhase('details'); }
  async function openCamera(p: DamagePin, shot: number) {
    const others = dPhotos(p.id).filter((x) => x.shot !== shot);
    let earlier: { label: string; hash: string }[] = [];
    try {
      const rows = await db.kv.bulkGet(others.map((o) => 'hash:' + o.id));
      earlier = others.map((o, i) => ({ label: shotName(o.shot), hash: rows[i]?.value as string })).filter((e) => typeof e.hash === 'string');
    } catch { earlier = []; }
    setCam({ pinId: p.id, shot, earlier });
  }
  const nextShot = (pid: string) => Math.max(2, ...dPhotos(pid).map((x) => x.shot)) + 1;

  /* Hold a pin for 300ms, then drag it. A quick tap selects it instead (screen B), where
     a tap on the drawing places it: so holding is never the only way to move a pin. */
  function holdPin(e: RPointerEvent, p: DamagePin) {
    e.stopPropagation();
    const pid = e.pointerId, sx = e.clientX, sy = e.clientY;
    const w = stageW;
    let dragging = false, cancelled = false, off = { x: 0, y: 0 }, pos = { x: p.x, y: p.y };
    const norm = (cx: number, cy: number) => {
      const r = stageRef.current?.getBoundingClientRect();
      return r && r.width && r.height ? { x: (cx - r.left) / r.width, y: (cy - r.top) / r.height } : null;
    };
    const t = window.setTimeout(() => {
      dragging = true;
      const f = norm(sx, sy);
      off = f ? { x: f.x - p.x, y: f.y - p.y } : off;
      buzz('light');
      setSel(p.id); setPhase('mark');
      setDrag({ id: p.id, x: p.x, y: p.y, w });
    }, 300);
    const mv = (ev: PointerEvent) => {
      if (ev.pointerId !== pid) return;
      if (!dragging) {
        if (Math.hypot(ev.clientX - sx, ev.clientY - sy) > 10) { cancelled = true; window.clearTimeout(t); }
        return;
      }
      ev.preventDefault();
      const f = norm(ev.clientX, ev.clientY);
      if (!f) return;
      pos = { x: unit(f.x - off.x), y: unit(f.y - off.y) };
      setDrag((d) => (d ? { ...d, ...pos } : d));
    };
    const end = (ev: PointerEvent) => {
      if (ev.pointerId !== pid) return;
      window.clearTimeout(t);
      window.removeEventListener('pointermove', mv);
      window.removeEventListener('pointerup', end);
      window.removeEventListener('pointercancel', end);
      if (dragging) { movePin(p.id, pos.x, pos.y).finally(() => setDrag(null)); }
      else if (!cancelled && ev.type === 'pointerup') { setSel(p.id); setPhase('mark'); }
    };
    window.addEventListener('pointermove', mv, { passive: false });
    window.addEventListener('pointerup', end);
    window.addEventListener('pointercancel', end);
  }

  /* ---------- The drawing ---------- */
  const moving = phase === 'mark' && !!selPin;
  const stageW = drag ? drag.w : moving && land ? '60%' : '100%';
  function boardPins(v: View, only?: DamagePin, act?: boolean): BoardPin[] {
    const out: BoardPin[] = [];
    const news = only ? [only] : live.filter((p) => p.view === v);
    news.forEach((p) => {
      const d = drag && drag.id === p.id ? drag : null;
      const isAct = act || p.id === sel && moving;
      out.push({
        key: p.id, n: p.number, x: (d ? d.x : p.x) * 100, y: (d ? d.y : p.y) * 100, k: isAct ? 'act' : 'new',
        onPointerDown: only ? undefined : (e) => holdPin(e, p), label: only ? undefined : 'Damage ' + p.number + ', ' + p.zone,
      });
    });
    if (!only) {
      c.oldPins.filter((o) => o.view === v).forEach((o) => {
        const can = c.direction === 'IN';
        out.push({
          key: o.id, n: o.letter, x: o.x * 100, y: o.y * 100, k: 'old',
          onPointerDown: can ? (e) => e.stopPropagation() : undefined,
          onClick: can ? () => setSh({ k: 'verdict', id: o.id }) : undefined,
          label: can ? 'Damage ' + o.letter + ', on record. Still there or repaired?' : undefined,
        });
      });
    }
    return out;
  }
  function onTap(x: number, y: number) {
    if (moving && selPin) { if (selPin.view === view) movePin(selPin.id, x, y); return; }
    dropPin(x, y);
  }
  function pickView(v: View) { setView(v); if (moving) setSel(null); }
  const dragPin = drag ? live.find((p) => p.id === drag.id) : null;
  const theBoard = (pinch: boolean) => (
    <Board view={view} drawing={drawing} pins={boardPins(view)} w={stageW} stageRef={stageRef} pinch={pinch} onTap={onTap}
      extra={drag && dragPin && dragPin.view === view ? loupe(view, drawing, drag.x, drag.y) : null} />
  );
  const bbar = selPin ? (
    <div style={css('display:flex;align-items:center;gap:10px;padding:8px 10px;border-radius:10px;background:' + W + ';border:1px solid ' + BL)}>
      <span style={css('font-weight:800;font-size:14px;flex:1')}>Pin {selPin.number} &middot; {selPin.zone}</span>
      {sb('Remove', 'd', { h: 40, ic: 'trash', onClick: () => removePin(selPin.id) })}
      {sb('Add details', 'p', { h: 40, onClick: () => openDetails(selPin) })}
    </div>
  ) : null;
  const items = (
    <>
      {live.map((p) => {
        const n = dPhotos(p.id).length;
        return <div key={p.id}>{pinItem(p.number, damageName(p.type, config) || 'What kind?', p.zone, n ? plural(n, 'photo', 'photos') : '', { on: p.id === sel, onClick: () => openDetails(p), label: 'Damage ' + p.number + ', ' + p.zone })}</div>;
      })}
      {c.oldPins.map((o) => (
        <div key={o.id}>{pinItem(o.letter, damageName(o.type, config) || o.zone, 'On record since ' + dayMon(o.since), o.verdict === 'still_there' ? 'Still there' : o.verdict === 'repaired' ? 'Repaired' : '',
          { old: true, onClick: c.direction === 'IN' ? () => { setView(o.view); setSh({ k: 'verdict', id: o.id }); } : undefined })}</div>
      ))}
    </>
  );
  const sides = new Set(live.map((p) => p.view)).size;
  const markSub = live.length ? plural(live.length, 'new mark', 'new marks') + ' across ' + plural(sides, 'side', 'sides') : fleetTag(c) + ' · ' + typeName(c.trailerType, config) + ' · ' + dirWord(c.direction);
  const showHint = !moving && !live.some((p) => p.view === view);

  /* ---------- Details (screen C) ---------- */
  function detailsRight(p: DamagePin) {
    const ph = dPhotos(p.id);
    const s1 = photoFor(photos, 'D', p.id, 1), s2 = photoFor(photos, 'D', p.id, 2);
    const tapSlot = (shot: number, have?: PhotoMeta) => () => {
      if (have) { setGal(Math.max(0, ph.findIndex((x) => x.id === have.id))); setPhase('gallery'); }
      else openCamera(p, shot);
    };
    return (
      <>
        <div style={css('font-weight:800;font-size:14px')}>What kind? <span style={css('color:' + R)}>*</span></div>
        {kinds(config.damageTypes, p.type, (code) => setType(p.id, code))}
        <div style={css('font-weight:800;font-size:14px;margin-top:2px')}>Photos</div>
        <div style={css('display:flex;gap:8px')}>
          <Slot t="Close-up" photoId={s1?.id} req onClick={tapSlot(1, s1)} label={s1 ? 'Close-up, see it' : 'Take the close-up'} />
          <Slot t="Wide shot" photoId={s2?.id} req onClick={tapSlot(2, s2)} label={s2 ? 'Wide shot, see it' : 'Take the wide shot'} />
          <Slot t="+ More" req={false} onClick={() => openCamera(p, nextShot(p.id))} label="Take another photo" />
        </div>
        <div style={css('display:flex;gap:8px;align-items:center')}>
          <input className="dk-in" value={p.note} onChange={(e) => setNote(p.id, e.target.value)} placeholder="Note (optional)" aria-label="Note (optional)" enterKeyHint="done"
            style={{ ...css('flex:1;min-height:44px;display:flex;align-items:center;padding:0 12px;border-radius:8px;border:2px solid #A3A39D;background:' + W + ';font-size:14px;color:' + N), minWidth: 0, boxSizing: 'border-box', fontFamily: 'inherit' }} />
          <button type="button" className="k-tap k-reset" onClick={() => setSh({ k: 'phrases' })} aria-label="Quick phrases and voice notes"
            style={{ ...css('width:44px;height:44px;border-radius:8px;background:' + N05 + ';display:flex;align-items:center;justify-content:center'), border: 0, padding: 0, color: N, flex: 'none' }}>{ic('info', 20)}</button>
          {sb('Save pin ' + p.number, 'p', { h: 44, onClick: () => { setPhase(land || upright ? 'mark' : 'ask'); setSel(null); } })}
        </div>
      </>
    );
  }
  const moveLink = (p: DamagePin) => (
    <button type="button" className="k-tap k-reset" onClick={() => { setView(p.view); setSel(p.id); setPhase('mark'); }}
      style={{ ...css('font-size:12px;color:' + MU + ';margin-top:auto'), background: 'transparent', border: 0, padding: 0, alignSelf: 'flex-start' }}><u>Move pin</u></button>
  );

  /* ---------- Overlays ---------- */
  const camPin = cam ? live.find((p) => p.id === cam.pinId) : null;
  const overlay = (
    <>
      {sh?.k === 'verdict' ? (() => {
        const o = c.oldPins.find((q) => q.id === sh.id);
        if (!o) return null;
        return sheet(<>
          <div style={css('font-family:' + PT + ';font-weight:800;font-size:22px;text-align:center')}>Damage {o.letter}</div>
          <div style={css('font-size:17px;line-height:1.45;text-align:center')}>{[damageName(o.type, config), o.zone].filter(Boolean).join(' · ')}. On record since {dayMon(o.since)}.</div>
          {btn('Still there', 's', { h: 56, ic: o.verdict === 'still_there' ? 'tick' : undefined, onClick: () => setVerdict(o.id, 'still_there') })}
          {btn('Repaired', 's', { h: 56, ic: o.verdict === 'repaired' ? 'tick' : undefined, onClick: () => setVerdict(o.id, 'repaired') })}
        </>, { onClose: () => setSh(null), label: 'Damage ' + o.letter });
      })() : null}
      {sh?.k === 'phrases' && selPin ? sheet(<>
        <div>
          <div style={css('display:flex;justify-content:space-between;align-items:baseline;margin-bottom:8px')}>
            <span style={css('font-weight:700;font-size:16px')}>Describe the damage</span><span style={css('font-size:14px;color:' + SU)}>Optional</span>
          </div>
          {noteBox(selPin.note, (v) => setNote(selPin.id, v), { focus: noteFocus, onFocus: () => setNoteFocus(true), onBlur: () => setNoteFocus(false) })}
          <div style={css('display:flex;flex-wrap:wrap;gap:8px;margin-top:10px')}>
            {config.quickPhrases.map((q) => {
              const re = new RegExp('(^|\\s)' + q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '(?=\\s|$)', 'i');
              const on = re.test(selPin.note);
              return <span key={q}>{chip(q, on, { h: 44, onClick: () => setNote(selPin.id, on ? selPin.note.replace(re, '$1').replace(/\s{2,}/g, ' ').trim() : (selPin.note.trim() ? selPin.note.trim() + ' ' : '') + q) })}</span>;
            })}
          </div>
          <div style={css('font-size:15px;color:' + MU + ';margin-top:10px')}>Quick phrases add words to the note. The phone keyboard&rsquo;s microphone works for voice notes.</div>
        </div>
      </>, { onClose: () => setSh(null), label: 'Describe the damage' }) : null}
      {sh?.k === 'delPhoto' && selPin ? (() => {
        const ph = dPhotos(selPin.id).find((x) => x.id === sh.id);
        if (!ph) return null;
        return sheet(<>
          <div style={css('display:flex;justify-content:center')}>{sg('miss', 48)}</div>
          <div style={css('font-family:' + PT + ';font-weight:800;font-size:22px;text-align:center')}>Delete this photo?</div>
          <div style={css('font-size:17px;line-height:1.45;text-align:center')}>{shotName(ph.shot)} of damage {selPin.number}, {selPin.zone}.</div>
          {btn('Delete this photo', 'd', { ic: 'trash', onClick: async () => {
            setSh(null);
            await removePhoto(ph.id);
            setGal(0);
            showToast('ok', 'Photo deleted', 6000, 'Undo', async () => { setTst(null); await removePhoto(ph.id, true); });
          } })}
          {btn('Keep it', 's', { h: 56, onClick: () => setSh(null) })}
        </>, { center: true, onClose: () => setSh(null), label: 'Delete this photo?' });
      })() : null}
      {tst ? (
        <div key={tst.key} style={{ position: 'fixed', left: 16, right: 16, bottom: 22, zIndex: 60, maxWidth: 420, margin: '0 auto' }}>
          {toast(tst.kind, tst.text, { act: tst.act, onAct: tst.onAct })}
        </div>
      ) : null}
    </>
  );

  /* ---------- The camera (screen D) ---------- */
  if (cam && camPin) {
    return (
      <Camera
        title={camTitle(cam.shot)}
        pinTag={'PIN ' + camPin.number}
        corner={stage(camPin.view, [{ n: camPin.number, x: camPin.x * 100, y: camPin.y * 100 }], { drawing })}
        earlier={cam.earlier}
        onClose={() => setCam(null)}
        onUse={async (t: Taken) => {
          try { await addPhoto(t, 'D', camPin.id, camPin.number, label(camPin), cam.shot); setCam(null); }
          catch (e) { setCam(null); showToast('err', (e as Error).message, 6000); }
        }}
      />
    );
  }

  /* ---------- Gallery and retake (source/05 S_camera e) ---------- */
  if (phase === 'gallery' && selPin) {
    const ph = dPhotos(selPin.id);
    const i = Math.min(gal, Math.max(0, ph.length - 1));
    const cur = ph[i];
    return (
      <div style={css(PORTRAIT)}>
        {topbar('Damage photos', { sub: [shortZone(selPin.view, selPin.zone), damageName(selPin.type, config)].filter(Boolean).join(' · '), save, onBack: () => setPhase('details') })}
        {scroll(<>
          <div style={css('padding:0')}>
            {cur ? <PhonePhoto id={cur.id} label={'Photo ' + (i + 1) + ' of ' + ph.length} ar="4/3" bg="linear-gradient(135deg,#9AA3B2,#5B6476)" />
              : photo('', { ar: '4/3', bg: 'linear-gradient(135deg,#9AA3B2,#5B6476)' })}
          </div>
          <div style={css('display:grid;grid-template-columns:repeat(4,1fr);gap:6px')}>
            {ph.map((x, j) => (
              <div key={x.id} style={css('border-radius:6px;' + (j === i ? 'outline:3px solid ' + N + ';outline-offset:2px' : ''))}>
                <PhonePhoto id={x.id} label="" ar="1/1" onClick={() => setGal(j)} aria={shotName(x.shot)} />
              </div>
            ))}
            <button type="button" className="k-tap k-reset" onClick={() => openCamera(selPin, nextShot(selPin.id))} aria-label="Take another photo"
              style={{ ...css('aspect-ratio:1/1;border-radius:6px;border:2px dashed ' + N + ';display:flex;align-items:center;justify-content:center;background:' + W), padding: 0, color: N }}>{ic('plus', 24)}</button>
          </div>
          <div style={css('display:grid;grid-template-columns:1fr 1fr;gap:8px')}>
            {cur ? btn('Retake', 's', { ic: 'retake', h: 56, onClick: () => openCamera(selPin, cur.shot) }) : btn('Retake', 'dis', { ic: 'retake', h: 56, title: 'No photo to retake yet' })}
            {cur ? btn('Delete', 'dg', { ic: 'trash', h: 56, onClick: () => setSh({ k: 'delPhoto', id: cur.id }) }) : btn('Delete', 'dis', { ic: 'trash', h: 56, title: 'No photo to delete' })}
          </div>
        </>)}
        {overlay}
      </div>
    );
  }

  /* ---------- Details for the pin (screen C) ---------- */
  if (phase === 'details' && selPin) {
    const pinOnly = <Board view={selPin.view} drawing={drawing} pins={boardPins(selPin.view, selPin, true)} stageRef={{ current: null }} />;
    if (land) {
      return (
        <div style={css(LANDSCAPE)}>
          <div style={css('width:250px;flex:none;padding:12px 14px;display:flex;flex-direction:column;gap:8px;border-right:1px solid ' + BL + ';background:' + W)}>
            {lbar('Pin ' + selPin.number, selPin.zone, null, () => { setPhase('mark'); setSel(null); })}
            <div style={css('margin-top:20px')}>{pinOnly}</div>
            {moveLink(selPin)}
          </div>
          <div style={{ ...css('flex:1;padding:12px 16px;display:flex;flex-direction:column;gap:8px;min-width:0'), overflowY: 'auto', scrollbarWidth: 'none' }}>
            {detailsRight(selPin)}
          </div>
          {overlay}
        </div>
      );
    }
    return (
      <div style={css(PORTRAIT)}>
        {topbar('Pin ' + selPin.number, { sub: selPin.zone, save, onBack: () => { setPhase(upright ? 'mark' : 'ask'); setSel(null); } })}
        {scroll(<>
          <div style={css('margin-top:20px')}>{pinOnly}</div>
          {moveLink(selPin)}
          {detailsRight(selPin)}
        </>, 'gap:8px')}
        {overlay}
      </div>
    );
  }

  /* ---------- The marker (screens A, B and E, or 8 and 9 upright) ---------- */
  if (phase === 'mark' || (phase === 'details' && !selPin) || (phase === 'gallery' && !selPin)) {
    if (land) {
      return (
        <div style={css(LANDSCAPE)}>
          <div style={css('flex:1;display:flex;flex-direction:column;padding:10px 16px 12px;gap:8px;min-width:0')}>
            {lbar('Mark damage', moving || drag ? 'Hold and drag to move it' : markSub, null, () => { if (moving) setSel(null); else setPhase('ask'); })}
            {vtabs(view, counts, { onPick: pickView })}
            <div style={css('position:relative;flex:1;display:flex;align-items:center')}>
              {theBoard(false)}
              {showHint ? hint('Tap where the damage is') : null}
            </div>
            {moving ? bbar : legend()}
          </div>
          {moving ? null : rail(items, mainTxt, onMain, mainTxt)}
          {overlay}
        </div>
      );
    }
    if (!upright) {
      return (
        <div style={css(PORTRAIT)}>
          {scroll(
            <div style={css('flex:1;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:18px;text-align:center;padding:10px')}>
              {rotArt()}
              <div style={css('font-family:' + PT + ';font-weight:800;font-size:26px;letter-spacing:-0.03em')}>Turn your phone sideways</div>
              <div style={css('font-size:16px;line-height:1.45;color:' + MU)}>You&rsquo;ll see the whole trailer, side on, so you can tap exactly where the damage is.</div>
            </div>,
          )}
          {footer(
            <button type="button" className="k-tap k-reset" onClick={() => setUpright(true)}
              style={{ ...css('text-align:center;font-weight:700;font-size:15px;min-height:48px;display:flex;align-items:center;justify-content:center'), background: 'transparent', border: 0, padding: 0, color: N, width: '100%' }}>
              <u>Can&rsquo;t turn it? Use it upright</u>
            </button>,
          )}
          {overlay}
        </div>
      );
    }
    return (
      <div style={css(PORTRAIT)}>
        {topbar('Mark damage', { sub: fleetTag(c) + ' · Upright view', save, onBack: () => { if (moving) setSel(null); else setPhase('ask'); } })}
        {scroll(<>
          {vtabs(view, counts, { onPick: pickView, small: true })}
          <div style={{ ...css('padding:30px 0 6px'), position: 'relative', overflow: 'hidden' }}>
            {theBoard(true)}
            {showHint ? hint('Tap where the damage is') : null}
          </div>
          {moving ? bbar : legend()}
          <div style={css('font-size:14px;color:' + MU + ';line-height:1.45')}>Pinch to zoom. Everything else works the same as sideways.</div>
          {moving ? null : <div style={css('font-family:' + MO + ';font-size:11px;letter-spacing:0.04em;color:' + SU)}>MARKS</div>}
          {moving ? null : items}
        </>, 'gap:12px')}
        {moving ? null : footer(btn(mainTxt, 'p', { onClick: onMain }))}
        {overlay}
      </div>
    );
  }

  /* ---------- Damage: yes or no first (source/04 s7), with the marks so far ---------- */
  const lastDir = (last?.direction === 'IN' || last?.direction === 'OUT' ? last.direction : c.direction === 'OUT' ? 'IN' : 'OUT') as 'IN' | 'OUT';
  const sinceOut = c.direction === 'IN' && last?.direction === 'OUT';
  const compare = sinceOut ? live.map((p) => ({ p, was: last!.pins.find((lp) => lp.zone === p.zone) })).filter((x) => !!x.was) : [];
  const cards: ReactNode[] = live.map((p) => {
    const ph = dPhotos(p.id);
    const tName = damageName(p.type, config);
    return (
      <button key={p.id} type="button" className="k-tap k-reset" onClick={() => openDetails(p)} aria-label={'Damage ' + p.number + ', ' + p.zone}
        style={{ border: 0, padding: 0, background: 'transparent', color: N, width: '100%', flex: 'none' }}>
        {card(
          <div style={css('display:grid;grid-template-columns:96px 1fr;gap:14px')}>
            <PhonePhoto id={ph[0]?.id} label="" ar="1/1" bg="linear-gradient(135deg,#9AA3B2,#5B6476)" />
            <div>
              <div style={css('display:flex;gap:8px;align-items:center')}>{tName ? badge(tName.toUpperCase(), 'miss') : null}{badge('NEW', 'warn')}</div>
              <div style={css('font-weight:700;font-size:17px;margin-top:8px')}>{p.zone}</div>
              <div style={css('font-size:15px;color:' + MU + ';margin-top:2px')}>{[p.note.trim(), plural(ph.length, 'photo', 'photos')].filter(Boolean).join(' · ')}</div>
            </div>
          </div>, 'padding:18px')}
      </button>
    );
  });
  return (
    <div style={css(PORTRAIT)}>
      {topbar('Damage', { sub, save, onBack: back })}
      {scroll(<>
        {sinceOut && live.length ? banner('warn', live.length + ' new damage since check out', 'Marked NEW. The office will see it next to the check out photo.') : null}
        {compare.map(({ p, was }) => (
          <div key={p.id} style={css('display:grid;grid-template-columns:1fr 1fr;gap:8px')}>
            <div>
              <div style={css('font-size:13px;font-weight:700;color:' + MU + ';margin-bottom:4px')}>CHECK OUT {dayMon(last!.sent_at).toUpperCase()}</div>
              <RemotePhoto path={lastPinPhoto(last, was!.id)} label={shortZone(p.view, p.zone)} ar="1/1" online={online} />
            </div>
            <div>
              <div style={css('font-size:13px;font-weight:700;color:' + R7 + ';margin-bottom:4px')}>NOW</div>
              <PhonePhoto id={dPhotos(p.id)[0]?.id} label={shortZone(p.view, p.zone)} ar="1/1" st="miss" />
            </div>
          </div>
        ))}
        {live.length ? null : <div style={css('font-family:' + PT + ';font-weight:800;font-size:22px;letter-spacing:-0.02em')}>{config.wording.damage_first || 'Any damage on this trailer?'}</div>}
        {live.length ? null : (
          <div style={css('display:grid;grid-template-columns:1fr 1fr;gap:10px')}>
            {btn('No damage', 's', { ic: 'tick', h: 56, css: 'padding:0 8px;font-size:16px', onClick: () => { update((d) => { if (!d.pins.some((p) => !p.removedAt)) d.damageAnswer = 'none'; }); back(); } })}
            {btn('Yes, add it', 'd', { ic: 'plus', h: 56, css: 'padding:0 8px;font-size:16px', onClick: () => { update((d) => { d.damageAnswer = 'yes'; }); setSel(null); setPhase('mark'); } })}
          </div>
        )}
        {cards}
        {live.length ? btn('Add another damage', 's', { ic: 'plus', onClick: () => { setSel(null); setPhase('mark'); } }) : null}
        {c.oldPins.length ? (
          <div style={css('font-size:15px;color:' + MU + ';line-height:1.45')}>
            Last {dirWord(lastDir).toLowerCase()} recorded <b>{plural(c.oldPins.length, 'mark', 'marks')}</b>. They&rsquo;re shown below so you only add anything new.
          </div>
        ) : null}
        {c.oldPins.length ? (
          <div style={css('display:flex;flex-direction:column;gap:8px')}>
            {c.oldPins.map((o) => {
              const row = (
                <>
                  <RemotePhoto path={lastPinPhoto(last, o.id)} label="" ar="1/1" online={online} />
                  <div>
                    <div style={css('font-weight:700;font-size:16px')}>{o.zone}</div>
                    <div style={css('font-size:14px;color:' + MU)}>{[damageName(o.type, config), 'from ' + dayMon(o.since), o.verdict === 'still_there' ? 'Still there' : o.verdict === 'repaired' ? 'Repaired' : ''].filter(Boolean).join(' · ')}</div>
                  </div>
                  {badge('OLD', 'draft')}
                </>
              );
              const st = css('display:grid;grid-template-columns:64px 1fr auto;gap:12px;align-items:center;padding:10px;border-radius:8px;background:' + W + ';border:1px solid ' + BL);
              return c.direction === 'IN'
                ? <button key={o.id} type="button" className="k-tap k-reset" onClick={() => setSh({ k: 'verdict', id: o.id })} aria-label={'Damage ' + o.letter + ', ' + o.zone + '. Still there or repaired?'} style={{ ...st, width: '100%', color: N }}>{row}</button>
                : <div key={o.id} style={st}>{row}</div>;
            })}
          </div>
        ) : null}
      </>)}
      {overlay}
    </div>
  );
}

