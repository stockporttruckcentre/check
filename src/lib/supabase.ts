import { createClient } from '@supabase/supabase-js';

export const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string;
const KEY = import.meta.env.VITE_SUPABASE_KEY as string;

/* Sessions are kept per person by lib/session.ts, so a shared yard phone can hold
   several people and switch between them. This client's own storage holds only
   whoever is using the phone now. */
export const supabase = createClient(SUPABASE_URL, KEY, {
  auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true, storageKey: 'stc-checks-auth' },
});

/* A message from the server is shown as it is when it was written for people
   (every exception raised in the migrations is). Anything else is replaced. */
export function plainError(e: unknown): string {
  const m = (e as { message?: string })?.message || '';
  if (/failed to fetch|network|load failed/i.test(m)) return 'Couldn’t reach the office. It will try again.';
  if (m && m.length < 140 && !/syntax|relation|column|violates|jwt|pgrst/i.test(m)) return m;
  return 'Something went wrong. Your work is safe on this phone.';
}
