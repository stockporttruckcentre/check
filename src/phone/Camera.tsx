/* The camera, from source/04 camUI (portrait shot), source/04 s5 (check the photo),
   source/05 S_camera (blocked, blurry) and source/08 E (labelled damage camera,
   landscape). One loop for every photo: see what's needed, take it, check it, tick. */
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { css } from '../kit/css';
import { ic, sg, btn, footer, photo, sheet } from '../kit/kit';
import { PT, R } from '../kit/tokens';
import { shrink, fromFile, quality, nearCopy, position, buzz, type Shrunk } from '../lib/photo';
import { getConfig } from '../lib/config';

export interface Taken extends Shrunk { takenAt: string; lat: number | null; lng: number | null; hash: string; fromGallery: boolean }

export interface CameraProps {
  title: string;          // "Front corner, nearside"
  n?: string;             // "2 OF 9"
  guide?: string;         // where to stand
  frame?: string;         // "Whole trailer inside the box"
  review?: string;        // "Is the whole corner in?"
  pinTag?: string;        // "PIN 2": the labelled damage camera
  corner?: ReactNode;     // the pin on its drawing, shown in the corner
  lastThumb?: string | null;
  earlier?: { label: string; hash: string }[];  // for "This looks the same as the Front photo"
  onUse: (t: Taken) => void | Promise<void>;
  onClose: () => void;
}

function isLandscape() { return typeof window !== 'undefined' && window.matchMedia('(orientation: landscape)').matches; }

