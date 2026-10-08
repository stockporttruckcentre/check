/* Starting a check: source/04 s1 (out or in), source/06 S_stock A to D (which trailer,
   two matches, not your trailer, what the stock sheet flags), source/05 S_states dup
   (duplicate stopped) and S_edge e2 (trailer not found). */
import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { css } from '../kit/css';
import { btn, footer, scroll, topbar, banner, sheet, stepRow, fleet, sg, kv, ic, saveInd } from '../kit/kit';
import { N, W, BL, MU, A, G, N05, PT, MO, A1 } from '../kit/tokens';
import { db, kvGet } from '../lib/db';
import { findExact, findStarting, findClose, repName, isMine, normKey, type Found } from '../lib/trailers';
import { useSession } from '../lib/session';
import { useConfig, getConfig } from '../lib/config';
import { detectType, typeName, stcLabel, tailLiftFitted, rearDoorsFitted, motExpired, dirWord, steps as stepList, percent } from '../lib/check';
import { dayMonYear, time } from '../lib/format';
import { fill } from '../data/defaults';
import { uuid } from '../lib/ids';
import type { Check, Direction, Trailer, TrailerTypeId, OldPin } from '../data/types';
import { screen } from './Places';
import { useOnline } from './useCheck';

export function ChooseDirection() {
  const nav = useNavigate();
  const cards: [Direction, string, string, string][] = [['OUT', 'Check out', 'It’s leaving us', 'send'], ['IN', 'Check in', 'It’s coming back to us', 'undo']];
  return (
    <div style={css(screen)}>
      {topbar('New check', { close: true, onBack: () => nav('/') })}
      {scroll(<>
        <div style={css('font-family:' + PT + ';font-weight:800;font-size:26px;letter-spacing:-0.03em')}>Is the trailer going out or coming back?</div>
        <div style={css('display:flex;flex-direction:column;gap:12px')}>
          {cards.map((c) => (
            <button key={c[0]} type="button" className="k-tap k-reset" onClick={() => nav('/new/' + c[0].toLowerCase())}
              style={css('min-height:120px;padding:18px;border-radius:12px;border:2px solid ' + N + ';background:' + W + ';display:flex;align-items:center;gap:16px;width:100%;color:' + N)}>
              <span style={css('width:60px;height:60px;border-radius:10px;background:' + N05 + ';display:flex;align-items:center;justify-content:center')}>{ic(c[3], 32, N)}</span>
              <span><span style={css('display:block;font-family:' + PT + ';font-weight:800;font-size:24px')}>{c[1]}</span><span style={css('font-size:16px;color:' + MU)}>{c[2]}</span></span>
            </button>
          ))}
        </div>
        <div style={css('font-size:15px;color:' + MU + ';line-height:1.45')}>Not sure? If the customer is collecting it, it&rsquo;s a check out.</div>
      </>)}
    </div>
  );
}

