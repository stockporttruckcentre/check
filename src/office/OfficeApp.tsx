/* The office area: source/07 dk(), the navy header and the 230px left nav with the
   eight ADM_NAV items, with each screen under /office/*. */
import { useEffect } from 'react';
import { Routes, Route, Navigate, NavLink } from 'react-router-dom';
import { css } from '../kit/css';
import { ic } from '../kit/kit';
import { N, N05, R, W, PA, BD, PT, IN } from '../kit/tokens';
import { useSession, NO_PERMS } from '../lib/session';
import { refreshConfig } from '../lib/config';
import { Toasts, say, useWidth, initials } from './ui';
import { useDraft, loadDraft, watchDraft, draftNo, onSaveError } from './draft';
import { plainError } from '../lib/supabase';
import Inspections from './Inspections';
import People from './People';
import Builder from './Builder';
import Lists from './Lists';
import Log from './Log';
import Bin from './Bin';
import Versions from './Versions';
import System from './System';

export const ADM_NAV: [string, string, string][] = [
  ['Inspections', 'list', 'inspections'], ['People and roles', 'user', 'people'], ['Check builder', 'pen', 'builder'], ['Lists and wording', 'list', 'lists'],
  ['Activity log', 'clock', 'log'], ['Recycle bin', 'trash', 'bin'], ['Versions', 'sync', 'versions'], ['System', 'gear', 'system'],
];

export default function OfficeApp() {
  const { user } = useSession();
  const d = useDraft();
  const w = useWidth();
  const perms = user?.perms || NO_PERMS;

  useEffect(() => {
    refreshConfig().catch(() => {});
    if (perms.edit_config) { loadDraft().catch(() => {}); watchDraft(); }
    onSaveError((m) => say('err', plainError({ message: m })));
  }, [perms.edit_config]);

  const hasDraft = d.draft != null || d.draftNumber != null;
  const header = (
    <div style={css('height:56px;background:' + N + ';color:#fff;display:flex;align-items:center;gap:16px;padding:0 24px')}>
      <span style={css('font-family:' + PT + ';font-weight:800;font-size:18px')}>STC Checks</span>
      <span style={css('font-size:13px;opacity:0.7')}>Office</span>
      {hasDraft && perms.edit_config
        ? <span style={css('margin-left:18px;display:inline-flex;align-items:center;gap:8px;height:30px;padding:0 12px;border-radius:999px;background:#F2C71B;color:#111;font-size:13px;font-weight:800')}>DRAFT v{draftNo(d)} &middot; not live yet</span>
        : null}
      {user
        ? <span style={css('margin-left:auto;display:flex;align-items:center;gap:10px;font-size:14px')}>
          <span style={css('width:32px;height:32px;border-radius:50%;background:' + R + ';display:inline-flex;align-items:center;justify-content:center;font-weight:800')}>{initials(user.name)}</span>
          {user.name} &middot; {user.roleName}
        </span>
        : null}
    </div>
  );

  /* source/05 S_admin, Responsive behaviour: on a phone the office is a read only list. */
  if (w < 1024) {
    return (
      <div style={css('min-height:100dvh;background:' + PA + ';color:' + N + ';font-family:' + IN + ';display:flex;flex-direction:column')}>
        {header}
        <Inspections listOnly />
        <Toasts />
      </div>
    );
  }

  return (
    <div style={css('min-height:100dvh;background:' + PA + ';color:' + N + ';font-family:' + IN + ';display:flex;flex-direction:column')}>
      {header}
      <div style={css('flex:1;display:grid;grid-template-columns:230px minmax(0,1fr);min-height:600px')}>
        <nav style={css('background:' + W + ';border-right:1px solid ' + BD + ';padding:14px 10px;display:flex;flex-direction:column;gap:2px')}>
          {ADM_NAV.map(([t, i, path]) => (
            <NavLink key={path} to={path} className="k-tap" style={({ isActive }) => css('display:flex;align-items:center;gap:10px;height:42px;padding:0 12px;border-radius:6px;font-size:14px;font-weight:' + (isActive ? 800 : 600) + ';color:' + N + ';background:' + (isActive ? N05 : 'transparent') + ';text-decoration:none')}>
              {ic(i, 18)}{t}
            </NavLink>
          ))}
        </nav>
        <Routes>
          <Route index element={<Navigate to="inspections" replace />} />
          <Route path="inspections" element={<Inspections />} />
          <Route path="people" element={<Pad><People /></Pad>} />
          <Route path="builder" element={<Pad><Builder /></Pad>} />
          <Route path="lists" element={<Pad><Lists /></Pad>} />
          <Route path="log" element={<Pad><Log /></Pad>} />
          <Route path="bin" element={<Pad><Bin /></Pad>} />
          <Route path="versions" element={<Pad><Versions /></Pad>} />
          <Route path="system" element={<Pad><System /></Pad>} />
          <Route path="*" element={<Navigate to="inspections" replace />} />
        </Routes>
      </div>
      <Toasts />
    </div>
  );
}

function Pad({ children }: { children: React.ReactNode }) {
  return <div style={css('padding:24px 28px;min-width:0')}>{children}</div>;
}
