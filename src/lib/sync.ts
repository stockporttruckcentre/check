/* Sending, and keeping the phone's copies fresh (source/05 S_offline).
   - "Saved" means saved on this phone. "Sent" only once the office has confirmed it.
   - Each part is sent separately and confirmed: the details, the damage marks, each photo.
   - Waiting sends retry at 10 seconds, 30 seconds, then every 2 minutes, and again on
     app open and when signal returns.
   - The server ignores repeats, because the check's id is made on the phone. */
import { useSyncExternalStore } from 'react';
import type { SupabaseClient } from '@supabase/supabase-js';
import { db, kvGet, kvSet, type DeviceUser, type LastCheck } from './db';
import { supabase } from './supabase';
import { clientFor, getSession } from './session';
import { getConfig, refreshConfig } from './config';
import type { Check, Trailer } from '../data/types';

export interface SendProgress { checkId: string; details: boolean; signature: boolean; photos: [number, number]; damage: [number, number]; error: string | null; startedAt: number; lastProgress: number; done: boolean }
interface SyncState { sending: Record<string, SendProgress>; lastPull: number | null; pulling: boolean; trailersAt: string | null; stockSavedBy: string | null; error: string | null }
let state: SyncState = { sending: {}, lastPull: null, pulling: false, trailersAt: null, stockSavedBy: null, error: null };
const subs = new Set<() => void>();
function set(n: Partial<SyncState>) { state = { ...state, ...n }; subs.forEach((f) => f()); }
function setProgress(id: string, p: Partial<SendProgress>) {
  const cur = state.sending[id] || { checkId: id, details: false, signature: false, photos: [0, 0], damage: [0, 0], error: null, startedAt: Date.now(), lastProgress: Date.now(), done: false };
  set({ sending: { ...state.sending, [id]: { ...cur, ...p, lastProgress: Date.now() } } });
}
export const getSync = () => state;
export function useSync() { return useSyncExternalStore((f) => { subs.add(f); return () => subs.delete(f); }, () => state); }

/* ---------------- Sending ---------------- */
let running = false, timer: ReturnType<typeof setTimeout> | null = null, attempt = 0;
const BACKOFF = [10000, 30000, 120000];

export function kick() {
  if (timer) { clearTimeout(timer); timer = null; }
  attempt = 0;
  void sendAll();
}
function schedule() {
  if (timer) clearTimeout(timer);
  const wait = BACKOFF[Math.min(attempt, BACKOFF.length - 1)];
  attempt++;
  timer = setTimeout(() => { timer = null; void sendAll(); }, wait);
}

async function sendAll() {
  if (running || !navigator.onLine) { if (!navigator.onLine) schedule(); return; }
  running = true;
  let failed = false;
  try {
    const waiting = await db.checks.where('status').equals('waiting').toArray();
    for (const c of waiting) {
      const u = await db.users.get(c.userId);
      if (!u || !u.session) continue;       // they have to sign in again first; the work waits on the phone
      try { await sendOne(c, await clientFor(u), u); }
      catch (e) { failed = true; setProgress(c.id, { error: (e as Error).message || 'Couldn’t reach the office' }); }
    }
  } finally { running = false; }
  const left = await db.checks.where('status').equals('waiting').count();
  if (left && (failed || !navigator.onLine)) schedule(); else attempt = 0;
}

function row(c: Check, status: 'waiting' | 'draft' | 'reopened') {
  return {
    id: c.id, person_id: c.userId, site_id: c.siteId || null, direction: c.direction, stc_no: c.stcNo, c_no: c.cNo,
    customer: c.customer, account_no: c.accountNo, order_no: c.orderNo, rate_per_week: c.ratePerWeek, replacement_value: c.replacementValue,
    collecting_reg: c.collectingReg, config_version: c.configVersion, status, version: c.version, parent_id: c.parentId,
    data: { ...c, trailer: c.trailer ? { ...c.trailer, keys: undefined } : null },
  };
}

