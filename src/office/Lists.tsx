/* Lists and wording: source/07 S_lists. Six tabs. Everything except Sites goes into
   the draft and is published with it; Sites are not versioned and change straight away. */
import { useState, type ReactNode } from 'react';
import { css } from '../kit/css';
import { dt, sb, tg, banner } from '../kit/kit';
import { R } from '../kit/tokens';
import { supabase, plainError } from '../lib/supabase';
import { useSession, NO_PERMS } from '../lib/session';
import { num } from '../lib/format';
import type { Config, Limits, TrailerType, TrailerTypeId } from '../data/types';
import { useDraft, editDraft, working } from './draft';
import { PublishButton } from './Publish';
import { wordingName } from './diff';
import { useLookups, reloadLookups, liveSites, type SiteRow } from './data';
import { Gate } from './Builder';
import { dh, Dialog, inp, Field, Choice, note, acts, say, need, useRemember, dashed, muted } from './ui';

type Tab = 'letters' | 'types' | 'sites' | 'wording' | 'limits' | 'email';
const TABS: [Tab, string][] = [['letters', 'Damage letters'], ['types', 'Trailer types'], ['sites', 'Sites'], ['wording', 'Wording'], ['limits', 'Limits and alerts'], ['email', 'Email and PDF']];
const COLS = '1fr 1.6fr 100px';
const editBtn = (onClick: () => void) => sb('Edit', 's', { h: 32, ic: 'pen', onClick });
const placeholders = (s: string) => [...new Set((s.match(/\{\w+\}/g) || []))];

type Dlg =
  | { k: 'limit'; key: keyof Limits; key2?: keyof Limits }
  | { k: 'alerts' }
  | { k: 'wording'; key: string }
  | { k: 'letter'; index: number | null }
  | { k: 'type'; index: number | null }
  | { k: 'site'; site: SiteRow | null }
  | { k: 'email'; field: 'to' | 'subject' | 'footer' };

