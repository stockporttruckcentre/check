/* Signing in (source/07 S_login, README "signing in").
   First time: work email and a 6 digit code. After that: a 4 digit PIN, checked on
   the phone so it works with no signal. A shared yard phone remembers each person
   who uses it and keeps each one's session apart. */
import { useSyncExternalStore } from 'react';
import { supabase, plainError } from './supabase';
import { db, kvGet, kvSet, type DeviceUser } from './db';
import type { Perms } from '../data/types';

export const NO_PERMS: Perms = { do_checks: false, see_unfinished: false, reopen: false, people: false, edit_config: false, publish: false, undo: false, system: false };

interface SessionState { user: DeviceUser | null; ready: boolean; pendingEmail: string | null; needPin: DeviceUser | null }
let state: SessionState = { user: null, ready: false, pendingEmail: null, needPin: null };
const subs = new Set<() => void>();
function set(n: Partial<SessionState>) { state = { ...state, ...n }; subs.forEach((f) => f()); }
export const getSession = () => state;
export function useSession() { return useSyncExternalStore((f) => { subs.add(f); return () => subs.delete(f); }, () => state); }
export function perms(): Perms { return state.user?.perms || NO_PERMS; }

/* Keep the current person's refreshed tokens on the phone. */
supabase.auth.onAuthStateChange(async (ev, s) => {
  const u = state.user;
  if (!u || !s || s.user.id !== u.userId) return;
  if (ev === 'TOKEN_REFRESHED' || ev === 'SIGNED_IN') {
    const next = { ...u, session: { access_token: s.access_token, refresh_token: s.refresh_token } };
    await db.users.put(next);
    if (state.user?.personId === u.personId) set({ user: next });
  }
});

export async function startSession() {
  if (await linkSignIn()) { set({ ready: true }); return; }
  const lastId = await kvGet<string>('currentUser');
  const resumable = await kvGet<{ personId: string; at: number }>('unlocked');
  /* The app reopening within the idle window goes straight back in (source/05 S_edge, App reopened). */
  const users = await db.users.toArray();
  if (lastId && resumable && resumable.personId === lastId && Date.now() - resumable.at < 10 * 60 * 1000) {
    const u = users.find((x) => x.personId === lastId);
    if (u && u.pinHash) { await activate(u); set({ ready: true }); return; }
  }
  set({ ready: true });
}
export async function deviceUsers() { return (await db.users.toArray()).sort((a, b) => (b.lastUsed || '').localeCompare(a.lastUsed || '')); }

/* ---------- First sign in: email, then code ---------- */
export async function sendCode(email: string): Promise<string | null> {
  const e = email.trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e)) return 'That doesn’t look like an email address.';
  try {
    const ok = await supabase.rpc('can_sign_in', { p_email: e });
    if (ok.error) throw ok.error;
    if (!ok.data) return 'That email hasn’t been added. Ask your site lead to add you.';
    const r = await supabase.auth.signInWithOtp({ email: e, options: { shouldCreateUser: true, emailRedirectTo: location.origin } });
    if (r.error) throw r.error;
    set({ pendingEmail: e });
    await kvSet('codeSentAt', Date.now());
    return null;
  } catch (err) { return /rate|seconds/i.test((err as Error).message) ? 'Too many codes asked for. Wait a minute and try again.' : plainError(err); }
}

export async function verifyCode(code: string): Promise<string | null> {
  const email = state.pendingEmail;
  if (!email) return 'Start again with your email.';
  const r = await supabase.auth.verifyOtp({ email, token: code, type: 'email' });
  if (r.error || !r.data.session) return /expired/i.test(r.error?.message || '') ? 'That code has run out. Send a new one.' : 'That code isn’t right. Check the email and try again.';
  return finishSignIn(r.data.session, email);
}

/* The same email also carries a link. Tapping it on the phone signs in just as the code does. */
const FROM_LINK = typeof location !== 'undefined' && /access_token=|[?&]code=|token_hash=/.test(location.href);
async function linkSignIn(): Promise<boolean> {
  if (!FROM_LINK) return false;
  const { data } = await supabase.auth.getSession();
  history.replaceState(null, '', location.pathname);
  const s = data.session;
  if (!s || !s.user.email) return false;
  const err = await finishSignIn(s, s.user.email.toLowerCase());
  return !err;
}

