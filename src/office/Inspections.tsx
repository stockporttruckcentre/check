/* Inspections: source/05 S_admin, the two-pane office view. The list on the left
   with chips and search; the record on the right, read with the source/03 S_nav
   tabs. The office reads, compares and exports, and never edits what was recorded
   in the yard (README, Undo and audit). */
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { useSearchParams } from 'react-router-dom';
import { css } from '../kit/css';
import { btn, chip, badge, fleet, photo, sheet, sg, dt, sb, banner } from '../kit/kit';
import { stage, type View } from '../kit/drawings';
import { N, N05, R, R7, W, A, MU, SU, BD, BL, PT, MO } from '../kit/tokens';
import { supabase, plainError } from '../lib/supabase';
import { useSession, NO_PERMS } from '../lib/session';
import { configFor, ensureVersion, useConfig } from '../lib/config';
import { fleetTag, stcLabel, dirWord, readingsFor, strapsApply, tyreKeys, drawingFor, reportName } from '../lib/check';
import { when, dayMon, time, num } from '../lib/format';
import type { Check, Config, PhotoMeta } from '../data/types';
import { buildPdf, downloadFile } from '../lib/output';
import { typeCell, photoRefs, oldNote, livePins } from '../lib/output/text';
import { useLookups, personName, siteName, liveSites } from './data';
import { search, useRemember, Dialog, inp, Field, note, body, acts, say, need, SelectSheet } from './ui';

export interface CheckRow {
  id: string; ref: string | null; person_id: string; site_id: string | null; direction: 'OUT' | 'IN'; stc_no: string; c_no: string | null;
  customer: string | null; collecting_reg: string | null; status: 'draft' | 'waiting' | 'sent' | 'reopened'; version: number; parent_id: string | null;
  new_damage: number; created_at: string; sent_at: string | null; received_at: string | null;
}
export interface PhotoDb {
  id: string; check_id: string; section: 'P' | 'D' | 'T' | 'R'; ref_id: string | null; shot: number; file_name: string; path: string;
  bytes: number | null; width: number | null; height: number | null; taken_at: string; lat: number | null; lng: number | null;
  from_gallery: boolean; uploaded_at: string; removed_at: string | null;
}
const LIST_COLS = 'id, ref, person_id, site_id, direction, stc_no, c_no, customer, collecting_reg, status, version, parent_id, new_damage, created_at, sent_at, received_at';

export const toMeta = (p: PhotoDb): PhotoMeta => ({
  id: p.id, checkId: p.check_id, section: p.section, refId: p.ref_id, shot: p.shot, fileName: p.file_name, bytes: p.bytes || 0,
  width: p.width || 0, height: p.height || 0, takenAt: p.taken_at, lat: p.lat, lng: p.lng, uploadedAt: p.uploaded_at, fromGallery: p.from_gallery, removedAt: p.removed_at,
});
export async function signed(paths: string[]): Promise<Record<string, string>> {
  const out: Record<string, string> = {};
  if (!paths.length) return out;
  const r = await supabase.storage.from('checks').createSignedUrls(paths, 3600);
  (r.data || []).forEach((x) => { if (x.path && x.signedUrl) out[x.path] = x.signedUrl; });
  return out;
}
export async function checkConfig(c: Check): Promise<Config> {
  try { if (c.configVersion) await ensureVersion(c.configVersion); } catch { /* falls back to the live version */ }
  return configFor(c.configVersion);
}
/** A button that cannot be used, in the pack's disabled style, saying why. */
const off = (t: string, title: string, i?: string) => <span title={title}>{btn(t, 'dis', { h: 44, ic: i, title })}</span>;
const stamp = (r: CheckRow) => r.sent_at || r.created_at;
const norm = (s: string | null | undefined) => (s || '').toLowerCase().replace(/[\s-]+/g, '');

function rowBadge(r: CheckRow) {
  if (r.status === 'sent') return r.new_damage > 0 ? badge('NEW DAMAGE', 'warn') : badge('SENT', 'ok');
  if (r.status === 'waiting') return badge('WAITING', 'pend');
  return badge('UNFINISHED', 'draft');
}

