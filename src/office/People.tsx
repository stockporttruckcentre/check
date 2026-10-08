/* People and roles: source/07 S_people. The users table with chips, Add a person,
   the edit dialog behind each row, and the roles by permissions grid. */
import { useEffect, useState } from 'react';
import { css } from '../kit/css';
import { chip, dt, sb, tg, pill, lab, banner } from '../kit/kit';
import { W, PA, MU, BD, BL } from '../kit/tokens';
import { supabase, plainError } from '../lib/supabase';
import { useSession, NO_PERMS } from '../lib/session';
import { PERM_LABELS, type Perms, type Role } from '../data/types';
import { when } from '../lib/format';
import { useLookups, reloadLookups, siteName, liveSites, type PersonRow } from './data';
import { dh, Dialog, inp, Field, Choice, note, acts, say, need, useRemember, csv } from './ui';

type Filter = 'all' | 'yard' | 'locked' | 'invited';
const locked = (p: PersonRow) => !!p.locked_until && new Date(p.locked_until) > new Date();
const OWNER_ONLY = 'Only the Owner can give out publishing or system settings';

export default function People() {
  const { user } = useSession();
  const perms = user?.perms || NO_PERMS;
  const look = useLookups();
  const [roles, setRoles] = useState<Role[]>([]);
  const [f, setF] = useRemember<Filter>('people-chip', 'all');
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState<PersonRow | null>(null);

  async function loadRoles() {
    const r = await supabase.from('roles').select('*').order('sort');
    setRoles((r.data || []) as Role[]);
  }
  useEffect(() => { loadRoles(); reloadLookups(); }, []);

  const people = look.people.filter((p) => !p.deleted_at && p.status !== 'removed');
  const sites = liveSites(look);
  const roleName = (id: string) => roles.find((r) => r.id === id)?.name || id;
  const shown = people.filter((p) => f === 'all' || (f === 'yard' && p.role_id === 'yard') || (f === 'locked' && locked(p)) || (f === 'invited' && p.status === 'invited'));
  /* Owner rows need the Owner's own permission (the people policies in 003_rules.sql). */
  const canTouch = (p: { role_id: string }) => perms.people && (p.role_id !== 'owner' || perms.system);
  const why = (p: { role_id: string }) => (!perms.people ? need('people') : p.role_id === 'owner' ? 'Only the Owner can change an Owner' : '');

  async function act(p: PersonRow, kind: 'reset' | 'unlock' | 'resend') {
    try {
      if (kind === 'reset') {
        const r = await supabase.from('people').update({ pin_reset_at: new Date().toISOString() }).eq('id', p.id);
        if (r.error) throw r.error;
        say('ok', p.name + ' sets a new PIN next time');
      } else if (kind === 'unlock') {
        const r = await supabase.from('people').update({ locked_until: null }).eq('id', p.id);
        if (r.error) throw r.error;
        say('ok', p.name + ' is unlocked');
      } else {
        const r = await supabase.auth.signInWithOtp({ email: p.email, options: { shouldCreateUser: true } });
        if (r.error) throw r.error;
        say('ok', 'Invite sent again to ' + p.email);
      }
      reloadLookups();
    } catch (e) { say('err', plainError(e)); }
  }

  async function toggle(r: Role, k: keyof Perms) {
    const next = { ...r.perms, [k]: !r.perms[k] };
    setRoles(roles.map((x) => (x.id === r.id ? { ...x, perms: next } : x)));
    const res = await supabase.from('roles').update({ perms: next }).eq('id', r.id);
    if (res.error) { say('err', plainError(res.error)); }
    loadRoles();
  }

  function exportCsv() {
    csv('People.csv', ['Name', 'Email', 'Role', 'Site', 'Last active', 'Status', 'Names on the spreadsheets'],
      people.map((p) => [p.name, p.email, roleName(p.role_id), siteName(look, p.site_id), p.last_active || '', locked(p) ? 'Locked' : p.status, (p.aliases || []).join(', ')]));
  }

  const rows = shown.map((p) => {
    const isLocked = locked(p);
    const st = isLocked ? pill('LOCKED', 'err') : p.status === 'invited' ? pill('INVITED', 'n') : pill('ACTIVE', 'ok');
    const ok = canTouch(p);
    const stop = (fn: () => void) => (e: React.MouseEvent) => { e.stopPropagation(); fn(); };
    const action = isLocked
      ? sb('Unlock', 'p', { h: 34, onClick: stop(() => act(p, 'unlock')), disabled: !ok, title: ok ? undefined : why(p) })
      : p.status === 'invited'
        ? sb('Resend', 's', { h: 34, onClick: stop(() => act(p, 'resend')), disabled: !ok, title: ok ? undefined : why(p) })
        : sb('Reset PIN', 's', { h: 34, onClick: stop(() => act(p, 'reset')), disabled: !ok, title: ok ? undefined : why(p) });
    return {
      key: p.id,
      onClick: () => setEditing(p),
      cells: [
        <><b>{p.name}</b><br /><span style={css('color:' + MU)}>{p.email}</span></>,
        roleName(p.role_id), siteName(look, p.site_id), p.status === 'invited' && !p.last_active ? 'Invite sent' : when(p.last_active), st,
        <span onClick={(e) => e.stopPropagation()}>{action}</span>,
      ],
    };
  });

  const matrix = (
    <div style={css('min-width:640px;border:1px solid ' + BL + ';border-radius:8px;background:' + W + ';overflow:hidden')}>
      <div style={css('display:grid;grid-template-columns:2fr repeat(' + roles.length + ',1fr);padding:12px 16px;background:' + PA + ';border-bottom:1px solid #09163a9e;font-weight:800;font-size:13px')}>
        <span>Permission</span>{roles.map((r) => <span key={r.id} style={css('text-align:center')}>{r.name}</span>)}
      </div>
      {PERM_LABELS.map(([k, l], i) => (
        <div key={k} style={css('display:grid;grid-template-columns:2fr repeat(' + roles.length + ',1fr);align-items:center;min-height:52px;padding:0 16px;font-size:14px;' + (i ? 'border-top:1px solid ' + BD : ''))}>
          <span>{l}</span>
          {roles.map((r) => {
            const v = !!r.perms[k];
            if (r.fixed) return <span key={r.id} style={css('display:flex;justify-content:center')}><span style={css('opacity:0.6')}>{tg(v, { disabled: true, title: 'Owner permissions are fixed', label: r.name + ': ' + l })}</span></span>;
            const block = !perms.people ? need('people') : (k === 'publish' || k === 'system') && !perms.system ? OWNER_ONLY : null;
            return <span key={r.id} style={css('display:flex;justify-content:center')}>{tg(v, { onClick: () => toggle(r, k), disabled: !!block, title: block || undefined, label: r.name + ': ' + l })}</span>;
          })}
        </div>
      ))}
    </div>
  );

  return (
    <>
      {dh('People', people.length + ' people · ' + sites.length + ' sites', <>
        {sb('Export', 's', { ic: 'down', onClick: exportCsv })}
        {sb('Add a person', 'p', { ic: 'plus', onClick: () => setAdding(true), disabled: !perms.people, title: perms.people ? undefined : need('people') })}
      </>)}
      <div style={css('display:flex;gap:8px;margin-bottom:14px')}>
        {chip('All', f === 'all', { h: 38, onClick: () => setF('all') })}
        {chip('Yard staff', f === 'yard', { h: 38, onClick: () => setF('yard') })}
        {chip('Locked', f === 'locked', { h: 38, n: people.filter(locked).length, onClick: () => setF('locked') })}
        {chip('Invited', f === 'invited', { h: 38, n: people.filter((p) => p.status === 'invited').length, onClick: () => setF('invited') })}
      </div>
      {dt(['Name', 'Role', 'Site', 'Last active', 'Status', ''], rows, '1.6fr 1fr 0.9fr 0.9fr 0.8fr 0.8fr')}
      <div style={css('display:flex;gap:24px;flex-wrap:wrap;align-items:flex-start;margin-top:24px')}>
        <div style={css('flex:1;min-width:0;max-width:100%;overflow-x:auto')}>
          {lab('Roles and permissions')}
          {matrix}
          <div style={css('font-size:13px;color:' + MU + ';margin-top:8px')}>Owner permissions are fixed so nobody can lock everyone out. Admins can add new roles and copy an existing one as a start.</div>
        </div>
      </div>
      {adding ? <PersonDialog roles={roles} onClose={() => setAdding(false)} /> : null}
      {editing ? <PersonDialog roles={roles} person={editing} onClose={() => setEditing(null)} canEdit={canTouch(editing)} whyNot={why(editing)} /> : null}
    </>
  );
}

