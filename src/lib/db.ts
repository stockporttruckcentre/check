/* Everything the phone keeps. "Saved" always means saved here, in IndexedDB,
   which survives closing the app and losing signal (source/05 S_offline). */
import Dexie, { type Table } from 'dexie';
import type { Check, PhotoMeta, Trailer, Config, SystemSettings, Role, Site, Perms } from '../data/types';

export interface PhotoRow extends PhotoMeta { blob: Blob }
export interface LastCheck { stc_no: string; check_id: string; direction: string; sent_at: string; readings: Record<string, number | null>; pins: { id: string; view: string; x: number; y: number; zone: string; type: string | null; note: string; since: string }[]; photos: { path: string; ref: string | null; section: string; shot: number }[] }
export interface DeviceUser {
  personId: string; userId: string; name: string; email: string; roleId: string; roleName: string; siteId: string | null; siteName: string;
  session: { access_token: string; refresh_token: string } | null;
  pinHash: string | null; pinSalt: string | null; pinSetAt: string | null;
  lastUsed: string | null; fails: number; lockedUntil: string | null;
  perms: Perms; aliases: string[];
}
export interface KV { key: string; value: unknown }

class ChecksDB extends Dexie {
  checks!: Table<Check, string>;
  photos!: Table<PhotoRow, string>;
  trailers!: Table<Trailer, string>;
  lastChecks!: Table<LastCheck, string>;
  users!: Table<DeviceUser, string>;
  kv!: Table<KV, string>;
  constructor() {
    super('stc-checks');
    this.version(1).stores({
      checks: 'id, userId, status, stcNo, updatedAt',
      photos: 'id, checkId, uploadedAt',
      trailers: 'stc_no, *keys',
      lastChecks: 'stc_no',
      users: 'personId, userId, email',
      kv: 'key',
    });
  }
}
export const db = new ChecksDB();

export async function kvGet<T>(key: string): Promise<T | undefined> { return (await db.kv.get(key))?.value as T | undefined; }
export async function kvSet(key: string, value: unknown) { await db.kv.put({ key, value }); }

export interface CachedConfig { number: number; config: Config }
export interface CachedMeta { settings: SystemSettings; roles: Role[]; sites: Site[] }

/* Ask the browser not to clear what the app keeps when space runs short. */
export async function keepStorage() {
  try { if (navigator.storage && navigator.storage.persist) await navigator.storage.persist(); } catch { /* not supported */ }
}