/* The match card (source/06 trailerMatch), built from the real stock sheet row. */
export function trailerMatch(f: Found, o: { warn?: boolean; rep?: string | null; mine?: boolean } = {}) {
  const t = f.t;
  if (t.no_stc) o = { ...o, warn: true };
  const cfg = getConfig().config;
  const type = detectType(t, cfg);
  const axleWord = t.axle_count === 3 ? 'tri axle' : t.axle_count === 2 ? 'tandem axle' : t.axle_count === 1 ? 'single axle' : '';
  const rows: [string, string, string?][] = [];
  if (t.no_stc) rows.push(['STC number', 'None yet', A]);
  if (t.c_no) rows.push(['C number', t.c_no]);
  if (t.side_aperture) rows.push(['Side aperture', t.side_aperture]);
  if (t.colour) rows.push(['Colour', t.colour]);
  if (t.door_type) rows.push(['Doors', t.door_type]);
  if (t.axle_type || axleWord) rows.push(['Axles', [t.axle_type, axleWord].filter(Boolean).join(', ')]);
  rows.push(['MOT', t.mot_date ? dayMonYear(t.mot_date) : t.mot_text || 'Not on the sheet']);
  if (t.location) rows.push(['Location', t.location]);
  if (o.rep !== undefined && o.rep !== null) rows.push(['Sales rep', o.rep + (o.mine ? ' (you)' : ''), o.mine ? '' : A]);
  if (t.on_hire && t.hire_customer) rows.push(['On hire to', t.hire_customer]);
  return (
    <div style={css('border:2px solid ' + (o.warn ? A : G) + ';border-radius:10px;background:' + W + ';padding:16px')}>
      <div style={css('display:flex;justify-content:space-between;align-items:center;gap:10px')}>{fleet(stcLabel(t.stc_no))}{sg(o.warn ? 'warn' : 'done', 30)}</div>
      <div style={css('font-size:13px;color:' + MU + ';margin-top:8px')}>Found by {f.by}</div>
      <div style={css('font-family:' + PT + ';font-weight:800;font-size:20px;margin-top:6px')}>{[t.year, t.make, (t.description && t.description.length < 40 ? t.description : typeName(type, cfg).toLowerCase())].filter(Boolean).join(' ')}</div>
      {kv(rows)}
    </div>
  );
}

/* A typed STC number is kept as the stock sheet keeps it, digits only, so "STC 999123" is not shown as "STC STC 999123". */
const typedNo = (q: string) => { const v = q.trim().toUpperCase().replace(/\s+/g, ' '); return /^STC\s?\d+$/.test(v) ? v.replace(/\D/g, '') : v; };

type Stage = 'find' | 'flags' | 'notmine' | 'dup' | 'notfound' | 'nostc' | 'again';
type Gate = 'nostc' | 'again' | 'notmine' | 'flags';
interface Last { at: string; by: string | null; ref: string | null; direction: Direction }

/** The last check that went off for a trailer, from this phone or the office, whichever is newer. */
async function lastDone(key: string): Promise<Last | null> {
  /* "STC 999123", "STC999123" and "999123" are the same trailer. */
  const k = normKey(key.replace(/^NOSTC-/, ''));
  const same = (x: string) => normKey(x.replace(/^NOSTC-/, '')) === k;
  const mine = (await db.checks.filter((c) => same(c.stcNo) && c.status !== 'draft' && !!c.sentAt).toArray())
    .sort((a, b) => (b.sentAt || '').localeCompare(a.sentAt || ''))[0];
  const office = (await db.lastChecks.filter((x) => same(x.stc_no)).toArray()).sort((a, b) => b.sent_at.localeCompare(a.sent_at))[0];
  const a: Last | null = mine ? { at: mine.sentAt!, by: mine.userName, ref: mine.ref, direction: mine.direction } : null;
  const b: Last | null = office ? { at: office.sent_at, by: office.person_name || null, ref: office.ref || null, direction: office.direction as Direction } : null;
  if (!a) return b;
  if (!b) return a;
  return a.at >= b.at ? a : b;
}

/* Check out and check in share this screen, so switching between them starts it afresh. */
export function FindTrailer() {
  const { dir } = useParams();
  return <Find key={dir} />;
}

