/* Names the office screens look up: people and sites, read once and refreshed
   after any change to either. */
import { useEffect, useSyncExternalStore } from 'react';
import { supabase } from '../lib/supabase';

export interface PersonRow {
  id: string; user_id: string | null; email: string; name: string; role_id: string; site_id: string | null;
  status: 'invited' | 'active' | 'locked' | 'removed'; aliases: string[]; last_active: string | null;
  pin_reset_at: string | null; locked_until: string | null; deleted_at: string | null; created_at: string;
}
export interface SiteRow { id: string; name: string; deleted_at: string | null }
interface Lookups { people: PersonRow[]; sites: SiteRow[]; loaded: boolean }

let state: Lookups = { people: [], sites: [], loaded: false };
const subs = new Set<() => void>();
function set(n: Partial<Lookups>) { state = { ...state, ...n }; subs.forEach((f) => f()); }

let inflight: Promise<void> | null = null;
export function reloadLookups() {
  inflight = (async () => {
    const [p, s] = await Promise.all([
      supabase.from('people').select('*').order('name'),
      supabase.from('sites').select('id, name, deleted_at').order('name'),
    ]);
    set({ people: (p.data || []) as PersonRow[], sites: (s.data || []) as SiteRow[], loaded: true });
  })();
  return inflight;
}
export function useLookups() {
  const s = useSyncExternalStore((f) => { subs.add(f); return () => subs.delete(f); }, () => state);
  useEffect(() => { if (!state.loaded && !inflight) reloadLookups(); }, []);
  return s;
}
export const personName = (l: Lookups, id: string | null | undefined) => l.people.find((p) => p.id === id)?.name || '';
export const siteName = (l: Lookups, id: string | null | undefined) => (id ? l.sites.find((s) => s.id === id)?.name || '' : 'All sites');
export const liveSites = (l: Lookups) => l.sites.filter((s) => !s.deleted_at);
