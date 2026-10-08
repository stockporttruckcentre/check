/* The four places yard staff use (source/05 S_ia): Home, New check, Unfinished,
   History, and Me under the user icon on Home (source/03 S_nav rules). */
import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { liveQuery } from 'dexie';
import { css } from '../kit/css';
import { btn, scroll, topbar, bnav, stepRow, banner, chip, card, badge, fleet, progbar, sg, ic, setGrp, setRow, tg, pill, footer, sheet } from '../kit/kit';
import { N, W, BL, MU, PT, MO, N5, SU, BD } from '../kit/tokens';
import { db } from '../lib/db';
import type { Check } from '../data/types';
import { useSession, signOut, lockPhone, perms } from '../lib/session';
import { useConfig, configFor } from '../lib/config';
import { useSync, kick, pullAll } from '../lib/sync';
import { supabase } from '../lib/supabase';
import { steps as stepList, percent, fleetTag, dirWord, typeName, stcLabel } from '../lib/check';
import { greeting, time, when, num } from '../lib/format';
import { useOnline } from './useCheck';

export const screen = 'height:100dvh;display:flex;flex-direction:column;max-width:600px;margin:0 auto;background:#F7F7F5;position:relative;overflow:hidden';

export function useMyChecks() {
  const { user } = useSession();
  const [list, setList] = useState<Check[]>([]);
  useEffect(() => {
    if (!user) return;
    const lead = user.perms.see_unfinished;
    const s = liveQuery(() => db.checks.toArray()).subscribe((all) =>
      setList(all.filter((c) => c.userId === user.personId || (lead && c.status !== 'sent')).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))));
    return () => s.unsubscribe();
  }, [user]);
  return list;
}
export function useNav() {
  const nav = useNavigate();
  return (i: number) => nav(['/', '/new', '/unfinished', '/history'][i]);
}

function progressOf(c: Check) {
  const cfg = configFor(c.configVersion);
  return percent(stepList(c, cfg, []));
}

/* ---------------- Home ---------------- */
export function Home() {
  const { user } = useSession();
  const go = useNav();
  const nav = useNavigate();
  const list = useMyChecks();
  const online = useOnline();
  const sync = useSync();
  const [notes, setNotes] = useState<{ id: string; body: { by: string; stc: string; direction: string; ref: string } }[]>([]);
  useEffect(() => {
    if (!online || !user) return;
    supabase.from('notifications').select('id, body').is('read_at', null).order('created_at', { ascending: false }).limit(5)
      .then(({ data }) => setNotes((data || []) as typeof notes));
  }, [online, user]);
  const mine = list.filter((c) => c.userId === user?.personId);
  const unfinished = mine.filter((c) => c.status === 'draft');
  const waiting = mine.filter((c) => c.status === 'waiting');
  const failed = waiting.filter((c) => sync.sending[c.id]?.error && Date.now() - (sync.sending[c.id]?.startedAt || 0) > 120000);
  async function dismiss(id: string) {
    await supabase.from('notifications').update({ read_at: new Date().toISOString() }).eq('id', id);
    setNotes((n) => n.filter((x) => x.id !== id));
  }
  return (
    <div style={css(screen)}>
      {topbar('Home', { back: false, right: (
        <button type="button" className="k-tap k-reset" onClick={() => nav('/me')} aria-label="Me and settings"
          style={css('width:48px;height:48px;display:flex;align-items:center;justify-content:center;background:transparent;border:0;color:' + N)}>{ic('user', 26)}</button>
      ) })}
      {scroll(<>
        {!online && waiting.length ? banner('off', 'No signal', 'Keep going. Everything saves on this phone and sends when signal comes back.') : null}
        {failed.length ? banner('err', failed.length === 1 ? '1 inspection couldn’t send' : failed.length + ' inspections couldn’t send', 'They’re safe on this phone. It will try again.', 'Try again now', kick) : null}
        {notes.map((n) => <div key={n.id}>{banner('info', n.body.by + ' checked ' + (n.body.direction === 'OUT' ? 'out' : 'in') + ' your trailer STC ' + n.body.stc, 'Ref ' + n.body.ref + '. It’s noted on the record.', 'Got it', () => dismiss(n.id))}</div>)}
        <div style={css('font-family:' + PT + ';font-weight:800;font-size:26px;letter-spacing:-0.03em')}>{greeting()}, {user?.name.split(' ')[0]}</div>
        <div style={css('font-size:15px;color:' + MU)}>{user?.siteName === 'All sites' ? 'Carrington' : user?.siteName}</div>
        {btn('Start a check', 'd', { ic: 'plus', h: 72, css: 'font-size:21px', onClick: () => go(1) })}
        {unfinished.length ? <div style={css('font-weight:800;font-size:15px;margin-top:6px')}>Carry on</div> : null}
        {unfinished.slice(0, 3).map((c) => {
          const p = progressOf(c);
          return <div key={c.id}>{stepRow(fleetTag(c) + ' · ' + dirWord(c.direction), p.done + ' of ' + p.total + ' steps · started ' + time(c.createdAt), 'todo', { onClick: () => nav('/check/' + c.id) })}</div>;
        })}
        {waiting.length ? <div style={css('font-weight:800;font-size:15px;margin-top:6px')}>Waiting to send</div> : null}
        {waiting.map((c) => <div key={c.id}>{stepRow(fleetTag(c) + ' · ' + dirWord(c.direction), 'Sends when there’s signal', 'pend', { onClick: () => nav('/check/' + c.id + '/sending') })}</div>)}
      </>)}
      {bnav(0, { go, unfinished: unfinished.length })}
    </div>
  );
}

