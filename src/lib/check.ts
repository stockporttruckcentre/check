/* The rules of a check, in one place: what applies to a trailer, what is done,
   what is missing, what everything is called. Screens, the PDF, the zip and the
   office all read these functions, so they cannot disagree. */
import type { Check, Config, Trailer, TrailerTypeId, ShotDef, ItemDef, ReadingDef, StepId, PhotoMeta, Zone } from '../data/types';
import type { View, Drawing } from '../kit/drawings';
import { applies, fill } from '../data/defaults';
import { isoDate } from './format';

/* ---------------- What the trailer is ---------------- */

export function detectType(t: Trailer | null, config: Config): TrailerTypeId {
  if (!t) return 'curtainsider';
  const known = (t as Trailer & { trailer_type?: string | null }).trailer_type;
  if (known && config.trailerTypes.some((x) => x.id === known)) return known as TrailerTypeId;
  const text = ((t.model || '') + ' ' + (t.description || '')).toLowerCase();
  for (const tt of config.trailerTypes) {
    try { if (new RegExp(tt.match, 'i').test(text)) return tt.id; } catch { /* a bad pattern typed in the office is skipped */ }
  }
  return 'curtainsider';
}
export function drawingFor(type: TrailerTypeId, config: Config): Drawing {
  return config.trailerTypes.find((x) => x.id === type)?.drawing || 'trailer';
}
export function typeName(type: TrailerTypeId, config: Config): string {
  return config.trailerTypes.find((x) => x.id === type)?.name || type;
}
export function tailLiftFitted(t: Trailer | null): boolean {
  return !!t && /tail ?lift|\bt\/l\b/i.test((t.model || '') + ' ' + (t.description || ''));
}
export function rearDoorsFitted(t: Trailer | null): boolean {
  if (!t) return true;
  const d = (t.door_type || '').trim().toLowerCase();
  if (!d) return true;
  return !/^(none|no doors|n\/a|na)$/.test(d) && !/no doors/i.test(t.description || '');
}
export const motExpired = (t: Trailer | null, now = new Date()) =>
  !!t && ((t.mot_date && new Date(t.mot_date + 'T23:59:59') < now) || /expired/i.test(t.mot_text || ''));

/* ---------------- Names ---------------- */

/** "STC 145746", the way the pack writes an STC number on screen. A trailer with no STC number yet shows the number it has. */
export const stcLabel = (stcNo: string) => (/^\d+$/.test(stcNo) ? 'STC ' + stcNo : stcNo.replace(/^NOSTC-/, ''));
/** "STC145746", the way it starts every file name. */
export const stcFile = (stcNo: string) => (/^\d+$/.test(stcNo) ? 'STC' + stcNo : stcNo.replace(/^NOSTC-/, '').replace(/\s+/g, ''));
/** The number painted on the trailer that the yard reads first: the C number where there is one. */
export const fleetTag = (c: Pick<Check, 'cNo' | 'stcNo'>) => c.cNo || stcLabel(c.stcNo);
export const dirWord = (d: 'OUT' | 'IN') => (d === 'OUT' ? 'Check out' : 'Check in');

const hyph = (s: string) => s.trim().replace(/[^A-Za-z0-9]+/g, '-').replace(/^-|-$/g, '');

export function baseName(c: Check, at?: string) {
  return stcFile(c.stcNo) + '_' + c.direction + '_' + isoDate(at || c.signedAt || c.createdAt);
}
/** {STCNo}_{OUT|IN}_{YYYY-MM-DD}_{Section}{nn}_{Label}_{shot}.jpg (README, File naming). */
export function photoFileName(c: Check, section: 'P' | 'D' | 'T' | 'R', nn: number, label: string, shot: number | null) {
  return baseName(c) + '_' + section + String(nn).padStart(2, '0') + '_' + label.split('_').map(hyph).filter(Boolean).join('_') + (shot ? '_' + shot : '') + '.jpg';
}
const v2 = (c: Check) => (c.version > 1 ? '_v' + c.version : '');
export const reportName = (c: Check) => baseName(c) + '_Report' + v2(c) + '.pdf';
export const detailsName = (c: Check) => baseName(c) + '_Details' + v2(c) + '.csv';
export const zipName = (c: Check) => baseName(c) + '_' + hyph(c.customer || 'No-customer') + v2(c) + '.zip';

/* ---------------- Where a pin is ---------------- */

