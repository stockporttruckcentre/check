-- =============================================================
-- 004. An undo can itself be undone.
--
-- The undo dialog says "The undo is logged too, so it can be undone
-- again" (source/07 S_log). For that to be true the undo's own log row
-- has to carry what it replaced. Safe to run twice.
-- =============================================================
set search_path = public, extensions;

create or replace function undo_event(p_id bigint, p_reason text) returns bigint
language plpgsql security definer set search_path = public as $$
declare e audit_events; u jsonb; b jsonb; v_new bigint; v_redo jsonb;
begin
  if not has_perm('undo') then raise exception 'You can''t undo changes'; end if;
  if coalesce(trim(p_reason),'') = '' then raise exception 'A reason is needed'; end if;
  select * into e from audit_events where id = p_id for update;
  if e.id is null or e.undo is null then raise exception 'That change can''t be undone'; end if;
  if e.undone_by is not null then raise exception 'That change has already been undone'; end if;
  u := e.undo; b := u -> 'before';
  -- What is there now, so the undo can itself be undone.
  if u ->> 'table' = 'people' then
    v_redo := jsonb_build_object('table','people','id',u->>'id','before',(select to_jsonb(p) from people p where p.id = (u->>'id')::uuid));
  elsif u ->> 'table' = 'roles' then
    v_redo := jsonb_build_object('table','roles','id',u->>'id','before',(select to_jsonb(r) from roles r where r.id = u->>'id'));
  elsif u ->> 'table' = 'settings' then
    v_redo := jsonb_build_object('table','settings','id',u->>'id','before',(select to_jsonb(s) from settings s where s.key = u->>'id'));
  elsif u ->> 'table' = 'sheet_columns' then
    v_redo := jsonb_build_object('table','sheet_columns','before',(select to_jsonb(c) from sheet_columns c where c.source = b->>'source' and c.tab = b->>'tab' and c.field = b->>'field'));
  elsif u ->> 'table' = 'config_versions' then
    v_redo := jsonb_build_object('table','config_versions','number',(select number from config_versions where status = 'live'));
  end if;
  perform set_config('checks.undoing', '1', true);
  if u ->> 'table' = 'people' then
    if b is null or b = 'null'::jsonb then
      update people set deleted_at = now(), status = 'removed' where id = (u ->> 'id')::uuid;
    else
      update people set name = b->>'name', email = (b->>'email')::extensions.citext, role_id = b->>'role_id', site_id = (b->>'site_id')::uuid,
             status = b->>'status', aliases = array(select jsonb_array_elements_text(b->'aliases')),
             pin_reset_at = (b->>'pin_reset_at')::timestamptz, locked_until = (b->>'locked_until')::timestamptz,
             deleted_at = (b->>'deleted_at')::timestamptz
       where id = (u ->> 'id')::uuid;
    end if;
  elsif u ->> 'table' = 'roles' then
    update roles set name = b->>'name', perms = b->'perms' where id = u ->> 'id';
  elsif u ->> 'table' = 'settings' then
    update settings set value = b->'value', updated_at = now(), updated_by = (me()).id where key = u ->> 'id';
  elsif u ->> 'table' = 'sheet_columns' then
    update sheet_columns set header = b->>'header' where source = b->>'source' and tab = b->>'tab' and field = b->>'field';
  elsif u ->> 'table' = 'config_versions' then
    update config_versions set status = 'old' where status = 'live';
    update config_versions set status = 'live' where number = (u ->> 'number')::int;
  elsif u ->> 'table' = 'recycle' then
    perform set_config('checks.undoing', '0', true);
    perform restore_recycled((u ->> 'id')::uuid);
  else
    raise exception 'That change can''t be undone';
  end if;
  perform set_config('checks.undoing', '0', true);
  insert into audit_events (person_id, person_name, action, kind, target, detail, undo, undo_of)
  values ((me()).id, (me()).name, 'Undid: ' || e.action, 'admin', e.target, p_reason, v_redo, e.id)
  returning id into v_new;
  update audit_events set undone_by = v_new where id = e.id;
  return v_new;
end $$;