export default function Lists() {
  const { user } = useSession();
  const perms = user?.perms || NO_PERMS;
  const can = perms.edit_config;
  const d = useDraft();
  const cfg = working(d);
  const look = useLookups();
  const [tab, setTab] = useRemember<Tab>('lists-tab', 'limits');
  const [dlg, setDlg] = useState<Dlg | null>(null);

  const L = cfg.limits;
  const alertWords = [cfg.alerts.newDamage ? 'New damage' : '', cfg.alerts.expiredMot ? 'expired MOT' : '', cfg.alerts.notYourTrailer ? 'not your trailer' : ''].filter(Boolean).join(', ');
  const limits = dt(['Setting', 'Value', 'Used for'], [
    { key: 'lt', onClick: can ? () => setDlg({ k: 'limit', key: 'lowTread' }) : undefined, cells: ['Low tread warning', <b>{L.lowTread} mm</b>, 'Amber banner on Tyres'] },
    { key: 'lg', onClick: can ? () => setDlg({ k: 'limit', key: 'legalTread' }) : undefined, cells: ['Legal tread minimum', <b>{L.legalTread} mm</b>, 'Red banner, flagged'] },
    { key: 'hj', onClick: can ? () => setDlg({ k: 'limit', key: 'hubJump' }) : undefined, cells: ['Odd hubometer reading', <><b>More than {num(L.hubJump)} km</b> from last check</>, '“Is this right?” prompt'] },
    { key: 'id', onClick: can ? () => setDlg({ k: 'limit', key: 'idleMinutes' }) : undefined, cells: ['Idle sign out', <b>{L.idleMinutes} minutes</b>, 'Sign in'] },
    { key: 'pt', onClick: can ? () => setDlg({ k: 'limit', key: 'pinTries', key2: 'lockMinutes' }) : undefined, cells: ['Wrong PIN tries', <><b>{L.pinTries}</b>, then locked {L.lockMinutes} minutes</>, 'Sign in'] },
    { key: 'kd', onClick: can ? () => setDlg({ k: 'limit', key: 'keepDays' }) : undefined, cells: ['Keep sent checks on phone', <b>{L.keepDays} days</b>, 'Storage'] },
    { key: 'al', onClick: can ? () => setDlg({ k: 'alerts' }) : undefined, cells: ['Alert the office when', alertWords || 'Nothing', 'Emails and app alerts'] },
  ], '1.2fr 1.3fr 1fr');

  const wording = dt(['Where', 'Text staff see', ''], Object.keys(cfg.wording).map((k) => ({ key: k, cells: [wordingName(k), cfg.wording[k], editBtn(() => setDlg({ k: 'wording', key: k }))] })), COLS);

  const letters = (
    <>
      {dt(['Code', 'Name', ''], cfg.damageTypes.map((t, i) => ({ key: t.code + i, cells: [<b>{t.code}</b>, t.name, editBtn(() => setDlg({ k: 'letter', index: i }))] })), COLS)}
      <div style={css('margin-top:10px')}>{dashed('Add a damage letter', { onClick: () => setDlg({ k: 'letter', index: null }) })}</div>
    </>
  );
  const drawName = (x: TrailerType['drawing']) => (x === 'truck' ? 'Rigid truck' : x === 'van' ? 'Van' : 'Trailer');
  const types = (
    <>
      {dt(['Name', 'Match words', ''], cfg.trailerTypes.map((t, i) => ({ key: t.id, cells: [<><b>{t.name}</b><br />{muted(drawName(t.drawing) + ' drawing')}</>, <span style={css('font-family:ui-monospace,Menlo,Consolas,monospace;word-break:break-all')}>{t.match}</span>, editBtn(() => setDlg({ k: 'type', index: i }))] })), COLS)}
      <div style={css('margin-top:10px')}>{dashed('Add a trailer type', { onClick: () => setDlg({ k: 'type', index: null }) })}</div>
    </>
  );
  const sites = (
    <>
      <div style={css('margin-bottom:14px')}>{banner('info', 'Sites change straight away', 'They aren’t part of the draft, so there is nothing to publish for them.')}</div>
      {dt(['Site', 'People', ''], liveSites(look).map((s) => ({ key: s.id, cells: [<b>{s.name}</b>, String(look.people.filter((p) => p.site_id === s.id && !p.deleted_at).length), editBtn(() => setDlg({ k: 'site', site: s }))] })), COLS)}
      <div style={css('margin-top:10px')}>{dashed('Add a site', { onClick: () => setDlg({ k: 'site', site: null }) })}</div>
    </>
  );
  const email = dt(['Setting', 'Value', ''], [
    { key: 'to', cells: ['Send checks to', cfg.email.to.join(', '), editBtn(() => setDlg({ k: 'email', field: 'to' }))] },
    { key: 'su', cells: ['Email subject', cfg.email.subject, editBtn(() => setDlg({ k: 'email', field: 'subject' }))] },
    { key: 'fo', cells: ['PDF footer', cfg.email.footer, editBtn(() => setDlg({ k: 'email', field: 'footer' }))] },
    { key: 'ga', cells: ['Allow photos from the gallery', tg(cfg.allowGallery, { label: 'Allow photos from the gallery', onClick: () => editDraft((c) => { c.allowGallery = !c.allowGallery; }) }), ''] },
  ], COLS);

  const body: Record<Tab, ReactNode> = { limits, wording, letters, types, sites, email };
  return (
    <>
      {dh('Lists and wording', 'Changes here go into the draft and are published together', <PublishButton />)}
      <div role="tablist" style={css('display:flex;gap:4px;border-bottom:1px solid #09163a9e;margin-bottom:16px')}>
        {TABS.map(([k, t]) => (
          <button key={k} type="button" role="tab" aria-selected={tab === k} className="k-tap k-reset" onClick={() => setTab(k)}
            style={css('padding:10px 14px;font-weight:' + (tab === k ? 800 : 600) + ';font-size:14px;border:0;background:transparent;border-bottom:' + (tab === k ? '3px solid ' + R : '3px solid transparent'))}>{t}</button>
        ))}
      </div>
      <Gate ok={can} why={need('edit_config')}>{body[tab]}</Gate>
      {dlg ? <ListDialog dlg={dlg} cfg={cfg} onClose={() => setDlg(null)} /> : null}
    </>
  );
}

