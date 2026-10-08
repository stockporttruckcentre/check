/* System (Owner): source/07 S_system. Four health tiles from real data and the tools table. */
import { useEffect, useState, type ReactNode } from 'react';
import JSZip from 'jszip';
import { css } from '../kit/css';
import { dt, sb, pill, lab, banner } from '../kit/kit';
import { W, MU, SU, BL, PT, MO } from '../kit/tokens';
import { supabase, plainError } from '../lib/supabase';
import { useSession, NO_PERMS } from '../lib/session';
import { num, time, isoDate } from '../lib/format';
import { zipName, reportName } from '../lib/check';
import type { Check, PhotoMeta } from '../data/types';
import { buildPdf, buildZip, downloadFile } from '../lib/output';
import { dh, Dialog, inp, Field, note, acts, say, need } from './ui';
import { Gate } from './Builder';
import { toMeta, checkConfig, type PhotoDb } from './Inspections';

interface Sync { source: 'stock' | 'fleet'; updated_at: string; updated_by: string | null; rows: number; detail: { skipped?: number } }
interface Col { source: 'stock' | 'fleet'; tab: string; field: string; header: string }
interface Photo { targetKB: number; longEdge: number; hardKB: number }
const KB = 1024;

function readWhen(at: string) {
  const d = new Date(at), now = new Date();
  const y = new Date(now); y.setDate(now.getDate() - 1);
  if (isoDate(d) === isoDate(now)) return 'Read ' + time(d) + ' today';
  if (isoDate(d) === isoDate(y)) return 'Read ' + time(d) + ' yesterday';
  return 'Read ' + d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short' }) + ' ' + time(d);
}
function size(bytes: number) {
  if (bytes >= KB ** 3) return (bytes / KB ** 3).toFixed(1) + ' GB';
  if (bytes >= KB ** 2) return (bytes / KB ** 2).toFixed(1) + ' MB';
  return Math.round(bytes / KB) + 'KB';
}

