/* Finding a trailer by whatever number is in front of you (source/06 S_stock).
   Search ignores spaces, dashes and a leading C or STC. Two matches always ask.
   Each result says which number matched. */
import { db } from './db';
import type { Trailer } from '../data/types';

/** The same rule as norm_key() in the database, so the phone and the office agree. */
export function normKey(t: string | null | undefined): string {
  const s = (t || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
  return s.replace(/^(STC|C)(?=[0-9])/, '');
}

export type MatchedBy = 'STC number' | 'C number' | 'supplier number' | 'chassis number';
export interface Found { t: Trailer; by: MatchedBy; matched: string }

function which(t: Trailer, key: string): { by: MatchedBy; matched: string } {
  if (normKey(t.stc_no) === key) return { by: 'STC number', matched: t.stc_no };
  if (normKey(t.c_no) === key) return { by: 'C number', matched: t.c_no || '' };
  if (normKey(t.supplier_no) === key) return { by: 'supplier number', matched: t.supplier_no || '' };
  return { by: 'chassis number', matched: t.chassis_no || '' };
}

/** Exact matches on any key. */
export async function findExact(q: string): Promise<Found[]> {
  const key = normKey(q);
  if (!key) return [];
  const rows = await db.trailers.where('keys').equals(key).toArray();
  return dedupe(rows).map((t) => ({ t, ...which(t, key) }));
}

/** Matches from the second character, for the list under the field (source/02 Search and autocomplete). */
export async function findStarting(q: string, limit = 6): Promise<Found[]> {
  const key = normKey(q);
  if (key.length < 2) return [];
  const rows = await db.trailers.where('keys').startsWith(key).limit(limit * 3).toArray();
  return dedupe(rows).slice(0, limit).map((t) => {
    const k = t.keys.find((x) => x.startsWith(key)) || key;
    return { t, ...which(t, k) };
  });
}

/** Close matches when nothing is found: one character out, or two swapped. */
export async function findClose(q: string, limit = 3): Promise<Found[]> {
  const key = normKey(q);
  if (key.length < 4) return [];
  const out: Found[] = [];
  await db.trailers.each((t) => {
    for (const k of t.keys) {
      if (Math.abs(k.length - key.length) > 1) continue;
      if (dist(k, key) <= 1) { out.push({ t, ...which(t, k) }); break; }
    }
  });
  return dedupe(out.map((f) => f.t)).slice(0, limit).map((t) => out.find((f) => f.t === t)!);
}

function dedupe(rows: Trailer[]): Trailer[] {
  const seen = new Set<string>();
  return rows.filter((r) => (seen.has(r.stc_no) ? false : (seen.add(r.stc_no), true)));
}
function dist(a: string, b: string): number {
  if (a === b) return 0;
  if (a.length === b.length) {
    let d = 0, first = -1;
    for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) { d++; if (first < 0) first = i; }
    if (d === 2 && a[first] === b[first + 1] && a[first + 1] === b[first]) return 1;
    return d;
  }
  const [s, l] = a.length < b.length ? [a, b] : [b, a];
  for (let i = 0; i < l.length; i++) if (l.slice(0, i) + l.slice(i + 1) === s) return 1;
  return 2;
}

/** "This is Dean Mann's trailer": the sheet's name matched to a person, or null when it is nobody's in particular. */
export function repName(t: Trailer, direction: 'OUT' | 'IN'): string | null {
  const raw = ((direction === 'OUT' && t.on_hire ? t.hire_salesman : null) || t.sales_rep || t.hire_salesman || '').trim();
  if (!raw || /^(stc|rental|ex[ -]?rental|tbc|n\/?a)$/i.test(raw)) return null;
  return raw;
}
export function isMine(rep: string, me: { name: string; aliases: string[] }): boolean {
  const r = rep.trim().toLowerCase();
  const first = me.name.split(' ')[0].toLowerCase();
  return r === me.name.toLowerCase() || r === first || r.split(' ')[0] === first || me.aliases.some((a) => a.trim().toLowerCase() === r);
}