export default function Inspections({ listOnly }: { listOnly?: boolean }) {
  const { user } = useSession();
  const perms = user?.perms || NO_PERMS;
  const look = useLookups();
  const [params, setParams] = useSearchParams();
  const [rows, setRows] = useState<CheckRow[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [q, setQ] = useState('');
  const [site, setSite] = useRemember<string>('insp-site', '');
  const [onlyIn, setOnlyIn] = useRemember<boolean>('insp-in', false);
  const [newDmg, setNewDmg] = useRemember<boolean>('insp-new', false);
  const [sel, setSel] = useRemember<string | null>('insp-sel', null);
  const [pickSite, setPickSite] = useState(false);

  async function load() {
    const r = await supabase.from('checks').select(LIST_COLS).order('created_at', { ascending: false }).limit(2000);
    if (r.error) { setErr(plainError(r.error)); return; }
    setRows(((r.data || []) as CheckRow[]).sort((a, b) => stamp(b).localeCompare(stamp(a))));
  }
  useEffect(() => { load(); }, []);
  useEffect(() => {
    const ch = supabase.channel('office-checks').on('postgres_changes', { event: '*', schema: 'public', table: 'checks' }, () => { load(); }).subscribe();
    return () => { supabase.removeChannel(ch); };
  }, []);
  /* "See changes" in the activity log lands here with the trailer number. */
  useEffect(() => {
    const p = params.get('q');
    if (p != null) { setQ(p); setParams({}, { replace: true }); }
  }, [params, setParams]);

  const base = useMemo(() => (rows || []).filter((r) => {
    if (site && r.site_id !== site) return false;
    if (onlyIn && r.direction !== 'IN') return false;
    if (q.trim()) {
      const k = norm(q);
      if (![r.ref, r.stc_no, 'stc' + r.stc_no, r.c_no, r.customer, r.collecting_reg].some((x) => norm(x).includes(k))) return false;
    }
    return true;
  }), [rows, site, onlyIn, q]);
  const nNew = base.filter((r) => r.new_damage > 0).length;
  const list = newDmg ? base.filter((r) => r.new_damage > 0) : base;

  useEffect(() => {
    if (listOnly || !rows) return;
    if (q && list.length && !list.some((r) => r.id === sel)) setSel(list[0].id);
    else if ((!sel || !rows.some((r) => r.id === sel)) && list.length) setSel(list[0].id);
  }, [rows, q]); // eslint-disable-line

  const siteOpts: [string, string][] = [['', 'All sites'], ...liveSites(look).map((s): [string, string] => [s.id, s.name])];
  const listPane = (
    <div style={css('border-right:1px solid ' + BD + ';padding:18px;display:flex;flex-direction:column;gap:10px;background:' + W + (listOnly ? ';flex:1;border-right:0' : ''))}>
      <div style={css('display:flex;gap:8px;flex-wrap:wrap')}>
        {chip(site ? siteName(look, site) : 'All sites', true, { h: 40, onClick: () => setPickSite(true) })}
        {chip('Check in', onlyIn, { h: 40, onClick: () => setOnlyIn(!onlyIn) })}
        {chip('New damage', newDmg, { h: 40, n: nNew, onClick: () => setNewDmg(!newDmg) })}
      </div>
      {search(q, setQ, 'Trailer, customer or reg', 48)}
      {err ? banner('err', 'Couldn’t load the inspections', err) : null}
      {!perms.do_checks && user ? banner('info', 'Inspections need a role that does checks', need('do_checks')) : null}
      {list.map((r) => {
        const on = !listOnly && r.id === sel;
        const inner = (
          <>
            {fleet(fleetTag({ cNo: r.c_no, stcNo: r.stc_no }), 'height:32px;font-size:16px')}
            <div style={css('flex:1 1 130px;min-width:0;text-align:left')}>
              <div style={css('font-weight:700;font-size:15px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis')} title={r.customer || undefined}>{r.customer || stcLabel(r.stc_no)}</div>
              <div style={css('font-size:13px;color:' + MU)}>{dirWord(r.direction)} &middot; {when(stamp(r))}</div>
            </div>
            {rowBadge(r)}
          </>
        );
        const st = css('display:flex;flex-wrap:wrap;align-items:center;gap:12px;padding:12px;border-radius:8px;border:' + (on ? 2 : 1) + 'px solid ' + (on ? N : BL) + ';background:' + (on ? N05 : W) + ';color:' + N);
        return listOnly
          ? <div key={r.id} style={st}>{inner}</div>
          : <button key={r.id} type="button" className="k-tap k-reset" onClick={() => setSel(r.id)} aria-pressed={on} style={{ ...st, width: '100%' }}>{inner}</button>;
      })}
      {pickSite ? <SelectSheet title="Site" options={siteOpts} value={site} onPick={(v) => { setSite(v); setPickSite(false); }} onClose={() => setPickSite(false)} /> : null}
    </div>
  );
  if (listOnly) return listPane;
  const cur = (rows || []).find((r) => r.id === sel) || null;
  return (
    <div style={css('display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1.5fr);min-height:560px')}>
      {listPane}
      {cur ? <Record key={cur.id} row={cur} onChanged={load} onOpen={(id) => { setSel(id); }} /> : <div />}
    </div>
  );
}

/* ---------------- The record ---------------- */
type Tab = 'details' | 'photos' | 'damage' | 'history';
interface Prev { row: CheckRow; check: Check; photos: PhotoDb[] }

function Record({ row, onChanged, onOpen }: { row: CheckRow; onChanged: () => void; onOpen: (id: string) => void }) {
  const { user } = useSession();
  const perms = user?.perms || NO_PERMS;
  const look = useLookups();
  useConfig();
  const [check, setCheck] = useState<Check | null>(null);
  const [cfg, setCfg] = useState<Config | null>(null);
  const [photos, setPhotos] = useState<PhotoDb[]>([]);
  const [urls, setUrls] = useState<Record<string, string>>({});
  const [corr, setCorr] = useState<{ id: string; person_id: string; text: string; at: string }[]>([]);
  const [events, setEvents] = useState<{ id: number; at: string; person_name: string; action: string; target: string | null; detail: string | null }[]>([]);
  const [tab, setTab] = useRemember<Tab>('insp-tab', 'details');
  const [prev, setPrev] = useState<Prev | null | undefined>(undefined);
  const [comparing, setComparing] = useState(false);
  const [dlg, setDlg] = useState<null | 'reopen' | 'correct' | 'delete'>(null);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [pdfBusy, setPdfBusy] = useState(false);

  async function load() {
    const [c, p, k] = await Promise.all([
      supabase.from('checks').select('data').eq('id', row.id).maybeSingle(),
      supabase.from('photos').select('*').eq('check_id', row.id).is('removed_at', null).order('file_name'),
      supabase.from('corrections').select('id, person_id, text, at').eq('check_id', row.id).order('at'),
    ]);
    if (c.error || !c.data) { say('err', plainError(c.error || { message: 'That check couldn’t be opened.' })); return; }
    const data = { ...(c.data.data as Check), status: row.status, ref: row.ref, version: row.version };
    data.pins = data.pins || []; data.oldPins = data.oldPins || []; data.readings = data.readings || {}; data.readingNotes = data.readingNotes || {}; data.tyres = data.tyres || {};
    setCheck(data);
    setCfg(await checkConfig(data));
    const ph = (p.data || []) as PhotoDb[];
    setPhotos(ph);
    setCorr(k.data || []);
    setUrls(await signed(ph.map((x) => x.path)));
    const targets = [row.c_no, row.stc_no, stcLabel(row.stc_no)].filter(Boolean) as string[];
    const ev = await supabase.from('audit_events').select('id, at, person_name, action, target, detail').in('target', targets).gte('at', row.created_at).order('at');
    setEvents(ev.data || []);
    /* The last check the other way for the same trailer, for Compare. */
    const other = row.direction === 'OUT' ? 'IN' : 'OUT';
    const pr = await supabase.from('checks').select(LIST_COLS + ', data').eq('stc_no', row.stc_no).eq('status', 'sent').eq('direction', other)
      .lt('sent_at', row.sent_at || new Date().toISOString()).order('sent_at', { ascending: false }).limit(1);
    const pv = (pr.data || [])[0] as unknown as (CheckRow & { data: Check }) | undefined;
    if (!pv) { setPrev(null); return; }
    const pp = await supabase.from('photos').select('*').eq('check_id', pv.id).is('removed_at', null).order('file_name');
    const pph = (pp.data || []) as PhotoDb[];
    const pu = await signed(pph.map((x) => x.path));
    setUrls((u) => ({ ...u, ...pu }));
    setPrev({ row: pv, check: pv.data, photos: pph });
  }
  useEffect(() => { load(); }, [row.id, row.status]); // eslint-disable-line

  const mine = row.person_id === user?.personId;
  const sent = row.status === 'sent';
  const other = row.direction === 'OUT' ? 'in' : 'out';

  async function pdf() {
    if (!check || !cfg) return;
    setPdfBusy(true);
    try { const b = await buildPdf(check, cfg, { photos: photos.map(toMeta), recordVersion: check.version }); downloadFile(b, reportName(check)); }
    catch (e) { say('err', plainError(e)); }
    setPdfBusy(false);
  }
  async function run() {
    setBusy(true);
    try {
      if (dlg === 'reopen') {
        const r = await supabase.rpc('reopen_check', { p_check: row.id, p_reason: text });
        if (r.error) throw r.error;
        say('ok', 'Reopened as version ' + (row.version + 1) + '. It carries on in the app.');
        onChanged(); onOpen(r.data as string);
      } else if (dlg === 'correct') {
        const r = await supabase.rpc('add_correction', { p_check: row.id, p_text: text });
        if (r.error) throw r.error;
        say('ok', 'Correction added');
        load();
      } else if (dlg === 'delete') {
        const r = await supabase.rpc('delete_unfinished', { p_check: row.id, p_reason: text });
        if (r.error) throw r.error;
        say('ok', 'Moved to the recycle bin');
        onChanged();
      }
      setDlg(null); setText('');
    } catch (e) { say('err', plainError(e)); }
    setBusy(false);
  }

  if (!check || !cfg) return <div style={css('padding:22px')} />;
  const P = photos.filter((p) => p.section === 'P');
  const shotLabel = (p: PhotoDb) => cfg.shots.find((s) => s.id === p.ref_id)?.label || p.file_name;
  const order = (p: PhotoDb) => { const i = cfg.shots.findIndex((s) => s.id === p.ref_id); return i < 0 ? 99 : i; };
  P.sort((a, b) => order(a) - order(b));
  const open = (p: PhotoDb) => () => { const u = urls[p.path]; if (u) window.open(u, '_blank', 'noopener'); };
  const nDmg = livePins(check).length + check.oldPins.length;
  const who = check.userName || personName(look, row.person_id);
  const where = check.siteName || siteName(look, row.site_id);
  const stampAt = row.sent_at || row.created_at;

  /* ---- Details ---- */
  const drawing = drawingFor(check.trailerType, cfg);
  const frac = (v: number) => (v > 1 ? v : v * 100);
  const views: View[] = ['ns', 'os', 'rear', 'front'];
  if (livePins(check).some((p) => p.view === 'roof') || check.oldPins.some((p) => p.view === 'roof')) views.push('roof');
  const mini = (v: View) => (
    <div key={v} style={css('flex:1;min-width:0')}>
      <div style={css('font-family:' + MO + ';font-size:9px;color:' + SU + ';margin-bottom:2px')}>{v.toUpperCase()}</div>
      {stage(v, [
        ...livePins(check).filter((p) => p.view === v).map((p) => ({ n: p.number, x: frac(p.x), y: frac(p.y) })),
        ...check.oldPins.filter((o) => o.view === v && o.verdict !== 'repaired').map((o) => ({ n: o.letter, x: frac(o.x), y: frac(o.y), k: 'old' as const })),
      ], { drawing })}
    </div>
  );
  const rs = readingsFor(check, cfg);
  const lowerNote = (id: string) => (check.readingNotes[id] ? <> <span style={css('color:' + A)}>(lower than last, noted)</span></> : null);
  const keys = tyreKeys(check);
  const side = (s: string) => keys.filter((k) => k.startsWith(s)).map((k) => check.tyres[k]?.depth).map((d) => (d == null ? '' : String(d))).join(' · ');
  const lines: ReactNode[] = [];
  rs.forEach((r) => { const v = check.readings[r.id]; if (v != null) lines.push(<span key={r.id}>{r.name} <b style={css('font-family:' + MO)}>{num(v)}</b>{lowerNote(r.id)}<br /></span>); });
  if (keys.length && keys.some((k) => check.tyres[k]?.depth != null)) lines.push(<span key="ty">Tyres <b>{side('ns')} / {side('os')} mm</b><br /></span>);
  const sc: ReactNode[] = [];
  if (strapsApply(check, cfg) && check.straps != null) sc.push(<span key="st">Straps <b>{check.straps}</b></span>);
  if (check.cleanliness) sc.push(<span key="cl">Cleanliness <b>{check.cleanliness}</b></span>);
  if (sc.length) lines.push(<span key="sc">{sc.map((x, i) => <span key={i}>{i ? <> &middot; </> : null}{x}</span>)}<br /></span>);
  if (check.seal) lines.push(<span key="se">Seal <b style={css('font-family:' + MO)}>{check.seal}</b></span>);
  const f = check.flags || {};
  const flagLines = [
    f.notOnSheet ? 'Not on the stock sheet' : '', f.noStcNumber ? 'No STC number on the stock sheet' : '',
    f.repeat ? (check.direction === 'OUT' ? 'Checked out' : 'Checked in') + ' last time too (' + f.repeat + ')' : '',
    f.notYourTrailer ? 'Sales rep on the sheet: ' + f.notYourTrailer : '', f.unexpected ? 'Not on a sales order, sold or on hire' : '',
    f.wrongSite ? 'Stock sheet says ' + f.wrongSite : '', f.motExpired ? 'MOT run out (' + f.motExpired + ')' : '',
  ].filter(Boolean);
  const card = (t: string, inner: ReactNode, big?: boolean) => (
    <div style={css('background:' + W + ';border:1px solid ' + BL + ';border-radius:8px;padding:16px' + (big ? ';font-size:14px;line-height:1.7' : ''))}>
      <div style={css(big ? 'font-weight:800;font-size:16px;margin-bottom:6px' : 'font-weight:800;margin-bottom:10px')}>{t}</div>{inner}
    </div>
  );
  const details = (
    <>
      <div style={css('display:grid;grid-template-columns:repeat(6,1fr);gap:8px')}>
        {P.map((p) => <div key={p.id}>{photo(shotLabel(p), { ar: '4/3', src: urls[p.path], onClick: open(p), label: 'Open ' + shotLabel(p) })}</div>)}
      </div>
      <div style={css('display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:16px')}>
        {card('Damage', <div style={css('padding:10px 0 0;display:grid;grid-template-columns:1fr 1fr;gap:10px')}>{views.map(mini)}</div>)}
        {card('Readings', <>{lines}</>, true)}
      </div>
      {flagLines.length ? card('Flagged on the phone', <>{flagLines.map((x) => <span key={x}>{x}<br /></span>)}</>, true) : null}
      {corr.length ? card('Corrections', <>{corr.map((x) => <span key={x.id}>{dayMon(x.at)} {time(x.at)} &middot; {personName(look, x.person_id)}: <b>{x.text}</b><br /></span>)}</>, true) : null}
    </>
  );

  /* ---- Photos ---- */
  const all = [...photos].sort((a, b) => a.file_name.localeCompare(b.file_name));
  const photosTab = (
    <div style={css('display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:8px')}>
      {all.map((p) => <div key={p.id}>{photo(p.file_name, { ar: '4/3', src: urls[p.path], onClick: open(p), label: 'Open ' + p.file_name })}</div>)}
    </div>
  );

  /* ---- Damage: the PDF's damage table (source/08 S_output) ---- */
  const metas = photos.map(toMeta);
  const damageTab = dt(['No', 'Where', 'Type', 'Note', 'Photos in zip'], [
    ...livePins(check).map((p) => ({ key: p.id, cells: [<b style={css('font-weight:800;color:' + R)}>{p.number}</b>, p.zone, typeCell(p.type, cfg), p.note, <span style={css('font-family:' + MO)}>{photoRefs(p, metas)}</span>] })),
    ...check.oldPins.map((o) => ({ key: o.id, cells: [<b style={css('font-weight:800;color:#8A8F99')}>{o.letter}</b>, o.zone, typeCell(o.type, cfg), oldNote(o), ''] })),
  ], '0.8fr 0.8fr 0.8fr 1.8fr 0.8fr');

  /* ---- History: the record's timeline (source/05 S_admin, Audit history) ---- */
  type H = { key: string; at: string; who: string; what: string; on: string; detail: string };
  const hist: H[] = [{ key: 'c', at: check.createdAt || row.created_at, who, what: 'Created', on: fleetTag(check), detail: dirWord(row.direction) }];
  photos.forEach((p) => hist.push({ key: 'p' + p.id, at: p.taken_at, who, what: 'Photo', on: p.file_name, detail: (p.lat != null && p.lng != null ? p.lat.toFixed(5) + ', ' + p.lng.toFixed(5) : '') + (p.from_gallery ? (p.lat != null ? ' · ' : '') + 'From the gallery' : '') }));
  if (check.signedAt) hist.push({ key: 's', at: check.signedAt, who, what: 'Signed', on: fleetTag(check), detail: '' });
  if (row.sent_at) hist.push({ key: 'se', at: row.sent_at, who, what: 'Sent', on: row.ref || fleetTag(check), detail: '' });
  if (row.received_at) hist.push({ key: 'r', at: row.received_at, who: 'System', what: 'Received', on: row.ref || fleetTag(check), detail: '' });
  events.filter((e) => !/^Sent check/.test(e.action)).forEach((e) => hist.push({ key: 'e' + e.id, at: e.at, who: e.person_name, what: e.action, on: e.target || '', detail: e.detail || '' }));
  hist.sort((a, b) => a.at.localeCompare(b.at));
  const historyTab = dt(['When', 'Who', 'What', 'On', 'Detail', ''], hist.map((h) => ({ key: h.key, cells: [dayMon(h.at) + ' ' + time(h.at), h.who, h.what, <span style={css('word-break:break-all')}>{h.on}</span>, h.detail, ''] })), '0.9fr 0.9fr 1fr 0.9fr 1.6fr 0.8fr');

  /* ---- Compare with the last check the other way ---- */
  const compare = prev ? (() => {
    const lbl = (r: CheckRow) => (dirWord(r.direction) + ' ' + dayMon(r.sent_at || r.created_at)).toUpperCase();
    const refs = new Set<string>();
    const pairs: { key: string; label: string; a?: PhotoDb; b?: PhotoDb }[] = [];
    [...prev.photos, ...photos].filter((p) => p.section === 'P' || p.section === 'T').forEach((p) => {
      const k = p.section + ':' + p.ref_id + ':' + p.shot;
      if (refs.has(k)) return;
      refs.add(k);
      const a = prev.photos.find((x) => x.section === p.section && x.ref_id === p.ref_id && x.shot === p.shot);
      const b = photos.find((x) => x.section === p.section && x.ref_id === p.ref_id && x.shot === p.shot);
      pairs.push({ key: k, label: p.section === 'P' ? shotLabel(p) : (p.ref_id || '').replace(/^tyre_/, '').replace('_', ' ').toUpperCase(), a, b });
    });
    return (
      <>
        {pairs.map((x) => (
          <div key={x.key} style={css('display:grid;grid-template-columns:1fr 1fr;gap:8px')}>
            <div><div style={css('font-size:13px;font-weight:700;color:' + MU + ';margin-bottom:4px')}>{lbl(prev.row)}</div>{photo(x.label, { ar: '4/3', src: x.a ? urls[x.a.path] : undefined, onClick: x.a ? open(x.a) : undefined })}</div>
            <div><div style={css('font-size:13px;font-weight:700;color:' + R7 + ';margin-bottom:4px')}>{lbl(row)}</div>{photo(x.label, { ar: '4/3', src: x.b ? urls[x.b.path] : undefined, onClick: x.b ? open(x.b) : undefined })}</div>
          </div>
        ))}
      </>
    );
  })() : null;

  const tabs: [Tab, string][] = [['details', 'Details'], ['photos', 'Photos (' + photos.length + ')'], ['damage', 'Damage (' + nDmg + ')'], ['history', 'History']];
  const canCorrect = mine || perms.reopen;
  const canDelete = mine || perms.see_unfinished;
  return (
    <div style={css('padding:22px;display:flex;flex-direction:column;gap:16px;min-width:0')}>
      <div style={css('display:flex;justify-content:space-between;align-items:center;gap:12px;flex-wrap:wrap')}>
        <div style={css('display:flex;align-items:center;gap:12px')}>
          {fleet(fleetTag(check))}
          <div>
            <div style={css('font-family:' + PT + ';font-weight:800;font-size:22px')}>{dirWord(row.direction)} &middot; {row.customer || check.customer || 'No customer'}</div>
            <div style={css('font-size:14px;color:' + MU)}>{who} &middot; {where} &middot; {dayMon(stampAt)} {time(stampAt)}{row.ref ? <> &middot; Ref {row.ref}</> : null}</div>
          </div>
        </div>
        <div style={css('display:flex;gap:8px;flex-wrap:wrap')}>
          {btn('Download PDF', 's', { h: 44, ic: 'down', onClick: pdf, loading: pdfBusy })}
          {prev
            ? btn('Compare with last check ' + other, 'p', { h: 44, onClick: () => setComparing(!comparing) })
            : off('Compare with last check ' + other, prev === undefined ? 'Looking for the last check ' + other : 'No earlier check ' + other + ' of ' + fleetTag(check) + ' on record')}
          {sent ? (perms.reopen ? btn('Reopen', 's', { h: 44, ic: 'undo', onClick: () => { setText(''); setDlg('reopen'); } }) : off('Reopen', need('reopen'), 'undo')) : null}
          {sent ? (canCorrect ? btn('Add a correction', 's', { h: 44, ic: 'pen', onClick: () => { setText(''); setDlg('correct'); } }) : off('Add a correction', 'Only the person who did the check, or a role that can reopen checks, can add a correction', 'pen')) : null}
          {!sent ? (canDelete ? btn('Delete', 'dg', { h: 44, ic: 'trash', onClick: () => { setText(''); setDlg('delete'); } }) : off('Delete', need('see_unfinished'), 'trash')) : null}
        </div>
      </div>
      <div role="tablist" style={css('display:flex;border-bottom:1px solid ' + BD + ';max-width:520px')}>
        {tabs.map(([k, t]) => {
          const on = !comparing && tab === k;
          return (
            <button key={k} type="button" role="tab" aria-selected={on} className="k-tap k-reset" onClick={() => { setComparing(false); setTab(k); }}
              style={css('flex:1;min-height:56px;display:flex;align-items:center;justify-content:center;font-weight:' + (on ? 800 : 600) + ';font-size:16px;color:' + (on ? N : SU) + ';border:0;background:transparent;border-bottom:' + (on ? '4px solid ' + R : '4px solid transparent'))}>{t}</button>
          );
        })}
      </div>
      {comparing ? compare : tab === 'details' ? details : tab === 'photos' ? photosTab : tab === 'damage' ? damageTab : historyTab}

      {dlg === 'reopen' ? (
        <Dialog title="Reopen this check?" onClose={() => setDlg(null)}>
          {body(<>A new version is made for you to correct in the app. The original stays on record.</>)}
          {inp('Reason', <Field value={text} onChange={setText} ph="Reg typed wrong" autoFocus />, { req: true })}
          {note('The reopen is logged with the reason.')}
          {acts(<>{sb('Cancel', 's', { onClick: () => setDlg(null) })}{sb('Reopen', 'p', { ic: 'undo', onClick: run, disabled: busy || !text.trim(), title: !text.trim() ? 'Write a reason first' : undefined })}</>)}
        </Dialog>
      ) : null}
      {dlg === 'correct' ? (
        <Dialog title="Add a correction" onClose={() => setDlg(null)}>
          {body(<>Sent checks are never edited. The correction is added to the record and shown with it.</>)}
          {inp('Correction', <Field value={text} onChange={setText} ph="Collecting reg is MX19 KLA" autoFocus />, { req: true })}
          {acts(<>{sb('Cancel', 's', { onClick: () => setDlg(null) })}{sb('Add correction', 'p', { ic: 'plus', onClick: run, disabled: busy || !text.trim(), title: !text.trim() ? 'Write the correction first' : undefined })}</>)}
        </Dialog>
      ) : null}
      {dlg === 'delete' ? sheet(
        <>
          <div style={css('display:flex;justify-content:center')}>{sg('miss', 48)}</div>
          <div style={css('font-family:' + PT + ';font-weight:800;font-size:22px;text-align:center')}>Delete this inspection?</div>
          <div style={css('font-size:17px;line-height:1.45;text-align:center')}>{fleetTag(check)}, {dirWord(row.direction).toLowerCase()}, with {photos.length} photos and {livePins(check).length} damage marks. It goes to the recycle bin for 30 days.</div>
          {inp('Reason', <Field value={text} onChange={setText} ph="Started by mistake" autoFocus />, { req: true })}
          {btn('Delete inspection', busy || !text.trim() ? 'dis' : 'd', { ic: 'trash', onClick: run, title: !text.trim() ? 'Write a reason first' : undefined })}
          {btn('Keep it', 's', { h: 56, onClick: () => setDlg(null) })}
        </>, { center: true, onClose: () => setDlg(null), label: 'Delete this inspection?' })
        : null}
    </div>
  );
}