export default function System() {
  const { user } = useSession();
  const perms = user?.perms || NO_PERMS;
  const can = perms.system;
  const [waiting, setWaiting] = useState<{ old: number; all: number; people: number } | null>(null);
  const [sync, setSync] = useState<Sync[]>([]);
  const [store, setStore] = useState<{ n: number; bytes: number } | null>(null);
  const [today, setToday] = useState<number | null>(null);
  const [photoSet, setPhotoSet] = useState<Photo>({ targetKB: 100, longEdge: 1600, hardKB: 150 });
  const [years, setYears] = useState(6);
  const [cols, setCols] = useState<Col[] | null>(null);
  const [dlg, setDlg] = useState<null | 'photo' | 'years' | { col: Col }>(null);
  const [progress, setProgress] = useState<string | null>(null);

  async function load() {
    const tenAgo = new Date(Date.now() - 10 * 60000).toISOString();
    const midnight = new Date(); midnight.setHours(0, 0, 0, 0);
    const [w, s, st, t] = await Promise.all([
      supabase.from('checks').select('id, person_id, updated_at').eq('status', 'waiting'),
      supabase.from('sheet_sync').select('*'),
      supabase.from('settings').select('key, value'),
      supabase.from('checks').select('id', { count: 'exact', head: true }).eq('status', 'sent').gte('sent_at', midnight.toISOString()),
    ]);
    const wr = (w.data || []) as { id: string; person_id: string; updated_at: string }[];
    setWaiting({ old: wr.filter((x) => x.updated_at < tenAgo).length, all: wr.length, people: new Set(wr.map((x) => x.person_id)).size });
    setSync((s.data || []) as Sync[]);
    for (const r of st.data || []) {
      if (r.key === 'photo') setPhotoSet((p) => ({ ...p, ...(r.value as Photo) }));
      if (r.key === 'records') setYears((r.value as { years: number }).years);
    }
    setToday(t.count ?? 0);
    /* Photo sizes, a page at a time. */
    let n = 0, bytes = 0, from = 0;
    for (;;) {
      const p = await supabase.from('photos').select('bytes').is('removed_at', null).range(from, from + 999);
      const rows = (p.data || []) as { bytes: number | null }[];
      rows.forEach((r) => { n++; bytes += r.bytes || 0; });
      if (rows.length < 1000) break;
      from += 1000;
    }
    setStore({ n, bytes });
    if (can) {
      const c = await supabase.from('sheet_columns').select('*').order('source').order('tab').order('field');
      setCols((c.data || []) as Col[]);
    }
  }
  useEffect(() => { load(); }, [can]); // eslint-disable-line

  const stock = sync.find((x) => x.source === 'stock');
  const fleet = sync.find((x) => x.source === 'fleet');
  const tile = (t: string, main: ReactNode, k: 'ok' | 'warn', p: string, sub: ReactNode) => (
    <div style={css('border-radius:10px;background:' + W + ';border:1px solid ' + BL + ';padding:18px')}>
      <div style={css('display:flex;justify-content:space-between;align-items:center')}><span style={css('font-family:' + MO + ';font-size:12px;letter-spacing:0.04em;color:' + SU + ';text-transform:uppercase')}>{t}</span>{pill(p, k)}</div>
      <div style={css('font-family:' + PT + ';font-weight:800;font-size:20px;margin-top:10px')}>{main}</div>
      <div style={css('font-size:13px;color:' + MU + ';margin-top:4px')}>{sub}</div>
    </div>
  );
  const sheetLine = (x: Sync | undefined, name: string) => (x ? num(x.rows) + ' trailers' + (x.detail?.skipped ? ' · ' + num(x.detail.skipped) + ' not read' : '') + (x.updated_by ? ' · saved by ' + x.updated_by : '') : name + ' not read yet');
  const tiles = (
    <div style={css('display:grid;grid-template-columns:repeat(4,1fr);gap:14px;margin-bottom:22px')}>
      {tile('Sync', !waiting ? '' : waiting.old ? waiting.old + (waiting.old === 1 ? ' check queued' : ' checks queued') : 'All phones up to date', waiting && waiting.old ? 'warn' : 'ok', waiting && waiting.old ? 'WAITING' : 'OK',
        !waiting ? '' : waiting.all ? waiting.all + (waiting.all === 1 ? ' check' : ' checks') + ' waiting to send from ' + waiting.people + (waiting.people === 1 ? ' person' : ' people') : 'Nothing waiting to send')}
      {tile('Stock sheet link', stock ? readWhen(stock.updated_at) : 'Not read yet', stock ? 'ok' : 'warn', stock ? 'OK' : 'WAITING',
        <>{sheetLine(stock, 'Stock sheet')}<br />Fleet Serve: {fleet ? readWhen(fleet.updated_at).replace(/^Read/, 'read') + ' · ' + sheetLine(fleet, 'Fleet Serve') : 'not read yet'}</>)}
      {tile('Storage', store ? num(store.n) + ' photos' : '', 'ok', 'OK', store ? 'Photos ' + size(store.bytes) + ' · avg ' + (store.n ? size(store.bytes / store.n) : '0KB') : '')}
      {tile('Email', 'Sent from each phone', 'ok', 'OK', today == null ? '' : today + (today === 1 ? ' check sent today' : ' checks sent today'))}
    </div>
  );

  async function exportAll() {
    setProgress('Starting');
    try {
      const all = await supabase.from('checks').select('id, data, version, status, ref').eq('status', 'sent').order('sent_at');
      if (all.error) throw all.error;
      const list = (all.data || []) as { id: string; data: Check; version: number; ref: string | null }[];
      const zip = new JSZip();
      for (let i = 0; i < list.length; i++) {
        setProgress((i + 1) + ' of ' + list.length);
        const row = list[i];
        const check: Check = { ...row.data, status: 'sent', version: row.version, ref: row.ref };
        const cfg = await checkConfig(check);
        const ph = ((await supabase.from('photos').select('*').eq('check_id', row.id).is('removed_at', null)).data || []) as PhotoDb[];
        const metas = ph.map(toMeta);
        const paths = new Map(ph.map((p) => [p.id, p.path]));
        const getBlob = async (m: PhotoMeta) => {
          const d = await supabase.storage.from('checks').download(paths.get(m.id) || '');
          if (d.error || !d.data) throw d.error || new Error('A photo couldn’t be read');
          return d.data;
        };
        const pdf = await buildPdf(check, cfg, { photos: metas, recordVersion: check.version });
        const z = await buildZip(check, cfg, metas, getBlob, pdf);
        zip.file(zipName(check) || reportName(check), z);
      }
      setProgress('Activity log');
      const log = await supabase.from('audit_events').select('at, person_name, action, kind, target, detail').order('at');
      const q = (v: unknown) => { const s = v == null ? '' : String(v); return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; };
      zip.file('Activity-log.csv', '﻿' + [['When', 'Who', 'What', 'Kind', 'On', 'Detail'], ...(log.data || []).map((r) => [r.at, r.person_name, r.action, r.kind, r.target, r.detail])].map((r) => r.map(q).join(',')).join('\r\n'));
      setProgress('Making the zip');
      const blob = await zip.generateAsync({ type: 'blob' });
      downloadFile(blob, 'STC-Checks-export-' + isoDate(new Date()) + '.zip');
      say('ok', 'Exported ' + list.length + (list.length === 1 ? ' check' : ' checks'));
    } catch (e) { say('err', plainError(e)); }
    setProgress(null);
  }

  const tools = dt(['Tool', 'What it does', ''], [
    { key: 'va', cells: ['View as', 'See the app exactly as a chosen person sees it, read only. Logged.', sb('Choose person', 's', { h: 34, ic: 'eye', disabled: true, title: 'Needs a server sign-in for another person. Not built yet.' })] },
    { key: 'rs', cells: ['Read stock sheet now', 'Fetch the stock sheet now instead of waiting for 06:00.', sb('Run', 's', { h: 34, ic: 'sync', disabled: true, title: 'The sheet sends itself every time somebody saves it in Excel.' })] },
    { key: 'ex', cells: ['Export everything', 'All checks, photos and logs as a zip, for audits or moving systems.', sb(progress ? 'Exporting ' + progress : 'Export', 's', { h: 34, ic: 'down', onClick: exportAll, disabled: !!progress, title: progress ? 'Exporting ' + progress : undefined })] },
    { key: 'ps', cells: ['Photo size', 'Target ' + photoSet.targetKB + 'KB JPEG, ' + photoSet.longEdge + 'px long edge, never over ' + photoSet.hardKB + 'KB.', sb('Change', 's', { h: 34, ic: 'pen', onClick: () => setDlg('photo') })] },
    { key: 'kr', cells: ['Keep records for', 'How long sent checks and photos are kept. Currently ' + years + (years === 1 ? ' year.' : ' years.'), sb('Change', 's', { h: 34, ic: 'pen', onClick: () => setDlg('years') })] },
    { key: 'sc', cells: ['Stock sheet columns', 'Match each stock sheet column to an app field. Add a new column without code.', sb('Open', 's', { h: 34, onClick: () => document.getElementById('sheet-columns')?.scrollIntoView({ behavior: 'smooth' }) })] },
    { key: 'bk', cells: ['Backups', 'Nightly copy, last at 02:00. Restore a whole day if needed.', sb('See backups', 's', { h: 34, disabled: true, title: 'Supabase keeps daily backups. Restoring a day is done in the Supabase dashboard.' })] },
  ], '0.9fr 2fr 0.8fr');

  const groups = new Map<string, Col[]>();
  (cols || []).forEach((c) => { const k = (c.source === 'stock' ? 'Stock sheet' : 'Fleet Serve') + (c.tab !== '*' ? ' · ' + c.tab : ''); groups.set(k, [...(groups.get(k) || []), c]); });

  return (
    <>
      {dh('System', 'Owner only')}
      {!can ? <div style={css('margin-bottom:14px')}>{banner('info', 'System settings are for the Owner', need('system'))}</div> : null}
      {tiles}
      <Gate ok={can} why={need('system')}>
        {tools}
        <div id="sheet-columns" style={css('margin-top:24px;display:flex;flex-direction:column;gap:20px')}>
          {[...groups.entries()].map(([g, list]) => (
            <div key={g}>
              {lab(g)}
              {dt(['App field', 'Column header in the sheet', ''], list.map((c) => ({ key: c.source + c.tab + c.field, cells: [<span style={css('font-family:' + MO)}>{c.field}</span>, c.header, sb('Edit', 's', { h: 32, ic: 'pen', onClick: () => setDlg({ col: c }) })] })), '1fr 1.6fr 100px')}
            </div>
          ))}
        </div>
      </Gate>
      {dlg === 'photo' ? <PhotoDialog cur={photoSet} onClose={() => setDlg(null)} onSaved={load} /> : null}
      {dlg === 'years' ? <YearsDialog cur={years} onClose={() => setDlg(null)} onSaved={load} /> : null}
      {dlg && typeof dlg === 'object' ? <ColDialog col={dlg.col} onClose={() => setDlg(null)} onSaved={load} /> : null}
    </>
  );
}