/* ---------------- Unfinished ---------------- */
export function Unfinished() {
  const go = useNav();
  const nav = useNavigate();
  const { user } = useSession();
  const list = useMyChecks().filter((c) => c.status === 'draft');
  const mine = list.filter((c) => c.userId === user?.personId);
  return (
    <div style={css(screen)}>
      {topbar('Unfinished', { back: false })}
      {scroll(list.length
        ? <>{list.map((c) => {
            const p = progressOf(c);
            const cfg = configFor(c.configVersion);
            return <div key={c.id}>{card(<>
              <div style={css('display:flex;justify-content:space-between;gap:10px;align-items:center')}>{badge('UNFINISHED', 'draft')}<span style={css('font-size:14px;color:' + MU)}>Started {time(c.createdAt)}</span></div>
              <div style={css('display:flex;align-items:center;gap:12px;margin-top:14px')}>{fleet(fleetTag(c))}<div style={css('font-weight:700;font-size:17px')}>{dirWord(c.direction)} &middot; {typeName(c.trailerType, cfg).replace('Curtainsider', 'Curtainsider')}</div></div>
              {c.userId !== user?.personId ? <div style={css('font-size:14px;color:' + MU + ';margin-top:8px')}>Started by {c.userName}</div> : null}
              {progbar(p.pct, p.done + ' of ' + p.total + ' steps')}
              <div style={css('margin-top:14px')}>{btn('Carry on', 'p', { h: 56, onClick: () => nav('/check/' + c.id) })}</div>
            </>, 'padding:18px')}</div>;
          })}</>
        : <div style={css('flex:1;display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center;gap:12px;padding:20px')}>
            {sg('done', 56)}
            <div style={css('font-family:' + PT + ';font-weight:800;font-size:22px')}>Nothing unfinished</div>
            <div style={css('font-size:16px;color:' + MU + ';line-height:1.45')}>Any check you leave part way through will wait here.</div>
          </div>)}
      {bnav(2, { go, unfinished: mine.length })}
    </div>
  );
}