export const VIEW_NAMES: Record<View, string> = { ns: 'Nearside', os: 'Offside', front: 'Front', rear: 'Rear', roof: 'Roof' };
export const VIEW_SHORT: Record<View, string> = { ns: 'NS', os: 'OS', front: 'Front', rear: 'Rear', roof: 'Roof' };
export function zoneOf(view: View, x: number, y: number, config: Config): string {
  const z: Zone | undefined = (config.zones[view] || []).find((r) => x >= r.x0 && x <= r.x1 && y >= r.y0 && y <= r.y1);
  return z ? VIEW_NAMES[view] + ', ' + z.name : VIEW_NAMES[view];
}
/** "NS-rear-axles" for file names. */
export function zoneFileLabel(view: View, zone: string) {
  const rest = zone.includes(',') ? zone.split(',').slice(1).join(',') : '';
  return hyph(VIEW_SHORT[view] + (rest ? ' ' + rest : ''));
}
export function damageName(code: string | null, config: Config) {
  return config.damageTypes.find((d) => d.code === code)?.name || '';
}

/* ---------------- What applies ---------------- */

export interface Shot { id: string; label: string; title: string; guide: string; frame?: string; section: 'P' | 'T'; nn: number }
export function shotsFor(c: Check, config: Config): Shot[] {
  const list: Shot[] = [];
  let n = 0;
  config.shots.forEach((s: ShotDef) => {
    if (!applies(s.types, c.trailerType)) return;
    n++;
    list.push({ id: s.id, label: s.label, title: s.id === 'nsf' ? 'Front corner, nearside' : s.label, guide: s.guide, frame: s.frame, section: 'P', nn: n });
  });
  return list;
}
/** One photo per axle per side, so a tri-axle needs 6 (source/04 S_adapt). */
export function tyreShots(c: Check): Shot[] {
  const axles = c.axles || 0;
  const out: Shot[] = [];
  let n = 0;
  (['NS', 'OS'] as const).forEach((side) => {
    for (let a = 1; a <= axles; a++) {
      n++;
      out.push({ id: 'tyre_' + side.toLowerCase() + '_' + a, label: side + ' ' + a, title: (side === 'NS' ? 'Nearside' : 'Offside') + ' tyre, axle ' + a, guide: '', section: 'T', nn: n });
    }
  });
  return out;
}
export function itemsFor(c: Check, config: Config): ItemDef[] {
  return config.items.filter((i) => !i.hidden && applies(i.types, c.trailerType, i.fitted === 'tail_lift' ? c.tailLift : i.fitted === 'rear_doors' ? c.rearDoors : false));
}
export function readingsFor(c: Check, config: Config): ReadingDef[] {
  return config.readings.filter((r) => applies(r.types, c.trailerType));
}
export const strapsApply = (c: Check, config: Config) => applies(config.strapsTypes, c.trailerType);
export const tyreKeys = (c: Check) => tyreShots(c).map((s) => s.id.replace('tyre_', ''));

/* ---------------- Progress ---------------- */

export type StepState = 'done' | 'todo' | 'miss' | 'lock';
export interface StepStatus { id: StepId; name: string; sub: string; state: StepState; missing: { text: string; step: StepId; target?: string }[]; required: boolean }

export function photoFor(photos: PhotoMeta[], section: 'P' | 'T' | 'D', refId: string, shot = 1) {
  return photos.find((p) => p.section === section && p.refId === refId && p.shot === shot && !p.removedAt);
}

