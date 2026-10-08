/* Versions: source/07 S_log, the versions table. Every published checklist, the live
   one marked LIVE, with Put back and Compare. */
import { useEffect, useState } from 'react';
import { css } from '../kit/css';
import { dt, sb, pill, banner } from '../kit/kit';
import { MU } from '../kit/tokens';
import { supabase, plainError } from '../lib/supabase';
import { useSession, NO_PERMS } from '../lib/session';
import { refreshConfig } from '../lib/config';
import { when } from '../lib/format';
import { dh, Dialog, inp, Field, note, body, acts, say } from './ui';
import { useLookups, personName } from './data';
import { full, loadDraft } from './draft';
import { diff } from './diff';
import type { Config } from '../data/types';

interface Ver { number: number; status: 'live' | 'old'; reason: string | null; published_by: string | null; published_at: string | null; config: Config }

export default function Versions() {
  const { user } = useSession();
  const perms = user?.perms || NO_PERMS;
  const look = useLookups();
  const [rows, setRows] = useState<Ver[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const [cmp, setCmp] = useState<{ a: Ver; b: Ver } | null>(null);
  const [back, setBack] = useState<Ver | null>(null);
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);

  async function load() {
    const r = await supabase.from('config_versions').select('number, status, reason, published_by, published_at, config')
      .in('status', ['live', 'old']).not('published_at', 'is', null).order('number', { ascending: false });
    if (r.error) { setErr(plainError(r.error)); return; }
    setErr(null);
    setRows(((r.data || []) as Ver[]).map((v) => ({ ...v, config: full(v.config) })));
  }
  useEffect(() => { load(); }, []);

  const live = rows.find((v) => v.status === 'live');
  async function putBack() {
    if (!back) return;
    setBusy(true);
    const r = await supabase.rpc('put_back_version', { p_number: back.number, p_reason: reason.trim() });
    setBusy(false);
    if (r.error) { say('err', plainError(r.error)); return; }
    say('ok', 'v' + back.number + ' is live again');
    setBack(null); setReason('');
    load(); loadDraft().catch(() => {}); refreshConfig().catch(() => {});
  }

  const ownerOnly = 'Only the Owner can put back a version';
  const cells = rows.map((v, i) => {
    const isLive = v.status === 'live';
    const older = rows[i + 1];
    const compare = isLive
      ? sb('Compare', 's', { h: 32, onClick: () => older && setCmp({ a: older, b: v }), disabled: !older, title: older ? undefined : 'There is no earlier version to compare with' })
      : sb('Compare', 's', { h: 32, onClick: () => live && setCmp({ a: v, b: live }), disabled: !live, title: live ? undefined : 'There is no live version to compare with' });
    return {
      key: String(v.number),
      cells: [
        isLive ? <><b>v{v.number}</b> {pill('LIVE', 'ok')}</> : 'v' + v.number,
        v.published_at ? when(v.published_at) : '', personName(look, v.published_by), v.reason || '',
        isLive ? compare : <span style={css('display:flex;gap:8px;flex-wrap:wrap')}>{sb('Put back', 's', { h: 32, ic: 'undo', onClick: () => { setReason(''); setBack(v); }, disabled: !perms.publish, title: perms.publish ? undefined : ownerOnly })}{compare}</span>,
      ],
    };
  });
  const changes = cmp ? diff(cmp.a.config, cmp.b.config) : [];
  return (
    <>
      {dh('Versions')}
      {err ? <div style={css('margin-bottom:14px')}>{banner('err', 'Couldn’t load the versions', err)}</div> : null}
      {dt(['Version', 'Published', 'By', 'Reason', ''], cells, '0.8fr 0.8fr 0.8fr 1.8fr 0.8fr')}
      {cmp ? (
        <Dialog title={'v' + cmp.a.number + ' and v' + cmp.b.number + (cmp.b.status === 'live' ? ' (live)' : '')} onClose={() => setCmp(null)} w={460}>
          {body(changes.length ? <><b>{changes.length} {changes.length === 1 ? 'difference' : 'differences'}</b> going from v{cmp.a.number} to v{cmp.b.number}.</> : <>No differences.</>)}
          {changes.length ? <ul style={css('margin:0;padding-left:20px;font-size:14px;color:' + MU + ';line-height:1.6')}>{changes.map((c, i) => <li key={i}>{c}</li>)}</ul> : null}
          {acts(sb('Close', 's', { onClick: () => setCmp(null) }))}
        </Dialog>
      ) : null}
      {back ? (
        <Dialog title={'Put back v' + back.number + '?'} onClose={() => setBack(null)} w={460}>
          {body(<><b>v{back.number}</b> goes live again. New checks use it straight away. Checks already started finish on the version they started on.</>)}
          {inp('Reason', <Field value={reason} onChange={setReason} ph="Tail lift wording was wrong" autoFocus onEnter={() => { if (reason.trim()) putBack(); }} />, { req: true })}
          {note('Putting a version back is logged, and can be undone from the activity log.')}
          {acts(<>{sb('Cancel', 's', { onClick: () => setBack(null) })}{sb('Put back', 'p', { ic: 'undo', onClick: putBack, disabled: busy || !reason.trim(), title: reason.trim() ? undefined : 'Write a reason first' })}</>)}
        </Dialog>
      ) : null}
    </>
  );
}
