/* What the last sent check on this trailer left on the phone (db.lastChecks), and the
   signed address of one of its photos. The photos are the only thing here that needs
   signal: with none, the caller shows the pack's grey photo tile instead. */
import { useEffect, useState } from 'react';
import { db, type LastCheck } from '../../lib/db';
import { supabase } from '../../lib/supabase';

export function useLastCheck(stcNo: string | undefined) {
  const [last, setLast] = useState<LastCheck | null>(null);
  useEffect(() => {
    let on = true;
    if (!stcNo) { setLast(null); return; }
    db.lastChecks.get(stcNo).then((r) => { if (on) setLast(r || null); }).catch(() => { if (on) setLast(null); });
    return () => { on = false; };
  }, [stcNo]);
  return last;
}

const signed = new Map<string, string>();

export function useSignedUrl(path: string | null | undefined, online: boolean) {
  const [url, setUrl] = useState<string | null>(path ? signed.get(path) || null : null);
  useEffect(() => {
    let on = true;
    if (!path) { setUrl(null); return; }
    const hit = signed.get(path);
    if (hit) { setUrl(hit); return; }
    if (!online) { setUrl(null); return; }
    supabase.storage.from('checks').createSignedUrl(path, 3600)
      .then(({ data }) => { if (data?.signedUrl) { signed.set(path, data.signedUrl); if (on) setUrl(data.signedUrl); } })
      .catch(() => { /* no signal after all: the grey tile stays */ });
    return () => { on = false; };
  }, [path, online]);
  return url;
}

/** The photo the last check took of one of its pins: the close-up first, then the wide shot. */
export function lastPinPhoto(last: LastCheck | null, pinId: string): string | null {
  if (!last) return null;
  const ph = last.photos.filter((x) => x.section === 'D' && x.ref === pinId).sort((a, b) => a.shot - b.shot);
  return ph[0]?.path || null;
}
