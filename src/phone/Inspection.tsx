/* Inside an inspection: source/04 S_flow screens 3 and 6 to 16, source/03 S_nav
   (the hub), S_overlays (leave and delete), source/06 E (customer and hire), source/05
   S_camera (photo states, gallery and retake) and S_states (sending, partly sent). */
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import { css } from '../kit/css';
import { btn, footer, scroll, topbar, stepRow, sheet, banner, photo, sg, ic, srcTag, plate, toast, badge, type SaveState } from '../kit/kit';
import { N, W, R, BL, MU, SU, G, A, A1, R7, PT, MO, N1, N5, PA } from '../kit/tokens';
import { useCheck, usePhotoUrl } from './useCheck';
import Camera, { type Taken } from './Camera';
import { configFor, isPreview } from '../lib/config';
import { useSession } from '../lib/session';
import { db, kvGet } from '../lib/db';
import { queueSend, useSync, kick, pushDraft } from '../lib/sync';
import { supabase } from '../lib/supabase';
import { steps as stepList, percent, missingAll, fleetTag, dirWord, stcLabel, shotsFor, tyreShots, itemsFor, readingsFor, strapsApply, tyreKeys, photoFor, typeName, type Shot, type StepStatus } from '../lib/check';
import { num, time } from '../lib/format';
import { buzz } from '../lib/photo';
import type { Check, Config, PhotoMeta, StepId, ItemAnswer } from '../data/types';
import { screen } from './Places';

/* ---------------- shared bits ---------------- */
const STEP_PATH: Record<StepId, string> = { trailer: 'trailer', photos: 'photos', damage: 'damage', items: 'items', tyres: 'tyres', readings: 'readings', seals: 'seals', sign: 'sign' };

function useInspection() {
  const { id } = useParams();
  const h = useCheck(id);
  const cfg = h.check ? configFor(h.check.configVersion) : null;
  const st = useMemo(() => (h.check && cfg ? stepList(h.check, cfg, h.photos, !!h.check.tried) : []), [h.check, cfg, h.photos]);
  const pr = percent(st);
  return { ...h, id: id!, cfg: cfg!, st, pr };
}
function bar(title: ReactNode, c: Check, save: SaveState, pr: { done: number; total: number; pct: number }, onBack: () => void, sub?: ReactNode) {
  return topbar(title, { sub: sub ?? (fleetTag(c) + ' · ' + dirWord(c.direction)), save, prog: pr.pct, progLabel: pr.done === pr.total ? 'All steps done' : pr.done + ' of ' + pr.total + ' steps', onBack });
}
/** "Next" in a step goes to the next step that isn't done, skipping finished ones (source/03 S_nav rules). */
function nextAfter(st: StepStatus[], from: StepId): StepStatus | null {
  const i = st.findIndex((s) => s.id === from);
  const order = [...st.slice(i + 1), ...st.slice(0, i)];
  return order.find((s) => s.state !== 'done' && s.id !== 'sign') || st.find((s) => s.id === 'sign' && s.state !== 'done') || null;
}
function nextButton(st: StepStatus[], from: StepId, go: (s: StepId | 'review') => void) {
  const n = nextAfter(st, from);
  const missing = missingAll(st);
  if (!n || (n.id === 'sign' && missing.length)) return btn(missing.length ? 'Next: Check everything' : 'Next: Sign', 'p', { onClick: () => go(missing.length ? 'review' : 'sign') });
  return btn('Next: ' + n.name, 'p', { onClick: () => go(n.id) });
}
function Loading() { return <div style={css(screen)} />; }
function Gone() {
  const nav = useNavigate();
  return <div style={css(screen)}>{topbar('Check', { onBack: () => nav('/') })}{scroll(banner('err', 'That check isn’t on this phone', 'It may have been sent and cleared, or started on another phone.'))}</div>;
}

/* An input drawn like the pack's inp(): label above, 56px box, 2px #A3A39D border, 3px navy on focus. */
function Field(p: { label: string; value: string; onChange: (v: string) => void; req?: boolean; tag?: ReactNode; ph?: string; mono?: boolean; inputMode?: 'text' | 'numeric' | 'decimal'; big?: boolean; suffix?: ReactNode; warn?: boolean; ok?: boolean; id?: string; autoCap?: boolean; plateStyle?: boolean }) {
  const [f, setF] = useState(false);
  const border = p.warn ? '3px solid ' + A : f ? '3px solid ' + N : p.ok ? '2px solid ' + G : '2px solid #A3A39D';
  return (
    <div style={css('display:flex;flex-direction:column;gap:6px;min-width:0')}>
      <div style={css('display:flex;justify-content:space-between;align-items:center;gap:8px')}>
        <label htmlFor={p.id} style={css('font-weight:700;font-size:' + (p.big ? 16 : 15) + 'px')}>{p.label}{p.req ? <> <span style={css('color:' + R)}>*</span></> : null}</label>{p.tag || null}
      </div>
      <div style={css('min-height:' + (p.big ? 64 : 56) + 'px;display:flex;align-items:center;padding:0 ' + (p.big ? 16 : 14) + 'px;border-radius:8px;background:' + W + ';border:' + border)}>
        <input id={p.id} value={p.value} onChange={(e) => p.onChange(e.target.value)} onFocus={() => setF(true)} onBlur={() => setF(false)} placeholder={p.ph} inputMode={p.inputMode}
          autoCapitalize={p.autoCap ? 'characters' : 'sentences'} autoComplete="off"
          style={css('flex:1;min-width:0;border:0;outline:none;background:transparent;color:' + N + ';font-size:' + (p.big ? 26 : 18) + 'px;font-family:' + (p.mono ? MO : 'inherit') + ';' + (p.mono ? 'font-weight:800;' : '') + (p.plateStyle ? 'letter-spacing:0.06em;font-weight:800;font-family:' + MO + ';' : ''))} />
        {p.suffix || null}
      </div>
    </div>
  );
}

