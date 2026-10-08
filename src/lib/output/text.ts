/* The words the office receives, worked out once so the PDF, Details.csv and the
   email body cannot disagree. Wording follows source/08 S_output. */
import type { Check, Config, DamagePin, OldPin, PhotoMeta, ItemAnswer, ItemDef } from '../../data/types';
import type { View } from '../../kit/drawings';
import { VIEW_NAMES, damageName, typeName, stcLabel, tyreKeys } from '../check';
import { dayMon, dayMonYear, time } from '../format';

/** The order the pack draws the views in on page 1: NS, OS, rear, front. Roof last. */
export const VIEW_ORDER: View[] = ['ns', 'os', 'rear', 'front', 'roof'];

export const when = (c: Check) => c.signedAt || c.createdAt;
/** "07 Oct 2026 09:58" */
export const dateTime = (d: string) => dayMonYear(d) + ' ' + time(d);

/** "tri", "tandem", "single" for the details grid: "Curtainsider, tri axle". */
export function axleWord(n: number | null): string {
  if (!n) return '';
  return n === 1 ? 'single' : n === 2 ? 'tandem' : n === 3 ? 'tri' : String(n);
}
export function typeLine(c: Check, config: Config): string {
  const w = axleWord(c.axles);
  return typeName(c.trailerType, config) + (w ? ', ' + w + ' axle' : '');
}

/** "£145" from "145" or "£145". Empty stays empty. */
export function pounds(rate: string): string {
  const r = (rate || '').trim();
  if (!r) return '';
  return r.startsWith('£') ? r : '£' + r;
}
/** "£145 / week" on the PDF. */
export const rateShort = (c: Check) => (pounds(c.ratePerWeek) ? pounds(c.ratePerWeek) + ' / week' : '');
/** "£145 per week" in the email. */
export const rateLong = (c: Check) => (pounds(c.ratePerWeek) ? pounds(c.ratePerWeek) + ' per week' : '');

/** "C10772 / STC 4418" */
export const assetShort = (c: Check) => (c.cNo ? c.cNo + ' / ' : '') + stcLabel(c.stcNo);
/** "BOR001 / 4471" */
export const accountOrder = (c: Check) => [c.accountNo, c.orderNo].filter((x) => x && x.trim()).join(' / ');

export const livePins = (c: Check): DamagePin[] => c.pins.filter((p) => !p.removedAt).sort((a, b) => a.number - b.number);
export const newPins = (c: Check): DamagePin[] => livePins(c).filter((p) => p.status === 'new');

/** "D Dent" */
export function typeCell(code: string | null, config: Config): string {
  if (!code) return '';
  const n = damageName(code, config);
  return code + (n ? ' ' + n : '');
}

/** "D01_1, D01_2", or "D03_1 to D03_3" when there are three or more in a row. */
export function photoRefs(pin: DamagePin, photos?: PhotoMeta[]): string {
  const nn = 'D' + String(pin.number).padStart(2, '0');
  let shots: number[];
  if (photos) {
    shots = [...new Set(photos.filter((p) => p.section === 'D' && p.refId === pin.id && !p.removedAt).map((p) => p.shot))].sort((a, b) => a - b);
  } else {
    /* No photo list given: the close-up and the wide shot, which every pin must have. */
    shots = [1, 2];
  }
  if (!shots.length) return '';
  const run = shots.every((s, i) => i === 0 || s === shots[i - 1] + 1);
  if (shots.length >= 3 && run) return nn + '_' + shots[0] + ' to ' + nn + '_' + shots[shots.length - 1];
  return shots.map((s) => nn + '_' + s).join(', ');
}

/** "On record since 12 Sep. Still there." or "Repaired." */
export function oldNote(o: OldPin): string {
  if (o.verdict === 'repaired') return 'Repaired.';
  return 'On record since ' + dayMon(o.since) + '.' + (o.verdict === 'still_there' ? ' Still there.' : '');
}

/* The email lists sides in the order the pack writes them: nearside, offside, rear. */
const VIEW_ORDER_EMAIL: View[] = ['ns', 'os', 'front', 'rear', 'roof'];
/** "2 nearside, 1 offside, 1 rear" */
export function damageByView(pins: DamagePin[]): string {
  return VIEW_ORDER_EMAIL.map((v) => {
    const n = pins.filter((p) => p.view === v).length;
    return n ? n + ' ' + VIEW_NAMES[v].toLowerCase() : '';
  }).filter(Boolean).join(', ');
}

/* ---------------- Tyres ---------------- */

/** "Nearside axle 2" from "ns_2" */
export function tyreName(key: string): string {
  const [side, axle] = key.split('_');
  return (side === 'ns' ? 'Nearside' : 'Offside') + ' axle ' + axle;
}
export const isLow = (depth: number | null | undefined, config: Config) => depth != null && depth <= config.limits.lowTread;
export function lowTyres(c: Check, config: Config): { key: string; depth: number }[] {
  return tyreKeys(c).map((k) => ({ key: k, depth: c.tyres[k]?.depth as number })).filter((t) => isLow(t.depth, config));
}
/** "1 low (offside axle 2, 2mm)" */
export function tyreSummary(c: Check, config: Config): string {
  const low = lowTyres(c, config);
  if (!low.length) return 'None low';
  return low.length + ' low (' + low.map((t) => tyreName(t.key).toLowerCase() + ', ' + t.depth + 'mm').join('; ') + ')';
}

/* ---------------- General items ---------------- */

export function answerWord(item: ItemDef, a: ItemAnswer | undefined): string {
  if (!a) return '';
  if (a === 'ok') return 'OK';
  if (a === 'na') return 'Not fitted';
  return item.answer === 'ok_fault_na' ? 'Fault' : 'Damaged';
}
