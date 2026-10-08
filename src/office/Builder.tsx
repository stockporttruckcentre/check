/* Check builder: source/07 S_builder. Steps on the left (drag to reorder, toggle),
   the selected step's items in the middle, the item editor on the right. Every
   change lands in the draft; Publish makes it live. */
import { useState, type DragEvent, type KeyboardEvent, type ReactNode } from 'react';
import { css } from '../kit/css';
import { tg, pill, chip, lab, sb } from '../kit/kit';
import { N, N05, W, MU, SU, BL, PT } from '../kit/tokens';
import { supabase, plainError } from '../lib/supabase';
import { useSession, NO_PERMS } from '../lib/session';
import type { Config, ItemDef, ShotDef, StepId, TrailerTypeId, Applies } from '../data/types';
import { useDraft, editDraft, working, draftNo, flushDraft } from './draft';
import { PublishButton, DiscardButton } from './Publish';
import { dh, inp, Field, Choice, dashed, say, need, useRemember } from './ui';

const ANSWERS: [ItemDef['answer'], string][] = [['ok_dmg_na', 'OK / Damaged / N/A'], ['ok_fault_na', 'OK / Fault / N/A'], ['ok_dmg', 'OK / Damaged']];
const answerName = (a: ItemDef['answer']) => ANSWERS.find((x) => x[0] === a)?.[1] || a;
const ALWAYS: StepId[] = ['trailer', 'sign'];
const allTypes = (c: Config) => Object.fromEntries(c.trailerTypes.map((t) => [t.id, 'yes'])) as Partial<Record<TrailerTypeId, Applies>>;
const uid = (p: string) => p + '_' + Math.random().toString(36).slice(2, 8);

export function typesLabel(types: Partial<Record<TrailerTypeId, Applies>>, cfg: Config, fitted?: string) {
  const on = cfg.trailerTypes.filter((t) => (types[t.id] || 'no') !== 'no');
  if (on.length === cfg.trailerTypes.length && on.every((t) => types[t.id] === 'yes')) return 'All';
  if (fitted === 'tail_lift' && on.length && on.every((t) => types[t.id] === 'if_fitted')) return 'Tail lift only';
  if (!on.length) return 'None';
  return on.map((t) => t.name).join(', ');
}

/** A fieldset that turns every control inside it off, with the reason as its title. */
export function Gate({ ok, why, children }: { ok: boolean; why: string; children: ReactNode }) {
  return <fieldset disabled={!ok} title={ok ? undefined : why} style={css('border:0;padding:0;margin:0;min-width:0')}>{children}</fieldset>;
}

