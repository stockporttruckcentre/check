/* Activity log: source/07 S_log. Search, chips, the log table with Undo, Restore and
   See changes, the undo dialog with a reason, and Export CSV. */
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { css } from '../kit/css';
import { chip, dt, sb, banner } from '../kit/kit';
import { supabase, plainError } from '../lib/supabase';
import { useSession, NO_PERMS } from '../lib/session';
import { when } from '../lib/format';
import { dh, Dialog, inp, Field, note, body, acts, say, need, useRemember, search, csv, SelectSheet } from './ui';
import { reloadLookups } from './data';
import { loadDraft } from './draft';
import { refreshConfig } from '../lib/config';

export interface AuditRow {
  id: number; at: string; person_name: string; action: string; kind: 'admin' | 'check' | 'signin' | 'system'; target: string | null; detail: string | null;
  undo: { table?: string; id?: unknown; number?: number; before?: Record<string, unknown> | null } | null; undo_of: number | null; undone_by: number | null;
}
type Kind = 'admin' | 'check' | 'signin';
const ARROW = ' → ';

/** What goes back, in words, for the undo dialog. */
function whatGoesBack(e: AuditRow): ReactNode {
  const t = e.target || '';
  if (e.action === 'Changed role' || e.action === 'Changed site') {
    const [from, to] = (e.detail || '').split(ARROW);
    if (from && to) return <>{t} goes back from <b>{to}</b> to <b>{from}</b>.</>;
  }
  if (e.action === 'Added a person') return <>{t} is removed and can no longer sign in.</>;
  if (e.action === 'Removed a person') return <>{t} comes back and can sign in again.</>;
  if (e.action === 'Changed column match') {
    const [from, to] = (e.detail || '').replace(/^[^:]+: /, '').split(ARROW);
    if (from && to) return <>The {t.toLowerCase()} goes back from <b>{to}</b> to <b>{from}</b>.</>;
  }
  if (/^(Published|Put back) v/.test(e.action) && e.undo?.number) return <><b>v{e.undo.number}</b> goes live again. New checks use it straight away.</>;
  if (e.action === 'Deleted unfinished check') return <>The unfinished check <b>{t}</b> comes back from the recycle bin.</>;
  if (e.action === 'Changed permissions') return <>{t} gets back the permissions it had before.</>;
  if (e.action === 'Changed setting') return <>{t} goes back to what it was before.</>;
  return <>{e.action} on {t} is put back as it was.</>;
}

