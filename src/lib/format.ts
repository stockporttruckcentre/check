/* Dates and numbers the way the pack writes them: "07 Oct 09:58", "Today 09:41", "281,950". */
const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const DAY = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const p2 = (n: number) => String(n).padStart(2, '0');

export const time = (d: Date | string) => { const x = new Date(d); return p2(x.getHours()) + ':' + p2(x.getMinutes()); };
export const dayMon = (d: Date | string) => { const x = new Date(d); return p2(x.getDate()) + ' ' + MON[x.getMonth()]; };
export const dayMonYear = (d: Date | string) => { const x = new Date(d); return p2(x.getDate()) + ' ' + MON[x.getMonth()] + ' ' + x.getFullYear(); };
export const isoDate = (d: Date | string) => { const x = new Date(d); return x.getFullYear() + '-' + p2(x.getMonth() + 1) + '-' + p2(x.getDate()); };

function sameDay(a: Date, b: Date) { return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate(); }

/** "Today 09:41", "Yesterday 16:40", "Monday", "02 Oct" */
export function when(d: Date | string | null | undefined, withTime = true): string {
  if (!d) return '';
  const x = new Date(d), now = new Date();
  const y = new Date(now); y.setDate(now.getDate() - 1);
  if (sameDay(x, now)) return withTime ? 'Today ' + time(x) : 'Today';
  if (sameDay(x, y)) return withTime ? 'Yesterday ' + time(x) : 'Yesterday';
  if (now.getTime() - x.getTime() < 6 * 864e5) return DAY[x.getDay()];
  return dayMon(x);
}
export function lastUsed(d: Date | string | null | undefined): string {
  if (!d) return '';
  const x = new Date(d), now = new Date();
  if (sameDay(x, now)) return 'Last used today, ' + time(x);
  return 'Last used ' + when(x, false);
}
export const num = (n: number | null | undefined) => (n == null ? '' : n.toLocaleString('en-GB'));
export function greeting(d = new Date()) { const h = d.getHours(); return h < 12 ? 'Morning' : h < 18 ? 'Afternoon' : 'Evening'; }
