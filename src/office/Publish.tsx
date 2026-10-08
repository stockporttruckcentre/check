/* Publish vN and Discard draft, used by the Check builder and Lists and wording.
   "Publish asks for a one-line reason ... It shows how many items changed."
   (source/07 S_builder, Publishing). */
import { useState } from 'react';
import { css } from '../kit/css';
import { sb } from '../kit/kit';
import { MU } from '../kit/tokens';
import { plainError } from '../lib/supabase';
import { useSession, NO_PERMS } from '../lib/session';
import { useDraft, draftNo, publishDraft, discardDraft } from './draft';
import { diff } from './diff';
import { Dialog, inp, Field, note, body, acts, say, need } from './ui';

export function PublishButton() {
  const { user } = useSession();
  const perms = user?.perms || NO_PERMS;
  const d = useDraft();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const n = draftNo(d);
  const changes = d.draft ? diff(d.live, d.draft) : [];
  const block = !perms.publish ? 'Only the Owner can publish a new version' : !d.draft ? 'Nothing to publish. Change something first.' : !changes.length ? 'The draft is the same as the live version.' : null;
  async function go() {
    setBusy(true);
    try { const v = await publishDraft(reason.trim()); say('ok', 'v' + v + ' is live'); setOpen(false); setReason(''); }
    catch (e) { say('err', plainError(e)); }
    setBusy(false);
  }
  return (
    <>
      {sb('Publish v' + n, 'p', { ic: 'send', onClick: () => setOpen(true), disabled: !!block, title: block || undefined })}
      {open ? (
        <Dialog title={'Publish v' + n + '?'} onClose={() => setOpen(false)}>
          {body(<><b>{changes.length} {changes.length === 1 ? 'change' : 'changes'}</b> since v{d.liveNumber}.</>)}
          <ul style={css('margin:0;padding-left:20px;font-size:13px;color:' + MU + ';line-height:1.6')}>{changes.map((c, i) => <li key={i}>{c}</li>)}</ul>
          {inp('Reason', <Field value={reason} onChange={setReason} ph="Added curtain buckles for curtainsiders" autoFocus onEnter={() => { if (reason.trim()) go(); }} />, { req: true })}
          {note('Checks already started finish on the version they started on. New checks use the new version.')}
          {acts(<>{sb('Cancel', 's', { onClick: () => setOpen(false) })}{sb('Publish v' + n, 'p', { ic: 'send', onClick: go, disabled: busy || !reason.trim(), title: reason.trim() ? undefined : 'Write a one-line reason first' })}</>)}
        </Dialog>
      ) : null}
    </>
  );
}

export function DiscardButton() {
  const { user } = useSession();
  const perms = user?.perms || NO_PERMS;
  const d = useDraft();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const block = !perms.edit_config ? need('edit_config') : !d.draft ? 'There’s no draft to discard.' : null;
  async function go() {
    setBusy(true);
    try { await discardDraft(); say('ok', 'Draft discarded'); setOpen(false); }
    catch (e) { say('err', plainError(e)); }
    setBusy(false);
  }
  return (
    <>
      {sb('Discard draft', 's', { onClick: () => setOpen(true), disabled: !!block, title: block || undefined })}
      {open ? (
        <Dialog title={'Discard draft v' + draftNo(d) + '?'} onClose={() => setOpen(false)}>
          {body(<>Every change since v{d.liveNumber} is thrown away. The live version keeps running.</>)}
          {acts(<>{sb('Cancel', 's', { onClick: () => setOpen(false) })}{sb('Discard draft', 'd', { onClick: go, disabled: busy })}</>)}
        </Dialog>
      ) : null}
    </>
  );
}