/* ---------------- The hub (source/03 S_nav p2) ---------------- */
export function Hub() {
  const x = useInspection();
  const nav = useNavigate();
  const [leave, setLeave] = useState(false);
  const [del, setDel] = useState(false);
  const { user } = useSession();
  useEffect(() => { if (x.check) void pushDraft(x.check); }, [x.check?.id]); // eslint-disable-line
  if (x.check === undefined) return <Loading />;
  if (!x.check) return <Gone />;
  const c = x.check;
  if (c.status === 'waiting' || c.status === 'sent') { nav('/check/' + c.id + '/sent', { replace: true }); return null; }
  const missing = missingAll(x.st);
  const first = x.st.find((s) => s.state !== 'done' && s.id !== 'sign');
  const photosTaken = x.photos.some((p) => !p.removedAt);
  async function remove() {
    await db.photos.where('checkId').equals(c.id).modify({ removedAt: new Date().toISOString() });
    await db.checks.delete(c.id);
    if (navigator.onLine) { try { await supabase.rpc('delete_unfinished', { p_check: c.id, p_reason: 'Deleted on the phone' }); } catch { /* never reached the office */ } }
    nav('/', { replace: true });
  }
  const open = (s: StepId) => nav('/check/' + c.id + '/' + STEP_PATH[s]);
  return (
    <div style={css(screen)}>
      {topbar(dirWord(c.direction) + ' · ' + fleetTag(c), { close: true, save: x.save, prog: x.pr.pct, onBack: () => setLeave(true) })}
      {scroll(<>
        {c.reopenReason ? banner('info', 'Reopened: ' + c.reopenReason, 'When you send it, the office gets it as version ' + c.version + '. The original stays on record.') : null}
        {c.flags.notOnSheet ? banner('warn', 'Not on the stock sheet', 'The office will see this flagged.') : null}
        {c.flags.noStcNumber ? banner('warn', 'No STC number yet', 'The office will see this flagged.') : null}
        {c.flags.repeat ? banner('warn', (c.direction === 'OUT' ? 'Checked out' : 'Checked in') + ' last time too', 'The office will see this flagged.') : null}
        {x.st.map((s) => (
          <div key={s.id}>{stepRow(s.name, s.id === 'sign' && s.state === 'lock' ? '' : s.sub, s.state, {
            cur: s.id === first?.id,
            r: s.id === 'sign' && s.state === 'lock' ? <span style={css('font-size:13px;color:' + SU)}>After the rest</span> : undefined,
            onClick: s.state === 'lock' ? () => nav('/check/' + c.id + '/review') : () => open(s.id),
          })}</div>
        ))}
        <div style={css('display:flex;flex-direction:column;gap:10px;margin-top:12px')}>
          {btn(c.direction === 'OUT' ? 'Change to check in' : 'Change to check out', 's', { h: 56, onClick: () => x.update((d) => { d.direction = d.direction === 'OUT' ? 'IN' : 'OUT'; }) })}
          {btn('Delete inspection', 'dg', { h: 56, onClick: () => setDel(true) })}
        </div>
      </>, 'gap:6px;padding:10px 16px')}
      {footer(missing.length && !first ? btn(missing.length + (missing.length === 1 ? ' thing left' : ' things left'), 'p', { onClick: () => nav('/check/' + c.id + '/review') })
        : first ? btn('Next: ' + first.name, 'p', { onClick: () => open(first.id) })
          : btn('Next: Sign', 'p', { onClick: () => open('sign') }))}
      {leave ? sheet(<>
        <div style={css('font-family:' + PT + ';font-weight:800;font-size:22px')}>Leave this check?</div>
        <div style={css('font-size:17px;line-height:1.45')}>Everything so far is saved. You can carry on from <b>Home &rsaquo; Unfinished</b>.</div>
        {btn('Keep going', 'p', { onClick: () => setLeave(false) })}
        {btn('Leave and carry on later', 's', { h: 56, onClick: () => nav('/') })}
      </>, { onClose: () => setLeave(false), label: 'Leave this check?' }) : null}
      {del ? sheet(<>
        <div style={css('display:flex;justify-content:center')}>{sg('miss', 48)}</div>
        <div style={css('font-family:' + PT + ';font-weight:800;font-size:22px;text-align:center')}>Delete this inspection?</div>
        <div style={css('font-size:17px;line-height:1.45;text-align:center')}>{fleetTag(c)}, {dirWord(c.direction).toLowerCase()}, with {x.photos.filter((p) => !p.removedAt).length} photos and {c.pins.filter((p) => !p.removedAt).length} damage marks. This can&rsquo;t be undone.</div>
        {btn('Delete inspection', 'd', { ic: 'trash', onClick: remove })}
        <div style={css('height:2px')} />
        {btn('Keep it', 's', { h: 56, onClick: () => setDel(false) })}
      </>, { center: true, onClose: () => setDel(false), label: 'Delete this inspection?' }) : null}
      {void user}
      {void photosTaken}
    </div>
  );
}

/* ---------------- 3 · Customer and hire details (source/06 E) ---------------- */
export function Customer() {
  const x = useInspection();
  const nav = useNavigate();
  if (x.check === undefined) return <Loading />;
  if (!x.check) return <Gone />;
  const c = x.check;
  const photosTaken = x.photos.some((p) => !p.removedAt);
  const tag = c.customerSource === 'stock' ? srcTag('Stock sheet', true) : c.customerSource === 'fleet' ? srcTag('Fleet Serve', true) : srcTag('Typed in');
  const go = (s: StepId | 'review') => nav('/check/' + c.id + '/' + (s === 'review' ? 'review' : STEP_PATH[s]));
  return (
    <div style={css(screen)}>
      {bar('Customer', c, x.save, x.pr, () => nav('/check/' + c.id), stcLabel(c.stcNo) + ' · ' + dirWord(c.direction))}
      {scroll(<>
        <Field id="cust" label="Customer" req tag={tag} value={c.customer} onChange={(v) => x.update((d) => { d.customer = v; if (d.customerSource !== 'typed' && v !== (d.trailer?.hire_customer || d.trailer?.customer)) d.customerSource = 'typed'; })} />
        <div style={css('display:flex;flex-direction:column;gap:6px')}>
          <label htmlFor="reg" style={css('font-weight:700;font-size:15px')}>Collecting vehicle reg <span style={css('color:' + R)}>*</span></label>
          <div style={css('min-height:56px;display:flex;align-items:center;padding:0 14px;border-radius:8px;background:' + W + ';border:2px solid #A3A39D')}>
            {plate(<input id="reg" value={c.collectingReg} onChange={(e) => x.update((d) => { d.collectingReg = e.target.value.toUpperCase(); })} autoCapitalize="characters" autoComplete="off" placeholder="MX19 KLA"
              style={css('width:7.5em;border:0;outline:none;background:transparent;font:inherit;letter-spacing:inherit;color:#111')} />, 1)}
          </div>
        </div>
        <div style={css('font-family:' + PT + ';font-weight:800;font-size:18px;margin-top:8px;display:flex;justify-content:space-between;align-items:center')}>Hire details {c.rateSource === 'fleet' ? srcTag('Fleet Serve', true) : srcTag('Typed in')}</div>
        <div style={css('display:grid;grid-template-columns:1fr 1fr;gap:10px')}>
          <Field id="acc" label="Account no" value={c.accountNo} onChange={(v) => x.update((d) => { d.accountNo = v; })} autoCap />
          <Field id="ord" label="Order no" value={c.orderNo} onChange={(v) => x.update((d) => { d.orderNo = v; })} />
          <Field id="rate" label="Rate / week" value={c.ratePerWeek} inputMode="decimal" onChange={(v) => x.update((d) => { d.ratePerWeek = v; d.rateSource = 'typed'; })} />
          <Field id="rep" label="Replace value" ph="Optional" value={c.replacementValue} inputMode="decimal" onChange={(v) => x.update((d) => { d.replacementValue = v; })} />
        </div>
        <div style={css('margin-top:8px')}>
          {btn('Change trailer', 's', { h: 56, onClick: () => nav('/new/' + c.direction.toLowerCase()), ...(photosTaken ? { title: 'Photos are already taken for this trailer' } : {}) })}
        </div>
      </>, 'gap:10px')}
      {footer(nextButton(x.st, 'trailer', go))}
    </div>
  );
}