export function steps(c: Check, config: Config, photos: PhotoMeta[], tried = false): StepStatus[] {
  const out: StepStatus[] = [];
  for (const s of config.steps) {
    if (!s.enabled) continue;
    const st: StepStatus = { id: s.id, name: s.name, sub: '', state: 'todo', missing: [], required: true };
    if (s.id === 'trailer') {
      if (!c.customer.trim()) st.missing.push({ text: 'No customer', step: 'trailer' });
      if (!c.collectingReg.trim()) st.missing.push({ text: 'No collecting vehicle reg', step: 'trailer' });
      st.sub = fleetTag(c) + (c.customer ? ' · ' + c.customer : '');
    } else if (s.id === 'photos') {
      const all = [...shotsFor(c, config), ...tyreShots(c)];
      const done = all.filter((x) => photoFor(photos, x.section, x.id));
      all.filter((x) => !photoFor(photos, x.section, x.id)).forEach((x) => st.missing.push({ text: 'Photo: ' + x.label, step: 'photos', target: x.id }));
      if (!c.axles) st.missing.push({ text: 'Tyre photos: how many axles?', step: 'tyres' });
      st.sub = done.length + ' of ' + all.length + ' taken';
    } else if (s.id === 'damage') {
      const live = c.pins.filter((p) => !p.removedAt);
      if (c.damageAnswer === null) st.missing.push({ text: 'Damage: yes or no', step: 'damage' });
      live.forEach((p) => {
        if (!p.type) st.missing.push({ text: 'Damage ' + p.number + ': what kind', step: 'damage', target: p.id });
        if (!photoFor(photos, 'D', p.id, 1)) st.missing.push({ text: 'Damage ' + p.number + ': close-up', step: 'damage', target: p.id });
        if (!photoFor(photos, 'D', p.id, 2)) st.missing.push({ text: 'Damage ' + p.number + ': wide shot', step: 'damage', target: p.id });
      });
      if (c.direction === 'IN') c.oldPins.filter((o) => !o.verdict).forEach((o) => st.missing.push({ text: 'Damage ' + o.letter + ': still there or repaired', step: 'damage', target: o.id }));
      const old = c.oldPins.length;
      st.sub = c.damageAnswer === 'none' && !live.length ? 'No damage' : live.length ? live.length + (live.length === 1 ? ' mark recorded' : ' marks recorded') + (old ? ' · ' + old + ' old' : '') : old ? old + ' on record' : 'Required';
    } else if (s.id === 'items') {
      const items = itemsFor(c, config);
      const answered = items.filter((i) => c.items[i.id]);
      items.forEach((i) => {
        if (i.required && !c.items[i.id]) st.missing.push({ text: i.name, step: 'items', target: i.id });
        if (c.items[i.id] === 'damaged' && i.photoIfDamaged && !c.pins.some((p) => !p.removedAt && p.itemId === i.id))
          st.missing.push({ text: i.name + ': mark the damage', step: 'damage', target: i.id });
      });
      st.sub = answered.length + ' of ' + items.length + ' done';
    } else if (s.id === 'tyres') {
      if (!c.axles) { st.missing.push({ text: 'Tyres: how many axles?', step: 'tyres' }); st.sub = 'Required'; }
      else {
        const keys = tyreKeys(c);
        keys.filter((k) => c.tyres[k]?.depth == null).forEach((k) => st.missing.push({ text: 'Tyres: ' + (k.startsWith('ns') ? 'nearside' : 'offside') + ' axle ' + k.split('_')[1], step: 'tyres', target: k }));
        const n = keys.filter((k) => c.tyres[k]?.depth != null).length;
        st.sub = n ? n + ' of ' + keys.length + ' readings' : 'Required';
      }
    } else if (s.id === 'readings') {
      const rs = readingsFor(c, config);
      rs.forEach((r) => { if (r.required && c.readings[r.id] == null) st.missing.push({ text: r.name, step: 'readings', target: r.id }); });
      if (!rs.length && !strapsApply(c, config)) { st.required = false; }
      st.sub = rs.map((r) => r.name).join(', ');
    } else if (s.id === 'seals') {
      if (!c.cleanliness) st.missing.push({ text: 'How clean is it?', step: 'seals' });
      st.sub = c.cleanliness || '';
    } else if (s.id === 'sign') {
      st.sub = c.signature ? (c.userName + ' · ' + (c.signedAt ? new Date(c.signedAt).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }) : '')) : 'Staff signature';
    }
    out.push(st);
  }
  const before = out.filter((x) => x.id !== 'sign');
  out.forEach((x) => {
    if (x.id === 'sign') x.state = c.signature ? 'done' : before.some((b) => b.missing.length) ? 'lock' : 'todo';
    else x.state = !x.missing.length ? 'done' : tried ? 'miss' : 'todo';
  });
  /* A step with nothing yet done shows its own state. Damage with no answer is to do, not done. */
  return out;
}

export function missingAll(st: StepStatus[]) { return st.filter((s) => s.id !== 'sign').flatMap((s) => s.missing); }
export function percent(st: StepStatus[]) {
  const total = st.length;
  const done = st.filter((s) => s.state === 'done').length;
  return { done, total, pct: total ? Math.round((done / total) * 100) : 0 };
}
export function missingText(st: StepStatus[], config: Config) {
  const m = missingAll(st);
  return fill(config.wording.missing || '{n} things left. {list}', { n: m.length, list: m.slice(0, 3).map((x) => x.text).join('. ') + (m.length ? '.' : '') });
}

/* ---------------- The email subject (README, Email and PDF) ---------------- */
export function subjectFor(c: Check, config: Config) {
  const nd = c.pins.filter((p) => !p.removedAt && p.status === 'new').length;
  return fill(config.email.subject, {
    direction: dirWord(c.direction), stc: c.stcNo, c: c.cNo || '', customer: c.customer || 'No customer',
    date: new Date(c.signedAt || c.createdAt).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }),
    damage: nd ? nd + ' new damage' : 'no new damage',
  }).replace(' ()', '');
}