function ListDialog({ dlg, cfg, onClose }: { dlg: Dlg; cfg: Config; onClose: () => void }) {
  if (dlg.k === 'limit') return <LimitDialog k1={dlg.key} k2={dlg.key2} cfg={cfg} onClose={onClose} />;
  if (dlg.k === 'alerts') return <AlertsDialog cfg={cfg} onClose={onClose} />;
  if (dlg.k === 'wording') return <WordingDialog k={dlg.key} cfg={cfg} onClose={onClose} />;
  if (dlg.k === 'letter') return <LetterDialog index={dlg.index} cfg={cfg} onClose={onClose} />;
  if (dlg.k === 'type') return <TypeDialog index={dlg.index} cfg={cfg} onClose={onClose} />;
  if (dlg.k === 'site') return <SiteDialog site={dlg.site} onClose={onClose} />;
  return <EmailDialog field={dlg.field} cfg={cfg} onClose={onClose} />;
}

const LIMIT_LABEL: Record<keyof Limits, [string, string]> = {
  lowTread: ['Low tread warning', 'mm'], legalTread: ['Legal tread minimum', 'mm'], hubJump: ['Odd hubometer reading', 'km'],
  idleMinutes: ['Idle sign out', 'minutes'], pinTries: ['Wrong PIN tries', 'tries'], lockMinutes: ['Then locked for', 'minutes'], keepDays: ['Keep sent checks on phone', 'days'],
};
function LimitDialog({ k1, k2, cfg, onClose }: { k1: keyof Limits; k2?: keyof Limits; cfg: Config; onClose: () => void }) {
  const [a, setA] = useState(String(cfg.limits[k1]));
  const [b, setB] = useState(k2 ? String(cfg.limits[k2]) : '');
  const ok = (v: string) => v.trim() !== '' && Number.isFinite(Number(v)) && Number(v) >= 0;
  const bad = !ok(a) || (k2 && !ok(b));
  const save = () => { editDraft((c) => { c.limits[k1] = Number(a); if (k2) c.limits[k2] = Number(b); }); onClose(); };
  return (
    <Dialog title={LIMIT_LABEL[k1][0]} onClose={onClose}>
      {inp(LIMIT_LABEL[k1][0] + ', ' + LIMIT_LABEL[k1][1], <Field value={a} onChange={setA} type="number" autoFocus />, { req: true })}
      {k2 ? inp(LIMIT_LABEL[k2][0] + ', ' + LIMIT_LABEL[k2][1], <Field value={b} onChange={setB} type="number" />, { req: true }) : null}
      {note('Goes into the draft. Phones use it once the draft is published.')}
      {acts(<>{sb('Cancel', 's', { onClick: onClose })}{sb('Save', 'p', { onClick: save, disabled: !!bad, title: bad ? 'Type a number' : undefined })}</>)}
    </Dialog>
  );
}
function AlertsDialog({ cfg, onClose }: { cfg: Config; onClose: () => void }) {
  const rows: [keyof Config['alerts'], string][] = [['newDamage', 'New damage'], ['expiredMot', 'Expired MOT'], ['notYourTrailer', 'Not your trailer']];
  return (
    <Dialog title="Alert the office when" onClose={onClose}>
      {rows.map(([k, t]) => (
        <div key={k} style={css('display:flex;justify-content:space-between;align-items:center;font-size:14px;font-weight:700')}>{t} {tg(cfg.alerts[k], { label: t, onClick: () => editDraft((c) => { c.alerts[k] = !c.alerts[k]; }) })}</div>
      ))}
      {acts(sb('Done', 'p', { onClick: onClose }))}
    </Dialog>
  );
}
function WordingDialog({ k, cfg, onClose }: { k: string; cfg: Config; onClose: () => void }) {
  const orig = cfg.wording[k] || '';
  const [v, setV] = useState(orig);
  const lost = placeholders(orig).filter((p) => !v.includes(p));
  return (
    <Dialog title={wordingName(k)} onClose={onClose} w={460}>
      {inp('Text staff see', <Field value={v} onChange={setV} autoFocus />, { req: true })}
      {lost.length ? banner('warn', lost.length === 1 ? lost[0] + ' has been removed' : lost.join(', ') + ' have been removed', 'Placeholders in curly brackets are filled in by the app. Without it the message loses that part.') : null}
      {note('Placeholders in curly brackets are filled in by the app.')}
      {acts(<>{sb('Cancel', 's', { onClick: onClose })}{sb('Save', 'p', { onClick: () => { editDraft((c) => { c.wording[k] = v; }); onClose(); }, disabled: !v.trim(), title: v.trim() ? undefined : 'Type the text first' })}</>)}
    </Dialog>
  );
}
function LetterDialog({ index, cfg, onClose }: { index: number | null; cfg: Config; onClose: () => void }) {
  const cur = index == null ? null : cfg.damageTypes[index];
  const [code, setCode] = useState(cur?.code || '');
  const [name, setName] = useState(cur?.name || '');
  const c = code.trim().toUpperCase();
  const clash = cfg.damageTypes.some((t, i) => t.code === c && i !== index);
  const bad = !c ? 'Type a code' : !name.trim() ? 'Type a name' : clash ? c + ' is already used' : null;
  const n = cfg.damageTypes.length;
  const moveTo = (to: number) => { editDraft((x) => { const [t] = x.damageTypes.splice(index!, 1); x.damageTypes.splice(to, 0, t); }); onClose(); };
  return (
    <Dialog title={cur ? cur.code + ' ' + cur.name : 'Add a damage letter'} onClose={onClose}>
      <div style={css('display:grid;grid-template-columns:1fr 1fr;gap:10px')}>
        {inp('Code', <Field value={code} onChange={setCode} mono autoFocus />, { req: true })}
        {inp('Name', <Field value={name} onChange={setName} />, { req: true })}
      </div>
      {cur ? <div style={css('display:flex;gap:10px')}>
        {sb('Move up', 's', { onClick: () => moveTo(index! - 1), disabled: index === 0, title: index === 0 ? 'Already first' : undefined })}
        {sb('Move down', 's', { onClick: () => moveTo(index! + 1), disabled: index === n - 1, title: index === n - 1 ? 'Already last' : undefined })}
      </div> : null}
      {note('Pins already recorded keep the letter they were given.')}
      <div style={css('display:flex;justify-content:space-between;gap:10px')}>
        <span>{cur ? sb('Remove', 'd', { ic: 'trash', onClick: () => { editDraft((x) => { x.damageTypes.splice(index!, 1); }); onClose(); } }) : null}</span>
        {acts(<>{sb('Cancel', 's', { onClick: onClose })}{sb('Save', 'p', {
          disabled: !!bad, title: bad || undefined,
          onClick: () => { editDraft((x) => { if (index == null) x.damageTypes.push({ code: c, name: name.trim() }); else x.damageTypes[index] = { code: c, name: name.trim() }; }); onClose(); },
        })}</>)}
      </div>
    </Dialog>
  );
}
function TypeDialog({ index, cfg, onClose }: { index: number | null; cfg: Config; onClose: () => void }) {
  const cur = index == null ? null : cfg.trailerTypes[index];
  const [name, setName] = useState(cur?.name || '');
  const [drawing, setDrawing] = useState<TrailerType['drawing']>(cur?.drawing || 'trailer');
  const [match, setMatch] = useState(cur?.match || '');
  let badMatch = false;
  try { new RegExp(match, 'i'); } catch { badMatch = true; }
  const id = (cur?.id || name.trim().toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '')) as TrailerTypeId;
  const clash = !cur && cfg.trailerTypes.some((t) => t.id === id);
  const bad = !name.trim() ? 'Type a name' : !match.trim() ? 'Type the match words' : badMatch ? 'The match words can’t be read. Separate words with |' : clash ? 'There’s already a type called ' + name.trim() : null;
  return (
    <Dialog title={cur ? cur.name : 'Add a trailer type'} onClose={onClose} w={460}>
      {inp('Name', <Field value={name} onChange={setName} autoFocus />, { req: true })}
      {inp('Drawing', <Choice value={drawing} options={[['trailer', 'Trailer'], ['truck', 'Rigid truck'], ['van', 'Van']]} onChange={setDrawing} title="Drawing" />, { req: true })}
      {inp('Match words', <Field value={match} onChange={setMatch} mono ph="curtain|psk|clearspan" />, { req: true })}
      {note('Words looked for in the stock sheet’s Model and Description, separated by |. The first type that matches wins, top to bottom.')}
      <div style={css('display:flex;justify-content:space-between;gap:10px')}>
        <span>{cur ? sb('Remove', 'd', { ic: 'trash', onClick: () => { editDraft((x) => { x.trailerTypes.splice(index!, 1); }); onClose(); } }) : null}</span>
        {acts(<>{sb('Cancel', 's', { onClick: onClose })}{sb('Save', 'p', {
          disabled: !!bad, title: bad || undefined,
          onClick: () => {
            editDraft((x) => {
              const t: TrailerType = { id, name: name.trim(), drawing, match: match.trim() };
              if (index == null) {
                x.trailerTypes.push(t);
                /* A new type gets every item and photo, the same as "All"; untick in the Check builder. */
                x.items.forEach((it) => { it.types[id] = 'yes'; });
                x.shots.forEach((s) => { s.types[id] = 'yes'; });
              } else x.trailerTypes[index] = t;
            });
            onClose();
          },
        })}</>)}
      </div>
    </Dialog>
  );
}
function SiteDialog({ site, onClose }: { site: SiteRow | null; onClose: () => void }) {
  const [name, setName] = useState(site?.name || '');
  const [busy, setBusy] = useState(false);
  const fail = (e: { code?: string; message?: string }) => say('err', e.code === '23505' ? 'There’s already a site called ' + name.trim() + '.' : plainError(e));
  async function save() {
    setBusy(true);
    const r = site ? await supabase.from('sites').update({ name: name.trim() }).eq('id', site.id) : await supabase.from('sites').insert({ name: name.trim() });
    setBusy(false);
    if (r.error) { fail(r.error); return; }
    say('ok', 'Saved'); await reloadLookups(); onClose();
  }
  async function remove() {
    if (!site) return;
    setBusy(true);
    const r = await supabase.from('sites').update({ deleted_at: new Date().toISOString() }).eq('id', site.id);
    setBusy(false);
    if (r.error) { fail(r.error); return; }
    say('ok', site.name + ' removed'); await reloadLookups(); onClose();
  }
  return (
    <Dialog title={site ? site.name : 'Add a site'} onClose={onClose}>
      {inp('Site', <Field value={name} onChange={setName} autoFocus onEnter={() => { if (name.trim()) save(); }} />, { req: true })}
      {note('Sites change straight away. People keep their site until it is changed on People and roles.')}
      <div style={css('display:flex;justify-content:space-between;gap:10px')}>
        <span>{site ? sb('Remove', 'd', { ic: 'trash', onClick: remove, disabled: busy }) : null}</span>
        {acts(<>{sb('Cancel', 's', { onClick: onClose })}{sb('Save', 'p', { onClick: save, disabled: busy || !name.trim(), title: name.trim() ? undefined : 'Type the site name' })}</>)}
      </div>
    </Dialog>
  );
}
function EmailDialog({ field, cfg, onClose }: { field: 'to' | 'subject' | 'footer'; cfg: Config; onClose: () => void }) {
  const [v, setV] = useState(field === 'to' ? cfg.email.to.join(', ') : cfg.email[field]);
  const list = v.split(/[,;\s]+/).map((x) => x.trim()).filter(Boolean);
  const badEmail = field === 'to' && (!list.length || list.some((x) => !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(x)));
  const lost = field === 'subject' ? placeholders(cfg.email.subject).filter((p) => !v.includes(p)) : [];
  const title = field === 'to' ? 'Send checks to' : field === 'subject' ? 'Email subject' : 'PDF footer';
  return (
    <Dialog title={title} onClose={onClose} w={460}>
      {inp(title, <Field value={v} onChange={setV} autoFocus />, { req: true })}
      {field === 'to' ? note('Separate addresses with commas.') : null}
      {field === 'subject' ? note('Placeholders in curly brackets are filled in by the app: {direction}, {stc}, {c}, {customer}, {date}, {damage}.') : null}
      {lost.length ? banner('warn', lost.join(', ') + (lost.length === 1 ? ' has been removed' : ' have been removed'), 'The subject loses that part.') : null}
      {acts(<>{sb('Cancel', 's', { onClick: onClose })}{sb('Save', 'p', {
        disabled: badEmail || !v.trim(), title: badEmail ? 'One of the addresses isn’t an email address' : !v.trim() ? 'Type something first' : undefined,
        onClick: () => { editDraft((c) => { if (field === 'to') c.email.to = list; else c.email[field] = v; }); onClose(); },
      })}</>)}
    </Dialog>
  );
}