/* ---------------- 6 · Photos, with the camera (source/04 s4 to s6, source/05 S_camera) ---------------- */
function Thumb({ p, label, st, onClick }: { p: PhotoMeta; label: string; st: string; onClick: () => void }) {
  const u = usePhotoUrl(p.id);
  return photo(label, { ar: '1/1', st, src: u || undefined, onClick, label: label + ', open' });
}
function EmptySlot({ label, onClick, small }: { label: string; onClick: () => void; small?: boolean }) {
  return (
    <button type="button" className="k-tap k-reset" onClick={onClick} aria-label={'Take photo: ' + label}
      style={css('aspect-ratio:4/3;border-radius:6px;border:2px dashed ' + N + ';display:flex;flex-direction:column;align-items:center;justify-content:center;gap:' + (small ? 4 : 6) + 'px;background:' + W + ';color:' + N + ';font-size:13px;font-weight:700;text-align:center;width:100%;padding:0')}>
      {ic('cam', small ? 22 : 26)}{label}
    </button>
  );
}
export function AxlesAsk({ c, update }: { c: Check; update: (fn: (d: Check) => void) => Promise<void> }) {
  async function pick(n: number) {
    await update((d) => { d.axles = n; });
    if (navigator.onLine && c.onStockSheet) { try { await supabase.rpc('set_trailer_fact', { p_stc: c.stcNo, p_axles: n, p_type: null }); } catch { /* kept on the check */ } }
  }
  return (
    <div style={css('display:flex;flex-direction:column;gap:10px')}>
      <div style={css('font-weight:800;font-size:17px')}>How many axles?</div>
      <div style={css('font-size:15px;color:' + MU + ';line-height:1.45')}>The stock sheet doesn&rsquo;t say. Count the wheels on one side.</div>
      <div style={css('display:grid;grid-template-columns:repeat(3,1fr);gap:8px')}>
        {[1, 2, 3].map((n) => (
          <button key={n} type="button" className="k-tap k-reset" onClick={() => pick(n)}
            style={css('min-height:64px;border-radius:8px;border:2px solid #A3A39D;background:' + W + ';color:' + N + ';display:flex;align-items:center;justify-content:center;font-family:' + MO + ';font-weight:800;font-size:22px')}>{n}</button>
        ))}
      </div>
    </div>
  );
}
export function Photos() {
  const x = useInspection();
  const nav = useNavigate();
  const [cam, setCam] = useState<Shot | null>(null);
  const [view, setView] = useState<string | null>(null);
  const [tst, setTst] = useState<{ k: 'ok' | 'err'; t: string; undo?: string } | null>(null);
  const [hashes, setHashes] = useState<Record<string, string>>({});
  useEffect(() => { if (!tst) return; const t = setTimeout(() => setTst(null), tst.undo ? 6000 : 3000); return () => clearTimeout(t); }, [tst]);
  useEffect(() => {
    (async () => { const h: Record<string, string> = {}; for (const p of x.photos) { const v = await kvGet<string>('hash:' + p.id); if (v) h[p.id] = v; } setHashes(h); })();
  }, [x.photos]);
  if (x.check === undefined) return <Loading />;
  if (!x.check) return <Gone />;
  const c = x.check, cfg = x.cfg;
  const shots = shotsFor(c, cfg), tyres = tyreShots(c);
  const all = [...shots, ...tyres];
  const have = (s: Shot) => photoFor(x.photos, s.section, s.id);
  /* Shots are made afresh each render, so they are found by what they are, not by which object they are. */
  const same = (a: Shot, b: Shot) => a.section === b.section && a.id === b.id;
  const indexOf = (s: Shot) => all.findIndex((x) => same(x, s));
  const nextMissing = (after?: Shot) => { const i = after ? indexOf(after) : -1; return [...all.slice(i + 1), ...all.slice(0, i + 1)].find((s) => !have(s) && !(after && same(s, after))) || null; };
  const taken = all.filter(have).length;
  const go = (s: StepId | 'review') => nav('/check/' + c.id + '/' + (s === 'review' ? 'review' : STEP_PATH[s]));
  const sent = c.status !== 'draft';
  const stateOf = (p: PhotoMeta) => (sent ? (p.uploadedAt ? 'done' : 'pend') : 'done');
  async function used(t: Taken) {
    if (!cam) return;
    try { await x.addPhoto(t, cam.section, cam.id, cam.nn, cam.label, 1); }
    catch (e) { setTst({ k: 'err', t: (e as Error).message }); setCam(null); return; }
    const n = nextMissing(cam);
    if (n) setCam(n); else { setCam(null); buzz('double'); setTst({ k: 'ok', t: 'Photos done' }); }
  }
  const viewing = view ? x.photos.find((p) => p.id === view) : null;
  const viewShot = viewing ? all.find((s) => s.id === viewing.refId) : null;
  return (
    <div style={css(screen)}>
      {bar('Photos', c, x.save, x.pr, () => nav('/check/' + c.id))}
      {scroll(<>
        {!x.online ? banner('off', 'No signal', 'Photos are saved on this phone. They’ll send by themselves.') : null}
        <div style={css('display:flex;justify-content:space-between;align-items:center')}><span style={css('font-weight:800;font-size:17px')}>{taken} of {all.length || shots.length} taken</span></div>
        <div style={css('display:grid;grid-template-columns:repeat(3,1fr);gap:8px')}>
          {shots.map((s) => { const p = have(s); return <div key={s.id}>{p ? <Thumb p={p} label={s.label} st={stateOf(p)} onClick={() => setView(p.id)} /> : <EmptySlot label={s.label} onClick={() => setCam(s)} />}</div>; })}
        </div>
        <div style={css('font-weight:800;font-size:15px;margin-top:4px')}>Tyres, one per axle per side</div>
        {c.axles
          ? <div style={css('display:grid;grid-template-columns:repeat(3,1fr);gap:8px')}>
              {tyres.map((s) => { const p = have(s); return <div key={s.id}>{p ? <Thumb p={p} label={s.label} st={stateOf(p)} onClick={() => setView(p.id)} /> : <EmptySlot small label={s.label} onClick={() => setCam(s)} />}</div>; })}
            </div>
          : <AxlesAsk c={c} update={x.update} />}
      </>)}
      {tst ? <div style={css('position:fixed;left:16px;right:16px;bottom:110px;z-index:30;max-width:568px;margin:0 auto')}>{toast(tst.k, tst.t)}</div> : null}
      {footer(nextMissing() ? btn('Take photo: ' + nextMissing()!.label, 'p', { ic: 'cam', onClick: () => setCam(nextMissing()) }) : nextButton(x.st, 'photos', go))}
      {cam ? <Camera title={cam.title} n={(indexOf(cam) + 1) + ' OF ' + all.length} guide={cam.guide} frame={cam.frame}
        review={cam.id === 'nsf' ? 'Is the whole corner in?' : undefined}
        earlier={x.photos.filter((p) => !p.removedAt && p.section !== 'D' && p.refId !== cam.id && hashes[p.id]).map((p) => ({ label: all.find((s) => s.id === p.refId)?.label || '', hash: hashes[p.id] }))}
        onUse={used} onClose={() => setCam(null)} /> : null}
      {viewing && viewShot ? <Gallery p={viewing} label={viewShot.label} sent={sent}
        onRetake={() => { setView(null); setCam(viewShot); }}
        onDelete={async () => { await x.removePhoto(viewing.id); setView(null); setTst({ k: 'ok', t: 'Photo deleted', undo: viewing.id }); }}
        onClose={() => setView(null)} /> : null}
      {tst?.undo ? <div style={css('position:fixed;left:16px;right:16px;bottom:110px;z-index:31;max-width:568px;margin:0 auto')}>{toast('ok', tst.t, { act: 'Undo', onAct: async () => { await x.removePhoto(tst.undo!, true); setTst(null); } })}</div> : null}
    </div>
  );
}
function Gallery({ p, label, sent, onRetake, onDelete, onClose }: { p: PhotoMeta; label: string; sent: boolean; onRetake: () => void; onDelete: () => void; onClose: () => void }) {
  const u = usePhotoUrl(p.id);
  const [ask, setAsk] = useState(false);
  return (
    <div style={css('position:fixed;inset:0;z-index:40;background:' + PA + ';display:flex;flex-direction:column;max-width:600px;margin:0 auto')}>
      {topbar(label, { sub: p.fileName, onBack: onClose, save: p.uploadedAt ? 'saved' : 'off' })}
      {scroll(<>
        {photo(label, { ar: p.width + '/' + p.height, src: u || undefined })}
        <div style={css('font-size:14px;color:' + MU)}>Taken {time(p.takenAt)}{p.lat != null ? ' · location kept on the record' : ''}{p.fromGallery ? ' · From gallery' : ''}</div>
        {sent ? null : <div style={css('display:grid;grid-template-columns:1fr 1fr;gap:8px')}>{btn('Retake', 's', { ic: 'retake', h: 56, onClick: onRetake })}{btn('Delete', 'dg', { ic: 'trash', h: 56, onClick: () => setAsk(true) })}</div>}
      </>)}
      {ask ? sheet(<>
        <div style={css('display:flex;justify-content:center')}>{sg('miss', 48)}</div>
        <div style={css('font-family:' + PT + ';font-weight:800;font-size:22px;text-align:center')}>Delete this photo?</div>
        <div style={css('font-size:17px;line-height:1.45;text-align:center')}>{label}. You can undo it for 6 seconds.</div>
        {btn('Delete this photo', 'd', { ic: 'trash', onClick: onDelete })}
        {btn('Keep it', 's', { h: 56, onClick: () => setAsk(false) })}
      </>, { center: true, onClose: () => setAsk(false) }) : null}
    </div>
  );
}