function PersonDialog({ roles, person, onClose, canEdit = true, whyNot }: { roles: Role[]; person?: PersonRow; onClose: () => void; canEdit?: boolean; whyNot?: string }) {
  const { user } = useSession();
  const perms = user?.perms || NO_PERMS;
  const look = useLookups();
  const [email, setEmail] = useState(person?.email || '');
  const [name, setName] = useState(person?.name || '');
  const [role, setRole] = useState(person?.role_id || roles.find((r) => r.id === 'yard')?.id || roles[0]?.id || '');
  const [site, setSite] = useState(person?.site_id || '');
  const [aliases, setAliases] = useState((person?.aliases || []).join(', '));
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const roleOpts: [string, string][] = roles.filter((r) => r.id !== 'owner' || perms.system).map((r) => [r.id, r.name]);
  if (person && person.role_id === 'owner' && !roleOpts.some((o) => o[0] === 'owner')) roleOpts.push(['owner', 'Owner']);
  const siteOpts: [string, string][] = [['', 'All sites'], ...liveSites(look).map((s): [string, string] => [s.id, s.name])];
  const aliasList = aliases.split(',').map((x) => x.trim()).filter(Boolean);
  const missing = !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim()) ? 'Type their work email' : !name.trim() ? 'Type their name' : !role ? 'Pick a role' : null;

  async function save() {
    setBusy(true); setErr(null);
    try {
      const row = { email: email.trim().toLowerCase(), name: name.trim(), role_id: role, site_id: site || null, aliases: aliasList };
      if (person) {
        const r = await supabase.from('people').update(row).eq('id', person.id);
        if (r.error) throw r.error;
        say('ok', 'Saved');
      } else {
        const r = await supabase.from('people').insert({ ...row, status: 'invited' });
        if (r.error) throw r.error;
        const o = await supabase.auth.signInWithOtp({ email: row.email, options: { shouldCreateUser: true } });
        if (o.error) say('warn', 'Added, but the email didn’t send: ' + plainError(o.error) + ' Use Resend.');
        else say('ok', 'Invite sent to ' + row.email);
      }
      await reloadLookups();
      onClose();
    } catch (e) { setErr(plainError(e)); }
    setBusy(false);
  }
  async function remove() {
    if (!person) return;
    setBusy(true);
    const r = await supabase.rpc('remove_person', { p_person: person.id });
    setBusy(false);
    if (r.error) { setErr(plainError(r.error)); return; }
    say('ok', person.name + ' moved to the recycle bin');
    await reloadLookups();
    onClose();
  }
  const ro = !canEdit;
  return (
    <Dialog title={person ? person.name : 'Add a person'} onClose={onClose}>
      {inp('Work email', <Field value={email} onChange={setEmail} ph="name@stc-uk.com" type="email" disabled={ro} autoFocus={!person} />, { req: true })}
      {inp('Name', <Field value={name} onChange={setName} ph="Jordan Hill" disabled={ro} />, { req: true })}
      <div style={css('display:grid;grid-template-columns:1fr 1fr;gap:10px')}>
        {inp('Role', <Choice value={role} options={roleOpts} onChange={setRole} title="Role" disabled={ro} disabledTitle={whyNot} />, { req: true })}
        {inp('Site', <Choice value={site} options={siteOpts} onChange={setSite} title="Site" disabled={ro} disabledTitle={whyNot} />, { req: true })}
      </div>
      {inp('Names on the spreadsheets', <Field value={aliases} onChange={setAliases} ph="Dean, DAVID REAY" disabled={ro} />)}
      {note(person ? 'Names on the spreadsheets match this person to the Sales Rep column, separated by commas.' : 'They get an email with a link to sign in. Nothing else to set up.')}
      {err ? banner('err', 'Not saved', err) : null}
      <div style={css('display:flex;justify-content:space-between;gap:10px')}>
        <span>{person ? sb('Remove', 'd', { ic: 'trash', onClick: remove, disabled: ro || busy, title: ro ? whyNot : undefined }) : null}</span>
        {acts(<>
          {sb('Cancel', 's', { onClick: onClose })}
          {person
            ? sb('Save', 'p', { onClick: save, disabled: ro || busy || !!missing, title: ro ? whyNot : missing || undefined })
            : sb('Send invite', 'p', { onClick: save, disabled: busy || !!missing, title: missing || undefined })}
        </>)}
      </div>
    </Dialog>
  );
}
