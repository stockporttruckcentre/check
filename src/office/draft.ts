/* The checklist the office is editing. Every change goes into one draft version on
   the server (save_draft), shared by everybody editing, until it is published or
   discarded. The live version keeps running until then (source/07 S_builder rules). */
import { useSyncExternalStore } from 'react';
import { supabase } from '../lib/supabase';
import { refreshConfig } from '../lib/config';
import { DEFAULT_CONFIG } from '../data/defaults';
import type { Config } from '../data/types';
import { diff } from './diff';

export interface DraftState {
  loaded: boolean; liveNumber: number; live: Config; draftNumber: number | null; draft: Config | null; maxNumber: number;
  saving: boolean; error: string | null;
}
let state: DraftState = { loaded: false, liveNumber: 0, live: DEFAULT_CONFIG, draftNumber: null, draft: null, maxNumber: 0, saving: false, error: null };
const subs = new Set<() => void>();
function set(n: Partial<DraftState>) { state = { ...state, ...n }; subs.forEach((f) => f()); }
export const getDraft = () => state;
export function useDraft() { return useSyncExternalStore((f) => { subs.add(f); return () => subs.delete(f); }, () => state); }

export const full = (c: unknown): Config => ({ ...DEFAULT_CONFIG, ...(c as Config) });
const clone = <T,>(x: T): T => JSON.parse(JSON.stringify(x)) as T;

export async function loadDraft() {
  const [rows, max] = await Promise.all([
    supabase.from('config_versions').select('number, status, config').in('status', ['draft', 'live']),
    supabase.from('config_versions').select('number').order('number', { ascending: false }).limit(1),
  ]);
  if (rows.error) { set({ loaded: true, error: rows.error.message }); return; }
  const live = rows.data.find((r) => r.status === 'live');
  const draft = rows.data.find((r) => r.status === 'draft');
  if (timer) return; /* an unsaved edit is newer than what the server has */
  set({
    loaded: true, error: null,
    liveNumber: live?.number || 0, live: live ? full(live.config) : DEFAULT_CONFIG,
    draftNumber: draft?.number ?? null, draft: draft ? full(draft.config) : null,
    maxNumber: max.data?.[0]?.number || live?.number || 0,
  });
}

/** The number the draft has, or will have once the first change is saved. */
export const draftNo = (s: DraftState) => s.draftNumber ?? s.maxNumber + 1;
/** The checklist as the editor sees it: the draft, or the live version until something changes. */
export const working = (s: DraftState) => s.draft || s.live;

let timer: ReturnType<typeof setTimeout> | null = null;
let pending: Promise<void> | null = null;
let onError: ((m: string) => void) | null = null;
export function onSaveError(f: (m: string) => void) { onError = f; }

export function editDraft(fn: (c: Config) => void) {
  const next = clone(working(state));
  fn(next);
  set({ draft: next });
  if (timer) clearTimeout(timer);
  timer = setTimeout(() => { timer = null; pending = save(); }, 700);
}
async function save() {
  const c = state.draft;
  if (!c) return;
  set({ saving: true });
  const r = await supabase.rpc('save_draft', { p_config: c });
  if (r.error) { set({ saving: false, error: r.error.message }); if (onError) onError(r.error.message); return; }
  set({ saving: false, error: null, draftNumber: r.data as number, maxNumber: Math.max(state.maxNumber, r.data as number) });
}
/** Writes any change still waiting, so a publish or a restore sees everything. */
export async function flushDraft() {
  if (timer) { clearTimeout(timer); timer = null; pending = save(); }
  if (pending) await pending;
}
/** Puts a change straight into the draft and waits for the server to have it. */
export async function editDraftNow(fn: (c: Config) => void) {
  editDraft(fn);
  await flushDraft();
  if (state.error) throw new Error(state.error);
}

export async function discardDraft() {
  if (timer) { clearTimeout(timer); timer = null; }
  const r = await supabase.rpc('discard_draft');
  if (r.error) throw r.error;
  set({ draft: null, draftNumber: null });
  await loadDraft();
}
export async function publishDraft(reason: string) {
  await flushDraft();
  const changed = state.draft ? diff(state.live, state.draft).length : 0;
  const r = await supabase.rpc('publish_draft', { p_reason: reason, p_changed: changed });
  if (r.error) throw r.error;
  set({ draft: null, draftNumber: null });
  await loadDraft();
  try { await refreshConfig(); } catch { /* the phone picks it up on its own */ }
  return r.data as number;
}

let channel: ReturnType<typeof supabase.channel> | null = null;
export function watchDraft() {
  if (channel) return;
  channel = supabase.channel('office-config')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'config_versions' }, () => { loadDraft().catch(() => {}); })
    .subscribe();
}