async function finishSignIn(s: { access_token: string; refresh_token: string; user: { id: string } }, email: string): Promise<string | null> {
  const me = await supabase.rpc('touch_me');
  if (me.error || !me.data) return 'That email hasn’t been added. Ask your site lead to add you.';
  const d = me.data as { person: Record<string, unknown>; role: { id: string; name: string; perms: Perms }; site: { id: string; name: string } | null };
  const u: DeviceUser = {
    personId: d.person.id as string, userId: s.user.id, name: d.person.name as string, email,
    roleId: d.role.id, roleName: d.role.name, perms: d.role.perms, siteId: d.site?.id || null, siteName: d.site?.name || 'All sites',
    aliases: (d.person.aliases as string[]) || [],
    session: { access_token: s.access_token, refresh_token: s.refresh_token },
    pinHash: null, pinSalt: null, pinSetAt: null, lastUsed: new Date().toISOString(), fails: 0, lockedUntil: null,
  };
  await db.users.put(u);
  set({ pendingEmail: null, needPin: u });
  return null;
}

/* ---------- PIN ---------- */
const SIMPLE = /^(\d)\1{3}$/;
export function pinProblem(pin: string): string | null {
  const seq = '01234567890', rev = '09876543210';
  if (SIMPLE.test(pin)) return 'Not ' + pin + '. Pick four digits that aren’t all the same.';
  if (seq.includes(pin) || rev.includes(pin)) return 'Not ' + pin + '. Pick four digits that aren’t in a row.';
  if (/^(19|20)\d\d$/.test(pin)) return 'Not a year. Pick four other digits.';
  return null;
}
async function hashPin(pin: string, salt: string) {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(pin), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt: new TextEncoder().encode(salt), iterations: 150000 }, key, 256);
  return [...new Uint8Array(bits)].map((b) => b.toString(16).padStart(2, '0')).join('');
}
export async function setPin(u: DeviceUser, pin: string) {
  const salt = crypto.getRandomValues(new Uint32Array(4)).join('-');
  const next = { ...u, pinSalt: salt, pinHash: await hashPin(pin, salt), pinSetAt: new Date().toISOString(), fails: 0, lockedUntil: null };
  await db.users.put(next);
  set({ needPin: null });
  await activate(next);
}

export type UnlockResult = { ok: true } | { ok: false; left: number; locked: boolean; message: string };
export async function unlock(u: DeviceUser, pin: string, tries: number, lockMinutes: number): Promise<UnlockResult> {
  if (u.lockedUntil && new Date(u.lockedUntil) > new Date()) {
    return { ok: false, left: 0, locked: true, message: 'Locked. Try again after ' + new Date(u.lockedUntil).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }) + '.' };
  }
  const h = await hashPin(pin, u.pinSalt || '');
  if (h === u.pinHash) {
    await db.users.put({ ...u, fails: 0, lockedUntil: null });
    await activate({ ...u, fails: 0, lockedUntil: null });
    return { ok: true };
  }
  const fails = (u.fails || 0) + 1;
  const locked = fails >= tries;
  const next = { ...u, fails: locked ? 0 : fails, lockedUntil: locked ? new Date(Date.now() + lockMinutes * 60000).toISOString() : null };
  await db.users.put(next);
  if (locked && navigator.onLine && u.session) {
    try { const c = await clientFor(u); await c.rpc('pin_locked'); } catch { /* recorded on the phone; the office sees it next time */ }
  }
  const left = tries - fails;
  return { ok: false, left: locked ? 0 : left, locked, message: locked ? 'Wrong PIN. Locked for ' + lockMinutes + ' minutes.' : 'Wrong PIN. ' + left + (left === 1 ? ' try left.' : ' tries left.') };
}

/** Forgot PIN: a new code goes to their email, then they pick a new PIN. */
export async function forgotPin(u: DeviceUser) { return sendCode(u.email); }

