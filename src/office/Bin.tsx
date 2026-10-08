/* Recycle bin: source/07 S_log, the bin table. Deleted unfinished checks, checklist
   items and people stay here for 30 days and can be restored. */
import { useEffect, useState } from 'react';
import { css } from '../kit/css';
import { dt, sb, banner } from '../kit/kit';
import { supabase, plainError } from '../lib/supabase';
import { useSession, NO_PERMS } from '../lib/session';
import { when } from '../lib/format';
import type { ItemDef, ShotDef } from '../data/types';
import { dh, say, need } from './ui';
import { useLookups, reloadLookups, personName } from './data';
import { editDraftNow } from './draft';

interface BinRow { id: string; kind: 'check' | 'item' | 'person'; label: string; payload: { kind?: 'item' | 'shot'; item?: ItemDef; shot?: ShotDef; index?: number }; deleted_at: string; deleted_by: string | null }
const DAY = 864e5;
export const goneIn = (at: string) => Math.max(0, Math.ceil(30 - (Date.now() - new Date(at).getTime()) / DAY));

export default function Bin() {
  const { user } = useSession();
  const perms = user?.perms || NO_PERMS;
  const look = useLookups();
  const [rows, setRows] = useState<BinRow[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  async function load() {
    const r = await supabase.from('recycle').select('id, kind, label, payload, deleted_at, deleted_by').is('restored_at', null)
      .gte('deleted_at', new Date(Date.now() - 30 * DAY).toISOString()).order('deleted_at', { ascending: false });
    if (r.error) { setErr(plainError(r.error)); return; }
    setErr(null); setRows((r.data || []) as BinRow[]);
  }
  useEffect(() => { load(); }, []);

  async function restore(b: BinRow) {
    setBusy(b.id);
    try {
      if (b.kind === 'item') {
        /* Items live in the draft checklist: put it back there first, then mark it restored. */
        const p = b.payload;
        await editDraftNow((c) => {
          if (p.kind === 'shot' && p.shot && !c.shots.some((x) => x.id === p.shot!.id)) c.shots.splice(Math.min(p.index ?? c.shots.length, c.shots.length), 0, p.shot);
          if (p.kind !== 'shot' && p.item && !c.items.some((x) => x.id === p.item!.id)) c.items.splice(Math.min(p.index ?? c.items.length, c.items.length), 0, p.item);
        });
      }
      const r = await supabase.rpc('restore_recycled', { p_id: b.id });
      if (r.error) throw r.error;
      say('ok', b.kind === 'item' ? 'Restored into the draft' : 'Restored');
      load();
      if (b.kind === 'person') reloadLookups();
    } catch (e) { say('err', plainError(e)); }
    setBusy(null);
  }

  const cells = rows.map((b) => {
    const block = !perms.undo ? need('undo') : b.kind === 'item' && !perms.edit_config ? need('edit_config') : null;
    return {
      key: b.id,
      cells: [when(b.deleted_at), personName(look, b.deleted_by), b.label, goneIn(b.deleted_at) + (goneIn(b.deleted_at) === 1 ? ' day' : ' days'),
        sb('Restore', 'p', { h: 32, onClick: () => restore(b), disabled: !!block || busy === b.id, title: block || undefined })],
    };
  });
  return (
    <>
      {dh('Recycle bin')}
      {!perms.undo ? <div style={css('margin-bottom:14px')}>{banner('info', 'The recycle bin needs another permission', need('undo'))}</div> : null}
      {err ? <div style={css('margin-bottom:14px')}>{banner('err', 'Couldn’t load the recycle bin', err)}</div> : null}
      {dt(['Deleted', 'By', 'Item', 'Gone for good in', ''], cells.length ? cells : [{ key: 'none', cells: ['Nothing in the bin', '', '', '', ''] }], '0.9fr 0.9fr 1.6fr 0.9fr 0.7fr')}
    </>
  );
}
