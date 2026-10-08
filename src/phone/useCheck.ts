/* One check, open on the phone. Every change is written to the phone straight away
   (README: "Auto-save on every change") and the top bar pill says so. */
import { useCallback, useEffect, useRef, useState } from 'react';
import { liveQuery } from 'dexie';
import { db, type PhotoRow } from '../lib/db';
import type { Check, PhotoMeta } from '../data/types';
import { uuid } from '../lib/ids';
import { photoFileName } from '../lib/check';
import type { Taken } from './Camera';
import type { SaveState } from '../kit/kit';
import { kick, syncDraftSoon } from '../lib/sync';

const urls = new Map<string, string>();

export function useOnline() {
  const [on, setOn] = useState(typeof navigator === 'undefined' ? true : navigator.onLine);
  useEffect(() => {
    const a = () => setOn(true), b = () => setOn(false);
    window.addEventListener('online', a); window.addEventListener('offline', b);
    return () => { window.removeEventListener('online', a); window.removeEventListener('offline', b); };
  }, []);
  return on;
}

export function useCheck(id: string | undefined) {
  const [check, setCheck] = useState<Check | null | undefined>(undefined);
  const [photos, setPhotos] = useState<PhotoMeta[]>([]);
  const [save, setSave] = useState<SaveState>('saved');
  const online = useOnline();
  const latest = useRef<Check | null>(null);

  useEffect(() => {
    if (!id) return;
    const a = liveQuery(() => db.checks.get(id)).subscribe((c) => { latest.current = c || null; setCheck(c || null); });
    const b = liveQuery(() => db.photos.where('checkId').equals(id).toArray()).subscribe((rows) =>
      setPhotos(rows.map(({ blob: _b, ...m }) => { void _b; return m; })));
    return () => { a.unsubscribe(); b.unsubscribe(); };
  }, [id]);

  const update = useCallback(async (fn: (c: Check) => void) => {
    const cur = latest.current;
    if (!cur || cur.status === 'sent') return;
    const next: Check = structuredClone(cur);
    fn(next);
    next.updatedAt = new Date().toISOString();
    latest.current = next;
    setCheck(next);
    setSave('saving');
    try { await db.checks.put(next); setSave('saved'); if (next.status === 'draft') syncDraftSoon(next.id); } catch { setSave('fail'); }
  }, []);

  /** Saves a photo the camera has just taken, named by the app (README, File naming). */
  const addPhoto = useCallback(async (t: Taken, section: 'P' | 'D' | 'T' | 'R', refId: string, nn: number, label: string, shot: number) => {
    const c = latest.current;
    if (!c) return;
    const existing = await db.photos.where('checkId').equals(c.id).filter((p) => p.section === section && p.refId === refId && p.shot === shot && !p.removedAt).first();
    const row: PhotoRow = {
      id: existing?.id || uuid(), checkId: c.id, section, refId, shot,
      fileName: photoFileName(c, section, nn, label, section === 'P' || section === 'T' ? null : shot),
      bytes: t.bytes, width: t.width, height: t.height, takenAt: t.takenAt, lat: t.lat, lng: t.lng,
      uploadedAt: null, fromGallery: t.fromGallery, blob: t.blob,
    };
    const old = urls.get(row.id); if (old) { URL.revokeObjectURL(old); urls.delete(row.id); }
    setSave('saving');
    try { await db.photos.put(row); await db.kv.put({ key: 'hash:' + row.id, value: t.hash }); setSave('saved'); }
    catch { setSave('fail'); throw new Error('Photo didn’t save. Your phone is full. Delete old photos and try again.'); }
    await update(() => {});
  }, [update]);

  /** Moves a photo to the bin on the phone. It can come back for 30 days. */
  const removePhoto = useCallback(async (photoId: string, restore = false) => {
    await db.photos.update(photoId, { removedAt: restore ? null : new Date().toISOString() });
    await update(() => {});
  }, [update]);

  const saveState: SaveState = save === 'saved' && !online ? 'off' : save;
  return { check, photos, update, addPhoto, removePhoto, save: saveState, online, kick };
}

/** An object URL for a photo on the phone, cached for the session. */
export async function photoUrl(id: string): Promise<string | null> {
  if (urls.has(id)) return urls.get(id)!;
  const r = await db.photos.get(id);
  if (!r) return null;
  const u = URL.createObjectURL(r.blob);
  urls.set(id, u);
  return u;
}
export function usePhotoUrl(id: string | undefined | null) {
  const [u, setU] = useState<string | null>(null);
  useEffect(() => { let on = true; if (id) photoUrl(id).then((x) => on && setU(x)); else setU(null); return () => { on = false; }; }, [id]);
  return u;
}