/* ---------------- 10 · General items (source/04 s10, source/02 tri) ---------------- */
const ANSWERS: [ItemAnswer, string, string, string][] = [['ok', 'OK', 'tick', G], ['damaged', 'Damaged', 'alert', R], ['na', 'Not fitted', 'cross', SU]];
export function Items() {
  const x = useInspection();
  const nav = useNavigate();
  const [ask, setAsk] = useState(false);
  if (x.check === undefined) return <Loading />;
  if (!x.check) return <Gone />;
  const c = x.check;
  const items = itemsFor(c, x.cfg);
  const answered = items.filter((i) => c.items[i.id]);
  const na = items.filter((i) => c.items[i.id] === 'na').length;
  const untouched = items.filter((i) => !c.items[i.id]);
  const go = (s: StepId | 'review') => nav('/check/' + c.id + '/' + (s === 'review' ? 'review' : STEP_PATH[s]));
  return (
    <div style={css(screen)}>
      {bar('General items', c, x.save, x.pr, () => nav('/check/' + c.id))}
      {scroll(<>
        <div style={css('display:flex;justify-content:space-between;font-weight:800;font-size:16px')}><span>{answered.length} of {items.length} done</span><span style={css('color:' + MU + ';font-weight:600')}>{na} not fitted</span></div>
        {items.map((it) => {
          const k = c.items[it.id];
          const dmg = c.pins.filter((p) => !p.removedAt && p.itemId === it.id).length;
          return (
            <div key={it.id} style={css('padding:10px 12px;border-radius:8px;background:' + W + ';border:1px solid ' + BL)}>
              <div style={css('font-weight:800;font-size:17px;margin-bottom:8px;display:flex;justify-content:space-between')}>{it.name}{dmg ? <span style={css('font-size:13px;color:' + R7)}>&#9888; {dmg} damage</span> : k === 'damaged' && it.photoIfDamaged ? <span style={css('font-size:13px;color:' + R7)}>&#9888; Mark the damage</span> : null}</div>
              <div role="radiogroup" aria-label={it.name} style={css('display:grid;grid-template-columns:repeat(3,1fr);gap:6px')}>
                {ANSWERS.filter((b) => !(it.answer === 'ok_dmg' && b[0] === 'na')).map((b) => {
                  const on = k === b[0];
                  const text = b[0] === 'damaged' && it.answer === 'ok_fault_na' ? 'Fault' : b[1];
                  return (
                    <button key={b[0]} type="button" role="radio" aria-checked={on} className="k-tap k-reset"
                      onClick={async () => { await x.update((d) => { d.items[it.id] = b[0]; if (b[0] === 'damaged') d.damageAnswer = 'yes'; }); if (b[0] === 'damaged' && it.photoIfDamaged) nav('/check/' + c.id + '/damage?item=' + it.id); }}
                      style={css('height:52px;border-radius:7px;border:2px solid ' + (on ? b[3] : '#A3A39D') + ';background:' + (on ? b[3] : W) + ';color:' + (on ? W : N) + ';display:flex;align-items:center;justify-content:center;gap:6px;font-weight:700;font-size:15px;padding:0')}>
                      {ic(b[2], 18, on ? W : b[3], 2.6)}{text}
                    </button>
                  );
                })}
              </div>
            </div>
          );
        })}
      </>)}
      {footer(<>
        {untouched.length ? btn('Mark the other ' + untouched.length + ' as OK', 's', { h: 56, onClick: () => setAsk(true) }) : null}
        {nextButton(x.st, 'items', go)}
      </>)}
      {ask ? sheet(<>
        <div style={css('font-family:' + PT + ';font-weight:800;font-size:22px')}>Mark the other {untouched.length} as OK?</div>
        <div style={css('font-size:16px;line-height:1.45')}>{untouched.map((i) => i.name).join(', ')}.</div>
        {btn('Mark them OK', 'p', { onClick: async () => { await x.update((d) => { untouched.forEach((i) => { d.items[i.id] = 'ok'; }); }); setAsk(false); } })}
        {btn('Keep going', 's', { h: 56, onClick: () => setAsk(false) })}
      </>, { onClose: () => setAsk(false) }) : null}
    </div>
  );
}

/* ---------------- 11 · Tyres (source/04 s11) ---------------- */
export function Tyres() {
  const x = useInspection();
  const nav = useNavigate();
  const [cur, setCur] = useState<string | null>(null);
  const [other, setOther] = useState('');
  if (x.check === undefined) return <Loading />;
  if (!x.check) return <Gone />;
  const c = x.check, cfg = x.cfg;
  const keys = tyreKeys(c);
  const current = cur && keys.includes(cur) ? cur : keys.find((k) => c.tyres[k]?.depth == null) || keys[0];
  const nameOf = (k: string) => (k.startsWith('ns') ? 'NS' : 'OS') + ' axle ' + k.split('_')[1];
  const longName = (k: string) => (k.startsWith('ns') ? 'Nearside' : 'Offside') + ' axle ' + k.split('_')[1];
  const go = (s: StepId | 'review') => nav('/check/' + c.id + '/' + (s === 'review' ? 'review' : STEP_PATH[s]));
  async function setDepth(v: number) {
    await x.update((d) => { d.tyres[current] = { ...(d.tyres[current] || {}), depth: v }; });
    setOther('');
    if (v < cfg.limits.lowTread) buzz('firm');
    const n = keys.find((k) => k !== current && c.tyres[k]?.depth == null);
    if (n) setCur(n);
  }
  const lows = keys.filter((k) => c.tyres[k]?.depth != null && c.tyres[k]!.depth! < cfg.limits.lowTread);
  const tile = (k: string, l: ReactNode) => {
    const v = c.tyres[k]?.depth;
    const kind = k === current ? 'cur' : v != null && v < cfg.limits.lowTread ? 'warn' : v != null ? 'done' : 'todo';
    return (
      <button key={k} type="button" className="k-tap k-reset" onClick={() => setCur(k)} aria-pressed={k === current} aria-label={longName(k)}
        style={css('padding:8px;border-radius:8px;border:' + (kind === 'cur' ? 3 : 2) + 'px solid ' + (kind === 'cur' ? N : kind === 'warn' ? A : kind === 'done' ? G : '#A3A39D') + ';background:' + (kind === 'warn' ? A1 : W) + ';text-align:center;color:' + N + ';width:100%')}>
        <div style={css('font-size:12px;font-weight:700;color:' + MU)}>{l}</div>
        <div style={css('font-family:' + MO + ';font-weight:800;font-size:22px')}>{v != null ? v + 'mm' : '–'}</div>
      </button>
    );
  };
  const nextKey = keys.find((k) => k !== current && c.tyres[k]?.depth == null);
  return (
    <div style={css(screen)}>
      {topbar('Tyres', { sub: 'Tread depth', save: x.save, prog: x.pr.pct, progLabel: x.pr.done + ' of ' + x.pr.total + ' steps', onBack: () => nav('/check/' + c.id) })}
      {scroll(!c.axles ? <AxlesAsk c={c} update={x.update} /> : <>
        <div style={css('display:grid;grid-template-columns:1fr 50px 1fr;gap:8px;align-items:center')}>
          <span style={css('text-align:center;font-weight:800;font-size:14px')}>NEARSIDE</span><span /><span style={css('text-align:center;font-weight:800;font-size:14px')}>OFFSIDE</span>
          {Array.from({ length: c.axles }, (_, i) => i + 1).map((a) => [
            tile('ns_' + a, 'Axle ' + a),
            <span key={'b' + a} style={css('height:6px;background:' + N + ';border-radius:3px')} />,
            tile('os_' + a, 'Axle ' + a),
          ])}
        </div>
        {lows.map((k) => {
          const v = c.tyres[k]!.depth!;
          return <div key={k}>{v < cfg.limits.legalTread ? banner('err', nameOf(k) + ' is ' + v + 'mm', 'Under the legal limit. It will be flagged to the office.') : banner('warn', nameOf(k) + ' is ' + v + 'mm', 'Legal, but flagged to the office.')}</div>;
        })}
        <div style={css('font-weight:700;font-size:16px')}>{nameOf(current)} tread</div>
        <div style={css('display:grid;grid-template-columns:repeat(4,1fr);gap:6px')}>
          {cfg.treadChoices.map((v) => {
            const on = c.tyres[current]?.depth === v;
            return <button key={v} type="button" className="k-tap k-reset" onClick={() => setDepth(v)} aria-pressed={on}
              style={css('height:52px;border-radius:7px;border:2px solid ' + (on ? N : '#A3A39D') + ';background:' + (on ? N : W) + ';color:' + (on ? W : N) + ';display:flex;align-items:center;justify-content:center;font-family:' + MO + ';font-weight:800;font-size:18px;padding:0')}>{v}mm</button>;
          })}
          <label style={css('height:52px;border-radius:7px;border:2px solid #A3A39D;background:' + W + ';color:' + N + ';display:flex;align-items:center;justify-content:center;font-family:' + MO + ';font-weight:800;font-size:18px;overflow:hidden')}>
            <input aria-label="Other depth in mm" inputMode="decimal" placeholder="Other" value={other} onChange={(e) => setOther(e.target.value.replace(/[^0-9.]/g, ''))}
              onBlur={() => { const v = parseFloat(other); if (!isNaN(v)) setDepth(v); }} onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}
              style={css('width:100%;height:100%;border:0;outline:none;text-align:center;font:inherit;background:transparent;color:' + N)} />
          </label>
        </div>
      </>)}
      {footer(c.axles && nextKey ? btn('Next tyre: ' + nameOf(nextKey), 'p', { onClick: () => setCur(nextKey) }) : nextButton(x.st, 'tyres', go))}
    </div>
  );
}

