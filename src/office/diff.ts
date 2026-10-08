/* What is different between two checklist versions, one line per change. Used for
   "It shows how many items changed" on Publish (source/07 S_builder rules), the
   CHANGED pill, and Compare in Versions. */
import type { Config, Limits } from '../data/types';

export const LIMIT_NAMES: [keyof Limits, string, string][] = [
  ['lowTread', 'Low tread warning', 'mm'], ['legalTread', 'Legal tread minimum', 'mm'], ['hubJump', 'Odd hubometer reading', 'km'],
  ['idleMinutes', 'Idle sign out', 'minutes'], ['pinTries', 'Wrong PIN tries', ''], ['lockMinutes', 'Locked after wrong PIN tries', 'minutes'],
  ['keepDays', 'Keep sent checks on phone', 'days'],
];
export const WORDING_NAMES: Record<string, string> = {
  damage_first: 'Damage, first question', missing: 'Missing photos on send', not_your_trailer: 'Not your trailer',
  unexpected_out: 'Unexpected check out', unexpected_out_body: 'Unexpected check out, detail',
};
export const wordingName = (k: string) => WORDING_NAMES[k] || (k.charAt(0).toUpperCase() + k.slice(1)).replace(/_/g, ' ');

const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

function byId<T>(kind: string, a: T[], b: T[], id: (x: T) => string, name: (x: T) => string, out: string[]) {
  const am = new Map(a.map((x) => [id(x), x])), bm = new Map(b.map((x) => [id(x), x]));
  b.forEach((x) => { if (!am.has(id(x))) out.push(kind + ' added: ' + name(x)); });
  a.forEach((x) => { if (!bm.has(id(x))) out.push(kind + ' removed: ' + name(x)); });
  b.forEach((x) => { const o = am.get(id(x)); if (o && !same(o, x)) out.push(kind + ' changed: ' + name(x)); });
  const ao = a.map(id).filter((k) => bm.has(k)), bo = b.map(id).filter((k) => am.has(k));
  if (!same(ao, bo)) out.push(kind + 's put in a new order');
}

/** Each change from a to b, in words. */
export function diff(a: Config, b: Config): string[] {
  const out: string[] = [];
  const as = new Map(a.steps.map((s) => [s.id, s]));
  b.steps.forEach((s) => { const o = as.get(s.id); if (o && o.enabled !== s.enabled) out.push('Step ' + (s.enabled ? 'turned on' : 'turned off') + ': ' + s.name); });
  if (!same(a.steps.map((s) => s.id), b.steps.map((s) => s.id))) out.push('Steps put in a new order');
  byId('Item', a.items, b.items, (x) => x.id, (x) => x.name, out);
  byId('Photo', a.shots, b.shots, (x) => x.id, (x) => x.label, out);
  byId('Reading', a.readings, b.readings, (x) => x.id, (x) => x.name, out);
  byId('Damage letter', a.damageTypes, b.damageTypes, (x) => x.code, (x) => x.code + ' ' + x.name, out);
  byId('Trailer type', a.trailerTypes, b.trailerTypes, (x) => x.id, (x) => x.name, out);
  const keys = new Set([...Object.keys(a.wording), ...Object.keys(b.wording)]);
  keys.forEach((k) => { if (a.wording[k] !== b.wording[k]) out.push('Wording changed: ' + wordingName(k)); });
  LIMIT_NAMES.forEach(([k, n, u]) => { if (a.limits[k] !== b.limits[k]) out.push(n + ': ' + a.limits[k] + (u ? ' ' + u : '') + ' → ' + b.limits[k] + (u ? ' ' + u : '')); });
  if (!same(a.alerts, b.alerts)) out.push('Alerts changed');
  if (!same(a.email.to, b.email.to)) out.push('Email recipients changed');
  if (a.email.subject !== b.email.subject) out.push('Email subject changed');
  if (a.email.footer !== b.email.footer) out.push('PDF footer changed');
  if (a.allowGallery !== b.allowGallery) out.push('Photos from the gallery ' + (b.allowGallery ? 'allowed' : 'not allowed'));
  if (!same(a.zones, b.zones)) out.push('Damage zones changed');
  if (!same(a.strapsTypes, b.strapsTypes)) out.push('Straps trailer types changed');
  if (!same(a.treadChoices, b.treadChoices)) out.push('Tread choices changed');
  if (!same(a.cleanliness, b.cleanliness)) out.push('Cleanliness choices changed');
  if (!same(a.quickPhrases, b.quickPhrases)) out.push('Quick phrases changed');
  return out;
}
