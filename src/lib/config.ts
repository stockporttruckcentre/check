/* The live checklist and the system settings, as the phone holds them.
   Loaded from the phone's copy first (so it works with no signal), then refreshed
   from the office, and refreshed again whenever a new version is published. */
import { useSyncExternalStore } from 'react';
import { supabase } from './supabase';
import { kvGet, kvSet } from './db';
import { DEFAULT_CONFIG, DEFAULT_SETTINGS } from '../data/defaults';
import type { Config, SystemSettings, Role, Site } from '../data/types';

export interface ConfigState { number: number; config: Config; settings: SystemSettings; roles: Role[]; sites: Site[]; loadedFromServer: boolean; versions: Record<number, Config> }

let state: ConfigState = { number: 1, config: DEFAULT_CONFIG, settings: DEFAULT_SETTINGS, roles: [], sites: [], loadedFromServer: false, versions: { 1: DEFAULT_CONFIG } };
const subs = new Set<() => void>();
function set(next: Partial<ConfigState>) { state = { ...state, ...next }; subs.forEach((f) => f()); }
export const getConfig = () => state;
export function useConfig() { return useSyncExternalStore((f) => { subs.add(f); return () => subs.delete(f); }, () => state); }

/** A check finishes on the version it began with (README, Flow). */
export function configFor(version: number | null | undefined): Config {
  if (version && state.versions[version]) return state.versions[version];
  return state.config;
}

export async function loadCachedConfig() {
  const c = await kvGet<ConfigState>('config');
  if (c) set({ ...c, loadedFromServer: false, config: { ...DEFAULT_CONFIG, ...c.config } });
}

export async function refreshConfig() {
  const [live, settings, roles, sites] = await Promise.all([
    supabase.from('config_versions').select('number, config').eq('status', 'live').maybeSingle(),
    supabase.from('settings').select('key, value'),
    supabase.from('roles').select('*').order('sort'),
    supabase.from('sites').select('id, name').is('deleted_at', null).order('name'),
  ]);
  if (live.error) throw live.error;
  const s: SystemSettings = { ...DEFAULT_SETTINGS };
  for (const r of settings.data || []) {
    if (r.key === 'photo') s.photo = { ...s.photo, ...(r.value as object) };
    if (r.key === 'records') s.records = { ...s.records, ...(r.value as object) };
  }
  const versions = { ...state.versions };
  if (live.data) versions[live.data.number] = { ...DEFAULT_CONFIG, ...(live.data.config as Config) };
  set({
    number: live.data?.number || state.number,
    config: live.data ? versions[live.data.number] : state.config,
    settings: s, roles: (roles.data || []) as Role[], sites: (sites.data || []) as Site[], loadedFromServer: true, versions,
  });
  await kvSet('config', state);
}

/** Fetch an older version a check started on, so it can finish on it. */
export async function ensureVersion(n: number) {
  if (state.versions[n]) return;
  const { data } = await supabase.from('config_versions').select('number, config').eq('number', n).maybeSingle();
  if (data) { set({ versions: { ...state.versions, [n]: { ...DEFAULT_CONFIG, ...(data.config as Config) } } }); await kvSet('config', state); }
}

let channel: ReturnType<typeof supabase.channel> | null = null;
export function watchConfig() {
  if (channel) return;
  channel = supabase.channel('config-live')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'config_versions' }, () => { refreshConfig().catch(() => {}); })
    .subscribe();
}

/** Preview on phone (source/07 S_builder): the office opens the app with ?preview=draft and
    sees the draft as yard staff will. Checks started in a preview can't be sent. */
export const isPreview = () => {
  try {
    if (new URLSearchParams(location.search).get('preview') === 'draft') sessionStorage.setItem('stc-preview', '1');
    return sessionStorage.getItem('stc-preview') === '1';
  } catch { return false; }
};
export async function loadPreview() {
  const { data } = await supabase.from('config_versions').select('number, config').eq('status', 'draft').maybeSingle();
  if (!data) return false;
  const cfg = { ...DEFAULT_CONFIG, ...(data.config as Config) };
  set({ number: data.number, config: cfg, versions: { ...state.versions, [data.number]: cfg } });
  return true;
}