/* ---------------- History ---------------- */
interface Row { id: string; ref: string | null; direction: 'OUT' | 'IN'; stc_no: string; c_no: string | null; customer: string | null; collecting_reg: string | null; status: string; sent_at: string | null; created_at: string; new_damage: number; photos?: number }
const FILTERS = ['All', 'Unfinished', 'Waiting to send', 'Check out', 'Check in'] as const;
export function History() {
  const go = useNav();
  const nav = useNavigate();
  const online = useOnline();
  const local = useMyChecks();
  const [server, setServer] = useState<Row[] | null>(null);
  const [q, setQ] = useState('');
  const [f, setF] = useState<(typeof FILTERS)[number]>(() => { try { return (localStorage.getItem('stc-history-filter') as (typeof FILTERS)[number]) || 'All'; } catch { return 'All'; } });
  useEffect(() => { try { localStorage.setItem('stc-history-filter', f); } catch { /* private mode */ } }, [f]);
  useEffect(() => {
    if (!online) { setServer([]); return; }
    setServer(null);
    supabase.from('checks').select('id, ref, direction, stc_no, c_no, customer, collecting_reg, status, sent_at, created_at, new_damage').eq('status', 'sent').is('deleted_at', null)
      .order('sent_at', { ascending: false }).limit(100).then(({ data }) => setServer((data || []) as Row[]));
  }, [online]);
  const rows: Row[] = useMemo(() => {
    const fromPhone: Row[] = local.map((c) => ({ id: c.id, ref: c.ref, direction: c.direction, stc_no: c.stcNo, c_no: c.cNo, customer: c.customer, collecting_reg: c.collectingReg, status: c.status, sent_at: c.sentAt, created_at: c.createdAt, new_damage: c.pins.filter((p) => !p.removedAt && p.status === 'new').length }));
    const ids = new Set(fromPhone.map((r) => r.id));
    return [...fromPhone, ...(server || []).filter((r) => !ids.has(r.id))];
  }, [local, server]);
  const ql = q.trim().toLowerCase();
  const shown = rows.filter((r) => (f === 'All' || (f === 'Unfinished' && r.status === 'draft') || (f === 'Waiting to send' && r.status === 'waiting') || (f === 'Check out' && r.direction === 'OUT') || (f === 'Check in' && r.direction === 'IN'))
    && (!ql || [r.ref, r.stc_no, r.c_no, r.customer, r.collecting_reg].some((x) => (x || '').toLowerCase().includes(ql))));
  const count = (k: (typeof FILTERS)[number]) => rows.filter((r) => k === 'All' || (k === 'Unfinished' && r.status === 'draft') || (k === 'Waiting to send' && r.status === 'waiting')).length;
  return (
    <div style={css(screen)}>
      {topbar('History', { back: false })}
      {scroll(<>
        <div style={css('display:flex;align-items:center;gap:10px;min-height:56px;padding:0 14px;border-radius:8px;border:2px solid #A3A39D;background:' + W)}>
          {ic('search', 20, MU)}
          <input aria-label="Search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Trailer, customer or reg"
            style={css('flex:1;border:0;outline:none;font-size:18px;font-family:inherit;background:transparent;color:' + N)} />
        </div>
        <div style={css('display:flex;gap:10px;overflow-x:auto;padding-bottom:2px;scrollbar-width:none')}>
          {FILTERS.map((k) => <span key={k} style={{ flex: 'none' }}>{chip(k, f === k, { n: k === 'All' || k === 'Unfinished' || k === 'Waiting to send' ? count(k) : null, onClick: () => setF(k) })}</span>)}
        </div>
        {server === null && online
          ? [0, 1, 2].map((i) => <div key={i} style={css('padding:16px;border-radius:8px;background:' + W + ';border:1px solid ' + BL)}><div style={css('width:40%;height:18px;border-radius:4px;background:#EFEFEC')} /><div style={css('display:flex;gap:10px;margin-top:14px')}><div style={css('width:90px;height:40px;border-radius:6px;background:#E2E2DE')} /><div style={css('flex:1')}><div style={css('width:70%;height:14px;border-radius:4px;background:#EFEFEC')} /><div style={css('width:50%;height:14px;border-radius:4px;background:#EFEFEC;margin-top:8px')} /></div></div></div>)
          : shown.map((r) => (
            <button key={r.id} type="button" className="k-tap k-reset" onClick={() => nav(r.status === 'draft' ? '/check/' + r.id : r.status === 'waiting' ? '/check/' + r.id + '/sending' : '/history/' + r.id)}
              style={css('display:block;width:100%;text-align:left;background:' + W + ';border:1px solid ' + BL + ';border-radius:8px;padding:18px;color:' + N)}>
              <div style={css('display:flex;justify-content:space-between;gap:10px;align-items:center')}>{badge(r.direction === 'OUT' ? 'CHECK OUT' : 'CHECK IN', r.direction === 'OUT' ? 'out' : 'in')}<span style={css('font-size:14px;color:' + MU)}>{when(r.sent_at || r.created_at)}</span></div>
              <div style={css('display:flex;align-items:center;gap:12px;margin-top:14px')}>{fleet(r.c_no || stcLabel(r.stc_no))}<div style={css('min-width:0;overflow-wrap:anywhere')}><div style={css('font-weight:700;font-size:17px')}>{r.customer || 'No customer'}</div>{r.collecting_reg ? <div style={css('font-size:14px;color:' + MU)}>Collecting: <b style={css('font-family:' + MO)}>{r.collecting_reg}</b></div> : null}</div></div>
              <div style={css('display:flex;justify-content:space-between;align-items:center;margin-top:14px;padding-top:12px;border-top:1px solid ' + BD)}>
                {r.status === 'sent' ? badge('✓ SENT', 'ok') : r.status === 'waiting' ? badge('⏱ WAITING TO SEND', 'pend') : badge('UNFINISHED', 'draft')}
                <span style={css('font-size:14px;color:' + MU)}>{r.new_damage ? r.new_damage + ' damage' : 'No new damage'}</span>
              </div>
            </button>
          ))}
        {server !== null && !shown.length ? <div style={css('font-size:16px;color:' + MU + ';text-align:center;padding:20px')}>{online ? 'No checks yet.' : 'No signal. Only checks on this phone are shown.'}</div> : null}
      </>)}
      {bnav(3, { go, unfinished: local.filter((c) => c.status === 'draft').length })}
    </div>
  );
}