/* ---------------- 12 · Readings (source/04 s12) ---------------- */
export function Readings() {
  const x = useInspection();
  const nav = useNavigate();
  const [last, setLast] = useState<Record<string, number | null>>({});
  const inputs = useRef<Record<string, HTMLInputElement | null>>({});
  useEffect(() => { if (x.check) db.lastChecks.get(x.check.stcNo).then((l) => setLast(l?.readings || {})); }, [x.check?.stcNo]); // eslint-disable-line
  if (x.check === undefined) return <Loading />;
  if (!x.check) return <Gone />;
  const c = x.check, cfg = x.cfg;
  const rs = readingsFor(c, cfg);
  const go = (s: StepId | 'review') => nav('/check/' + c.id + '/' + (s === 'review' ? 'review' : STEP_PATH[s]));
  const odd = (id: string, v: number | null | undefined): string | null => {
    const l = last[id];
    if (v == null || l == null || c.readingNotes[id]) return null;
    if (v < l) return 'Lower than last time (' + num(l) + '). Check the reading.';
    if (id === 'hub' && v - l > cfg.limits.hubJump) return 'More than ' + num(cfg.limits.hubJump) + ' km from last time (' + num(l) + '). Is this right?';
    return null;
  };
  return (
    <div style={css(screen)}>
      {bar('Readings', c, x.save, x.pr, () => nav('/check/' + c.id), fleetTag(c) + ' · ' + typeName(c.trailerType, cfg))}
      {scroll(<>
        {rs.map((r) => {
          const v = c.readings[r.id];
          const warn = odd(r.id, v);
          return (
            <div key={r.id} style={css('display:flex;flex-direction:column;gap:6px')}>
              <label htmlFor={'r-' + r.id} style={css('font-weight:700;font-size:16px')}>{r.name}{r.required ? <> <span style={css('color:' + R)}>*</span></> : null}</label>
              <div style={css('min-height:64px;display:flex;align-items:center;padding:0 16px;border-radius:8px;background:' + W + ';border:' + (warn ? '3px solid ' + A : v != null ? '2px solid ' + G : '2px solid #A3A39D'))}>
                <input id={'r-' + r.id} ref={(el) => { inputs.current[r.id] = el; }} inputMode="numeric" value={v == null ? '' : num(v)}
                  onChange={(e) => { const n = parseInt(e.target.value.replace(/\D/g, ''), 10); x.update((d) => { d.readings[r.id] = isNaN(n) ? null : n; delete d.readingNotes[r.id]; }); }}
                  style={css('flex:1;min-width:0;border:0;outline:none;background:transparent;color:' + N + ';font-family:' + MO + ';font-weight:800;font-size:26px')} />
                {r.unit ? <span style={css('margin-left:auto;font-family:\'Inter\',system-ui,sans-serif;font-size:15px;font-weight:600;color:' + MU)}>{r.unit}</span> : v != null && !warn ? <span style={css('margin-left:auto')}>{sg('done', 24)}</span> : null}
              </div>
              {warn ? <>
                <div style={css('font-size:16px;color:' + A + ';font-weight:600')}>{warn}</div>
                <div style={css('display:grid;grid-template-columns:1fr 1fr;gap:8px')}>
                  {btn('Fix it', 's', { h: 56, onClick: () => inputs.current[r.id]?.focus() })}
                  {btn('It’s right', 'g', { h: 56, css: 'border:2px solid #A3A39D', onClick: () => x.update((d) => { d.readingNotes[r.id] = 'It’s right. ' + warn; }) })}
                </div>
              </> : c.readingNotes[r.id] ? <div style={css('font-size:14px;color:' + MU)}>Noted for the office: the reading is right.</div> : null}
            </div>
          );
        })}
        {strapsApply(c, cfg) ? <>
          <div style={css('font-weight:700;font-size:16px;margin-top:6px')}>Internal straps</div>
          <div style={css('display:flex;align-items:center;border:2px solid ' + N + ';border-radius:8px;overflow:hidden;height:60px;background:' + W)}>
            <button type="button" className="k-tap k-reset" aria-label="One fewer strap" onClick={() => x.update((d) => { d.straps = Math.max(0, (d.straps || 0) - 1); })} style={css('width:64px;height:100%;text-align:center;font-size:30px;font-weight:700;border:0;border-right:2px solid ' + N + ';background:transparent;color:' + N)}>&minus;</button>
            <span style={css('flex:1;text-align:center;font-family:' + MO + ';font-weight:800;font-size:26px')} aria-live="polite">{c.straps ?? 0}</span>
            <button type="button" className="k-tap k-reset" aria-label="One more strap" onClick={() => x.update((d) => { d.straps = (d.straps || 0) + 1; })} style={css('width:64px;height:100%;text-align:center;font-size:30px;font-weight:700;border:0;border-left:2px solid ' + N + ';background:transparent;color:' + N)}>+</button>
          </div>
        </> : null}
      </>)}
      {footer(nextButton(x.st, 'readings', go))}
    </div>
  );
}