async function saveSetting(key: string, value: unknown) {
  const r = await supabase.from('settings').update({ value }).eq('key', key).select('key');
  if (r.error) throw r.error;
  if (!r.data?.length) throw new Error('Only the Owner can change system settings');
}
function PhotoDialog({ cur, onClose, onSaved }: { cur: Photo; onClose: () => void; onSaved: () => void }) {
  const [t, setT] = useState(String(cur.targetKB));
  const [l, setL] = useState(String(cur.longEdge));
  const [h, setH] = useState(String(cur.hardKB));
  const n = (v: string) => Number(v);
  const bad = [t, l, h].some((v) => !v.trim() || !Number.isFinite(n(v)) || n(v) <= 0) ? 'Type a number in each box' : n(t) > n(h) ? 'The target can’t be over the hard limit' : null;
  async function save() {
    try { await saveSetting('photo', { targetKB: n(t), longEdge: n(l), hardKB: n(h) }); say('ok', 'Photo size saved'); onSaved(); onClose(); }
    catch (e) { say('err', plainError(e)); }
  }
  return (
    <Dialog title="Photo size" onClose={onClose}>
      <div style={css('display:grid;grid-template-columns:1fr 1fr 1fr;gap:10px')}>
        {inp('Target, KB', <Field value={t} onChange={setT} type="number" autoFocus />, { req: true })}
        {inp('Long edge, px', <Field value={l} onChange={setL} type="number" />, { req: true })}
        {inp('Hard limit, KB', <Field value={h} onChange={setH} type="number" />, { req: true })}
      </div>
      {note('Only affects new photos. Photos already taken keep their size.')}
      {acts(<>{sb('Cancel', 's', { onClick: onClose })}{sb('Save', 'p', { onClick: save, disabled: !!bad, title: bad || undefined })}</>)}
    </Dialog>
  );
}
function YearsDialog({ cur, onClose, onSaved }: { cur: number; onClose: () => void; onSaved: () => void }) {
  const [y, setY] = useState(String(cur));
  const bad = !y.trim() || !Number.isInteger(Number(y)) || Number(y) < 1 ? 'Type a whole number of years' : null;
  async function save() {
    try { await saveSetting('records', { years: Number(y) }); say('ok', 'Saved'); onSaved(); onClose(); }
    catch (e) { say('err', plainError(e)); }
  }
  return (
    <Dialog title="Keep records for" onClose={onClose}>
      {inp('Years', <Field value={y} onChange={setY} type="number" autoFocus />, { req: true })}
      {note('How long sent checks and photos are kept.')}
      {acts(<>{sb('Cancel', 's', { onClick: onClose })}{sb('Save', 'p', { onClick: save, disabled: !!bad, title: bad || undefined })}</>)}
    </Dialog>
  );
}
function ColDialog({ col, onClose, onSaved }: { col: Col; onClose: () => void; onSaved: () => void }) {
  const [h, setH] = useState(col.header);
  async function save() {
    const r = await supabase.from('sheet_columns').update({ header: h.trim() }).eq('source', col.source).eq('tab', col.tab).eq('field', col.field);
    if (r.error) { say('err', plainError(r.error)); return; }
    say('ok', 'Saved'); onSaved(); onClose();
  }
  return (
    <Dialog title={col.field} onClose={onClose}>
      {inp('Column header in the sheet', <Field value={h} onChange={setH} autoFocus onEnter={() => { if (h.trim()) save(); }} />, { req: true })}
      {note('Matched without caring about capitals. A header that starts with this text also matches, for columns with a date in the name.')}
      {acts(<>{sb('Cancel', 's', { onClick: onClose })}{sb('Save', 'p', { onClick: save, disabled: !h.trim(), title: h.trim() ? undefined : 'Type the header' })}</>)}
    </Dialog>
  );
}
