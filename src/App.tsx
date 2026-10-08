/* The phone app's routes, idle sign out (source/07 S_login 6) and the welcome back
   screen (source/05 S_edge e1). The office area is under /office. */
import { lazy, Suspense, useEffect, useRef, useState } from 'react';
import { BrowserRouter, Navigate, Route, Routes, useLocation, useNavigate, useParams } from 'react-router-dom';
import { css } from './kit/css';
import { btn, footer, scroll, sheet, stepRow, topbar } from './kit/kit';
import { PT } from './kit/tokens';
import { useSession, startSession, lockPhone, markActive, getSession, setPin, pinProblem } from './lib/session';
import { useConfig, loadCachedConfig, watchConfig, configFor, isPreview, loadPreview } from './lib/config';
import { startSync } from './lib/sync';
import { db, keepStorage, kvGet, kvSet } from './lib/db';
import { steps as stepList, percent, fleetTag, dirWord } from './lib/check';
import { time } from './lib/format';
import SignIn from './phone/SignIn';
import { Home, Unfinished, History, Me, TextSize, Storage, SentRecord, applyTextSize, screen } from './phone/Places';
import { ChooseDirection, FindTrailer } from './phone/NewCheck';
import { Hub, Customer, Photos, Items, Tyres, Readings, Seals, Review, Sign, Sent } from './phone/Inspection';
import DamageStep from './phone/damage/DamageStep';
import type { Check } from './data/types';
import { dots, pinpad } from './kit/kit';
import { R7, MU } from './kit/tokens';

const OfficeApp = lazy(() => import('./office/OfficeApp'));

function Idle() {
  const { user } = useSession();
  const { config } = useConfig();
  const [warn, setWarn] = useState<number | null>(null);
  const last = useRef(Date.now());
  useEffect(() => {
    if (!user) return;
    const bump = () => { last.current = Date.now(); markActive(); if (warn !== null) setWarn(null); };
    const ev = ['pointerdown', 'keydown', 'scroll', 'touchstart'];
    ev.forEach((e) => window.addEventListener(e, bump, { passive: true }));
    const t = setInterval(() => {
      const idle = (Date.now() - last.current) / 1000;
      const limit = (config.limits.idleMinutes || 10) * 60;
      if (idle >= limit) { lockPhone(); setWarn(null); }
      else if (idle >= limit - 48) setWarn(Math.ceil(limit - idle));
    }, 1000);
    return () => { ev.forEach((e) => window.removeEventListener(e, bump)); clearInterval(t); };
  }, [user, config.limits.idleMinutes, warn]);
  if (warn === null || !user) return null;
  return sheet(<>
    <div style={css('font-family:' + PT + ';font-weight:800;font-size:22px')}>Still there?</div>
    <div style={css('font-size:16px;line-height:1.45;margin-top:8px')}>You&rsquo;ll be signed out in 0:{String(warn).padStart(2, '0')} to keep the phone safe. Your check is saved.</div>
    <div style={css('display:flex;flex-direction:column;gap:10px;margin-top:16px')}>
      {btn('I’m still here', 'p', { onClick: () => { setWarn(null); markActive(); } })}
      {btn('Sign out now', 's', { onClick: () => { lockPhone(); setWarn(null); } })}
    </div>
  </>, { center: true, label: 'Still there?' });
}

/* Remember where somebody is inside a check, so a reopened app goes back to that exact step. */
function Where() {
  const loc = useLocation();
  useEffect(() => {
    const m = loc.pathname.match(/^\/check\/([^/]+)\/?([a-z]*)$/);
    if (m) kvSet('where', { id: m[1], step: m[2] || '', at: Date.now() });
    else if (!loc.pathname.startsWith('/check/')) kvSet('where', null);
  }, [loc.pathname]);
  return null;
}

const STEP_NAMES: Record<string, string> = { trailer: 'Customer', photos: 'Photos', damage: 'Damage', items: 'General items', tyres: 'Tyres', readings: 'Readings', seals: 'Seals and cleanliness', review: 'Check everything', sign: 'Sign' };
function WelcomeBack({ onDone }: { onDone: () => void }) {
  const nav = useNavigate();
  const [w, setW] = useState<{ c: Check; step: string } | null>(null);
  useEffect(() => {
    (async () => {
      const where = await kvGet<{ id: string; step: string; at: number }>('where');
      if (!where) return onDone();
      const c = await db.checks.get(where.id);
      if (!c || c.status !== 'draft' || c.userId !== getSession().user?.personId) return onDone();
      setW({ c, step: where.step });
    })();
  }, []); // eslint-disable-line
  if (!w) return null;
  const p = percent(stepList(w.c, configFor(w.c.configVersion), []));
  const name = STEP_NAMES[w.step] || 'the check';
  return (
    <div style={css(screen)}>
      {topbar('Carry on?', { back: false })}
      {scroll(<>
        <div style={css('font-family:' + PT + ';font-weight:800;font-size:24px')}>Welcome back</div>
        <div style={css('font-size:17px;line-height:1.45')}>The app closed while you were on <b>{fleetTag(w.c)}, {name}</b>. Everything up to there is saved.</div>
        {stepRow(fleetTag(w.c) + ' · ' + dirWord(w.c.direction), p.done + ' of ' + p.total + ' steps · ' + time(w.c.updatedAt), 'todo')}
      </>)}
      {footer(<>
        {btn('Carry on with ' + name, 'p', { onClick: () => { onDone(); nav('/check/' + w.c.id + (w.step ? '/' + w.step : '')); } })}
        {btn('Not now', 'g', { h: 56, onClick: () => { kvSet('where', null); onDone(); nav('/'); } })}
      </>)}
    </div>
  );
}