/* ---------------- 13 · Seals, locks and cleanliness (source/04 s13) ---------------- */
export function Seals() {
  const x = useInspection();
  const nav = useNavigate();
  if (x.check === undefined) return <Loading />;
  if (!x.check) return <Gone />;
  const c = x.check, cfg = x.cfg;
  const go = (s: StepId | 'review') => nav('/check/' + c.id + '/' + (s === 'review' ? 'review' : STEP_PATH[s]));
  return (
    <div style={css(screen)}>
      {topbar('Seals and cleanliness', { save: x.save, prog: x.pr.pct, progLabel: x.pr.done + ' of ' + x.pr.total + ' steps', onBack: () => nav('/check/' + c.id) })}
      {scroll(<>
        <div style={css('display:flex;flex-direction:column;gap:6px')}>
          <label htmlFor="seal" style={css('font-weight:700;font-size:16px')}>Seal number <span style={css('font-weight:400;color:' + SU)}>Optional</span></label>
          <input id="seal" value={c.seal} onChange={(e) => x.update((d) => { d.seal = e.target.value.toUpperCase(); })} autoCapitalize="characters"
            style={css('min-height:60px;display:flex;align-items:center;padding:0 16px;border-radius:8px;background:' + W + ';border:2px solid #A3A39D;font-family:' + MO + ';font-weight:800;font-size:22px;color:' + N + ';outline:none;width:100%')} />
        </div>
        <button type="button" role="checkbox" aria-checked={c.doorsLock} className="k-tap k-reset" onClick={() => x.update((d) => { d.doorsLock = !d.doorsLock; })}
          style={css('min-height:60px;display:flex;align-items:center;gap:14px;padding:0 16px;border-radius:8px;background:' + W + ';border:2px solid ' + (c.doorsLock ? G : '#A3A39D') + ';width:100%;color:' + N)}>
          <span style={css('width:32px;height:32px;border-radius:6px;border:3px solid ' + (c.doorsLock ? G : N) + ';background:' + (c.doorsLock ? G : W) + ';display:flex;align-items:center;justify-content:center;box-sizing:border-box')}>{c.doorsLock ? ic('tick', 22, W, 3) : null}</span>
          <span style={css('font-size:18px;font-weight:600')}>Doors lock</span>
        </button>
        <div style={css('font-weight:700;font-size:16px;margin-top:6px')}>How clean is it? <span style={css('color:' + R)}>*</span></div>
        <div role="radiogroup" aria-label="How clean is it?" style={css('display:grid;grid-template-columns:repeat(3,1fr);gap:6px')}>
          {cfg.cleanliness.map((v) => {
            const on = c.cleanliness === v;
            return <button key={v} type="button" role="radio" aria-checked={on} className="k-tap k-reset" onClick={() => x.update((d) => { d.cleanliness = v; })}
              style={css('min-height:64px;border-radius:8px;border:' + (on ? 3 : 2) + 'px solid ' + (on ? N : '#A3A39D') + ';background:' + (on ? N : W) + ';color:' + (on ? W : N) + ';display:flex;align-items:center;justify-content:center;text-align:center;font-weight:700;font-size:15px;padding:4px')}>{v}</button>;
          })}
        </div>
      </>)}
      {footer(nextButton(x.st, 'seals', go))}
    </div>
  );
}