function Find() {
  const { dir } = useParams();
  const direction: Direction = dir === 'in' ? 'IN' : 'OUT';
  const nav = useNavigate();
  const { user } = useSession();
  const { config, number } = useConfig();
  const online = useOnline();
  const [q, setQ] = useState('');
  const [exact, setExact] = useState<Found[] | null>(null);
  const [starting, setStarting] = useState<Found[]>([]);
  const [close, setClose] = useState<Found[]>([]);
  const [pick, setPick] = useState<Found | null>(null);
  const [stage, setStage] = useState<Stage>('find');
  const [dup, setDup] = useState<Check | null>(null);
  const [passed, setPassed] = useState<Gate[]>([]);
  const [last, setLast] = useState<Last | null>(null);
  const [typing, setTyping] = useState(false);
  const [people, setPeople] = useState<{ name: string; aliases: string[] }[]>([]);
  const [count, setCount] = useState<number | null>(null);
  useEffect(() => { kvGet<{ name: string; aliases: string[] }[]>('people').then((p) => setPeople(p || [])); db.trailers.count().then(setCount); }, []);

  useEffect(() => {
    let on = true;
    const t = setTimeout(async () => {
      const [e, s] = await Promise.all([findExact(q), findStarting(q)]);
      if (!on) return;
      setExact(q.trim() ? e : null); setStarting(s);
      if (e.length === 1) setPick(e[0]); else setPick(null);
      setClose(q.trim() && !e.length && !s.length ? await findClose(q) : []);
    }, 150);
    return () => { on = false; clearTimeout(t); };
  }, [q]);

  if (!user) return null;
  const me = { name: user.name, aliases: user.aliases };
  const site = user.siteName === 'All sites' ? 'Carrington' : user.siteName;

  function fullName(rep: string) {
    const r = rep.toLowerCase();
    const p = people.find((x) => x.name.toLowerCase() === r || x.name.split(' ')[0].toLowerCase() === r.split(' ')[0] || x.aliases.some((a) => a.toLowerCase() === r));
    return p ? p.name : rep;
  }

  function flagsFor(t: Trailer) {
    const out: { k: 'err' | 'warn'; title: string; body: string }[] = [];
    if (direction === 'OUT' && motExpired(t)) out.push({ k: 'err', title: t.mot_date ? 'MOT ran out on ' + dayMonYear(t.mot_date) : 'MOT has run out', body: 'It can’t go out on hire like this. Tell the workshop.' });
    if (t.location && !t.location.toLowerCase().includes(site.toLowerCase())) out.push({ k: 'warn', title: 'Stock sheet says ' + t.location, body: 'You’re at ' + site + '. Carry on and the office will update it.' });
    /* From the business: on a sales order, on the Sold List or out on hire, a check out is expected. Otherwise ask. Check ins never ask. */
    if (direction === 'OUT' && !(t.on_sales_order || t.sold || t.on_hire)) out.push({ k: 'warn', title: config.wording.unexpected_out, body: config.wording.unexpected_out_body });
    return out;
  }

  /* Each question is asked once, in this order, and only if it applies:
     no STC number yet, already done the same way last time, not your trailer, what the stock sheet flags. */
  async function confirm(f: Found | null, pass: Gate[] = []) {
    const key = f ? f.t.stc_no : typedNo(q);
    if (!pass.length) {
      /* Two checks of the same type on one trailer: the second is stopped (source/05 dup). */
      const open = await db.checks.filter((c) => normKey(c.stcNo.replace(/^NOSTC-/, '')) === normKey(key.replace(/^NOSTC-/, '')) && c.status === 'draft' && c.direction === direction).first();
      if (open) { setDup(open); setStage('dup'); return; }
    }
    const done = await lastDone(key);
    const rep = f ? repName(f.t, direction) : null;
    const gates: Gate[] = [];
    if (f?.t.no_stc) gates.push('nostc');
    /* From the business: a trailer checked out last time should be checked in next, and the other way round. */
    if (done && done.direction === direction) gates.push('again');
    if (f && rep && !isMine(rep, me) && config.alerts.notYourTrailer !== false) gates.push('notmine');
    if (f && flagsFor(f.t).length) gates.push('flags');
    const next = gates.find((g) => !pass.includes(g));
    setPassed(pass); setLast(done);
    if (next) { setStage(next); return; }
    if (!f) { setStage('notfound'); return; }
    await start(f.t, null, done);
  }

  async function start(t: Trailer | null, typedType: TrailerTypeId | null, done: Last | null = last) {
    const id = uuid();
    const now = new Date().toISOString();
    const type = typedType || detectType(t, config);
    const last = t ? await db.lastChecks.get(t.stc_no) : undefined;
    const oldPins: OldPin[] = (last?.pins || []).map((p, i) => ({ id: p.id, letter: String.fromCharCode(65 + i), view: p.view as OldPin['view'], x: p.x, y: p.y, zone: p.zone, type: p.type, note: p.note, since: p.since }));
    const rep = t ? repName(t, direction) : null;
    const flags: Check['flags'] = {};
    if (t && rep && !isMine(rep, me)) flags.notYourTrailer = fullName(rep);
    if (t) {
      const fl = flagsFor(t);
      if (fl.some((x) => x.title.startsWith('MOT'))) flags.motExpired = t.mot_date || t.mot_text || 'expired';
      if (fl.some((x) => x.title.startsWith('Stock sheet says'))) flags.wrongSite = t.location || '';
      if (fl.some((x) => x.title === config.wording.unexpected_out)) flags.unexpected = true;
    } else flags.notOnSheet = true;
    if (t?.no_stc) flags.noStcNumber = true;
    if (done && done.direction === direction) flags.repeat = done.ref || done.at;
    const hire = direction === 'OUT' && t?.on_hire && t.hire_customer;
    const c: Check = {
      id, ref: null, userId: user!.personId, userName: user!.name, userRole: user!.roleName, siteId: user!.siteId || '', siteName: site,
      direction, stcNo: t ? t.stc_no : typedNo(q), cNo: t?.c_no || null, onStockSheet: !!t, trailer: t, trailerType: type,
      axles: t?.axle_count || null, tailLift: tailLiftFitted(t), rearDoors: rearDoorsFitted(t),
      customer: (hire ? t!.hire_customer : t?.customer) || '', customerSource: hire ? 'fleet' : t?.customer ? 'stock' : 'typed',
      collectingReg: '', accountNo: '', orderNo: '', ratePerWeek: hire && t!.hire_rate ? '£' + t!.hire_rate : '', rateSource: hire && t!.hire_rate ? 'fleet' : 'typed', replacementValue: '',
      flags, configVersion: number, status: 'draft', version: 1, parentId: null,
      damageAnswer: null, pins: [], oldPins, nextPin: 1, items: {}, tyres: {}, readings: {}, readingNotes: {}, straps: null, seal: '', doorsLock: false, cleanliness: null,
      signature: null, signedAt: null, notes: '', createdAt: now, updatedAt: now, sentAt: null, currentStep: 'trailer', corrections: [],
    };
    await db.checks.put(c);
    nav('/check/' + id + '/trailer', { replace: true });
  }

  const match = pick || (exact && exact.length === 1 ? exact[0] : null);
  const bar = topbar('Which trailer?', { sub: dirWord(direction), save: online ? 'saved' : 'off', onBack: () => (stage === 'find' ? nav('/new') : setStage('find')) });
  const field = (
    <>
      <label htmlFor="tn" style={css('font-weight:700;font-size:16px')}>Trailer number</label>
      <input id="tn" autoFocus value={q} onChange={(e) => setQ(e.target.value)} autoCapitalize="characters" autoComplete="off" inputMode="text" placeholder="e.g. C10772"
        style={css('min-height:64px;display:flex;align-items:center;padding:0 16px;border-radius:8px;background:' + W + ';border:3px solid ' + (exact && !exact.length && !starting.length ? '#CF2417' : N) + ';font-family:' + MO + ';font-weight:800;font-size:26px;letter-spacing:0.04em;color:' + N + ';outline:none;width:100%')} />
      <div style={css('font-size:14px;color:' + MU + ';margin-top:-4px')}>Any number works: STC, C, chassis, ministry or supplier.</div>
    </>
  );

  if (stage === 'dup' && dup) {
    const p = percent(stepList(dup, getConfig().config, []));
    return (
      <div style={css(screen)}>
        {bar}{scroll(<div style={css('height:64px;border-radius:8px;border:3px solid ' + N + ';background:' + W + ';display:flex;align-items:center;padding:0 16px;font-family:' + MO + ';font-weight:800;font-size:26px')}>{q}</div>)}
        {sheet(<>
          <div style={css('font-family:' + PT + ';font-weight:800;font-size:22px')}>There&rsquo;s already an unfinished {dirWord(direction).toLowerCase()} for {dup.cNo || stcLabel(dup.stcNo)}</div>
          <div style={css('font-size:17px;line-height:1.45')}>Started by {dup.userId === user.personId ? 'you' : dup.userName} at {time(dup.createdAt)}, {p.done} of {p.total} steps done.</div>
          {btn('Carry on with that one', 'p', { onClick: () => nav('/check/' + dup.id, { replace: true }) })}
          {btn('Start again (deletes it)', 'dg', { h: 56, onClick: async () => { await db.checks.delete(dup.id); await db.photos.where('checkId').equals(dup.id).modify({ removedAt: new Date().toISOString() }); setDup(null); setStage('find'); } })}
        </>, { onClose: () => setStage('find') })}
      </div>
    );
  }

  if (stage === 'nostc' && match) {
    return (
      <div style={css(screen)}>
        {bar}
        {scroll(trailerMatch(match, { warn: true }), 'gap:10px')}
        {sheet(<>
          <div style={css('font-family:' + PT + ';font-weight:800;font-size:22px;letter-spacing:-0.02em')}>No STC number yet</div>
          <div style={css('font-size:16px;line-height:1.45')}>The stock sheet has {stcLabel(match.t.stc_no)}{match.t.tab ? ' on ' + match.t.tab : ''} with no STC number. A trailer usually needs its STC number before it&rsquo;s {direction === 'IN' ? 'checked in' : 'checked out'}.</div>
          <div style={css('font-size:16px;line-height:1.45')}>Ask the office to add it to the stock sheet, then search again.</div>
          {btn('Pick another trailer', 'p', { onClick: () => { setStage('find'); setQ(''); setPassed([]); } })}
          {btn('Carry on without one', 's', { h: 56, onClick: () => confirm(match, [...passed, 'nostc']) })}
        </>, { onClose: () => { setStage('find'); setPassed([]); }, label: 'No STC number yet' })}
      </div>
    );
  }

  if (stage === 'again' && last) {
    const shown = match ? (match.t.c_no || stcLabel(match.t.stc_no)) : stcLabel(typedNo(q));
    const other = direction === 'OUT' ? 'checked in' : 'checked out';
    return (
      <div style={css(screen)}>
        {bar}
        {scroll(match ? trailerMatch(match, { warn: true }) : <div style={css('height:64px;border-radius:8px;border:3px solid ' + N + ';background:' + W + ';display:flex;align-items:center;padding:0 16px;font-family:' + MO + ';font-weight:800;font-size:26px')}>{q}</div>, 'gap:10px')}
        {sheet(<>
          <div style={css('font-family:' + PT + ';font-weight:800;font-size:22px;letter-spacing:-0.02em')}>{shown} was {direction === 'OUT' ? 'checked out' : 'checked in'} on {dayMonYear(last.at)} at {time(last.at)}</div>
          <div style={css('font-size:16px;line-height:1.45')}>{last.by ? 'By ' + (last.by === user.name ? 'you' : last.by) : 'From this app'}{last.ref ? ', ref ' + last.ref : ''}. It hasn&rsquo;t been {other} since.</div>
          <div style={css('font-size:16px;line-height:1.45')}>Carry on only if this is a new {dirWord(direction).toLowerCase()}. The office will see it flagged.</div>
          {btn('Pick another trailer', 'p', { onClick: () => { setStage('find'); setQ(''); setPassed([]); } })}
          {btn('Carry on anyway', 's', { h: 56, onClick: () => confirm(match, [...passed, 'again']) })}
        </>, { onClose: () => { setStage('find'); setPassed([]); }, label: 'Already done' })}
      </div>
    );
  }

  if (stage === 'notfound' || typing) {
    return (
      <div style={css(screen)}>
        {bar}
        {scroll(<>
          <div style={css('height:64px;border-radius:8px;border:3px solid #CF2417;background:' + W + ';display:flex;align-items:center;padding:0 16px;font-family:' + MO + ';font-weight:800;font-size:26px')}>{q}</div>
          {banner('warn', 'Not on the stock sheet', 'The check can still go ahead. The office will see it flagged "Not on stock sheet".')}
        </>)}
        {sheet(<>
          <div style={css('font-family:' + PT + ';font-weight:800;font-size:22px')}>Trailer type</div>
          {config.trailerTypes.map((t) => (
            <button key={t.id} type="button" className="k-tap k-reset" onClick={() => start(null, t.id)}
              style={css('min-height:60px;display:flex;align-items:center;gap:14px;padding:0 6px;border-bottom:1px solid ' + BL + ';font-size:18px;font-weight:500;background:transparent;border-left:0;border-right:0;border-top:0;width:100%;color:' + N)}>
              <span style={css('width:26px;height:26px;border-radius:50%;border:2px solid #A3A39D')} />{t.name}
            </button>
          ))}
        </>, { onClose: () => { setTyping(false); setStage('find'); }, label: 'Trailer type' })}
      </div>
    );
  }

  if (stage === 'notmine' && match) {
    const rep = repName(match.t, direction)!;
    const full = fullName(rep);
    return (
      <div style={css(screen)}>
        {topbar('Which trailer?', { sub: dirWord(direction), onBack: () => setStage('find') })}
        {scroll(trailerMatch(match, { rep: full, warn: true }), 'gap:10px')}
        {sheet(<>
          <div style={css('font-family:' + PT + ';font-weight:800;font-size:22px;letter-spacing:-0.02em')}>{fill(config.wording.not_your_trailer, { rep: full })}</div>
          <div style={css('font-size:16px;line-height:1.45;margin-top:8px')}>The stock sheet has {full.split(' ')[0]} as the sales rep for {stcLabel(match.t.stc_no)}. You&rsquo;re signed in as {user.name}.</div>
          <div style={css('font-size:16px;line-height:1.45;margin-top:8px')}>{dirWord(direction).replace('Check', 'Check it')} anyway?</div>
          <div style={css('display:flex;flex-direction:column;gap:10px;margin-top:18px')}>
            {btn('Yes, carry on', 'p', { onClick: () => confirm(match, [...passed, 'notmine']) })}
            {btn('Pick another trailer', 's', { onClick: () => { setStage('find'); setQ(''); setPassed([]); } })}
          </div>
          <div style={css('font-size:13px;color:' + MU + ';margin-top:12px')}>If you carry on, {full.split(' ')[0]} gets a message and it&rsquo;s noted on the record.</div>
        </>, { onClose: () => setStage('find') })}
      </div>
    );
  }

  if (stage === 'flags' && match) {
    return (
      <div style={css(screen)}>
        {bar}
        {scroll(<>{flagsFor(match.t).map((f, i) => <div key={i}>{banner(f.k, f.title, f.body)}</div>)}</>, 'gap:10px')}
        {footer(<>{btn('Carry on anyway', 's', { onClick: () => confirm(match, [...passed, 'flags']) })}{btn('Pick another trailer', 'g', { onClick: () => { setStage('find'); setQ(''); setPassed([]); } })}</>)}
      </div>
    );
  }

  /* Find (A), more than one match (B), not found with close matches (e2). */
  const many = exact && exact.length > 1 ? exact : null;
  const none = !!q.trim() && exact !== null && !exact.length && !starting.length;
  return (
    <div style={css(screen)}>
      {bar}
      {scroll(<>
        {count === 0 ? banner('warn', 'The stock sheet isn’t on this phone yet', online ? 'It’s downloading. Give it a few seconds.' : 'Find signal so it can download. You can still type the trailer in.') : null}
        {field}
        {many ? <>
          <div style={css('font-weight:700;font-size:16px')}>{many.length} trailers match. Which one?</div>
          {many.map((f) => (
            <button key={f.t.stc_no} type="button" className="k-tap k-reset" onClick={() => { setPick(f); }}
              style={css('min-height:72px;display:flex;align-items:center;justify-content:space-between;gap:10px;padding:12px 14px;border-radius:8px;background:' + W + ';border:2px solid ' + (pick === f ? N : BL) + ';font-size:15px;line-height:1.35;width:100%;color:' + N + ';text-align:left')}>
              <span><b>{stcLabel(f.t.stc_no)}</b> &middot; {f.by === 'C number' ? f.matched : f.by.replace(' number', '').replace(/^./, (x) => x.toUpperCase()) + ' ' + f.matched}<br />
                <span style={css('color:' + MU)}>{[f.t.year, f.t.make, f.t.model].filter(Boolean).join(' ')}{f.t.colour ? ' · ' + f.t.colour : ''}</span></span>{ic('chev', 20)}
            </button>
          ))}
          <div style={css('font-size:14px;color:' + MU)}>Each result says which number matched, so a C number and a ministry number that look alike can&rsquo;t be mixed up.</div>
        </> : null}
        {!many && match ? trailerMatch(match, { rep: repName(match.t, direction) ? fullName(repName(match.t, direction)!) : undefined, mine: !!repName(match.t, direction) && isMine(repName(match.t, direction)!, me) }) : null}
        {!many && !match && starting.length ? (
          <div style={css('margin-top:6px;border:1px solid ' + BL + ';border-radius:8px;background:' + W + ';overflow:hidden')}>
            {starting.map((f, i) => {
              const key = q.trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
              const shown = f.matched.toUpperCase();
              const at = shown.replace(/[^A-Z0-9]/g, '').indexOf(key.replace(/^(STC|C)(?=\d)/, ''));
              return (
                <button key={f.t.stc_no} type="button" className="k-tap k-reset" onClick={() => setQ(f.matched)}
                  style={css('min-height:64px;display:flex;align-items:center;gap:12px;padding:10px 16px;width:100%;background:transparent;border:0;color:' + N + ';text-align:left;' + (i ? 'border-top:1px solid ' + BL : ''))}>
                  <span style={css('font-family:' + MO + ';font-weight:800;font-size:20px')}>{at >= 0 ? <><b style={css('background:' + A1)}>{shown.slice(0, at + key.replace(/^(STC|C)(?=\d)/, '').length)}</b>{shown.slice(at + key.replace(/^(STC|C)(?=\d)/, '').length)}</> : shown}</span>
                  <span style={css('flex:1;font-size:14px;color:' + MU + ';line-height:1.3')}>{typeName(detectType(f.t, config), config)}{f.t.location ? ' · ' + f.t.location : ''}<br />{f.t.on_hire ? 'Out to ' + (f.t.hire_customer || 'a customer') : stcLabel(f.t.stc_no)}</span>{ic('chev', 22, MU)}
                </button>
              );
            })}
          </div>
        ) : null}
        {none ? <>
          {banner('err', q.trim().toUpperCase() + ' isn’t on the fleet list', 'Check the number on the front of the trailer.' + (close.length ? ' Did you mean one of these?' : ''))}
          {close.map((f) => <div key={f.t.stc_no}>{stepRow(f.matched, typeName(detectType(f.t, config), config) + (f.t.on_hire ? ' · out to ' + (f.t.hire_customer || 'a customer') : f.t.location ? ' · ' + f.t.location : ''), 'todo', { onClick: () => setQ(f.matched) })}</div>)}
        </> : null}
      </>, 'gap:10px')}
      {footer(match
        ? btn('Yes, this is the trailer', 'p', { onClick: () => confirm(match) })
        : none
          ? btn('Trailer not on the list', 's', { h: 56, onClick: () => confirm(null) })
          : btn(many ? 'Pick one of them' : 'Type the trailer number', 'p', { title: 'Type a number first', onClick: () => document.getElementById('tn')?.focus() }))}
    </div>
  );
}
void saveInd;
