/* Sending, and keeping the phone's copies fresh (source/05 S_offline).
   - "Saved" means saved on this phone. "Sent" only once the office has confirmed it.
   - Each part is sent separately and confirmed: the details, the damage marks, each photo.
   - Waiting sends retry at 10 seconds, 30 seconds, then every 2 minutes, and again on
     app open and when signal returns.
   - The server ignores repeats, because the check's id is made on the phone. */
import { useSyncExternalStore } from 'react';
import type { SupabaseClient } from '@supabase/supabase-js';
import { db, kvGet, kvSet, type DeviceUser, type LastCheck, type PhotoRow } from './db';
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

/* The details, the damage marks and each photo. Used by a send, and by an unfinished check
   saving itself to the office as it goes so another device can carry it on. */
async function pushParts(c: Check, sb: SupabaseClient, status: 'waiting' | 'draft' | 'reopened', track: boolean) {
  /* 1. The details. */
  const r1 = await sb.from('checks').upsert(row(c, status));
  if (r1.error) throw r1.error;
  if (track) setProgress(c.id, { details: true, signature: !!c.signature });
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
  if (track) setProgress(c.id, { photos: [g, general.length], damage: [d, dmg.length] });
  for (const p of live) {
    if (p.uploadedAt) continue;
    const path = c.id + '/' + p.fileName;
    const up = await sb.storage.from('checks').upload(path, p.blob, { contentType: 'image/jpeg', upsert: true });
    if (up.error && !/exists|duplicate/i.test(up.error.message)) throw up.error;
    const r3 = await sb.from('photos').upsert({ id: p.id, check_id: c.id, section: p.section, ref_id: p.refId, shot: p.shot, file_name: p.fileName, path,
      bytes: p.bytes, width: p.width, height: p.height, taken_at: p.takenAt, lat: p.lat, lng: p.lng, from_gallery: p.fromGallery, removed_at: null });
    if (r3.error) throw r3.error;
    await db.photos.update(p.id, { uploadedAt: new Date().toISOString() });
    if (p.section === 'D') d++; else g++;
    if (track) setProgress(c.id, { photos: [g, general.length], damage: [d, dmg.length] });
  }
  /* Photos removed after they reached the office are marked removed there too. */
  const removed = photos.filter((p) => p.removedAt && p.uploadedAt);
  for (const p of removed) await sb.from('photos').update({ removed_at: p.removedAt }).eq('id', p.id);
}

async function sendOne(c: Check, sb: SupabaseClient, u: DeviceUser) {
  setProgress(c.id, { error: null, done: false });
  await pushParts(c, sb, 'waiting', true);
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

/** An unfinished check saves itself to the office a moment after each change, photos and all,
    so the same person can carry it on from another device, and a site lead can see it. */
const draftTimers: Record<string, ReturnType<typeof setTimeout>> = {};
export function syncDraftSoon(id: string) {
  clearTimeout(draftTimers[id]);
  draftTimers[id] = setTimeout(() => { delete draftTimers[id]; void syncDraft(id); }, 1500);
}
async function syncDraft(id: string) {
  if (!navigator.onLine) return;
  const c = await db.checks.get(id);
  if (!c || c.status !== 'draft') return;
  const u = await db.users.get(c.userId);
  if (!u?.session) return;
  try {
    await pushParts(c, await clientFor(u), c.parentId ? 'reopened' : 'draft', false);
    await db.checks.update(id, { syncedAt: new Date().toISOString() });
  } catch { /* it tries again on the next change, and goes with the send anyway */ }
}
export async function pushDraft(c: Check) { syncDraftSoon(c.id); }

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

/** Your unfinished checks, wherever you started them, and a check reopened in the office for you.
    A newer copy wins. One finished or deleted on another device is brought up to date here. */
export async function pullMine() {
  const u = getSession().user;
  if (!u) return;
  const { data } = await supabase.from('checks').select('id, data, status').eq('person_id', u.personId).in('status', ['draft', 'reopened']);
  const now = new Date().toISOString();
  for (const r of data || []) {
    const remote = r.data as Check;
    const local = await db.checks.get(r.id);
    if (local && local.status !== 'draft') continue;
    if (local && (local.updatedAt || '') >= (remote.updatedAt || '')) continue;
    if (local && draftTimers[r.id]) continue;   // this device has a change on its way
    await db.checks.put({ ...remote, id: r.id, status: 'draft', userId: u.personId, syncedAt: now });
    await pullPhotos(r.id);
  }
  /* Changes made here with no signal go up now. */
  const behind = await db.checks.filter((c) => c.status === 'draft' && c.userId === u.personId && (!c.syncedAt || c.syncedAt < c.updatedAt)).toArray();
  behind.forEach((c) => syncDraftSoon(c.id));
  /* Drafts here that the office had: finished or deleted somewhere else? */
  const mine = await db.checks.filter((c) => c.status === 'draft' && c.userId === u.personId && !!c.syncedAt).toArray();
  if (!mine.length) return;
  const { data: there, error } = await supabase.from('checks').select('id, status, ref, sent_at, data').in('id', mine.map((c) => c.id));
  if (error) return;
  const byId = new Map((there || []).map((x) => [x.id as string, x]));
  for (const c of mine) {
    const x = byId.get(c.id);
    if (!x) { await db.photos.where('checkId').equals(c.id).modify({ removedAt: now }); await db.checks.delete(c.id); continue; }
    if (x.status === 'sent') await db.checks.put({ ...(x.data as Check), id: c.id, status: 'sent', ref: x.ref, sentAt: x.sent_at, userId: u.personId });
  }
}
async function pullPhotos(checkId: string) {
  const { data } = await supabase.from('photos').select('*').eq('check_id', checkId);
  const here = new Map((await db.photos.where('checkId').equals(checkId).toArray()).map((p) => [p.id, p]));
  for (const p of data || []) {
    const mine = here.get(p.id);
    if (p.removed_at) { if (mine && !mine.removedAt) await db.photos.update(p.id, { removedAt: p.removed_at }); continue; }
    if (mine && mine.fileName === p.file_name && mine.uploadedAt) continue;
    const dl = await supabase.storage.from('checks').download(p.path);
    if (dl.error || !dl.data) continue;
    const photo: PhotoRow = { id: p.id, checkId, section: p.section, refId: p.ref_id, shot: p.shot, fileName: p.file_name, bytes: p.bytes || dl.data.size,
      width: p.width || 0, height: p.height || 0, takenAt: p.taken_at, lat: p.lat, lng: p.lng, uploadedAt: p.uploaded_at, fromGallery: p.from_gallery, removedAt: null, blob: dl.data };
    await db.photos.put(photo);
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
    await Promise.all([refreshConfig(), pullTrailers(), pullLastChecks(), pullMine(), pullPeople()]);
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