/* ---------------- 14 · Check everything (source/04 s14) ---------------- */
export function Review() {
  const x = useInspection();
  const nav = useNavigate();
  useEffect(() => { if (x.check && !x.check.tried) x.update((d) => { d.tried = true; }); }, [x.check?.id]); // eslint-disable-line
  if (x.check === undefined) return <Loading />;
  if (!x.check) return <Gone />;
  const c = x.check;
  const missing = missingAll(x.st);
  const go = (step: StepId) => nav('/check/' + c.id + '/' + STEP_PATH[step]);
  return (
    <div style={css(screen)}>
      {bar('Check everything', c, x.save, x.pr, () => nav('/check/' + c.id))}
      {scroll(<>
        {missing.length ? banner('err', missing.length + (missing.length === 1 ? ' thing left' : ' things left'), 'Tap one to go straight to it.') : banner('ok', 'Everything is done', 'Sign and send it.')}
        {missing.map((m, i) => <div key={i}>{stepRow(x.st.find((s) => s.id === m.step)?.name || '', m.text, 'miss', { onClick: () => go(m.step) })}</div>)}
        {x.st.filter((s) => s.state === 'done' && s.id !== 'sign').map((s) => <div key={s.id}>{stepRow(s.name, s.sub, 'done', { r: <span style={css('font-weight:700;font-size:14px')}>Change</span>, onClick: () => go(s.id) })}</div>)}
      </>)}
      {footer(missing.length
        ? btn('Go to the first one: ' + (x.st.find((s) => s.id === missing[0].step)?.name || ''), 'd', { onClick: () => go(missing[0].step) })
        : btn('Next: Sign', 'p', { onClick: () => go('sign') }))}
    </div>
  );
}

/* ---------------- 15 · Sign and send (source/04 s15) ---------------- */
export function Sign() {
  const x = useInspection();
  const nav = useNavigate();
  const loc = useLocation();
  const canvas = useRef<HTMLCanvasElement>(null);
  const drawing = useRef(false);
  const [has, setHas] = useState(false);
  const [busy, setBusy] = useState(false);
  const preview = new URLSearchParams(loc.search).get('preview') === 'draft' || isPreview();
  useEffect(() => {
    const cv = canvas.current;
    if (!cv) return;
    const r = cv.getBoundingClientRect();
    cv.width = Math.round(r.width * 2); cv.height = Math.round(r.height * 2);
    const ctx = cv.getContext('2d')!;
    ctx.lineWidth = 7; ctx.lineCap = 'round'; ctx.lineJoin = 'round'; ctx.strokeStyle = N;
  }, [x.check?.id]); // eslint-disable-line
  if (x.check === undefined) return <Loading />;
  if (!x.check) return <Gone />;
  const c = x.check;
  const missing = missingAll(x.st);
  const pt = (e: React.PointerEvent) => { const r = canvas.current!.getBoundingClientRect(); return [(e.clientX - r.left) * 2, (e.clientY - r.top) * 2]; };
  function down(e: React.PointerEvent) { drawing.current = true; canvas.current!.setPointerCapture(e.pointerId); const [a, b] = pt(e); const ctx = canvas.current!.getContext('2d')!; ctx.beginPath(); ctx.moveTo(a, b); }
  function move(e: React.PointerEvent) { if (!drawing.current) return; const [a, b] = pt(e); const ctx = canvas.current!.getContext('2d')!; ctx.lineTo(a, b); ctx.stroke(); setHas(true); }
  function up() { drawing.current = false; }
  function clear() { const cv = canvas.current!; cv.getContext('2d')!.clearRect(0, 0, cv.width, cv.height); setHas(false); }
  async function send() {
    if (busy) return;
    setBusy(true);
    const sig = canvas.current!.toDataURL('image/png');
    const now = new Date().toISOString();
    await x.update((d) => { d.signature = sig; d.signedAt = now; });
    const latest = await db.checks.get(c.id);
    if (latest) await queueSend(latest);
    buzz('long');
    nav('/check/' + c.id + '/sent', { replace: true });
  }
  return (
    <div style={css(screen)}>
      {topbar('Sign', { sub: fleetTag(c) + ' · ' + dirWord(c.direction), save: x.save, prog: missing.length ? x.pr.pct : 100, progLabel: missing.length ? x.pr.done + ' of ' + x.pr.total + ' steps' : 'All steps done', onBack: () => nav('/check/' + c.id) })}
      {scroll(<>
        {missing.length ? banner('err', missing.length + (missing.length === 1 ? ' thing left' : ' things left') + ' before you can send', missing.slice(0, 3).map((m) => m.text).join('. ') + '.', 'Show me', () => nav('/check/' + c.id + '/review')) : null}
        <div style={css('font-size:17px;line-height:1.45')}>I&rsquo;ve checked this trailer and the record is right.</div>
        <div style={css('height:220px;border-radius:10px;border:2px solid ' + N + ';background:' + W + ';position:relative;touch-action:none')}>
          <canvas ref={canvas} aria-label="Sign here with your finger" onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={up}
            style={css('position:absolute;inset:0;width:100%;height:100%;touch-action:none')} />
          <div style={css('position:absolute;left:16px;right:16px;bottom:30px;border-top:2px dashed #A3A39D;pointer-events:none')} />
          <button type="button" className="k-tap k-reset" onClick={clear} style={css('position:absolute;right:12px;top:10px;font-weight:700;font-size:15px;text-decoration:underline;background:transparent;border:0;color:' + N + ';min-height:44px')}>Clear</button>
        </div>
        <div style={css('font-size:16px')}><b>{c.userName}</b> &middot; {c.userRole.replace(' staff', '')} &middot; {new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'short' })} {time(new Date())}</div>
      </>)}
      {footer(missing.length
        ? btn(missing.length + (missing.length === 1 ? ' thing left' : ' things left'), 'p', { onClick: () => nav('/check/' + c.id + '/review') })
        : preview ? btn('Send inspection', 'dis', { ic: 'send', title: 'This is a preview of a draft checklist. Nothing is sent.' })
          : !has ? btn('Sign above to send', 'p', { ic: 'sign', onClick: () => canvas.current?.focus() })
            : btn(busy ? 'Sending' : 'Send inspection', 'ok', { ic: 'send', loading: busy, onClick: send }))}
    </div>
  );
}