async function sendOne(c: Check, sb: SupabaseClient, u: DeviceUser) {
  setProgress(c.id, { error: null, done: false });
  /* 1. The details. */
  const r1 = await sb.from('checks').upsert(row(c, 'waiting'));
  if (r1.error) throw r1.error;
  setProgress(c.id, { details: true, signature: !!c.signature });
  /* 2. The damage marks. */
  if (c.pins.length) {
    const pins = c.pins.map((p) => ({ id: p.id, check_id: c.id, number: p.number, view: p.view, x: p.x, y: p.y, zone: p.zone, type: p.type, note: p.note, status: p.status, previous_pin_id: p.previousPinId || null, item_id: p.itemId || null, removed_at: p.removedAt || null }));
    const r2 = await sb.from('damage_pins').upsert(pins);
    if (r2.error) throw r2.error;
  }
  /* 3. Each photo, already small. Full-size originals never leave the phone. */
  const photos = await db.photos.where('checkId').equals(c.id).toArray();
  const live = photos.filter((p) => !p.removedAt);
  const general = live.filter((p) => p.section !== 'D'), dmg = live.filter((p) => p.section === 'D');
  let g = general.filter((p) => p.uploadedAt).length, d = dmg.filter((p) => p.uploadedAt).length;
  setProgress(c.id, { photos: [g, general.length], damage: [d, dmg.length] });
  for (const p of live) {
    if (p.uploadedAt) continue;
    const path = c.id + '/' + p.fileName;
    const up = await sb.storage.from('checks').upload(path, p.blob, { contentType: 'image/jpeg', upsert: true });
    if (up.error && !/exists|duplicate/i.test(up.error.message)) throw up.error;
    const r3 = await sb.from('photos').upsert({ id: p.id, check_id: c.id, section: p.section, ref_id: p.refId, shot: p.shot, file_name: p.fileName, path,
      bytes: p.bytes, width: p.width, height: p.height, taken_at: p.takenAt, lat: p.lat, lng: p.lng, from_gallery: p.fromGallery });
    if (r3.error) throw r3.error;
    await db.photos.update(p.id, { uploadedAt: new Date().toISOString() });
    if (p.section === 'D') d++; else g++;
    setProgress(c.id, { photos: [g, general.length], damage: [d, dmg.length] });
  }
  /* Photos removed after an earlier partial send are marked removed on the server too. */
  const removed = photos.filter((p) => p.removedAt && p.uploadedAt);
  for (const p of removed) await sb.from('photos').update({ removed_at: p.removedAt }).eq('id', p.id);
  /* 4. The office confirms, and gives the reference. */
  const fin = await sb.rpc('finalize_check', { p_id: c.id });
  if (fin.error) throw fin.error;
  const res = fin.data as { ref: string; sent_at: string };
  await db.checks.update(c.id, { status: 'sent', ref: res.ref, sentAt: res.sent_at });
  setProgress(c.id, { done: true });
  void u;
}

/** "Send inspection": queue it. It goes now if there is signal, or by itself later. */
export async function queueSend(c: Check) {
  await db.checks.update(c.id, { status: 'waiting', updatedAt: new Date().toISOString() });
  kick();
}

/** Saves an unfinished check to the office too, so a site lead can see it (README roles). Best effort. */
export async function pushDraft(c: Check) {
  if (!navigator.onLine) return;
  const u = await db.users.get(c.userId);
  if (!u?.session) return;
  try { await (await clientFor(u)).from('checks').upsert(row(c, c.parentId ? 'reopened' : 'draft')); } catch { /* it will go with the send */ }
}

/* ---------------- Keeping the phone's copies fresh ---------------- */
async function fetchAll<T>(sb: SupabaseClient, table: string, select: string): Promise<T[]> {
  const out: T[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await sb.from(table).select(select).range(from, from + 999);
    if (error) throw error;
    out.push(...((data || []) as T[]));
    if (!data || data.length < 1000) break;
  }
  return out;
}