/* ---------------- Me: staff settings (source/07 S_settings) ---------------- */
export function Me() {
  const nav = useNavigate();
  const go = useNav();
  const { user } = useSession();
  const { settings } = useConfig();
  const sync = useSync();
  const list = useMyChecks();
  const waiting = list.filter((c) => c.status === 'waiting' && c.userId === user?.personId);
  const [buzzOn, setBuzz] = useState(() => { try { return localStorage.getItem('stc-buzz') !== 'off'; } catch { return true; } });
  const [blocked, setBlocked] = useState(false);
  const [space, setSpace] = useState<string>('');
  useEffect(() => { db.photos.toArray().then((ps) => setSpace(Math.round(ps.reduce((s, p) => s + p.bytes, 0) / 1e5) / 10 + ' MB')); }, []);
  function toggleBuzz() { const n = !buzzOn; setBuzz(n); try { localStorage.setItem('stc-buzz', n ? 'on' : 'off'); } catch { /* */ } }
  async function out(force = false) {
    if (!user) return;
    const e = await signOut(user, force);
    if (e) setBlocked(true); else nav('/');
  }
  if (blocked) {
    return (
      <div style={css(screen)}>
        {topbar('Me', { back: false })}
        {scroll(<>
          {banner('err', waiting.length + (waiting.length === 1 ? ' inspection hasn’t sent yet' : ' inspections haven’t sent yet'), 'If you sign out now, they’ll be lost. Find signal first.')}
          {waiting.map((c) => <div key={c.id}>{stepRow(fleetTag(c), 'Waiting to send', 'pend', { onClick: () => nav('/check/' + c.id + '/sending') })}</div>)}
        </>)}
        {footer(<>{btn('Try sending now', 'p', { ic: 'sync', onClick: () => { kick(); setBlocked(false); } })}
          {btn('Sign out anyway', 'dis', { h: 56, title: 'Unsent work can only be lost with a supervisor PIN' })}</>)}
      </div>
    );
  }
  return (
    <div style={css(screen)}>
      {topbar('Settings', { onBack: () => nav('/') })}
      {scroll(<>
        {setGrp('You', [
          <div key="a">{setRow(user?.name, (user?.roleName || '') + ' · ' + (user?.siteName === 'All sites' ? 'All sites' : user?.siteName), '')}</div>,
          <div key="b">{setRow('Change PIN', '', undefined, () => nav('/me/pin'))}</div>,
        ])}
        {setGrp('The app', [
          <div key="a">{setRow('Text size', textSizeName(), '', () => nav('/me/text'))}</div>,
          <div key="b">{setRow('Buzz on actions', '', tg(buzzOn, { onClick: toggleBuzz, label: 'Buzz on actions' }))}</div>,
          <div key="c">{setRow('Photo quality', 'Set by the office: ' + settings.photo.targetKB + 'KB JPEG', '')}</div>,
          <div key="d">{setRow('Dark mode', 'Follow phone', '')}</div>,
        ])}
        {setGrp('Phone', [
          <div key="a">{setRow('Saved on this phone', space + ' · ' + waiting.length + (waiting.length === 1 ? ' check waiting' : ' checks waiting'), pill(waiting.some((c) => sync.sending[c.id]?.error) ? 'RETRYING' : 'OK', waiting.some((c) => sync.sending[c.id]?.error) ? 'warn' : 'ok'), () => nav('/me/storage'))}</div>,
          <div key="b">{setRow('Lock the phone', 'Back to Who’s using the phone?', undefined, () => { lockPhone(); nav('/'); })}</div>,
          <div key="c">{setRow('Sign out', '', ic('chev', 18, SU), () => out())}</div>,
        ])}
        {perms().edit_config || perms().undo || perms().system || perms().people
          ? setGrp('Office', [<div key="o">{setRow('Open the office', 'Inspections, people, checklists', undefined, () => nav('/office/inspections'))}</div>])
          : null}
      </>, 'gap:10px;padding:14px 16px')}
      {bnav(-1, { go, unfinished: list.filter((c) => c.status === 'draft' && c.userId === user?.personId).length })}
    </div>
  );
}

