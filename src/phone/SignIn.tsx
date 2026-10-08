/* Signing in, source/07 S_login screens 1 to 6. */
import { useEffect, useRef, useState } from 'react';
import { css } from '../kit/css';
import { btn, footer, scroll, topbar, pinpad, dots, ic, sheet } from '../kit/kit';
import { N, W, BL, MU, SU, R7, MO, PT, N05 } from '../kit/tokens';
import { sendCode, verifyCode, setPin, pinProblem, unlock, forgotPin, deviceUsers, useSession } from '../lib/session';
import { useConfig } from '../lib/config';
import type { DeviceUser } from '../lib/db';
import { lastUsed } from '../lib/format';
import { buzz } from '../lib/photo';

const brand = (
  <div style={css('display:flex;flex-direction:column;align-items:center;gap:8px;padding-top:12px')}>
    <div style={css('width:64px;height:64px;border-radius:16px;background:' + N + ';color:#fff;display:flex;align-items:center;justify-content:center;font-family:' + PT + ';font-weight:800;font-size:22px')}>STC</div>
    <div style={css('font-family:' + PT + ';font-weight:800;font-size:24px;letter-spacing:-0.03em')}>STC Checks</div>
  </div>
);
const initials = (n: string) => n.split(' ').filter(Boolean).map((x) => x[0]).join('').slice(0, 2).toUpperCase();
const screen = 'min-height:100dvh;display:flex;flex-direction:column;max-width:600px;margin:0 auto;background:#F7F7F5';

export default function SignIn() {
  const { pendingEmail, needPin } = useSession();
  const [users, setUsers] = useState<DeviceUser[] | null>(null);
  const [who, setWho] = useState<DeviceUser | null>(null);
  const [someoneElse, setSomeoneElse] = useState(false);
  useEffect(() => { deviceUsers().then(setUsers); }, [needPin, pendingEmail]);

  if (needPin) return <PickPin u={needPin} />;
  if (pendingEmail) return <Code email={pendingEmail} />;
  if (users === null) return <div style={css(screen)} />;
  if (who) return <EnterPin u={who} onBack={() => setWho(null)} />;
  if (!users.filter((u) => u.pinHash).length || someoneElse) return <Email onBack={users.length ? () => setSomeoneElse(false) : undefined} />;
  return <WhoIsUsing users={users.filter((u) => u.pinHash)} onPick={setWho} onSomeoneElse={() => setSomeoneElse(true)} />;
}