/* ---------------- 16 · Done, Sending, Partly sent (source/04 s16, source/05 S_states) ---------------- */
export function Sent() {
  const x = useInspection();
  const nav = useNavigate();
  const sync = useSync();
  const [share, setShare] = useState<null | 'shared' | 'cancelled' | 'unsupported' | 'error'>(null);
  const [files, setFiles] = useState<{ pdf: File; zip: File } | null>(null);
  /* The share screen only opens straight after a tap, so the PDF and zip are made first, as soon as this screen shows,
     and made again when the office's reference arrives. */
  useEffect(() => {
    const c = x.check;
    if (!c || c.status === 'draft') return;
    let on = true;
    setFiles(null);
    (async () => {
      try {
        const out = await import('../lib/output');
        const live = x.photos.filter((p) => !p.removedAt);
        const f = await out.outputFiles(c, x.cfg, live, async (p) => (await db.photos.get(p.id))!.blob);
        if (on) setFiles({ pdf: f.pdf, zip: f.zip });
      } catch { if (on) setShare('error'); }
    })();
    return () => { on = false; };
  }, [x.check?.id, x.check?.ref, x.check?.status === 'draft']); // eslint-disable-line
  if (x.check === undefined) return <Loading />;
  if (!x.check) return <Gone />;
  const c = x.check, cfg = x.cfg;
  const pg = sync.sending[c.id];
  const live = x.photos.filter((p) => !p.removedAt);
  const nd = c.pins.filter((p) => !p.removedAt && p.status === 'new').length;
  async function email() {
    if (!files) return;
    try {
      const out = await import('../lib/output');
      setShare(await out.shareCheck(c, cfg, [files.pdf, files.zip]));
    } catch { setShare('error'); }
  }
  async function save() { if (!files) return; const out = await import('../lib/output'); out.downloadFile(files.pdf, files.pdf.name); out.downloadFile(files.zip, files.zip.name); }
  const emailBtn = files ? btn('Email the office', 'p', { ic: 'send', onClick: email }) : btn('Making the PDF and zip', 'p', { loading: share !== 'error', onClick: email });

  /* Still sending, with signal: show each part as it goes. */
  if (c.status === 'waiting' && x.online && (!pg || !pg.error)) {
    const stuck = pg && Date.now() - pg.lastProgress > 120000;
    const photosDone = pg ? pg.photos[0] : 0, photosAll = pg ? pg.photos[1] : live.filter((p) => p.section !== 'D').length;
    const dDone = pg ? pg.damage[0] : 0, dAll = pg ? pg.damage[1] : live.filter((p) => p.section === 'D').length;
    const total = photosAll + dAll + 2, done = (pg?.details ? 1 : 0) + (pg?.signature ? 1 : 0) + photosDone + dDone;
    return (
      <div style={css(screen)}>
        {topbar('Sending', { back: false, save: 'saving' })}
        {scroll(<div style={css('flex:1;display:flex;flex-direction:column;justify-content:center;gap:14px')}>
          <div style={css('font-family:' + PT + ';font-weight:800;font-size:24px')}>Sending {fleetTag(c)}</div>
          {([[pg?.details ? 'done' : 'pend', 'Inspection details'], [pg?.signature ? 'done' : pg?.details ? 'pend' : 'todo', 'Signature'],
            [photosAll && photosDone >= photosAll ? 'done' : pg?.details ? 'pend' : 'todo', 'Photos: ' + photosDone + ' of ' + photosAll],
            [dAll && dDone >= dAll ? 'done' : photosDone >= photosAll && pg?.details ? 'pend' : 'todo', dAll ? 'Damage photos: ' + dDone + ' of ' + dAll : 'Damage photos']] as [string, string][])
            .filter((r, i) => i < 3 || dAll || r).map((r) => <div key={r[1]} style={css('display:flex;align-items:center;gap:12px;font-size:17px;font-weight:600')}>{sg(r[0], 28)}{r[1]}</div>)}
          <div style={css('height:10px;border-radius:5px;background:' + N1)}><div style={css('width:' + Math.round((done / total) * 100) + '%;height:100%;border-radius:5px;background:' + N5)} /></div>
          <div style={css('font-size:15px;color:' + MU)}>{stuck ? 'Taking longer than usual. It’s still safe on your phone.' : 'You can leave this screen. It keeps sending in the background.'}</div>
        </div>)}
        {footer(btn('Done', 'g', { h: 56, onClick: () => nav('/') }))}
      </div>
    );
  }
  /* Partly sent: some parts arrived, some did not. */
  if (c.status === 'waiting' && pg?.error && pg.details) {
    const left = live.filter((p) => !p.uploadedAt).length;
    return (
      <div style={css(screen)}>
        {topbar(fleetTag(c) + ' · ' + dirWord(c.direction), { back: false, save: 'fail' })}
        {scroll(<>
          {banner('err', left + (left === 1 ? ' photo didn’t send' : ' photos didn’t send'), 'The details and ' + (live.length - left) + ' photos reached the office. The other ' + left + ' are safe on this phone.', 'Try again now', kick)}
          {stepRow('Photos', left + ' waiting to send', 'miss')}
          {stepRow('Inspection details', 'Sent ' + time(new Date(pg.lastProgress)), 'done')}
          <div style={css('font-size:15px;color:' + MU + ';line-height:1.45')}>It will keep retrying every 2 minutes while you have signal. Don&rsquo;t delete the app until this is sent.</div>
        </>)}
        {footer(<>{btn('Try again now', 'p', { ic: 'sync', onClick: kick })}{btn('Done', 'g', { h: 56, onClick: () => nav('/') })}</>)}
      </div>
    );
  }
  /* Sent (green), or queued with no signal (blue). */
  const queued = c.status !== 'sent';
  const bg = queued ? N5 : G;
  return (
    <div style={css(screen)}>
      <div style={css('flex:1;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:16px;padding:24px;background:' + bg + ';color:#fff;text-align:center')}>
        <span style={css('width:110px;height:110px;border-radius:50%;background:#fff;display:flex;align-items:center;justify-content:center')}>{ic(queued ? 'clock' : 'tick', 70, bg, 3.4)}</span>
        <div style={css('font-family:' + PT + ';font-weight:800;font-size:32px;letter-spacing:-0.03em')} role="status">{queued ? 'Will send when there’s signal' : 'Sent to the office'}</div>
        <div style={css('font-size:18px;line-height:1.45')}>{fleetTag(c)} &middot; {dirWord(c.direction)}<br />{live.length} photos &middot; {nd ? nd + ' new damage' : 'no new damage'}</div>
        {c.ref ? <div style={css('font-family:' + MO + ';font-weight:800;font-size:20px;padding:10px 16px;border-radius:8px;background:rgba(0,0,0,0.18)')}>REF {c.ref}</div>
          : <div style={css('font-size:16px;opacity:0.9')}>Saved on this phone. It will send by itself when there&rsquo;s signal.</div>}
      </div>
      {footer(<>
        {share === 'shared' ? banner('ok', 'Email ready in your mail app', 'Check it went from your Outbox.') : null}
        {share === 'cancelled' ? banner('info', 'Email not sent', 'Tap Email the office to try again.') : null}
        {share === 'error' ? banner('err', 'The PDF couldn’t be made', 'Your check is safe. Try again.') : null}
        {share === 'unsupported' ? banner('warn', 'This phone can’t attach files to an email from here', 'Save the PDF and zip, then attach them to an email to the office.', 'Save the files', save) : null}
        {emailBtn}
        {btn('Start another check', 's', { ic: 'plus', onClick: () => nav('/new') })}
        {btn('Done', 'g', { h: 56, onClick: () => nav('/') })}
      </>)}
      {void badge}
    </div>
  );
}

export type { Config };