export default function Log() {
  const { user } = useSession();
  const perms = user?.perms || NO_PERMS;
  const nav = useNavigate();
  const [rows, setRows] = useState<AuditRow[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const [q, setQ] = useState('');
  const [last7, setLast7] = useRemember<boolean>('log-7', true);
  const [who, setWho] = useRemember<string>('log-who', '');
  const [kinds, setKinds] = useRemember<Kind[]>('log-kinds', []);
  const [pickWho, setPickWho] = useState(false);
  const [undo, setUndo] = useState<AuditRow | null>(null);
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const canRead = perms.undo || perms.edit_config || perms.system;

  async function load() {
    let req = supabase.from('audit_events').select('*').order('at', { ascending: false }).limit(1000);
    if (last7) req = req.gte('at', new Date(Date.now() - 7 * 864e5).toISOString());
    const r = await req;
    if (r.error) { setErr(plainError(r.error)); return; }
    setErr(null);
    setRows((r.data || []) as AuditRow[]);
  }
  useEffect(() => { load(); }, [last7]); // eslint-disable-line

  const names = useMemo(() => [...new Set(rows.map((r) => r.person_name))].sort(), [rows]);
  const shown = rows.filter((r) => {
    if (who && r.person_name !== who) return false;
    if (kinds.length && !kinds.includes(r.kind as Kind)) return false;
    if (q.trim()) {
      const k = q.trim().toLowerCase();
      if (![r.person_name, r.action, r.target, r.detail].some((x) => (x || '').toLowerCase().includes(k))) return false;
    }
    return true;
  });
  const toggleKind = (k: Kind) => setKinds(kinds.includes(k) ? kinds.filter((x) => x !== k) : [...kinds, k]);

  async function doUndo() {
    if (!undo) return;
    setBusy(true);
    const r = await supabase.rpc('undo_event', { p_id: undo.id, p_reason: reason.trim() });
    setBusy(false);
    if (r.error) { say('err', plainError(r.error)); return; }
    say('ok', undo.action === 'Deleted unfinished check' ? 'Restored' : 'Undone');
    setUndo(null); setReason('');
    load(); reloadLookups(); loadDraft().catch(() => {}); refreshConfig().catch(() => {});
  }

  const undoOk = perms.undo;
  const cells = shown.map((r) => {
    let a: ReactNode = '';
    const open = !!r.undo && !r.undone_by;
    if (r.action === 'Deleted unfinished check' && open) a = sb('Restore', 's', { h: 32, ic: 'undo', onClick: () => { setReason(''); setUndo(r); }, disabled: !undoOk, title: undoOk ? undefined : need('undo') });
    else if (open) a = sb('Undo', 's', { h: 32, ic: 'undo', onClick: () => { setReason(''); setUndo(r); }, disabled: !undoOk, title: undoOk ? undefined : need('undo') });
    else if (r.action === 'Reopened check') a = sb('See changes', 's', { h: 32, ic: 'eye', onClick: () => nav('/office/inspections?q=' + encodeURIComponent(r.target || '')) });
    return { key: String(r.id), cells: [when(r.at), r.person_name, r.action, r.target || '', r.detail || '', a] };
  });

  return (
    <>
      {dh('Activity log', 'Everything, everyone, all sites', sb('Export CSV', 's', {
        ic: 'down',
        onClick: () => csv('Activity-log.csv', ['When', 'Who', 'What', 'On', 'Detail', 'Kind'], shown.map((r) => [r.at, r.person_name, r.action, r.target, r.detail, r.kind])),
      }))}
      <div style={css('display:flex;gap:8px;margin-bottom:14px;flex-wrap:wrap')}>
        {search(q, setQ, 'Person, trailer or customer', 40, 'min-width:280px')}
        {chip('Last 7 days', last7, { h: 40, onClick: () => setLast7(!last7) })}
        {chip(who || 'All people', !!who, { h: 40, onClick: () => setPickWho(true) })}
        {chip('Admin changes', kinds.includes('admin'), { h: 40, onClick: () => toggleKind('admin') })}
        {chip('Checks', kinds.includes('check'), { h: 40, onClick: () => toggleKind('check') })}
        {chip('Sign in', kinds.includes('signin'), { h: 40, onClick: () => toggleKind('signin') })}
      </div>
      {!canRead ? <div style={css('margin-bottom:14px')}>{banner('info', 'The activity log needs another permission', need('undo'))}</div> : null}
      {err ? <div style={css('margin-bottom:14px')}>{banner('err', 'Couldn’t load the activity log', err)}</div> : null}
      {dt(['When', 'Who', 'What', 'On', 'Detail', ''], cells, '0.9fr 0.9fr 1fr 0.9fr 1.6fr 0.8fr')}
      {pickWho ? <SelectSheet title="Person" options={[['', 'All people'], ...names.map((n): [string, string] => [n, n])]} value={who} onPick={(v) => { setWho(v); setPickWho(false); }} onClose={() => setPickWho(false)} /> : null}
      {undo ? (
        <Dialog title={undo.action === 'Deleted unfinished check' ? 'Restore this check?' : 'Undo this change?'} onClose={() => setUndo(null)} w={460}>
          {body(whatGoesBack(undo))}
          {inp('Reason', <Field value={reason} onChange={setReason} ph="Wrong person promoted" autoFocus onEnter={() => { if (reason.trim()) doUndo(); }} />, { req: true })}
          {note('The undo is logged too, so it can be undone again.')}
          {acts(<>{sb('Cancel', 's', { onClick: () => setUndo(null) })}{sb(undo.action === 'Deleted unfinished check' ? 'Restore' : 'Undo change', 'p', { ic: 'undo', onClick: doUndo, disabled: busy || !reason.trim(), title: reason.trim() ? undefined : 'Write a reason first' })}</>)}
        </Dialog>
      ) : null}
    </>
  );
}