export default function Builder() {
  const { user } = useSession();
  const perms = user?.perms || NO_PERMS;
  const can = perms.edit_config;
  const d = useDraft();
  const cfg = working(d);
  const [step, setStep] = useRemember<StepId>('builder-step', 'items');
  const [selItem, setSelItem] = useRemember<string | null>('builder-item', null);
  const [drag, setDrag] = useState<number | null>(null);

  function move(from: number, to: number) {
    if (to < 0 || to >= cfg.steps.length || from === to) return;
    editDraft((c) => { const [s] = c.steps.splice(from, 1); c.steps.splice(to, 0, s); });
  }
  const sub = (id: StepId): string => {
    if (id === 'trailer' || id === 'sign') return 'Always';
    if (id === 'photos') return cfg.shots.length + ' shots';
    if (id === 'damage') return 'Body plan';
    if (id === 'items') return cfg.items.filter((i) => !i.hidden).length + ' items';
    if (id === 'tyres') return 'Per axle';
    if (id === 'readings') return cfg.readings.map((r) => r.name).join(', ');
    return '';
  };

  const left = (
    <div style={css('display:flex;flex-direction:column;gap:6px')}>
      {cfg.steps.map((s, i) => {
        const on = s.id === step;
        const fixed = ALWAYS.includes(s.id);
        return (
          <div key={s.id} draggable={can} onClick={() => setStep(s.id)} className="k-tap"
            onDragStart={(e: DragEvent) => { setDrag(i); e.dataTransfer.effectAllowed = 'move'; }}
            onDragOver={(e: DragEvent) => { if (drag != null) e.preventDefault(); }}
            onDrop={(e: DragEvent) => { e.preventDefault(); if (drag != null) move(drag, i); setDrag(null); }}
            onDragEnd={() => setDrag(null)}
            style={css('display:flex;align-items:center;gap:10px;min-height:52px;padding:6px 12px;border-radius:8px;background:' + (on ? N05 : W) + ';border:' + (on ? 2 : 1) + 'px solid ' + (on ? N : BL) + (drag === i ? ';opacity:0.6' : ''))}>
            <button type="button" className="k-tap k-reset" disabled={!can} title={can ? 'Drag to reorder, or use the up and down arrow keys' : need('edit_config')} aria-label={'Move ' + s.name}
              onClick={(e) => e.stopPropagation()}
              onKeyDown={(e: KeyboardEvent) => { if (e.key === 'ArrowUp') { e.preventDefault(); move(i, i - 1); } if (e.key === 'ArrowDown') { e.preventDefault(); move(i, i + 1); } }}
              style={css('color:' + SU + ';font-size:18px;letter-spacing:-2px;background:transparent;border:0;padding:0;cursor:' + (can ? 'grab' : 'not-allowed'))}>&#8942;&#8942;</button>
            <div style={css('flex:1')}>
              <div style={css('font-weight:700;font-size:14px')}>{s.name}</div>
              <div style={css('font-size:12px;color:' + MU)}>{sub(s.id)}</div>
            </div>
            <span onClick={(e) => e.stopPropagation()}>
              {tg(s.enabled, {
                label: s.name, disabled: fixed || !can,
                title: fixed ? 'Every check needs this step, so it stays on' : !can ? need('edit_config') : undefined,
                onClick: () => editDraft((c) => { const x = c.steps.find((y) => y.id === s.id); if (x) x.enabled = !x.enabled; }),
              })}
            </span>
          </div>
        );
      })}
      {dashed('Add a step', { disabled: true, title: 'A new kind of step needs a developer. Add items to an existing step instead.' })}
    </div>
  );

  let mid: ReactNode = null, right: ReactNode = null, midLabel: ReactNode = '';
  const cur = cfg.steps.find((s) => s.id === step) || cfg.steps[0];
  if (cur?.id === 'items') {
    midLabel = <>{cur.name} &middot; {cfg.items.length}</>;
    const item = cfg.items.find((x) => x.id === selItem) || null;
    mid = (
      <div style={css('display:flex;flex-direction:column;gap:8px')}>
        {cfg.items.map((it) => {
          const on = it.id === item?.id;
          const was = d.live.items.find((x) => x.id === it.id);
          const changed = !was || JSON.stringify(was) !== JSON.stringify(it);
          return (
            <button key={it.id} type="button" className="k-tap k-reset" onClick={() => setSelItem(it.id)} aria-pressed={on}
              style={{ ...css('border-radius:8px;background:' + W + ';border:' + (on ? '2px solid ' + N : '1px solid ' + BL) + ';padding:12px 14px;color:' + N), width: '100%', textAlign: 'left' }}>
              <div style={css('display:flex;justify-content:space-between;align-items:center;gap:10px')}><span style={css('font-weight:800;font-size:15px')}>{it.name}</span>{changed && d.draft ? pill('CHANGED', 'warn') : null}</div>
              <div style={css('display:flex;gap:6px;flex-wrap:wrap;margin-top:8px')}>{pill(answerName(it.answer), 'g')}{pill(it.required ? 'REQUIRED' : 'OPTIONAL', it.required ? 'n' : 'g')}{pill(typesLabel(it.types, cfg, it.fitted), 'g')}</div>
            </button>
          );
        })}
        {dashed('Add an item', {
          disabled: !can, title: can ? undefined : need('edit_config'),
          onClick: () => { const id = uid('item'); editDraft((c) => { c.items.push({ id, name: 'New item', answer: 'ok_dmg_na', required: true, photoIfDamaged: true, types: allTypes(c) }); }); setSelItem(id); },
        })}
      </div>
    );
    right = item ? <ItemEditor key={item.id} item={item} cfg={cfg} can={can} onRemoved={() => setSelItem(null)} /> : null;
  } else if (cur?.id === 'photos') {
    midLabel = <>{cur.name} &middot; {cfg.shots.length}</>;
    const shot = cfg.shots.find((x) => x.id === selItem) || null;
    mid = (
      <div style={css('display:flex;flex-direction:column;gap:8px')}>
        {cfg.shots.map((s) => {
          const on = s.id === shot?.id;
          const was = d.live.shots.find((x) => x.id === s.id);
          const changed = !was || JSON.stringify(was) !== JSON.stringify(s);
          return (
            <button key={s.id} type="button" className="k-tap k-reset" onClick={() => setSelItem(s.id)} aria-pressed={on}
              style={{ ...css('border-radius:8px;background:' + W + ';border:' + (on ? '2px solid ' + N : '1px solid ' + BL) + ';padding:12px 14px;color:' + N), width: '100%', textAlign: 'left' }}>
              <div style={css('display:flex;justify-content:space-between;align-items:center;gap:10px')}><span style={css('font-weight:800;font-size:15px')}>{s.label}</span>{changed && d.draft ? pill('CHANGED', 'warn') : null}</div>
              <div style={css('display:flex;gap:6px;flex-wrap:wrap;margin-top:8px')}>{pill('Photo with guide text', 'g')}{pill(typesLabel(s.types, cfg), 'g')}</div>
              {s.guide ? <div style={css('font-size:12px;color:' + MU + ';margin-top:8px')}>{s.guide}</div> : null}
            </button>
          );
        })}
        {dashed('Add an item', {
          disabled: !can, title: can ? undefined : need('edit_config'),
          onClick: () => { const id = uid('shot'); editDraft((c) => { c.shots.push({ id, label: 'New photo', guide: '', types: allTypes(c) }); }); setSelItem(id); },
        })}
      </div>
    );
    right = shot ? <ShotEditor key={shot.id} shot={shot} cfg={cfg} can={can} onRemoved={() => setSelItem(null)} /> : null;
  } else if (cur) {
    midLabel = cur.name;
    right = (
      <div style={css('border-radius:10px;background:' + W + ';border:1px solid ' + BL + ';padding:16px;display:flex;flex-direction:column;gap:12px')}>
        <div style={css('font-family:' + PT + ';font-weight:800;font-size:18px')}>{cur.name}</div>
        <div style={css('display:flex;justify-content:space-between;align-items:center;font-size:14px;font-weight:700')}>In the check {tg(cur.enabled, {
          label: cur.name, disabled: ALWAYS.includes(cur.id) || !can,
          title: ALWAYS.includes(cur.id) ? 'Every check needs this step, so it stays on' : !can ? need('edit_config') : undefined,
          onClick: () => editDraft((c) => { const x = c.steps.find((y) => y.id === cur.id); if (x) x.enabled = !x.enabled; }),
        })}</div>
      </div>
    );
  }

  const subtitle = d.draft ? <>Live version v{d.liveNumber} &middot; Editing draft v{draftNo(d)}</> : <>Live version v{d.liveNumber}</>;
  return (
    <>
      {dh('Check out: all trailer types', subtitle, <>
        {sb('Preview on phone', 's', { ic: 'eye', disabled: !d.draft, title: d.draft ? undefined : 'Nothing in the draft yet. Change something first.', onClick: () => { flushDraft().catch(() => {}); window.open('/?preview=draft', '_blank', 'noopener'); } })}
        <DiscardButton />
        <PublishButton />
      </>)}
      <div style={css('display:grid;grid-template-columns:260px minmax(0,1fr) 300px;gap:18px')}>
        <div>{lab(<>Steps &middot; drag to reorder</>)}{left}</div>
        <div>{lab(midLabel)}{mid}</div>
        <div>{right ? <>{lab(cur?.id === 'items' ? 'Edit item' : cur?.id === 'photos' ? 'Edit photo' : 'Edit step')}{right}</> : null}</div>
      </div>
    </>
  );
}

