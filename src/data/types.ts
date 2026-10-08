/* The data model. Shapes follow the pack's "Suggested data model (minimum)" in
   docs/source/design_handoff_trailer_checks/README.md, extended only where a screen
   in the pack needs a field that list leaves out. */
import type { View } from '../kit/drawings';

export type Direction = 'OUT' | 'IN';
export type CheckStatus = 'draft' | 'waiting' | 'sent' | 'reopened';
export type Applies = 'yes' | 'no' | 'if_fitted';
export type TrailerTypeId = 'curtainsider' | 'box' | 'fridge' | 'flatbed' | 'skeletal' | 'double_deck' | 'drawbar' | 'step_frame' | 'low_loader' | 'tanker' | 'rigid' | 'van';
export type StepId = 'trailer' | 'photos' | 'damage' | 'items' | 'tyres' | 'readings' | 'seals' | 'sign';
export type ItemAnswer = 'ok' | 'damaged' | 'na';
export type DamageCode = string; // C T D CR M S H, editable list
export type PinStatus = 'new' | 'still_there' | 'repaired';
export type PhotoSection = 'P' | 'D' | 'T' | 'R';

export interface TrailerType { id: TrailerTypeId; name: string; drawing: 'trailer' | 'truck' | 'van'; match: string }
export interface StepDef { id: StepId; name: string; enabled: boolean }
export interface ShotDef { id: string; label: string; guide: string; frame?: string; types: Partial<Record<TrailerTypeId, Applies>>; fitted?: 'interior' | 'floor' }
export interface ItemDef {
  id: string; name: string; answer: 'ok_dmg_na' | 'ok_fault_na' | 'ok_dmg'; required: boolean; photoIfDamaged: boolean;
  types: Partial<Record<TrailerTypeId, Applies>>; fitted?: 'tail_lift' | 'rear_doors'; hidden?: boolean;
}
export interface ReadingDef { id: string; name: string; unit: string; required: boolean; types: Partial<Record<TrailerTypeId, Applies>>; compare: boolean }
export interface Zone { name: string; x0: number; y0: number; x1: number; y1: number }
export interface Limits { lowTread: number; legalTread: number; hubJump: number; idleMinutes: number; pinTries: number; lockMinutes: number; keepDays: number }
/* System settings (source/07 S_system): take effect straight away, not through a published version. */
export interface SystemSettings { photo: { targetKB: number; longEdge: number; hardKB: number }; records: { years: number } }
export interface Config {
  steps: StepDef[];
  shots: ShotDef[];
  items: ItemDef[];
  readings: ReadingDef[];
  strapsTypes: Partial<Record<TrailerTypeId, Applies>>;
  damageTypes: { code: DamageCode; name: string }[];
  trailerTypes: TrailerType[];
  zones: Record<View, Zone[]>;
  wording: Record<string, string>;
  limits: Limits;
  email: { to: string[]; subject: string; footer: string };
  allowGallery: boolean;
  treadChoices: number[];
  cleanliness: string[];
  quickPhrases: string[];
  alerts: { newDamage: boolean; expiredMot: boolean; notYourTrailer: boolean };
}

/* A trailer as the phone sees it: search keys and match card fields only.
   Money columns never leave the spreadsheet. */
export interface Trailer {
  stc_no: string; c_no: string | null; ministry_no: string | null; supplier_no: string | null; chassis_no: string | null;
  year: string | null; make: string | null; model: string | null; description: string | null;
  side_aperture: string | null; colour: string | null; door_type: string | null; axle_type: string | null; axle_count: number | null;
  mot_date: string | null; mot_text: string | null; location: string | null; status: string | null; sales_rep: string | null;
  customer: string | null; tab: string | null; sold: boolean; on_sales_order: boolean;
  hire_customer: string | null; hire_rate: number | null; on_hire: boolean; hire_salesman: string | null;
  keys: string[]; updated_at?: string;
}

export interface DamagePin {
  id: string; number: number; view: View; x: number; y: number; zone: string; type: DamageCode | null; note: string;
  status: PinStatus; previousPinId?: string | null; itemId?: string | null; removedAt?: string | null;
}
export interface OldPin { id: string; letter: string; view: View; x: number; y: number; zone: string; type: DamageCode | null; note: string; since: string; verdict?: 'still_there' | 'repaired' }

export interface PhotoMeta {
  id: string; checkId: string; section: PhotoSection; refId: string | null; shot: number; fileName: string;
  bytes: number; width: number; height: number; takenAt: string; lat: number | null; lng: number | null;
  uploadedAt: string | null; fromGallery: boolean; removedAt?: string | null;
}

export interface Tyre { depth: number | null; make?: string }
export interface Check {
  id: string; ref: string | null; userId: string; userName: string; userRole: string; siteId: string; siteName: string;
  direction: Direction; stcNo: string; cNo: string | null; onStockSheet: boolean; trailer: Trailer | null; trailerType: TrailerTypeId;
  axles: number | null; tailLift: boolean; rearDoors: boolean;
  customer: string; customerSource: 'stock' | 'fleet' | 'typed'; collectingReg: string; accountNo: string; orderNo: string;
  ratePerWeek: string; rateSource: 'fleet' | 'typed'; replacementValue: string;
  flags: { notYourTrailer?: string; unexpected?: boolean; wrongSite?: string; motExpired?: string; notOnSheet?: boolean };
  configVersion: number; status: CheckStatus; version: number; parentId: string | null;
  damageAnswer: 'none' | 'yes' | null; pins: DamagePin[]; oldPins: OldPin[]; nextPin: number;
  items: Record<string, ItemAnswer>; tyres: Record<string, Tyre>; readings: Record<string, number | null>;
  readingNotes: Record<string, string>; straps: number | null; seal: string; doorsLock: boolean; cleanliness: string | null;
  signature: string | null; signedAt: string | null; notes: string;
  createdAt: string; updatedAt: string; sentAt: string | null; currentStep: string | null; corrections: { at: string; by: string; text: string }[];
  reopenReason?: string | null;
  tried?: boolean;   // somebody has tried to send: missing rows turn red (source/03 S_status)
}

export interface Person {
  id: string; user_id: string | null; email: string; name: string; role_id: string; site_id: string | null;
  status: 'invited' | 'active' | 'locked' | 'removed'; last_active: string | null; aliases: string[];
}
export interface Role { id: string; name: string; perms: Perms; fixed: boolean; sort: number }
export interface Perms { do_checks: boolean; see_unfinished: boolean; reopen: boolean; people: boolean; edit_config: boolean; publish: boolean; undo: boolean; system: boolean }
export const PERM_LABELS: [keyof Perms, string][] = [
  ['do_checks', 'Do checks out and in'], ['see_unfinished', 'See other people’s unfinished checks'], ['reopen', 'Reopen a sent check (with reason)'],
  ['people', 'Add and remove people'], ['edit_config', 'Edit checks, lists and wording'], ['publish', 'Publish a new version'],
  ['undo', 'Undo and restore'], ['system', 'System settings, export, view as'],
];
export interface Site { id: string; name: string }