export const TEXT_SIZES = ['Standard', 'Large', 'Extra large'] as const;
export function textSizeName() { try { return localStorage.getItem('stc-text') || 'Standard'; } catch { return 'Standard'; } }
export function applyTextSize() {
  const i = Math.max(0, TEXT_SIZES.indexOf(textSizeName() as (typeof TEXT_SIZES)[number]));
  document.documentElement.style.zoom = String([1, 1.12, 1.25][i]);
}
export function TextSize() {
  const nav = useNavigate();
  const [cur, setCur] = useState(textSizeName());
  function pick(t: string) { setCur(t); try { localStorage.setItem('stc-text', t); } catch { /* */ } applyTextSize(); }
  return (
    <div style={css(screen)}>
      {topbar('Text size', { onBack: () => nav('/me') })}
      {scroll(<>
        <div style={css('padding:20px;border-radius:10px;background:' + W + ';border:1px solid ' + BL)}>
          <div style={css('font-family:' + PT + ';font-weight:800;font-size:24px')}>Tyres</div>
          <div style={css('font-size:19px;margin-top:6px;line-height:1.4')}>Offside axle 2 is 2mm. It will be flagged to the office.</div>
        </div>
        {TEXT_SIZES.map((t, i) => (
          <button key={t} type="button" className="k-tap k-reset" onClick={() => pick(t)} aria-pressed={cur === t}
            style={css('min-height:60px;display:flex;align-items:center;justify-content:space-between;padding:0 16px;border-radius:10px;background:' + W + ';border:' + (cur === t ? '3px solid ' + N : '1px solid ' + BL) + ';font-size:' + (16 + i * 3) + 'px;font-weight:700;width:100%;color:' + N)}>
            {t}{cur === t ? sg('done', 26) : null}
          </button>
        ))}
      </>, 'gap:10px')}
    </div>
  );
}

export function Storage() {
  const nav = useNavigate();
  const sync = useSync();
  const list = useMyChecks();
  const waiting = list.filter((c) => c.status === 'waiting');
  const [photos, setPhotos] = useState({ mb: 0, n: 0 });
  const [app, setApp] = useState<string>('');
  useEffect(() => {
    db.photos.toArray().then((ps) => setPhotos({ mb: Math.round(ps.reduce((s, p) => s + p.bytes, 0) / 1e5) / 10, n: ps.length }));
    navigator.storage?.estimate?.().then((e) => setApp(Math.round((e.usage || 0) / 1e6) + ' MB'));
  }, []);
  const { config } = useConfig();
  return (
    <div style={css(screen)}>
      {topbar('Saved on this phone', { onBack: () => nav('/me') })}
      {scroll(<>
        {waiting.length ? banner('info', waiting.length + (waiting.length === 1 ? ' check waiting to send' : ' checks waiting to send'), 'They go as soon as there’s signal.') : null}
        {setGrp('Space used', [
          <div key="a">{setRow('Photos', photos.mb + ' MB · about ' + (photos.n ? Math.round((photos.mb * 1000) / photos.n) : 100) + 'KB each', '')}</div>,
          <div key="b">{setRow('Stock sheet copy', sync.trailersAt ? 'Refreshed ' + when(sync.trailersAt).replace('Today', 'today') : 'Not downloaded yet', '')}</div>,
          <div key="c">{setRow('App', app || '', '')}</div>,
        ])}
        <div style={css('font-size:14px;color:' + MU + ';line-height:1.45')}>Sent checks are cleared from the phone after {config.limits.keepDays} days. The office keeps them.</div>
        {btn('Refresh the stock sheet now', 's', { h: 56, ic: 'sync', onClick: () => pullAll() })}
      </>, 'gap:10px')}
    </div>
  );
}