export default function Camera(p: CameraProps) {
  const video = useRef<HTMLVideoElement>(null);
  const stream = useRef<MediaStream | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const [blocked, setBlocked] = useState(false);
  const [help, setHelp] = useState(false);
  const [torch, setTorch] = useState<boolean | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [shot, setShot] = useState<(Taken & { url: string; warn: null | 'blurry' | 'dark' | { same: string } }) | null>(null);
  const [land, setLand] = useState(isLandscape());
  const allowGallery = getConfig().config.allowGallery;

  async function start() {
    setBlocked(false);
    try {
      const s = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' }, width: { ideal: 4032 }, height: { ideal: 3024 } }, audio: false });
      stream.current = s;
      if (video.current) { video.current.srcObject = s; await video.current.play().catch(() => {}); }
      const track = s.getVideoTracks()[0];
      const caps = (track.getCapabilities?.() || {}) as MediaTrackCapabilities & { torch?: boolean };
      setTorch(caps.torch ? false : null);
    } catch {
      setBlocked(true);
    }
  }
  /* The live view is a new element every time the camera comes back from checking a photo or turns
     sideways, so the running camera is joined to whichever element is on screen. */
  const attach = useCallback((el: HTMLVideoElement | null) => {
    video.current = el;
    const s = stream.current;
    if (el && s && el.srcObject !== s) { el.srcObject = s; el.play().catch(() => {}); }
  }, []);
  useEffect(() => {
    start();
    const mq = window.matchMedia('(orientation: landscape)');
    const on = () => setLand(mq.matches);
    mq.addEventListener('change', on);
    return () => { mq.removeEventListener('change', on); stream.current?.getTracks().forEach((t) => t.stop()); };
  }, []);

  async function toggleTorch() {
    const track = stream.current?.getVideoTracks()[0];
    if (!track || torch === null) return;
    try { await track.applyConstraints({ advanced: [{ torch: !torch } as MediaTrackConstraintSet] }); setTorch(!torch); } catch { setTorch(null); }
  }

  async function finish(sh: Shrunk, fromGallery: boolean) {
    const [q, pos] = await Promise.all([quality(sh.blob), position()]);
    const same = (p.earlier || []).find((e) => nearCopy(e.hash, q.hash));
    const warn = q.blurry ? 'blurry' as const : q.dark ? 'dark' as const : same ? { same: same.label } : null;
    if (warn) buzz('firm');
    setShot({ ...sh, takenAt: new Date().toISOString(), lat: pos?.lat ?? null, lng: pos?.lng ?? null, hash: q.hash, fromGallery, url: URL.createObjectURL(sh.blob), warn });
  }

  async function capture() {
    if (busy || !video.current) return;
    setBusy(true); setErr(null);
    try {
      const v = video.current;
      /* A picture only exists once the camera has sent its first frame. */
      if (!v.videoWidth) await new Promise<void>((res) => { const t = setTimeout(res, 2500); v.addEventListener('loadeddata', () => { clearTimeout(t); res(); }, { once: true }); });
      if (!v.videoWidth) throw new Error('not ready');
      let sh: Shrunk | null = null;
      const track = stream.current?.getVideoTracks()[0];
      const IC = (window as unknown as { ImageCapture?: new (t: MediaStreamTrack) => { takePhoto: () => Promise<Blob> } }).ImageCapture;
      if (IC && track) {
        try {
          const full = await new IC(track).takePhoto();
          const bmp = await createImageBitmap(full, { imageOrientation: 'from-image' } as ImageBitmapOptions);
          sh = await shrink(bmp, bmp.width, bmp.height, getConfig().settings.photo); bmp.close();
        } catch { sh = null; }
      }
      if (!sh) sh = await shrink(v, v.videoWidth, v.videoHeight, getConfig().settings.photo);
      await finish(sh, false);
    } catch (e) {
      const m = (e as Error).message || '';
      setErr(m.startsWith('Photo') ? m : 'The camera wasn’t ready. Wait a second and take it again.');
    } finally { setBusy(false); }
  }

  async function pickFile(f: File | undefined) {
    if (!f) return;
    setBusy(true);
    setErr(null);
    try { await finish(await fromFile(f, getConfig().settings.photo), true); }
    catch { setErr('That photo couldn’t be opened. Pick another or take one.'); }
    finally { setBusy(false); if (fileInput.current) fileInput.current.value = ''; }
  }

  async function use() {
    if (!shot) return;
    const s = shot;
    buzz('light');
    setShot(null);
    URL.revokeObjectURL(s.url);
    await p.onUse(s);
  }
  function retake() { if (shot) URL.revokeObjectURL(shot.url); setShot(null); }

  const wrap = 'position:fixed;inset:0;z-index:40;display:flex;flex-direction:column;font-family:\'Inter\',system-ui,sans-serif';

  if (blocked) {
    return (
      <div style={css(wrap + ';background:#111;color:#fff')}>
        <div style={css('flex:1;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:16px;padding:28px;text-align:center;background:#111;color:#fff')}>
          {sg('miss', 56)}
          <div style={css('font-family:' + PT + ';font-weight:800;font-size:24px')}>The app can&rsquo;t use the camera</div>
          <div style={css('font-size:17px;line-height:1.5;opacity:0.9')}>Photos are needed for every check. Turn on camera access for STC Checks in your phone settings.</div>
        </div>
        {footer(<>{btn('Try again', 'p', { onClick: start })}{btn('How do I do this?', 'g', { h: 56, onClick: () => setHelp(true) })}{btn('Close', 'g', { h: 56, onClick: p.onClose })}</>)}
        {help ? sheet(<>
          <div style={css('font-family:' + PT + ';font-weight:800;font-size:22px')}>Turn the camera on</div>
          <div style={css('font-size:17px;line-height:1.45')}><b>iPhone:</b> Settings, Safari, Camera, Allow. If STC Checks is on your home screen, open it again after.</div>
          <div style={css('font-size:17px;line-height:1.45')}><b>Android:</b> tap the lock beside the web address, Permissions, Camera, Allow.</div>
          {btn('Try again', 'p', { onClick: () => { setHelp(false); start(); } })}
        </>, { onClose: () => setHelp(false), label: 'Turn the camera on' }) : null}
      </div>
    );
  }

  /* Check the photo (s5), or the poor photo warning (S_camera b). */
  if (shot) {
    const w = shot.warn;
    const warnTitle = w === 'blurry' ? 'This photo looks blurry' : w === 'dark' ? 'This photo looks too dark' : w ? 'This looks the same as the ' + w.same + ' photo. Retake?' : null;
    return (
      <div style={css(wrap + ';background:#000')}>
        <div style={css('padding:12px 16px;color:#fff')}>
          {w ? null : <div style={css('font-size:13px;font-weight:700;opacity:0.85')}>{p.pinTag ? p.pinTag : 'PHOTO ' + (p.n || '')}</div>}
          <div style={css('font-family:' + PT + ';font-weight:800;font-size:22px')}>{warnTitle || p.review || p.title}</div>
          {w === 'blurry' || w === 'dark' ? <div style={css('font-size:16px;opacity:0.9;margin-top:4px')}>The office might not be able to see damage in it.</div> : null}
        </div>
        <div style={css('padding:0 12px;flex:1;min-height:0;display:flex;align-items:flex-start')}>
          <div style={{ width: '100%', maxHeight: '100%' }}>{photo(p.title.split(',')[0] ? labelFor(p) : '', { ar: shot.width + '/' + shot.height, src: shot.url, css: 'max-height:62dvh;margin:0 auto' + (w === 'blurry' ? ';filter:blur(0)' : '') })}</div>
        </div>
        {w
          ? <div style={css('padding:14px 16px 26px;margin-top:auto;display:flex;flex-direction:column;gap:10px')}>
              {btn('Retake', 'p', { ic: 'retake', css: 'background:#fff;color:#000;border-color:#fff', onClick: retake })}
              {btn('Use it anyway', 'g', { h: 56, css: 'color:#fff;border:2px solid rgba(255,255,255,0.5)', onClick: use })}
            </div>
          : <div style={css('padding:14px 16px 26px;margin-top:auto;display:grid;grid-template-columns:1fr 1.4fr;gap:10px')}>
              {btn('Retake', 's', { ic: 'retake', css: 'background:#111;color:#fff;border-color:#fff', onClick: retake })}
              {btn('Use photo', 'ok', { ic: 'tick', onClick: use })}
            </div>}
      </div>
    );
  }

  const errEl = err ? <div role="alert" style={css('position:absolute;left:16px;right:16px;bottom:140px;z-index:1;padding:12px 14px;border-radius:10px;background:' + R + ';color:#fff;font-size:16px;font-weight:700;text-align:center')}>{err}</div> : null;
  const shutter = (
    <button type="button" className="k-tap k-reset" onClick={capture} aria-label="Take photo" disabled={busy}
      style={{ ...css('width:84px;height:84px;border-radius:50%;border:5px solid #fff;box-shadow:0 0 0 3px rgba(0,0,0,0.4);background:#fff;padding:0;flex:none'), opacity: busy ? 0.6 : 1 }} />
  );
  const galleryBtn = (
    <button type="button" className="k-tap k-reset" onClick={() => allowGallery && fileInput.current?.click()} disabled={!allowGallery} aria-label="Choose from gallery"
      title={allowGallery ? undefined : 'Photos from the gallery are turned off in the office (Lists and wording)'}
      style={{ ...css('width:56px;height:56px;border-radius:8px;border:2px solid rgba(255,255,255,0.6);color:#fff;display:flex;align-items:center;justify-content:center;background:transparent;padding:0'), opacity: allowGallery ? 1 : 0.4 }}>{ic('image', 26, '#fff')}</button>
  );
  const thumb = p.lastThumb
    ? <span style={css('width:56px;height:56px;border-radius:8px;background:#5B6476;border:2px solid #fff;position:relative;background-size:cover;background-position:center;background-image:url(' + p.lastThumb + ')')}><span style={css('position:absolute;right:-8px;top:-8px')}>{sg('done', 22)}</span></span>
    : <span style={css('width:56px;height:56px')} />;
  const videoEl = <video ref={attach} playsInline muted autoPlay style={css('position:absolute;inset:0;width:100%;height:100%;object-fit:cover')} />;
  const input = <input ref={fileInput} type="file" accept="image/*" hidden onChange={(e) => pickFile(e.target.files?.[0])} />;

  /* Labelled damage camera, landscape (source/08 E). */
  if (p.pinTag && land) {
    return (
      <div style={css(wrap + ';background:linear-gradient(180deg,#4A5262,#2A2F38 60%,#1A1D22);color:#fff')}>
        {videoEl}{input}{errEl}
        <div style={css('position:absolute;left:0;right:0;top:0;padding:12px 18px;background:linear-gradient(180deg,rgba(0,0,0,0.75),transparent);display:flex;align-items:center;gap:12px')}>
          <button type="button" className="k-tap k-reset" onClick={p.onClose} aria-label="Close" style={css('width:44px;height:44px;display:flex;align-items:center;justify-content:center;background:transparent;border:0;color:#fff')}>{ic('cross', 24, '#fff')}</button>
          <span style={css('font-size:12px;font-weight:800;padding:4px 10px;border-radius:999px;background:' + R)}>{p.pinTag}</span>
          <span style={css('font-weight:800;font-size:16px')}>{p.title}</span>
        </div>
        <div style={css('position:absolute;left:120px;right:140px;top:70px;bottom:40px;border:3px dashed rgba(255,255,255,0.8);border-radius:10px;pointer-events:none')} />
        {p.corner ? <div style={css('position:absolute;left:14px;bottom:14px;width:150px;border-radius:8px;background:rgba(255,255,255,0.92);padding:6px')}>{p.corner}</div> : null}
        <div style={css('position:absolute;right:26px;top:50%;transform:translateY(-50%);display:flex;flex-direction:column;align-items:center;gap:14px')}>{shutter}</div>
      </div>
    );
  }

  /* The shot (source/04 camUI). */
  return (
    <div style={css(wrap + ';background:linear-gradient(180deg,#4A5262,#2A2F38 60%,#1A1D22)')}>
      {videoEl}{input}{errEl}
      <div style={css('position:absolute;left:0;right:0;top:0;padding:12px 16px;background:linear-gradient(180deg,rgba(0,0,0,0.75),transparent);color:#fff')}>
        <div style={css('display:flex;align-items:center;gap:10px')}>
          <button type="button" className="k-tap k-reset" onClick={p.onClose} aria-label="Close" style={css('width:48px;height:48px;display:flex;align-items:center;justify-content:center;background:transparent;border:0;color:#fff;padding:0')}>{ic('cross', 26, '#fff')}</button>
          <div style={css('flex:1')}>
            <div style={css('font-size:13px;font-weight:700;opacity:0.85')}>{p.pinTag ? p.pinTag : 'PHOTO ' + (p.n || '')}</div>
            <div style={css('font-family:' + PT + ';font-weight:800;font-size:22px')}>{p.title}</div>
          </div>
          <button type="button" className="k-tap k-reset" onClick={toggleTorch} disabled={torch === null} aria-label="Torch" aria-pressed={!!torch}
            title={torch === null ? 'This phone doesn’t let the app use its torch' : undefined}
            style={{ ...css('width:48px;height:48px;display:flex;align-items:center;justify-content:center;background:transparent;border:0;padding:0'), opacity: torch === null ? 0.4 : 1 }}>{ic('flash', 24, torch ? '#F7D117' : '#fff')}</button>
        </div>
        {p.guide ? <div style={css('font-size:16px;margin-top:4px;padding-left:58px;line-height:1.35')}>{p.guide}</div> : null}
      </div>
      {p.frame
        ? <div style={css('position:absolute;left:24px;right:24px;top:200px;height:240px;border:3px dashed rgba(255,255,255,0.9);border-radius:10px;display:flex;align-items:flex-end;justify-content:center;padding-bottom:10px;pointer-events:none')}><span style={css('padding:6px 10px;border-radius:6px;background:rgba(0,0,0,0.6);color:#fff;font-size:14px;font-weight:700')}>{p.frame}</span></div>
        : <div style={css('position:absolute;left:30px;right:30px;top:190px;height:250px;border:3px dashed rgba(255,255,255,0.85);border-radius:10px;pointer-events:none')} />}
      {p.corner ? <div style={css('position:absolute;left:14px;bottom:130px;width:150px;border-radius:8px;background:rgba(255,255,255,0.92);padding:6px')}>{p.corner}</div> : null}
      <div style={css('margin-top:auto;position:relative;padding:16px 20px 26px;background:linear-gradient(0deg,rgba(0,0,0,0.85),transparent);display:flex;align-items:center;justify-content:space-between')}>
        {thumb}{shutter}{galleryBtn}
      </div>
    </div>
  );
}

function labelFor(p: CameraProps) {
  return p.title.length <= 14 ? p.title : p.title.split(',').reverse().map((s) => s.trim()).join(' ').replace(/^nearside/i, 'NS').replace(/^offside/i, 'OS');
}
