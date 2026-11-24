/* The email. Decision from the business: it is sent from the user's own phone mail
   app through the phone's share screen, with the PDF and the zip attached, and the
   user picks the office address. The app cannot know whether it was sent, only
   whether something was picked on the share screen.

   The body is the rows of the email card in source/08 S_output, as plain text. */
import type { Check, Config } from '../../data/types';
import { stcLabel, typeName, subjectFor, reportName, zipName, dirWord } from '../check';
import { dayMonYear } from '../format';
import { time } from '../format';
import { when, rateLong, newPins, damageByView, tyreSummary, officeTodo } from './text';

/** "C10772 · STC 4418 · 2018 Cartwright curtainsider" */
function assetLine(c: Check, config: Config): string {
  const t = c.trailer;
  const what = [t?.year, t?.make, typeName(c.trailerType, config).toLowerCase()].filter((x) => x && String(x).trim()).join(' ');
  return [c.cNo, stcLabel(c.stcNo), what].filter(Boolean).join(' · ');
}
/** "Borgas Haulage · Account BOR001 · Order 4471" */
function customerLine(c: Check): string {
  return [c.customer, c.accountNo ? 'Account ' + c.accountNo : '', c.orderNo ? 'Order ' + c.orderNo : ''].filter(Boolean).join(' · ');
}
/** "4 (2 nearside, 1 offside, 1 rear)" */
function damageLine(c: Check): string {
  const pins = newPins(c);
  return pins.length ? pins.length + ' (' + damageByView(pins) + ')' : '0';
}

export function emailRows(c: Check, config: Config): [string, string][] {
  const rows: [string, string][] = [
    ['Asset', assetLine(c, config)],
    ['Customer', customerLine(c)],
    ['Collected by', c.collectingReg],
    ['Rate', rateLong(c)],
    ['Checked by', [c.userName, c.siteName, time(when(c))].filter(Boolean).join(', ')],
    ['New damage', damageLine(c)],
    ['Tyres', tyreSummary(c, config)],
  ];
  if (c.version > 1 && c.reopenReason) rows.push(['Reopened', c.reopenReason]);
  return rows;
}

export function emailBody(c: Check, config: Config): string {
  /* A row with nothing in it (no collecting reg or rate on a check in) is left out. */
  const rows = emailRows(c, config).filter(([, v]) => v && v.trim());
  const pad = Math.max(...rows.map((r) => r[0].length)) + 2;
  const todo = officeTodo(c);
  const list = todo.length ? 'Head office to do:\n' + todo.map((t) => '- ' + t).join('\n') + '\n\n' : '';
  return rows.map(([k, v]) => (k + ':').padEnd(pad) + v).join('\n') + '\n\n' + list + reportName(c) + '\n' + zipName(c) + '\n';
}

/** The separate to-do list file for the zip, or null when the check raised nothing for head office. */
export function officeTodoText(c: Check): string | null {
  const todo = officeTodo(c);
  if (!todo.length) return null;
  const head = 'Head office to do\r\n' + stcLabel(c.stcNo) + ' \u00b7 ' + dirWord(c.direction) + ' \u00b7 ' + dayMonYear(when(c)) + (c.ref ? ' \u00b7 ' + c.ref : '') + '\r\n\r\n';
  return head + todo.map((t, i) => (i + 1) + '. ' + t).join('\r\n') + '\r\n';
}

/** Opens the phone's share screen with the files. 'shared' means something was picked,
    not that a message was sent. 'unsupported' means offer the files as downloads. */
export async function shareCheck(c: Check, config: Config, files: File[]): Promise<'shared' | 'cancelled' | 'unsupported'> {
  if (typeof navigator === 'undefined' || typeof navigator.share !== 'function' || typeof navigator.canShare !== 'function') return 'unsupported';
  let can = false;
  try { can = navigator.canShare({ files }); } catch { can = false; }
  if (!can) return 'unsupported';
  try {
    await navigator.share({ files, title: subjectFor(c, config), text: emailBody(c, config) });
    return 'shared';
  } catch (e) {
    if (e instanceof DOMException && e.name === 'AbortError') return 'cancelled';
    /* NotAllowedError (the tap was too long ago) and the rest: the share screen cannot open. */
    return 'unsupported';
  }
}

export function downloadFile(blob: Blob, name: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.rel = 'noopener';
  a.style.display = 'none';
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}