function typeChips(types: Partial<Record<TrailerTypeId, Applies>>, cfg: Config, fitted: boolean, set: (t: Partial<Record<TrailerTypeId, Applies>>) => void) {
  return (
    <div style={css('display:flex;gap:6px;flex-wrap:wrap')}>
      {cfg.trailerTypes.map((t) => {
        const on = (types[t.id] || 'no') !== 'no';
        return <span key={t.id}>{chip(t.name, on, { h: 34, onClick: () => set({ ...types, [t.id]: on ? 'no' : fitted ? 'if_fitted' : 'yes' }) })}</span>;
      })}
    </div>
  );
}
async function sendToBin(label: string, payload: unknown) {
  const r = await supabase.rpc('recycle_item', { p_label: label, p_payload: payload });
  if (r.error) throw r.error;
}

function ItemEditor({ item, cfg, can, onRemoved }: { item: ItemDef; cfg: Config; can: boolean; onRemoved: () => void }) {
  const set = (fn: (x: ItemDef) => void) => editDraft((c) => { const x = c.items.find((y) => y.id === item.id); if (x) fn(x); });
  async function remove() {
    try {
      await sendToBin(item.name, { kind: 'item', item, index: cfg.items.findIndex((x) => x.id === item.id) });
      editDraft((c) => { c.items = c.items.filter((x) => x.id !== item.id); });
      say('ok', item.name + ' moved to the recycle bin');
      onRemoved();
    } catch (e) { say('err', plainError(e)); }
  }
  return (
    <Gate ok={can} why={need('edit_config')}>
      <div style={css('border-radius:10px;background:' + W + ';border:1px solid ' + BL + ';padding:16px;display:flex;flex-direction:column;gap:12px')}>
        <div style={css('font-family:' + PT + ';font-weight:800;font-size:18px')}>{item.name}</div>
        {inp('Name on screen', <Field value={item.name} onChange={(v) => set((x) => { x.name = v; })} />)}
        {inp('Answer type', <Choice value={item.answer} options={ANSWERS} onChange={(v) => set((x) => { x.answer = v; })} title="Answer type" disabled={!can} disabledTitle={need('edit_config')} />)}
        <div style={css('display:flex;justify-content:space-between;align-items:center;font-size:14px;font-weight:700')}>Required {tg(item.required, { label: 'Required', onClick: () => set((x) => { x.required = !x.required; }) })}</div>
        <div style={css('display:flex;justify-content:space-between;align-items:center;font-size:14px;font-weight:700')}>Photo needed if Damaged {tg(item.photoIfDamaged, { label: 'Photo needed if Damaged', onClick: () => set((x) => { x.photoIfDamaged = !x.photoIfDamaged; }) })}</div>
        <div>
          <div style={css('font-weight:700;font-size:14px;margin-bottom:6px')}>Trailer types</div>
          {typeChips(item.types, cfg, !!item.fitted, (t) => set((x) => { x.types = t; }))}
        </div>
        <div>{sb('Remove item', 'd', { ic: 'trash', onClick: remove })}</div>
      </div>
    </Gate>
  );
}