export async function pullTrailers() {
  const rows = await fetchAll<Trailer>(supabase, 'trailers_v', '*');
  await db.transaction('rw', db.trailers, async () => { await db.trailers.clear(); await db.trailers.bulkPut(rows); });
  const sync = await supabase.from('sheet_sync').select('*').eq('source', 'stock').maybeSingle();
  set({ trailersAt: sync.data?.updated_at || null, stockSavedBy: sync.data?.updated_by || null });
  await kvSet('trailersAt', { at: sync.data?.updated_at || null, by: sync.data?.updated_by || null, pulled: new Date().toISOString() });
}

export async function pullLastChecks() {
  const [{ data, error }, by] = await Promise.all([supabase.rpc('last_checks'), supabase.rpc('last_check_by')]);
  if (error) throw error;
  const who = new Map(((by.data || []) as { stc_no: string; ref: string | null; person_name: string | null }[]).map((r) => [r.stc_no, r]));
  const rows = ((data || []) as LastCheck[]).map((r) => ({ ...r, ref: who.get(r.stc_no)?.ref || null, person_name: who.get(r.stc_no)?.person_name || null }));
  await db.transaction('rw', db.lastChecks, async () => { await db.lastChecks.clear(); await db.lastChecks.bulkPut(rows); });
}

/** A check reopened in the office comes to the phone of the person who reopened it. */
export async function pullReopened() {
  const u = getSession().user;
  if (!u) return;
  const { data } = await supabase.from('checks').select('id, data, status').eq('person_id', u.personId).eq('status', 'reopened');
  for (const r of data || []) {
    if (await db.checks.get(r.id)) continue;
    await db.checks.put({ ...(r.data as Check), id: r.id, status: 'draft', userId: u.personId });
  }
}

/** Names, so "Dean" on the stock sheet reads "This is Dean Mann's trailer". */
export async function pullPeople() {
  const { data } = await supabase.from('people').select('name, aliases').is('deleted_at', null);
  await kvSet('people', (data || []).map((p) => ({ name: p.name as string, aliases: (p.aliases as string[]) || [] })));
}

export async function pullAll() {
  if (!navigator.onLine || !getSession().user || state.pulling) return;
  set({ pulling: true, error: null });
  try {
    await Promise.all([refreshConfig(), pullTrailers(), pullLastChecks(), pullReopened(), pullPeople()]);
    set({ lastPull: Date.now() });
  } catch (e) { set({ error: (e as Error).message }); }
  finally { set({ pulling: false }); }
  await tidy();
}

/** Sent checks leave the phone after the admin's "Keep sent checks on phone" days. The office keeps them. */
async function tidy() {
  const days = getConfig().config.limits.keepDays || 7;
  const cutoff = new Date(Date.now() - days * 864e5).toISOString();
  const old = await db.checks.where('status').equals('sent').filter((c) => !!c.sentAt && c.sentAt < cutoff).toArray();
  for (const c of old) {
    const unsent = await db.photos.where('checkId').equals(c.id).filter((p) => !p.uploadedAt && !p.removedAt).count();
    if (unsent) continue;   // nothing leaves the phone until the office has it
    await db.photos.where('checkId').equals(c.id).delete();
    await db.checks.delete(c.id);
  }
  const binCutoff = new Date(Date.now() - 30 * 864e5).toISOString();
  await db.photos.filter((p) => !!p.removedAt && p.removedAt < binCutoff).delete();
}

let watching = false;
export function startSync() {
  if (watching) return;
  watching = true;
  kvGet<{ at: string | null; by: string | null }>('trailersAt').then((v) => v && set({ trailersAt: v.at, stockSavedBy: v.by }));
  window.addEventListener('online', () => { kick(); void pullAll(); });
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') { kick(); void pullAll(); } });
  /* A save in Excel reaches the phone within seconds: the server tells every open phone. */
  let t: ReturnType<typeof setTimeout> | null = null;
  supabase.channel('sheets')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'sheet_sync' }, () => {
      if (t) clearTimeout(t);
      t = setTimeout(() => { pullTrailers().catch(() => {}); }, 1500);
    })
    .subscribe();
  setInterval(() => { if (navigator.onLine) kick(); }, 120000);
  kick();
  void pullAll();
}
