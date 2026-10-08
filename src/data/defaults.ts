/* The first published checklist, version 1. Every list and every word here is taken
   from the design pack: the 22 items and the trailer type matrix from source/04, the
   limits and wording from source/07, the damage letters from source/08. Admins change
   all of it in the office (Check builder, Lists and wording), so nothing here is final.

   Where the pack needed a value it does not give, it is marked BUILDER below and
   listed in docs/decisions.md so it can be changed in the office. */
import type { Config, TrailerTypeId, Applies, SystemSettings } from './types';

const T: TrailerTypeId[] = ['curtainsider', 'box', 'fridge', 'flatbed', 'skeletal', 'double_deck', 'drawbar', 'step_frame', 'low_loader', 'tanker', 'rigid', 'van'];
/* One letter per trailer type in the order above: y yes, n no, f if fitted.
   The last two (rigid truck, van) are the extra asset drawings in source/08 and follow box. */
function m(s: string): Partial<Record<TrailerTypeId, Applies>> {
  const out: Partial<Record<TrailerTypeId, Applies>> = {};
  T.forEach((t, i) => { out[t] = s[i] === 'y' ? 'yes' : s[i] === 'f' ? 'if_fitted' : 'no'; });
  return out;
}
const ALL = 'yyyyyyyyyyyy';