/* Read only record (source/05 S_states, Locked) with Add a correction. */
export function SentRecord({ id }: { id: string }) {
  const nav = useNavigate();
  const [c, setC] = useState<Check | null | undefined>(undefined);
  const [text, setText] = useState('');
  const [open, setOpen] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [photos, setPhotos] = useState(0);
  useEffect(() => {
    (async () => {
      const local = await db.checks.get(id);
      if (local) { setC(local); setPhotos(await db.photos.where('checkId').equals(id).filter((p) => !p.removedAt).count()); return; }
      const { data } = await supabase.from('checks').select('data, ref, sent_at').eq('id', id).maybeSingle();
      const n = await supabase.from('photos').select('id', { count: 'exact', head: true }).eq('check_id', id).is('removed_at', null);
      setPhotos(n.count || 0);
      setC(data ? { ...(data.data as Check), ref: data.ref, sentAt: data.sent_at, status: 'sent' } : null);
    })();
  }, [id]);
  if (c === undefined) return <div style={css(screen)} />;
  if (!c) return <div style={css(screen)}>{topbar('History', { onBack: () => nav('/history') })}{scroll(banner('err', 'That check isn’t here', 'It may not have reached the office yet.'))}</div>;
  const nd = c.pins.filter((p) => !p.removedAt && p.status === 'new').length;
  const tyres = Object.values(c.tyres).filter((t) => t.depth != null).length;
  async function add() {
    const r = await supabase.rpc('add_correction', { p_check: c!.id, p_text: text });
    if (r.error) setMsg(r.error.message); else { setOpen(false); setText(''); setMsg('Correction added. The office sees both.'); }
  }
  return (
    <div style={css(screen)}>
      {topbar(fleetTag(c) + ' · ' + dirWord(c.direction), { sub: 'Sent ' + (c.sentAt ? new Date(c.sentAt).toLocaleDateString('en-GB', { day: '2-digit', month: 'short' }) + ' ' + time(c.sentAt) : ''), close: true, onBack: () => nav('/history') })}
      {scroll(<>
        {banner('info', 'This inspection has been sent', 'It can’t be changed now. If something’s wrong, add a correction and the office will see both.')}
        {msg ? banner('ok', msg) : null}
        {stepRow('Photos', photos + ' photos', 'done', { r: ic('lock', 20, SU) })}
        {stepRow('Damage', nd ? nd + ' new' : 'No new damage', 'done', { r: ic('lock', 20, SU) })}
        {stepRow('Tyres', tyres + ' readings', 'done', { r: ic('lock', 20, SU) })}
        {c.ref ? <div style={css('font-family:' + MO + ';font-weight:800;font-size:16px;color:' + N5)}>REF {c.ref}</div> : null}
        {(c.corrections || []).map((x, i) => <div key={i} style={css('font-size:15px;line-height:1.45')}><b>{x.by}</b> {when(x.at)}: {x.text}</div>)}
      </>)}
      {footer(btn('Add a correction', 's', { ic: 'pen', onClick: () => setOpen(true), title: navigator.onLine ? undefined : 'Needs signal' }))}
      {open ? sheet(<>
        <div style={css('font-family:' + PT + ';font-weight:800;font-size:22px')}>Add a correction</div>
        <textarea aria-label="Correction" value={text} onChange={(e) => setText(e.target.value)} rows={4}
          style={css('padding:12px 16px;border-radius:8px;background:' + W + ';border:3px solid ' + N + ';font-size:18px;font-family:inherit;color:' + N + ';outline:none;width:100%')} />
        {btn('Add correction', 'p', { onClick: add, ...(text.trim() ? {} : { title: 'Write the correction first' }) })}
        {btn('Keep going', 's', { h: 56, onClick: () => setOpen(false) })}
      </>, { onClose: () => setOpen(false) }) : null}
    </div>
  );
}

export function notUsed() { return num(0); }