function Email({ onBack }: { onBack?: () => void }) {
  const [email, setEmail] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  async function go() { setBusy(true); setErr(await sendCode(email)); setBusy(false); }
  return (
    <div style={css(screen)}>
      {onBack ? topbar('Sign in', { onBack }) : null}
      {scroll(<>
        {brand}
        <div style={css('font-size:16px;line-height:1.45;text-align:center;color:' + MU)}>Sign in with your STC email the first time. After that it&rsquo;s your PIN.</div>
        <label htmlFor="email" style={css('font-weight:700;font-size:16px;margin-top:8px')}>Work email</label>
        <input id="email" type="email" inputMode="email" autoComplete="email" autoCapitalize="none" value={email} onChange={(e) => setEmail(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') go(); }} placeholder="name@stc-uk.com"
          style={css('min-height:60px;display:flex;align-items:center;padding:0 16px;border-radius:8px;background:' + W + ';border:' + (err ? '3px solid #CF2417' : '3px solid ' + N) + ';font-size:18px;font-family:inherit;color:' + N + ';outline:none;width:100%')} />
        {err ? <div role="alert" style={css('font-size:16px;color:#CF2417;font-weight:600')}>{err}</div> : null}
      </>, 'gap:12px;padding:20px')}
      {footer(<>{btn('Send me a code', 'p', { onClick: go, loading: busy })}<div style={css('text-align:center;font-size:14px;color:' + MU)}>No email? Ask your site lead to add you.</div></>)}
    </div>
  );
}

function Code({ email }: { email: string }) {
  const [code, setCode] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const [left, setLeft] = useState(60);
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => { ref.current?.focus(); const t = setInterval(() => setLeft((x) => Math.max(0, x - 1)), 1000); return () => clearInterval(t); }, []);
  useEffect(() => {
    if (code.length === 6) verifyCode(code).then((e) => { if (e) { setErr(e); setCode(''); buzz('firm'); } });
  }, [code]);
  async function again() { const e = await sendCode(email); setErr(e); setLeft(60); }
  const cells = Array.from({ length: 6 }, (_, i) => code[i] || '');
  return (
    <div style={css(screen)}>
      {scroll(<>
        {brand}
        <div style={css('font-weight:700;font-size:16px;text-align:center')}>Code sent to {email}</div>
        <div style={css('font-size:14px;text-align:center;color:' + MU)}>Type the code, or tap the link in the email on this phone.</div>
        <div style={css('position:relative')} onClick={() => ref.current?.focus()}>
          <div style={css('display:grid;grid-template-columns:repeat(6,1fr);gap:8px')} aria-hidden="true">
            {cells.map((c, i) => <div key={i} style={css('height:60px;border-radius:8px;background:' + W + ';border:' + (i === code.length ? '3px solid ' + N : '2px solid #A3A39D') + ';display:flex;align-items:center;justify-content:center;font-family:' + MO + ';font-weight:800;font-size:26px')}>{c}</div>)}
          </div>
          <input ref={ref} aria-label="Code" inputMode="numeric" autoComplete="one-time-code" maxLength={6} value={code}
            onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
            style={css('position:absolute;inset:0;opacity:0;width:100%;height:100%;font-size:16px')} />
        </div>
        {err ? <div role="alert" style={css('text-align:center;color:' + R7 + ';font-weight:700;font-size:15px')}>{err}</div> : null}
        <div style={css('text-align:center;font-size:14px;color:' + MU)}>
          Didn&rsquo;t get it? {left > 0
            ? <><u>Send again</u> in 0:{String(left).padStart(2, '0')}</>
            : <button type="button" className="k-tap k-reset" onClick={again} style={css('background:transparent;border:0;padding:0;font-size:14px;color:' + N + ';text-decoration:underline;font-weight:700')}>Send again</button>}
        </div>
      </>, 'gap:14px;padding:20px')}
    </div>
  );
}

function PickPin({ u }: { u: DeviceUser }) {
  const [pin, setP] = useState('');
  const [first, setFirst] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  function key(k: string) {
    setErr(null);
    if (k === 'back') return setP((x) => x.slice(0, -1));
    const next = (pin + k).slice(0, 4);
    setP(next);
    if (next.length === 4) {
      setTimeout(async () => {
        if (!first) {
          const bad = pinProblem(next);
          if (bad) { setErr(bad); setP(''); buzz('firm'); return; }
          setFirst(next); setP('');
        } else if (first !== next) { setErr('Those didn’t match. Pick your PIN again.'); setFirst(null); setP(''); buzz('firm'); }
        else await setPin(u, next);
      }, 120);
    }
  }
  return (
    <div style={css(screen)}>
      {scroll(<>
        <div style={css('font-family:' + PT + ';font-weight:800;font-size:24px;text-align:center;margin-top:10px')}>{first ? 'Type your PIN again' : 'Pick a 4-digit PIN'}</div>
        <div style={css('font-size:15px;color:' + MU + ';text-align:center')}>You&rsquo;ll use this every time you pick the phone up.</div>
        {dots(pin.length, !!err)}
        {err ? <div role="alert" style={css('text-align:center;color:' + R7 + ';font-weight:700;font-size:15px')}>{err}</div> : null}
        {pinpad(key)}
        <div style={css('font-size:13px;color:' + MU + ';text-align:center')}>Not 1234, 0000 or your birthday.</div>
      </>, 'gap:12px;padding:18px')}
    </div>
  );
}

function WhoIsUsing({ users, onPick, onSomeoneElse }: { users: DeviceUser[]; onPick: (u: DeviceUser) => void; onSomeoneElse: () => void }) {
  return (
    <div style={css(screen)}>
      {topbar('Who’s using the phone?', { back: false })}
      {scroll(<>
        {users.map((u, i) => (
          <button key={u.personId} type="button" className="k-tap k-reset" onClick={() => onPick(u)}
            style={css('min-height:68px;display:flex;align-items:center;gap:14px;padding:10px 14px;border-radius:10px;background:' + W + ';border:' + (i ? 1 : 2) + 'px solid ' + (i ? BL : N) + ';width:100%;color:' + N)}>
            <span style={css('width:44px;height:44px;border-radius:50%;background:' + (i ? N05 : N) + ';color:' + (i ? N : W) + ';display:flex;align-items:center;justify-content:center;font-weight:800')}>{initials(u.name)}</span>
            <div style={css('flex:1')}><div style={css('font-weight:700;font-size:17px')}>{u.name}</div><div style={css('font-size:13px;color:' + MU)}>{lastUsed(u.lastUsed)}</div></div>
            {ic('chev', 18, SU)}
          </button>
        ))}
        <button type="button" className="k-tap k-reset" onClick={onSomeoneElse}
          style={css('min-height:56px;display:flex;align-items:center;justify-content:center;gap:8px;font-weight:700;border:2px dashed #A3A39D;border-radius:10px;background:transparent;color:' + N + ';width:100%;font-size:16px')}>{ic('plus', 20)}Someone else</button>
      </>, 'gap:10px')}
    </div>
  );
}

function EnterPin({ u, onBack }: { u: DeviceUser; onBack: () => void }) {
  const { config } = useConfig();
  const [pin, setP] = useState('');
  const [msg, setMsg] = useState<string | null>(null);
  const [sent, setSent] = useState(false);
  function key(k: string) {
    if (k === 'back') return setP((x) => x.slice(0, -1));
    const next = (pin + k).slice(0, 4);
    setP(next);
    if (next.length === 4) {
      setTimeout(async () => {
        const r = await unlock(u, next, config.limits.pinTries, config.limits.lockMinutes);
        if (!r.ok) { setMsg(r.message); setP(''); buzz('firm'); }
      }, 120);
    }
  }
  async function forgot() { const e = await forgotPin(u); if (e) setMsg(e); else setSent(true); }
  return (
    <div style={css(screen)}>
      {topbar('', { onBack })}
      {scroll(<>
        <div style={css('display:flex;flex-direction:column;align-items:center;gap:6px;margin-top:10px')}>
          <span style={css('width:56px;height:56px;border-radius:50%;background:' + N + ';color:#fff;display:flex;align-items:center;justify-content:center;font-weight:800;font-size:20px')}>{initials(u.name)}</span>
          <div style={css('font-family:' + PT + ';font-weight:800;font-size:22px')}>{u.name}</div>
        </div>
        {dots(pin.length, !!msg)}
        {msg ? <div role="alert" style={css('text-align:center;color:' + R7 + ';font-weight:700;font-size:15px')}>{msg}</div> : null}
        {pinpad(key)}
        <button type="button" className="k-tap k-reset" onClick={forgot} style={css('text-align:center;font-weight:700;font-size:15px;background:transparent;border:0;color:' + N + ';min-height:48px')}><u>Forgot PIN?</u></button>
      </>, 'gap:10px;padding:18px')}
      {sent ? sheet(<>
        <div style={css('font-family:' + PT + ';font-weight:800;font-size:22px')}>Code sent to {u.email}</div>
        <div style={css('font-size:16px;line-height:1.45')}>Type the code from the email, then pick a new PIN.</div>
        {btn('Type the code', 'p', { onClick: () => setSent(false) })}
      </>, { center: true }) : null}
    </div>
  );
}