export const DEFAULT_CONFIG: Config = {
  steps: [
    { id: 'trailer', name: 'Trailer and customer', enabled: true },
    { id: 'photos', name: 'Photos', enabled: true },
    { id: 'damage', name: 'Damage', enabled: true },
    { id: 'items', name: 'General items', enabled: true },
    { id: 'tyres', name: 'Tyres', enabled: true },
    { id: 'readings', name: 'Readings', enabled: true },
    { id: 'seals', name: 'Seals and cleanliness', enabled: true },
    { id: 'sign', name: 'Sign', enabled: true },
  ],
  shots: [
    { id: 'front', label: 'Front', guide: '', types: m(ALL) },
    { id: 'nsf', label: 'NS front', guide: 'Stand at the front left corner. Fit the front and the whole side in.', frame: 'Whole trailer inside the box', types: m(ALL) },
    { id: 'osf', label: 'OS front', guide: '', types: m(ALL) },
    { id: 'nsr', label: 'NS rear', guide: '', types: m(ALL) },
    { id: 'osr', label: 'OS rear', guide: '', types: m(ALL) },
    { id: 'rear', label: 'Rear doors', guide: '', types: m(ALL) },
    { id: 'interior', label: 'Interior', guide: '', types: m('yyynnyyynnyy') },
    { id: 'floor', label: 'Floor', guide: '', types: m('yyyynyyyynyy') },
    { id: 'vtg', label: 'VTG plate', guide: '', types: m(ALL) },
  ],
  items: [
    ['Manufacturers plate', ALL], ['Ministry plate', ALL], ['Mud wings / flaps', ALL], ['Sideguards', ALL], ['Couplings', ALL],
    ['DIN plugs', ALL], ['Body work', ALL], ['Chassis', ALL], ['Electrical', ALL], ['Rear lights', ALL], ['Rear under run', ALL],
    ['Landing gear', ALL], ['Rear doors', 'fyynnyyynnyy'], ['Body / curtains', 'yyynnyyynnyy'], ['King pin & plate', 'yyyyyynyyynn'],
    ['Side lights', ALL], ['Front lights', ALL], ['Tail lift', 'fffnnfffnnff'], ['Markers', ALL], ['Interior', 'yyynnyyynnyy'],
    ['Floor', 'yyyynyyyynyy'], ['Internal straps', 'yyynnyyynnyy'], ['Drawbar coupling', 'nnnnnnynnnnn'],
  ].map(([name, mask]) => ({
    id: name.toLowerCase().replace(/[^a-z]+/g, '_').replace(/^_|_$/g, ''),
    name, answer: 'ok_dmg_na' as const, required: true, photoIfDamaged: true, types: m(mask),
    fitted: name === 'Tail lift' ? 'tail_lift' as const : name === 'Rear doors' ? 'rear_doors' as const : undefined,
  })),
  readings: [
    { id: 'hub', name: 'Hubometer', unit: 'km', required: true, types: m(ALL), compare: true },
    { id: 'fridge', name: 'Fridge unit hours', unit: '', required: true, types: m('nnynnnnnnnnn'), compare: true },
  ],
  strapsTypes: m('yyynnyyynnyy'),
  damageTypes: [{ code: 'C', name: 'Cut' }, { code: 'T', name: 'Tear' }, { code: 'D', name: 'Dent' }, { code: 'CR', name: 'Cracked' }, { code: 'M', name: 'Missing' }, { code: 'S', name: 'Scratch' }, { code: 'H', name: 'Holed' }],
  /* match: words looked for in the stock sheet's Model and Description, in this order.
     BUILDER: the words are read off the real stock sheet, and are editable. */
  trailerTypes: [
    { id: 'fridge', name: 'Fridge', drawing: 'trailer', match: 'fridge|reefer|refrigerat' },
    { id: 'double_deck', name: 'Double deck', drawing: 'trailer', match: 'double deck|\\bdd\\b' },
    { id: 'drawbar', name: 'Drawbar', drawing: 'trailer', match: 'draw ?bar' },
    { id: 'step_frame', name: 'Step frame', drawing: 'trailer', match: 'step ?frame' },
    { id: 'low_loader', name: 'Low loader', drawing: 'trailer', match: 'low ?loader' },
    { id: 'tanker', name: 'Tanker', drawing: 'trailer', match: 'tank' },
    { id: 'skeletal', name: 'Skeletal', drawing: 'trailer', match: 'skel' },
    { id: 'flatbed', name: 'Flatbed', drawing: 'trailer', match: 'flat' },
    { id: 'rigid', name: 'Rigid truck', drawing: 'truck', match: 'rigid' },
    { id: 'van', name: 'Van', drawing: 'van', match: '^van$|panel van|luton' },
    { id: 'box', name: 'Box', drawing: 'trailer', match: 'box' },
    { id: 'curtainsider', name: 'Curtainsider', drawing: 'trailer', match: 'curtain|psk|clearspan|taut' },
  ],
  /* BUILDER: zones follow the lines already in the pack's drawings (the panel lines at
     x 170, 320 and 470, the chassis at y 150, the wheels from x 454). Coordinates are
     fractions of the 640 by 220 drawing. First match wins. */
  zones: {
    ns: [
      { name: 'landing gear', x0: 0.19, y0: 0.68, x1: 0.28, y1: 1 },
      { name: 'rear axles', x0: 0.69, y0: 0.68, x1: 0.97, y1: 1 },
      { name: 'chassis', x0: 0.03, y0: 0.68, x1: 0.97, y1: 1 },
      { name: 'front panel', x0: 0.03, y0: 0, x1: 0.266, y1: 0.68 },
      { name: 'middle', x0: 0.266, y0: 0, x1: 0.734, y1: 0.68 },
      { name: 'rear panel', x0: 0.734, y0: 0, x1: 0.97, y1: 0.68 },
    ],
    os: [
      { name: 'landing gear', x0: 0.72, y0: 0.68, x1: 0.81, y1: 1 },
      { name: 'rear axles', x0: 0.03, y0: 0.68, x1: 0.31, y1: 1 },
      { name: 'chassis', x0: 0.03, y0: 0.68, x1: 0.97, y1: 1 },
      { name: 'front panel', x0: 0.734, y0: 0, x1: 0.97, y1: 0.68 },
      { name: 'middle', x0: 0.266, y0: 0, x1: 0.734, y1: 0.68 },
      { name: 'rear panel', x0: 0.03, y0: 0, x1: 0.266, y1: 0.68 },
    ],
    rear: [
      { name: 'left lamp', x0: 0.31, y0: 0.62, x1: 0.4, y1: 0.78 },
      { name: 'right lamp', x0: 0.6, y0: 0.62, x1: 0.69, y1: 0.78 },
      { name: 'under run', x0: 0.31, y0: 0.78, x1: 0.69, y1: 1 },
      { name: 'left door', x0: 0.2, y0: 0, x1: 0.5, y1: 0.62 },
      { name: 'right door', x0: 0.5, y0: 0, x1: 0.8, y1: 0.62 },
    ],
    front: [
      { name: 'couplings', x0: 0.44, y0: 0.68, x1: 0.56, y1: 0.95 },
      { name: 'landing gear', x0: 0.3, y0: 0.73, x1: 0.7, y1: 1 },
      { name: 'front panel', x0: 0.2, y0: 0, x1: 0.8, y1: 0.73 },
    ],
    roof: [
      { name: 'front', x0: 0, y0: 0, x1: 0.27, y1: 1 },
      { name: 'middle', x0: 0.27, y0: 0, x1: 0.73, y1: 1 },
      { name: 'rear', x0: 0.73, y0: 0, x1: 1, y1: 1 },
    ],
  },
  wording: {
    damage_first: 'Any new damage on this trailer?',
    missing: '{n} things left. {list}',
    not_your_trailer: 'This is {rep}’s trailer',
    /* From the business, 8 October 2026: a check out of a trailer that is neither on a
       sales order, on the Sold List nor out on hire asks this. */
    unexpected_out: 'Confirm you’re checking out the correct trailer',
    unexpected_out_body: 'It isn’t on a sales order, the Sold List or on hire.',
  },
  limits: { lowTread: 3, legalTread: 1, hubJump: 5000, idleMinutes: 10, pinTries: 5, lockMinutes: 15, keepDays: 7 },
  email: { to: ['alexellis@stc-uk.com'], subject: '{direction} · STC {stc} ({c}) · {customer} · {date} · {damage}', footer: 'stc-uk.com' },
  allowGallery: false,
  treadChoices: [4, 5, 6, 8, 10, 12, 14],
  cleanliness: ['Clean', 'Needs a sweep', 'Dirty'],
  quickPhrases: ['Dent', 'Scratch', 'Cut', 'Tear', 'Cracked', 'Holed', 'Missing', 'Old damage', 'Needs repair'],
  alerts: { newDamage: true, expiredMot: true, notYourTrailer: true },
};

export const DEFAULT_SETTINGS: SystemSettings = { photo: { targetKB: 100, longEdge: 1600, hardKB: 150 }, records: { years: 6 } };

export function applies(types: Partial<Record<TrailerTypeId, Applies>>, t: TrailerTypeId, fitted?: boolean): boolean {
  const a = types[t] || 'no';
  return a === 'yes' || (a === 'if_fitted' && !!fitted);
}

export function fill(template: string, vars: Record<string, string | number>): string {
  return template.replace(/\{(\w+)\}/g, (_, k: string) => (vars[k] != null ? String(vars[k]) : '{' + k + '}'));
}