/* ---------- Being signed in ---------- */
async function activate(u: DeviceUser) {
  const now = new Date().toISOString();
  const next = { ...u, lastUsed: now };
  await db.users.put(next);
  await kvSet('currentUser', u.personId);
  await kvSet('unlocked', { personId: u.personId, at: Date.now() });
  set({ user: next });
  if (u.session && navigator.onLine) {
    const r = await supabase.auth.setSession(u.session);
    if (!r.error && r.data.session) {
      next.session = { access_token: r.data.session.access_token, refresh_token: r.data.session.refresh_token };
      await refreshMe(next);
    } else if (r.error && /refresh token|invalid/i.test(r.error.message)) {
      /* The office removed them, or their session ran out: they sign in with email again. */
      await db.users.put({ ...next, session: null });
      set({ user: { ...next, session: null } });
    }
  }
}

/** Picks up role, site and PIN reset changes from the office. */
export async function refreshMe(u = state.user) {
  if (!u) return;
  const me = await supabase.rpc('touch_me');
  if (me.error) return;
  if (!me.data) { await removeFromPhone(u.personId, true); return; }
  const d = me.data as { person: { name: string; aliases: string[]; pin_reset_at: string | null; status: string }; role: { id: string; name: string; perms: Perms }; site: { id: string; name: string } | null };
  if (d.person.status === 'removed') { await removeFromPhone(u.personId, true); return; }
  const next: DeviceUser = { ...u, name: d.person.name, aliases: d.person.aliases || [], roleId: d.role.id, roleName: d.role.name, perms: d.role.perms, siteId: d.site?.id || null, siteName: d.site?.name || 'All sites' };
  if (d.person.pin_reset_at && (!u.pinSetAt || d.person.pin_reset_at > u.pinSetAt)) { next.pinHash = null; next.pinSalt = null; }
  await db.users.put(next);
  if (state.user?.personId === next.personId) set({ user: next, needPin: next.pinHash ? null : next });
}

/** Idle sign out: the phone locks, the check stays saved under the person who started it. */
export async function lockPhone() {
  await kvSet('unlocked', null);
  set({ user: null });
}
export function markActive() {
  if (state.user) kvSet('unlocked', { personId: state.user.personId, at: Date.now() });
}

/** Sign out takes this person off the phone. Refused while they have unsent work. */
export async function signOut(u: DeviceUser, force = false): Promise<string | null> {
  const waiting = await db.checks.where('userId').equals(u.personId).filter((c) => c.status === 'waiting').count();
  if (waiting && !force) return waiting + (waiting === 1 ? ' inspection hasn’t sent yet' : ' inspections haven’t sent yet');
  await removeFromPhone(u.personId, false);
  try { await supabase.auth.signOut({ scope: 'local' }); } catch { /* offline */ }
  return null;
}
async function removeFromPhone(personId: string, removedByOffice: boolean) {
  await db.users.delete(personId);
  if (state.user?.personId === personId) { await kvSet('unlocked', null); set({ user: null }); }
  if (removedByOffice) await kvSet('removedNotice', Date.now());
}

/* ---------- A client signed in as a given person, for sending their work ---------- */
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { SUPABASE_URL } from './supabase';
const clients = new Map<string, SupabaseClient>();
export async function clientFor(u: DeviceUser): Promise<SupabaseClient> {
  if (state.user?.personId === u.personId) return supabase;
  let c = clients.get(u.personId);
  if (!c) {
    c = createClient(SUPABASE_URL, import.meta.env.VITE_SUPABASE_KEY as string, { auth: { persistSession: false, autoRefreshToken: true, storageKey: 'stc-checks-' + u.personId } });
    c.auth.onAuthStateChange(async (_e, s) => {
      if (!s) return;
      const cur = await db.users.get(u.personId);
      if (cur) await db.users.put({ ...cur, session: { access_token: s.access_token, refresh_token: s.refresh_token } });
    });
    clients.set(u.personId, c);
  }
  const cur = (await db.users.get(u.personId)) || u;
  if (cur.session) await c.auth.setSession(cur.session);
  return c;
}
