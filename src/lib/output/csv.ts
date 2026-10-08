/* Details.csv: "holds every field on one row, for anyone who wants to paste it into a
   spreadsheet" (source/08 S_output, Rules). One header row, one data row, RFC 4180:
   CRLF line ends, every field quoted when it holds a comma, a quote or a line break. */
import type { Check, Config } from '../../data/types';
import { stcLabel, typeName, dirWord, VIEW_NAMES, itemsFor, readingsFor, strapsApply, tyreKeys, subjectFor } from '../check';
import { when, dateTime, pounds, livePins, typeCell, oldNote, tyreName, answerWord, newPins } from './text';

export function csvField(v: unknown): string {
  const s = v == null ? '' : String(v);
  return /[",\r\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
}
export const csvRow = (cells: unknown[]) => cells.map(csvField).join(',');

const yes = (b: boolean | undefined | null) => (b ? 'Yes' : 'No');
const at = (d: string | null | undefined) => (d ? dateTime(d) : '');

export function csvColumns(c: Check, config: Config): [string, unknown][] {
  const cols: [string, unknown][] = [
    ['Check', dirWord(c.direction)],
    ['STC No', stcLabel(c.stcNo)],
    ['C No', c.cNo || ''],
    ['On stock sheet', yes(c.onStockSheet)],
    ['Type', typeName(c.trailerType, config)],
    ['Axles', c.axles ?? ''],
    ['Tail lift fitted', yes(c.tailLift)],
    ['Rear doors fitted', yes(c.rearDoors)],
    ['Customer', c.customer],
    ['Account', c.accountNo],
    ['Order', c.orderNo],
    ['Collecting reg', c.collectingReg],
    ['Rate per week', pounds(c.ratePerWeek)],
    ['Replacement value', c.replacementValue ? pounds(c.replacementValue) : ''],
    ['Site', c.siteName],
    ['Checked by', c.userName],
    ['Role', c.userRole],
    ['Date', at(when(c))],
    ['Subject', subjectFor(c, config)],
    ['Record version', c.version],
    ['Reopen reason', c.reopenReason || ''],
    ['New damage', newPins(c).length],
    ['Damage', livePins(c).map((p) => p.number + ' ' + p.zone + (p.type ? ' ' + typeCell(p.type, config) : '') + (p.note ? ': ' + p.note : '')).join('; ')],
    ['Old damage', c.oldPins.map((o) => o.letter + ' ' + o.zone + (o.type ? ' ' + typeCell(o.type, config) : '') + ': ' + oldNote(o)).join('; ')],
  ];
  /* One column per general item, tyre and reading, named as the check names them. */
  for (const i of itemsFor(c, config)) cols.push([i.name, answerWord(i, c.items[i.id])]);
  for (const k of tyreKeys(c)) {
    const t = c.tyres[k];
    cols.push([tyreName(k) + ' (mm)', t?.depth ?? '']);
    if (t?.make) cols.push([tyreName(k) + ' make', t.make]);
  }
  for (const r of readingsFor(c, config)) {
    cols.push([r.name + (r.unit ? ' (' + r.unit + ')' : ''), c.readings[r.id] ?? '']);
    if (c.readingNotes[r.id]) cols.push([r.name + ' note', c.readingNotes[r.id]]);
  }
  if (strapsApply(c, config)) cols.push(['Internal straps count', c.straps ?? '']);
  cols.push(
    ['Seal number', c.seal],
    ['Doors lock', yes(c.doorsLock)],
    ['Cleanliness', c.cleanliness || ''],
    ['Notes', c.notes],
    ['Corrections', c.corrections.map((x) => at(x.at) + ' ' + x.by + ': ' + x.text).join('; ')],
    ['Not your trailer', c.flags.notYourTrailer || ''],
    ['Unexpected check out', c.flags.unexpected ? 'Yes' : ''],
    ['Wrong site', c.flags.wrongSite || ''],
    ['MOT expired', c.flags.motExpired || ''],
    ['Not on stock sheet', c.flags.notOnSheet ? 'Yes' : ''],
    ['Signed at', at(c.signedAt)],
    ['Sent at', at(c.sentAt)],
    ['Damage marks by view', (['ns', 'os', 'front', 'rear', 'roof'] as const).map((v) => VIEW_NAMES[v] + ' ' + livePins(c).filter((p) => p.view === v).length).join('; ')],
    ['Check ID', c.id],
  );
  return cols;
}

/** A UTF-8 byte order mark leads, so a spreadsheet opened straight from the file reads "£" right. */
export function buildCsv(c: Check, config: Config): string {
  const cols = csvColumns(c, config);
  return '﻿' + csvRow(cols.map((x) => x[0])) + '\r\n' + csvRow(cols.map((x) => x[1])) + '\r\n';
}