function ShotEditor({ shot, cfg, can, onRemoved }: { shot: ShotDef; cfg: Config; can: boolean; onRemoved: () => void }) {
  const set = (fn: (x: ShotDef) => void) => editDraft((c) => { const x = c.shots.find((y) => y.id === shot.id); if (x) fn(x); });
  async function remove() {
    try {
      await sendToBin('Photo ' + shot.label, { kind: 'shot', shot, index: cfg.shots.findIndex((x) => x.id === shot.id) });
      editDraft((c) => { c.shots = c.shots.filter((x) => x.id !== shot.id); });
      say('ok', shot.label + ' moved to the recycle bin');
      onRemoved();
    } catch (e) { say('err', plainError(e)); }
  }
  return (
    <Gate ok={can} why={need('edit_config')}>
      <div style={css('border-radius:10px;background:' + W + ';border:1px solid ' + BL + ';padding:16px;display:flex;flex-direction:column;gap:12px')}>
        <div style={css('font-family:' + PT + ';font-weight:800;font-size:18px')}>{shot.label}</div>
        {inp('Name on screen', <Field value={shot.label} onChange={(v) => set((x) => { x.label = v; })} />)}
        {inp('Guide text', <Field value={shot.guide} onChange={(v) => set((x) => { x.guide = v; })} ph="Stand at the front left corner. Fit the front and the whole side in." />)}
        <div>
          <div style={css('font-weight:700;font-size:14px;margin-bottom:6px')}>Trailer types</div>
          {typeChips(shot.types, cfg, false, (t) => set((x) => { x.types = t; }))}
        </div>
        <div>{sb('Remove item', 'd', { ic: 'trash', onClick: remove })}</div>
      </div>
    </Gate>
  );
}