function ChangePin() {
  const nav = useNavigate();
  const { user } = useSession();
  const [pin, setP] = useState('');
  const [first, setFirst] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  if (!user) return null;
  function key(k: string) {
    setErr(null);
    if (k === 'back') return setP((x) => x.slice(0, -1));
    const next = (pin + k).slice(0, 4);
    setP(next);
    if (next.length === 4) setTimeout(async () => {
      if (!first) { const bad = pinProblem(next); if (bad) { setErr(bad); setP(''); return; } setFirst(next); setP(''); }
      else if (first !== next) { setErr('Those didn’t match. Pick your PIN again.'); setFirst(null); setP(''); }
      else { await setPin(user!, next); nav('/me'); }
    }, 120);
  }
  return (
    <div style={css(screen)}>
      {topbar('Change PIN', { onBack: () => nav('/me') })}
      {scroll(<>
        <div style={css('font-family:' + PT + ';font-weight:800;font-size:24px;text-align:center;margin-top:10px')}>{first ? 'Type your PIN again' : 'Pick a 4-digit PIN'}</div>
        {dots(pin.length, !!err)}
        {err ? <div role="alert" style={css('text-align:center;color:' + R7 + ';font-weight:700;font-size:15px')}>{err}</div> : null}
        {pinpad(key)}
        <div style={css('font-size:13px;color:' + MU + ';text-align:center')}>Not 1234, 0000 or your birthday.</div>
      </>, 'gap:12px;padding:18px')}
    </div>
  );
}

function RecordRoute() { const { id } = useParams(); return <SentRecord id={id!} />; }

function Shell() {
  const { user, ready, needPin } = useSession();
  const [welcomed, setWelcomed] = useState(false);
  if (!ready) return <div style={css(screen)} />;
  if (!user || needPin) return <SignIn />;
  if (!user.perms.do_checks && !user.perms.edit_config) {
    return <div style={css(screen)}>{topbar('STC Checks', { back: false })}{scroll(<div style={css('font-size:17px;line-height:1.45')}>Your role doesn&rsquo;t include checks. Ask your site lead.</div>)}</div>;
  }
  if (!welcomed) return <WelcomeBack onDone={() => setWelcomed(true)} />;
  return (
    <>
      <Where />
      <Idle />
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/new" element={<ChooseDirection />} />
        <Route path="/new/:dir" element={<FindTrailer />} />
        <Route path="/check/:id" element={<Hub />} />
        <Route path="/check/:id/trailer" element={<Customer />} />
        <Route path="/check/:id/photos" element={<Photos />} />
        <Route path="/check/:id/damage" element={<DamageStep />} />
        <Route path="/check/:id/items" element={<Items />} />
        <Route path="/check/:id/tyres" element={<Tyres />} />
        <Route path="/check/:id/readings" element={<Readings />} />
        <Route path="/check/:id/seals" element={<Seals />} />
        <Route path="/check/:id/review" element={<Review />} />
        <Route path="/check/:id/sign" element={<Sign />} />
        <Route path="/check/:id/sent" element={<Sent />} />
        <Route path="/check/:id/sending" element={<Sent />} />
        <Route path="/unfinished" element={<Unfinished />} />
        <Route path="/history" element={<History />} />
        <Route path="/history/:id" element={<RecordRoute />} />
        <Route path="/me" element={<Me />} />
        <Route path="/me/text" element={<TextSize />} />
        <Route path="/me/storage" element={<Storage />} />
        <Route path="/me/pin" element={<ChangePin />} />
        <Route path="/office/*" element={<Suspense fallback={<div />}><OfficeApp /></Suspense>} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </>
  );
}

export default function App() {
  const { user } = useSession();
  useEffect(() => {
    applyTextSize();
    keepStorage();
    loadCachedConfig().finally(() => startSession());
  }, []);
  useEffect(() => {
    if (!user) return;
    if (isPreview() && user.perms.edit_config) { loadPreview(); return; }
    startSync(); watchConfig();
  }, [user?.personId]); // eslint-disable-line
  return <BrowserRouter><Shell /></BrowserRouter>;
}
