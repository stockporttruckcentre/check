-- =============================================================
-- 003. Who may do what, and the server side of every action.
--
-- Nothing in the app decides what somebody may do. Every table has a
-- policy that asks has_perm(), and every action that changes more than
-- one row is a function here that asks it again inside the same
-- transaction as the write.
-- =============================================================
set search_path = public, extensions;

-- -------------------------------------------------------------
-- Search keys: spaces, dashes and a leading C or STC are ignored
-- (source/06 rules), so "c 10772", "C10772" and "10772" are one key.
-- -------------------------------------------------------------
create or replace function norm_key(t text) returns text
language sql immutable as $$
  select nullif(regexp_replace(regexp_replace(upper(coalesce(t,'')), '[^A-Z0-9]', '', 'g'), '^(STC|C)(?=[0-9])', ''), '')
$$;

create or replace function axles_from(description text) returns int
language sql immutable as $$
  select case
    when description ~* 'tri[ -]?axle|\mtri\M|triaxle' then 3
    when description ~* 'tandem' then 2
    when description ~* 'single[ -]?axle' then 1
    else null end
$$;

-- -------------------------------------------------------------
-- Activity log helper
-- -------------------------------------------------------------
create or replace function log_event(p_action text, p_kind text, p_target text, p_detail text, p_undo jsonb default null)
returns bigint language plpgsql security definer set search_path = public as $$
declare v_me people; v_id bigint;
begin
  v_me := me();
  insert into audit_events (person_id, person_name, action, kind, target, detail, undo)
  values (v_me.id, coalesce(v_me.name, 'System'), p_action, p_kind, p_target, p_detail, p_undo)
  returning id into v_id;
  return v_id;
end $$;

-- -------------------------------------------------------------
-- Signing in. Only emails an admin has added can create an account.
-- -------------------------------------------------------------
create or replace function can_sign_in(p_email text) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from people where email = p_email::extensions.citext and deleted_at is null and status <> 'removed')
$$;

create or replace function on_auth_user_created() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from people where email = new.email::extensions.citext and deleted_at is null and status <> 'removed') then
    raise exception 'Only people added in People and roles can sign in';
  end if;
  return new;
end $$;

-- Linked after the account row exists, because people.user_id points at it.
create or replace function on_auth_user_linked() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  update people set user_id = new.id where email = new.email::extensions.citext and deleted_at is null;
  return new;
end $$;
create or replace trigger checks_auth_user_linked after insert on auth.users
  for each row execute function public.on_auth_user_linked();
create or replace trigger checks_auth_user_created before insert on auth.users
  for each row execute function on_auth_user_created();

-- Called by the phone after every sign in and unlock.
create or replace function touch_me() returns jsonb
language plpgsql security definer set search_path = public as $$
declare v people; r roles; s sites;
begin
  update people set last_active = now(), status = case when status = 'invited' then 'active' else status end
   where user_id = auth.uid() and deleted_at is null
   returning * into v;
  if v.id is null then return null; end if;
  select * into r from roles where id = v.role_id;
  select * into s from sites where id = v.site_id;
  return jsonb_build_object('person', to_jsonb(v), 'role', to_jsonb(r), 'site', to_jsonb(s));
end $$;

create or replace function pin_locked() returns void
language plpgsql security definer set search_path = public as $$
declare v people;
begin
  update people set locked_until = now() + interval '15 minutes' where user_id = auth.uid() returning * into v;
  perform log_event('PIN locked', 'signin', v.name, '5 wrong tries');
end $$;

-- -------------------------------------------------------------
-- People and roles: admin changes are logged with what they replaced,
-- so they can be undone (source/07 S_log).
-- -------------------------------------------------------------
create or replace function audit_people() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_action text; v_detail text; r_old text; r_new text;
begin
  if current_setting('checks.undoing', true) = '1' then return new; end if;
  if tg_op = 'INSERT' then
    perform log_event('Added a person', 'admin', new.name, new.email, jsonb_build_object('table','people','id',new.id,'before',null));
  elsif tg_op = 'UPDATE' then
    if new.deleted_at is not null and old.deleted_at is null then
      v_action := 'Removed a person'; v_detail := old.email;
    elsif new.role_id is distinct from old.role_id then
      select name into r_old from roles where id = old.role_id;
      select name into r_new from roles where id = new.role_id;
      v_action := 'Changed role'; v_detail := r_old || ' ' || chr(8594) || ' ' || r_new;
    elsif new.site_id is distinct from old.site_id then
      v_action := 'Changed site'; v_detail := coalesce((select name from sites where id = old.site_id),'All sites') || ' ' || chr(8594) || ' ' || coalesce((select name from sites where id = new.site_id),'All sites');
    elsif new.pin_reset_at is distinct from old.pin_reset_at then
      v_action := 'Reset PIN'; v_detail := null;
    elsif new.locked_until is distinct from old.locked_until and new.locked_until is null then
      v_action := 'Unlocked'; v_detail := null;
    elsif new.name is distinct from old.name or new.aliases is distinct from old.aliases or new.email is distinct from old.email then
      v_action := 'Changed details'; v_detail := null;
    else
      return new;
    end if;
    perform log_event(v_action, 'admin', new.name, v_detail, jsonb_build_object('table','people','id',old.id,'before',to_jsonb(old)));
  end if;
  return new;
end $$;
create or replace trigger people_audit after insert or update on people for each row execute function audit_people();

create or replace function audit_roles() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if current_setting('checks.undoing', true) = '1' then return new; end if;
  if old.fixed then raise exception 'Owner permissions are fixed'; end if;
  if (new.perms ->> 'publish') is distinct from (old.perms ->> 'publish') or (new.perms ->> 'system') is distinct from (old.perms ->> 'system') then
    if not has_perm('system') then raise exception 'Only the Owner can give out publishing or system settings'; end if;
  end if;
  perform log_event('Changed permissions', 'admin', new.name, null, jsonb_build_object('table','roles','id',old.id,'before',to_jsonb(old)));
  return new;
end $$;
create or replace trigger roles_audit before update on roles for each row execute function audit_roles();

create or replace function audit_settings() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if current_setting('checks.undoing', true) = '1' then return new; end if;
  new.updated_at := now(); new.updated_by := (me()).id;
  perform log_event('Changed setting', 'admin', case new.key when 'photo' then 'Photo size' when 'records' then 'Keep records for' else new.key end,
                    new.value::text, jsonb_build_object('table','settings','id',old.key,'before',to_jsonb(old)));
  return new;
end $$;
create or replace trigger settings_audit before update on settings for each row execute function audit_settings();

create or replace function audit_columns() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if current_setting('checks.undoing', true) = '1' then return coalesce(new, old); end if;
  if tg_op = 'UPDATE' then
    perform log_event('Changed column match', 'admin', initcap(new.source) || ' sheet', new.field || ': ' || old.header || ' ' || chr(8594) || ' ' || new.header,
                      jsonb_build_object('table','sheet_columns','id',jsonb_build_array(old.source, old.tab, old.field),'before',to_jsonb(old)));
  end if;
  return coalesce(new, old);
end $$;
create or replace trigger columns_audit before update on sheet_columns for each row execute function audit_columns();

-- -------------------------------------------------------------
-- Undo: puts the row back as it was, with a reason, and logs that too.
-- -------------------------------------------------------------
create or replace function undo_event(p_id bigint, p_reason text) returns bigint
language plpgsql security definer set search_path = public as $$
declare e audit_events; u jsonb; b jsonb; v_new bigint;
begin
  if not has_perm('undo') then raise exception 'You can''t undo changes'; end if;
  if coalesce(trim(p_reason),'') = '' then raise exception 'A reason is needed'; end if;
  select * into e from audit_events where id = p_id for update;
  if e.id is null or e.undo is null then raise exception 'That change can''t be undone'; end if;
  if e.undone_by is not null then raise exception 'That change has already been undone'; end if;
  u := e.undo; b := u -> 'before';
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
  insert into audit_events (person_id, person_name, action, kind, target, detail, undo_of)
  values ((me()).id, (me()).name, 'Undid: ' || e.action, 'admin', e.target, p_reason, e.id)
  returning id into v_new;
  -- The undo can itself be undone: it carries the row as it was just before.
  update audit_events set undone_by = v_new where id = e.id;
  return v_new;
end $$;

-- -------------------------------------------------------------
-- Checklist versions: draft, publish with a reason, put back.
-- -------------------------------------------------------------
create or replace function save_draft(p_config jsonb) returns int
language plpgsql security definer set search_path = public as $$
declare v_draft config_versions;
begin
  if not has_perm('edit_config') then raise exception 'You can''t edit checks, lists or wording'; end if;
  select * into v_draft from config_versions where status = 'draft';
  if v_draft.id is null then
    insert into config_versions (number, status, config, created_by)
    values (coalesce((select max(number) from config_versions), 0) + 1, 'draft', p_config, (me()).id)
    returning * into v_draft;
  else
    update config_versions set config = p_config, updated_at = now() where id = v_draft.id returning * into v_draft;
  end if;
  return v_draft.number;
end $$;

create or replace function discard_draft() returns void
language plpgsql security definer set search_path = public as $$
begin
  if not has_perm('edit_config') then raise exception 'You can''t edit checks, lists or wording'; end if;
  update config_versions set status = 'old', reason = 'Discarded draft', updated_at = now() where status = 'draft';
end $$;

create or replace function publish_draft(p_reason text, p_changed int) returns int
language plpgsql security definer set search_path = public as $$
declare v_draft config_versions; v_prev int;
begin
  if not has_perm('publish') then raise exception 'Only the Owner can publish a new version'; end if;
  if coalesce(trim(p_reason),'') = '' then raise exception 'A reason is needed'; end if;
  select * into v_draft from config_versions where status = 'draft' for update;
  if v_draft.id is null then raise exception 'There''s no draft to publish'; end if;
  select number into v_prev from config_versions where status = 'live';
  update config_versions set status = 'old' where status = 'live';
  update config_versions set status = 'live', reason = p_reason, changed = p_changed, published_by = (me()).id, published_at = now()
   where id = v_draft.id;
  perform log_event('Published v' || v_draft.number, 'admin', 'Check builder', p_reason,
                    case when v_prev is null then null else jsonb_build_object('table','config_versions','number',v_prev) end);
  return v_draft.number;
end $$;

create or replace function put_back_version(p_number int, p_reason text) returns int
language plpgsql security definer set search_path = public as $$
declare v_prev int;
begin
  if not has_perm('publish') then raise exception 'Only the Owner can put back a version'; end if;
  if not exists (select 1 from config_versions where number = p_number and status = 'old' and published_at is not null) then raise exception 'That version can''t be put back'; end if;
  select number into v_prev from config_versions where status = 'live';
  update config_versions set status = 'old' where status = 'live';
  update config_versions set status = 'live', published_at = now(), published_by = (me()).id where number = p_number;
  perform log_event('Put back v' || p_number, 'admin', 'Versions', p_reason, jsonb_build_object('table','config_versions','number',v_prev));
  return p_number;
end $$;

-- -------------------------------------------------------------
-- Checks: the phone writes its own; a sent check is never changed.
-- -------------------------------------------------------------
create or replace function guard_checks() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'UPDATE' and old.status = 'sent' and current_setting('checks.server', true) is distinct from '1' then
    raise exception 'A sent check can''t be changed. Add a correction instead.';
  end if;
  if tg_op = 'UPDATE' and new.status = 'sent' and old.status <> 'sent' and current_setting('checks.server', true) is distinct from '1' then
    raise exception 'Checks are sent through finalize_check';
  end if;
  if tg_op = 'INSERT' and new.status = 'sent' and current_setting('checks.server', true) is distinct from '1' then
    raise exception 'Checks are sent through finalize_check';
  end if;
  new.updated_at := now();
  return new;
end $$;
create or replace trigger checks_guard before insert or update on checks for each row execute function guard_checks();

create or replace function guard_children() returns trigger
language plpgsql security definer set search_path = public as $$
declare s text;
begin
  select status into s from checks where id = coalesce(new.check_id, old.check_id);
  if s = 'sent' and current_setting('checks.server', true) is distinct from '1' then
    raise exception 'A sent check can''t be changed';
  end if;
  return coalesce(new, old);
end $$;
create or replace trigger pins_guard before insert or update on damage_pins for each row execute function guard_children();
create or replace trigger photos_guard before insert or update on photos for each row execute function guard_children();

-- The phone calls this once every part has arrived. It is safe to call again:
-- a second call returns the same reference and changes nothing.
create or replace function finalize_check(p_id uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare c checks; v_me people; v_prefix text; v_n int; v_ref text; v_new int; v_rep people; v_flag text;
begin
  v_me := me();
  select * into c from checks where id = p_id for update;
  if c.id is null then raise exception 'That check hasn''t reached the office yet'; end if;
  if c.person_id <> v_me.id then raise exception 'That isn''t your check'; end if;
  if c.status = 'sent' then return jsonb_build_object('ref', c.ref, 'sent_at', c.sent_at); end if;
  v_prefix := case when c.direction = 'OUT' then 'CO' else 'CI' end || '-' || to_char(now() at time zone 'Europe/London', 'YYMM');
  insert into check_refs (prefix, n) values (v_prefix, 1)
    on conflict (prefix) do update set n = check_refs.n + 1 returning n into v_n;
  v_ref := v_prefix || '-' || lpad(v_n::text, 4, '0');
  select count(*) into v_new from damage_pins where check_id = p_id and status = 'new' and removed_at is null;
  perform set_config('checks.server', '1', true);
  update checks set status = 'sent', ref = v_ref, sent_at = coalesce((data ->> 'signedAt')::timestamptz, now()), received_at = now(), new_damage = v_new,
         data = jsonb_set(jsonb_set(data, '{status}', '"sent"'), '{ref}', to_jsonb(v_ref))
   where id = p_id returning * into c;
  perform set_config('checks.server', '0', true);
  perform log_event('Sent check ' || case when c.direction = 'OUT' then 'out' else 'in' end, 'check', coalesce(nullif(c.c_no,''), c.stc_no),
                    coalesce(c.customer,'') || case when v_new > 0 then ' ' || chr(183) || ' ' || v_new || ' new damage' else '' end);
  -- "If you carry on, Dean gets a message and it's noted on the record." (source/06)
  v_flag := c.data -> 'flags' ->> 'notYourTrailer';
  if coalesce(v_flag,'') <> '' then
    select * into v_rep from people p
     where p.deleted_at is null and p.id <> v_me.id
       and (lower(split_part(p.name,' ',1)) = lower(split_part(v_flag,' ',1)) or lower(p.name) = lower(v_flag)
            or exists (select 1 from unnest(p.aliases) a where lower(a) = lower(v_flag)))
     limit 1;
    if v_rep.id is not null then
      insert into notifications (person_id, kind, body, check_id)
      values (v_rep.id, 'not_your_trailer', jsonb_build_object('by', v_me.name, 'stc', c.stc_no, 'direction', c.direction, 'ref', v_ref), c.id);
    end if;
  end if;
  return jsonb_build_object('ref', v_ref, 'sent_at', c.sent_at);
end $$;

create or replace function add_correction(p_check uuid, p_text text) returns void
language plpgsql security definer set search_path = public as $$
declare c checks;
begin
  select * into c from checks where id = p_check;
  if c.id is null or c.status <> 'sent' then raise exception 'Corrections are added to sent checks'; end if;
  if c.person_id <> (me()).id and not has_perm('reopen') then raise exception 'You can''t add a correction to this check'; end if;
  if coalesce(trim(p_text),'') = '' then raise exception 'Write the correction first'; end if;
  insert into corrections (check_id, person_id, text) values (p_check, (me()).id, p_text);
  perform log_event('Added a correction', 'check', coalesce(nullif(c.c_no,''), c.stc_no), p_text);
end $$;

-- Reopening makes a new version for the person reopening it. The original stays on record.
create or replace function reopen_check(p_check uuid, p_reason text) returns uuid
language plpgsql security definer set search_path = public as $$
declare c checks; v_id uuid := gen_random_uuid(); v_me people; d jsonb;
begin
  if not has_perm('reopen') then raise exception 'You can''t reopen a sent check'; end if;
  if coalesce(trim(p_reason),'') = '' then raise exception 'A reason is needed'; end if;
  select * into c from checks where id = p_check;
  if c.id is null or c.status <> 'sent' then raise exception 'Only a sent check can be reopened'; end if;
  v_me := me();
  d := c.data || jsonb_build_object('id', v_id, 'status', 'draft', 'version', c.version + 1, 'parentId', c.id, 'ref', null,
                                    'userId', v_me.id, 'userName', v_me.name, 'sentAt', null, 'reopenReason', p_reason,
                                    'signature', null, 'signedAt', null);
  insert into checks (id, person_id, site_id, direction, stc_no, c_no, customer, account_no, order_no, rate_per_week, replacement_value,
                      collecting_reg, config_version, status, version, parent_id, data)
  values (v_id, v_me.id, c.site_id, c.direction, c.stc_no, c.c_no, c.customer, c.account_no, c.order_no, c.rate_per_week, c.replacement_value,
          c.collecting_reg, c.config_version, 'reopened', c.version + 1, c.id, d);
  insert into damage_pins (id, check_id, number, view, x, y, zone, type, note, status, previous_pin_id, item_id)
  select gen_random_uuid(), v_id, number, view, x, y, zone, type, note, status, previous_pin_id, item_id from damage_pins where check_id = c.id and removed_at is null;
  perform log_event('Reopened check', 'check', coalesce(nullif(c.c_no,''), c.stc_no), p_reason);
  return v_id;
end $$;

-- Deleting an unfinished check sends it to the recycle bin for 30 days.
create or replace function delete_unfinished(p_check uuid, p_reason text) returns uuid
language plpgsql security definer set search_path = public as $$
declare c checks; v_bin uuid;
begin
  select * into c from checks where id = p_check;
  if c.id is null or c.status = 'sent' then raise exception 'Only an unfinished check can be deleted'; end if;
  if c.person_id <> (me()).id and not has_perm('see_unfinished') then raise exception 'You can''t delete this check'; end if;
  insert into recycle (kind, label, payload, deleted_by)
  values ('check', 'Unfinished check ' || chr(183) || ' ' || coalesce(nullif(c.c_no,''), c.stc_no),
          jsonb_build_object('check', to_jsonb(c), 'pins', (select coalesce(jsonb_agg(to_jsonb(p)), '[]') from damage_pins p where p.check_id = c.id),
                             'photos', (select coalesce(jsonb_agg(to_jsonb(f)), '[]') from photos f where f.check_id = c.id)), (me()).id)
  returning id into v_bin;
  update checks set deleted_at = now() where id = p_check;
  perform log_event('Deleted unfinished check', 'check', coalesce(nullif(c.c_no,''), c.stc_no), coalesce(p_reason,''),
                    jsonb_build_object('table','recycle','id',v_bin));
  return v_bin;
end $$;

create or replace function remove_person(p_person uuid) returns uuid
language plpgsql security definer set search_path = public as $$
declare v people; v_bin uuid;
begin
  if not has_perm('people') then raise exception 'You can''t remove people'; end if;
  select * into v from people where id = p_person;
  if v.role_id = 'owner' and (select count(*) from people where role_id = 'owner' and deleted_at is null) <= 1 then
    raise exception 'The last Owner can''t be removed';
  end if;
  insert into recycle (kind, label, payload, deleted_by) values ('person', 'Person: ' || v.name, to_jsonb(v), (me()).id) returning id into v_bin;
  update people set deleted_at = now(), status = 'removed' where id = p_person;
  return v_bin;
end $$;

create or replace function restore_recycled(p_id uuid) returns void
language plpgsql security definer set search_path = public as $$
declare r recycle;
begin
  if not has_perm('undo') then raise exception 'You can''t restore things'; end if;
  select * into r from recycle where id = p_id for update;
  if r.id is null or r.restored_at is not null then raise exception 'That has already been restored'; end if;
  if r.deleted_at < now() - interval '30 days' then raise exception 'That has gone for good'; end if;
  if r.kind = 'check' then
    update checks set deleted_at = null where id = (r.payload -> 'check' ->> 'id')::uuid;
  elsif r.kind = 'person' then
    perform set_config('checks.undoing', '1', true);
    update people set deleted_at = null, status = coalesce(nullif(r.payload->>'status','removed'), 'invited') where id = (r.payload ->> 'id')::uuid;
    perform set_config('checks.undoing', '0', true);
  elsif r.kind = 'item' then
    null; -- items live in the draft checklist; the office screen puts the item back into the draft itself
  end if;
  update recycle set restored_at = now() where id = p_id;
  perform log_event('Restored', 'admin', r.label, null);
end $$;

-- Somebody leaves an item out of the checklist: the office puts it in the bin.
create or replace function recycle_item(p_label text, p_payload jsonb) returns uuid
language plpgsql security definer set search_path = public as $$
declare v uuid;
begin
  if not has_perm('edit_config') then raise exception 'You can''t edit checks, lists or wording'; end if;
  insert into recycle (kind, label, payload, deleted_by) values ('item', 'Item: ' || p_label, p_payload, (me()).id) returning id into v;
  return v;
end $$;

-- -------------------------------------------------------------
-- What the phone needs to know about each trailer's last check:
-- damage still on record, and the last readings to compare against.
-- -------------------------------------------------------------
create or replace function last_checks() returns table (stc_no text, check_id uuid, direction text, sent_at timestamptz, readings jsonb, pins jsonb, photos jsonb)
language sql stable security definer set search_path = public as $$
  with latest as (
    select distinct on (c.stc_no) c.* from checks c
     where c.status = 'sent' and c.deleted_at is null and has_perm('do_checks')
     order by c.stc_no, c.sent_at desc
  )
  select l.stc_no, l.id, l.direction, l.sent_at, coalesce(l.data -> 'readings', '{}'),
         coalesce((select jsonb_agg(jsonb_build_object('id', p.id, 'view', p.view, 'x', p.x, 'y', p.y, 'zone', p.zone, 'type', p.type, 'note', p.note, 'since', l.sent_at) order by p.number)
                     from damage_pins p where p.check_id = l.id and p.removed_at is null and p.status = 'new'), '[]'::jsonb)
         || coalesce((select jsonb_agg(jsonb_build_object('id', e->>'id', 'view', e->>'view', 'x', (e->>'x')::real, 'y', (e->>'y')::real, 'zone', e->>'zone',
                                                          'type', e->>'type', 'note', e->>'note', 'since', e->>'since'))
                        from jsonb_array_elements(coalesce(l.data -> 'oldPins', '[]'::jsonb)) e where coalesce(e->>'verdict','') <> 'repaired'), '[]'::jsonb),
         coalesce((select jsonb_agg(jsonb_build_object('path', f.path, 'ref', f.ref_id, 'section', f.section, 'shot', f.shot)) from photos f
                    where f.check_id = l.id and f.removed_at is null), '[]'::jsonb)
    from latest l
$$;

-- -------------------------------------------------------------
-- The spreadsheets. The macro inside each workbook calls these on save.
-- A row that leaves the sheet is marked gone rather than removed, so a
-- check that names it still reads properly.
-- -------------------------------------------------------------
alter table trailers add column if not exists gone boolean not null default false;
alter table fleet_hires add column if not exists gone boolean not null default false;

create or replace function sheet_key_ok(p_key text) returns boolean
language sql stable security definer set search_path = public, private, extensions as $$
  select exists (select 1 from private.sheet_keys where hash = encode(extensions.digest(p_key, 'sha256'), 'hex'))
$$;

-- Which headers to send. Anything not listed here never leaves the workbook.
create or replace function sheet_columns_for(p_key text, p_source text) returns table (tab text, header text)
language plpgsql stable security definer set search_path = public as $$
begin
  if not sheet_key_ok(p_key) then raise exception 'That key isn''t recognised'; end if;
  return query select c.tab, c.header from sheet_columns c where c.source = p_source;
end $$;

create or replace function sheet_cell(cells jsonb, header text) returns text
language sql immutable as $$
  select nullif(trim(e.value), '') from jsonb_each_text(cells) e
   where lower(trim(e.key)) = lower(trim(header))
      or (lower(trim(e.key)) like lower(trim(header)) || '%'
          and substr(lower(trim(e.key)), length(trim(header)) + 1, 1) !~ '[a-z ]')
   order by length(e.key) limit 1
$$;

create or replace function to_date_or_null(t text) returns date
language plpgsql immutable as $$
begin
  if t ~ '^\d{4}-\d{2}-\d{2}' then return left(t, 10)::date; end if;
  return null;
exception when others then return null;
end $$;

create or replace function sheet_push(p_key text, p_source text, p_by text, p_rows jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare v_f jsonb; v_t jsonb; v_fs jsonb; v_gu jsonb; v_count int := 0; v_skipped int := 0;
begin
  if not sheet_key_ok(p_key) then raise exception 'That key isn''t recognised'; end if;
  if p_source not in ('stock','fleet') then raise exception 'Unknown sheet'; end if;

  -- Each row, reduced to the fields the column map names.
  select coalesce(jsonb_agg(jsonb_build_object('rn', r.rn, 'tab', r.tab, 'f', z.f)), '[]'::jsonb) into v_f
    from (select x.ord as rn, x.r ->> 'tab' as tab, x.r -> 'cells' as cells
            from jsonb_array_elements(p_rows) with ordinality as x(r, ord)) r
    cross join lateral (select jsonb_object_agg(m.field, sheet_cell(r.cells, m.header)) as f
                          from sheet_columns m
                         where m.source = p_source and (m.tab = '*' or lower(m.tab) = lower(r.tab))) z
   where z.f is not null;

  if p_source = 'stock' then
    -- A real STC number, or a registration for the few assets that carry one. Section headings are not trailers.
    select coalesce(jsonb_agg(s), '[]'::jsonb) into v_t from (
      select distinct on (stc_no) stc_no, f, tab, sold from (
        select regexp_replace(upper(regexp_replace(e->'f'->>'stc_no', '\s+', '', 'g')), '\.0$', '') as stc_no, e->'f' as f, e->>'tab' as tab,
               (e->>'rn')::int as rn, (e->>'tab') ilike 'sold%' as sold
          from jsonb_array_elements(v_f) e
         where trim(coalesce(e->'f'->>'stc_no','')) ~ '^[0-9]{5,7}(\.0)?$'
            or upper(trim(coalesce(e->'f'->>'stc_no',''))) ~ '^[A-Z]{2}[0-9]{2}\s?[A-Z]{3}$'
      ) a order by stc_no, sold, rn desc
    ) s;
    v_skipped := jsonb_array_length(v_f) - jsonb_array_length(v_t);

    update trailers set gone = true, updated_at = now()
     where not gone and stc_no not in (select e->>'stc_no' from jsonb_array_elements(v_t) e);

    insert into trailers as t (stc_no, c_no, supplier_no, chassis_no, year, make, model, description, side_aperture, colour, door_type,
                               axle_type, axle_count, mot_date, mot_text, location, status, sales_rep, customer, tab, sold, on_sales_order, keys, gone, updated_at)
    select e->>'stc_no', f->>'c_no', f->>'supplier_no', f->>'chassis_no', regexp_replace(f->>'year','\.0$',''), f->>'make', f->>'model', f->>'description',
           f->>'side_aperture', f->>'colour', f->>'door_type', f->>'axle_type', axles_from(f->>'description'),
           to_date_or_null(f->>'mot_date'), case when to_date_or_null(f->>'mot_date') is null then f->>'mot_date' end,
           f->>'location', f->>'status', f->>'sales_rep', f->>'customer', e->>'tab', (e->>'sold')::boolean,
           coalesce(f->>'status','') ilike '%sales order%',
           array_remove(array[norm_key(e->>'stc_no'), norm_key(f->>'c_no'), norm_key(f->>'supplier_no'), norm_key(f->>'chassis_no')], null),
           false, now()
      from jsonb_array_elements(v_t) e, lateral (select e->'f' as f) ff
    on conflict (stc_no) do update set c_no = excluded.c_no, supplier_no = excluded.supplier_no, chassis_no = excluded.chassis_no,
       year = excluded.year, make = excluded.make, model = excluded.model, description = excluded.description,
       side_aperture = excluded.side_aperture, colour = excluded.colour, door_type = excluded.door_type, axle_type = excluded.axle_type,
       axle_count = excluded.axle_count, mot_date = excluded.mot_date, mot_text = excluded.mot_text, location = excluded.location,
       status = excluded.status, sales_rep = excluded.sales_rep, customer = excluded.customer, tab = excluded.tab, sold = excluded.sold,
       on_sales_order = excluded.on_sales_order, keys = excluded.keys, gone = false,
       updated_at = case when t.gone or (t.location, t.status, t.sales_rep, t.customer, t.mot_date, t.mot_text, t.description, t.tab, t.c_no)
                           is distinct from (excluded.location, excluded.status, excluded.sales_rep, excluded.customer, excluded.mot_date, excluded.mot_text, excluded.description, excluded.tab, excluded.c_no)
                         then now() else t.updated_at end;
    v_count := jsonb_array_length(v_t);
  else
    -- Fleetserv: one row per rental trailer, with the customer in Location when it is on hire.
    select coalesce(jsonb_agg(s), '[]'::jsonb) into v_fs from (
      select distinct on (fleet_no) fleet_no, f from (
        select regexp_replace(trim(e->'f'->>'fleet_no'), '\.0$', '') as fleet_no, e->'f' as f, (e->>'rn')::int as rn
          from jsonb_array_elements(v_f) e
         where lower(e->>'tab') = 'fleetserv' and trim(coalesce(e->'f'->>'fleet_no','')) ~ '^[0-9]{5,7}(\.0)?$'
      ) a order by fleet_no, rn desc
    ) s;
    -- General Update: the log of hires, newest last. The last row for a trailer names its salesman.
    select coalesce(jsonb_agg(s), '[]'::jsonb) into v_gu from (
      select distinct on (fleet_no) fleet_no, f from (
        select regexp_replace(trim(e->'f'->>'fleet_no'), '\.0$', '') as fleet_no, e->'f' as f, (e->>'rn')::int as rn
          from jsonb_array_elements(v_f) e
         where lower(e->>'tab') = 'general update' and trim(coalesce(e->'f'->>'fleet_no','')) ~ '^[0-9]{5,7}(\.0)?$'
      ) a order by fleet_no, rn desc
    ) s;
    v_skipped := 0;

    update fleet_hires set gone = true, updated_at = now()
     where not gone and fleet_no not in (select e->>'fleet_no' from jsonb_array_elements(v_fs) e);

    insert into fleet_hires as h (fleet_no, c_no, on_hire, hire_customer, hire_rate, hire_salesman, on_hire_date, year, make, model, mot_date, mot_text, keys, gone, updated_at)
    select s->>'fleet_no', sf->>'c_no', upper(coalesce(sf->>'on_hire','')) like 'ON HIRE%',
           case when upper(coalesce(sf->>'on_hire','')) like 'ON HIRE%' then coalesce(sf->>'hire_customer', gf->>'hire_customer') end,
           coalesce(nullif(regexp_replace(coalesce(sf->>'hire_rate',''), '[^0-9.]', '', 'g'), '')::numeric,
                    nullif(regexp_replace(coalesce(gf->>'hire_rate',''), '[^0-9.]', '', 'g'), '')::numeric),
           case when upper(coalesce(gf->>'on_hire','')) like 'ON HIRE%' then gf->>'hire_salesman' end,
           to_date_or_null(gf->>'on_hire_date'),
           regexp_replace(sf->>'year','\.0$',''), sf->>'make', sf->>'model',
           to_date_or_null(sf->>'mot_date'), case when to_date_or_null(sf->>'mot_date') is null then sf->>'mot_date' end,
           array_remove(array[norm_key(s->>'fleet_no'), norm_key(sf->>'c_no')], null), false, now()
      from jsonb_array_elements(v_fs) s
      cross join lateral (select s->'f' as sf) a
      left join lateral (select g->'f' as gf from jsonb_array_elements(v_gu) g where g->>'fleet_no' = s->>'fleet_no' limit 1) b on true
    on conflict (fleet_no) do update set c_no = excluded.c_no, on_hire = excluded.on_hire, hire_customer = excluded.hire_customer,
       hire_rate = excluded.hire_rate, hire_salesman = excluded.hire_salesman, on_hire_date = excluded.on_hire_date,
       year = excluded.year, make = excluded.make, model = excluded.model, mot_date = excluded.mot_date, mot_text = excluded.mot_text,
       keys = excluded.keys, gone = false, updated_at = now();
    v_count := jsonb_array_length(v_fs);
  end if;

  insert into sheet_sync (source, updated_at, updated_by, rows, detail)
  values (p_source, now(), left(coalesce(p_by,''), 80), v_count, jsonb_build_object('skipped', v_skipped))
  on conflict (source) do update set updated_at = now(), updated_by = excluded.updated_by, rows = excluded.rows, detail = excluded.detail;
  insert into audit_events (person_name, action, kind, target, detail)
  values ('System', case when p_source = 'stock' then 'Stock sheet read' else 'Fleet Serve read' end, 'system',
          v_count || ' trailers', 'Saved by ' || coalesce(nullif(p_by,''), 'someone'));
  return jsonb_build_object('rows', v_count, 'skipped', v_skipped);
end $$;

-- One list for the phone: the stock sheet, with Fleet Serve's hire laid over it,
-- plus any rental trailer Fleet Serve has that the stock sheet does not.
create or replace view trailers_v with (security_invoker = true) as
select t.stc_no, t.c_no, t.c_no as ministry_no, t.supplier_no, t.chassis_no, t.year, t.make, t.model, t.description,
       t.side_aperture, t.colour, t.door_type, t.axle_type, coalesce(f.axle_count, t.axle_count) as axle_count,
       t.mot_date, t.mot_text, t.location, t.status, t.sales_rep, t.customer, t.tab, t.sold, t.on_sales_order,
       h.hire_customer, h.hire_rate, coalesce(h.on_hire, false) as on_hire, h.hire_salesman, f.trailer_type,
       t.keys, greatest(t.updated_at, h.updated_at, f.updated_at) as updated_at
  from trailers t
  left join fleet_hires h on h.fleet_no = t.stc_no and not h.gone
  left join trailer_facts f on f.stc_no = t.stc_no
 where not t.gone
union all
select h.fleet_no, h.c_no, h.c_no, null, null, h.year, h.make, h.model, null, null, null, null, null, f.axle_count,
       h.mot_date, h.mot_text, null, null, null, null, 'Fleet Serve', false, false,
       h.hire_customer, h.hire_rate, h.on_hire, h.hire_salesman, f.trailer_type, h.keys, greatest(h.updated_at, f.updated_at)
  from fleet_hires h
  left join trailer_facts f on f.stc_no = h.fleet_no
 where not h.gone and not exists (select 1 from trailers t where t.stc_no = h.fleet_no and not t.gone);

create or replace function set_trailer_fact(p_stc text, p_axles int, p_type text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not has_perm('do_checks') then raise exception 'You can''t do checks'; end if;
  insert into trailer_facts (stc_no, axle_count, trailer_type, updated_by) values (p_stc, p_axles, p_type, (me()).id)
  on conflict (stc_no) do update set axle_count = coalesce(excluded.axle_count, trailer_facts.axle_count),
     trailer_type = coalesce(excluded.trailer_type, trailer_facts.trailer_type), updated_by = excluded.updated_by, updated_at = now();
end $$;

-- -------------------------------------------------------------
-- Row level security. Each policy is created only if it is not there,
-- so the file can be run again without removing anything first.
-- -------------------------------------------------------------
alter table sites enable row level security;
alter table roles enable row level security;
alter table people enable row level security;
alter table config_versions enable row level security;
alter table settings enable row level security;
alter table trailers enable row level security;
alter table fleet_hires enable row level security;
alter table trailer_facts enable row level security;
alter table sheet_sync enable row level security;
alter table sheet_columns enable row level security;
alter table checks enable row level security;
alter table damage_pins enable row level security;
alter table photos enable row level security;
alter table corrections enable row level security;
alter table notifications enable row level security;
alter table check_refs enable row level security;
alter table audit_events enable row level security;
alter table recycle enable row level security;

do $$
declare p text[];
begin
  foreach p slice 1 in array array[
    ['checks_sites_read', 'create policy checks_sites_read on sites for select to authenticated using (true)'],
    ['checks_sites_write', 'create policy checks_sites_write on sites for all to authenticated using (has_perm(''edit_config'')) with check (has_perm(''edit_config''))'],
    ['checks_roles_read', 'create policy checks_roles_read on roles for select to authenticated using (true)'],
    ['checks_roles_write', 'create policy checks_roles_write on roles for update to authenticated using (has_perm(''people'')) with check (has_perm(''people''))'],
    ['checks_people_read', 'create policy checks_people_read on people for select to authenticated using (user_id = auth.uid() or has_perm(''do_checks''))'],
    ['checks_people_insert', 'create policy checks_people_insert on people for insert to authenticated with check (has_perm(''people'') and (role_id <> ''owner'' or has_perm(''system'')))'],
    ['checks_people_update', 'create policy checks_people_update on people for update to authenticated using (has_perm(''people'')) with check (has_perm(''people'') and (role_id <> ''owner'' or has_perm(''system'')))'],
    ['checks_config_read', 'create policy checks_config_read on config_versions for select to authenticated using (status <> ''draft'' or has_perm(''edit_config''))'],
    ['checks_settings_read', 'create policy checks_settings_read on settings for select to authenticated using (true)'],
    ['checks_settings_write', 'create policy checks_settings_write on settings for update to authenticated using (has_perm(''system'')) with check (has_perm(''system''))'],
    ['checks_trailers_read', 'create policy checks_trailers_read on trailers for select to authenticated using (has_perm(''do_checks''))'],
    ['checks_fleet_read', 'create policy checks_fleet_read on fleet_hires for select to authenticated using (has_perm(''do_checks''))'],
    ['checks_facts_read', 'create policy checks_facts_read on trailer_facts for select to authenticated using (has_perm(''do_checks''))'],
    ['checks_sync_read', 'create policy checks_sync_read on sheet_sync for select to authenticated using (true)'],
    ['checks_columns_read', 'create policy checks_columns_read on sheet_columns for select to authenticated using (has_perm(''system''))'],
    ['checks_columns_write', 'create policy checks_columns_write on sheet_columns for update to authenticated using (has_perm(''system'')) with check (has_perm(''system''))'],
    ['checks_checks_read', 'create policy checks_checks_read on checks for select to authenticated using (deleted_at is null and (person_id = (me()).id or (status = ''sent'' and has_perm(''do_checks'')) or has_perm(''see_unfinished'')))'],
    ['checks_checks_insert', 'create policy checks_checks_insert on checks for insert to authenticated with check (person_id = (me()).id and has_perm(''do_checks''))'],
    ['checks_checks_update', 'create policy checks_checks_update on checks for update to authenticated using (person_id = (me()).id and status <> ''sent'') with check (person_id = (me()).id)'],
    ['checks_pins_read', 'create policy checks_pins_read on damage_pins for select to authenticated using (exists (select 1 from checks c where c.id = check_id))'],
    ['checks_pins_write', 'create policy checks_pins_write on damage_pins for all to authenticated using (exists (select 1 from checks c where c.id = check_id and c.person_id = (me()).id and c.status <> ''sent'')) with check (exists (select 1 from checks c where c.id = check_id and c.person_id = (me()).id and c.status <> ''sent''))'],
    ['checks_photos_read', 'create policy checks_photos_read on photos for select to authenticated using (exists (select 1 from checks c where c.id = check_id))'],
    ['checks_photos_write', 'create policy checks_photos_write on photos for all to authenticated using (exists (select 1 from checks c where c.id = check_id and c.person_id = (me()).id and c.status <> ''sent'')) with check (exists (select 1 from checks c where c.id = check_id and c.person_id = (me()).id and c.status <> ''sent''))'],
    ['checks_corrections_read', 'create policy checks_corrections_read on corrections for select to authenticated using (exists (select 1 from checks c where c.id = check_id))'],
    ['checks_notes_read', 'create policy checks_notes_read on notifications for select to authenticated using (person_id = (me()).id)'],
    ['checks_notes_update', 'create policy checks_notes_update on notifications for update to authenticated using (person_id = (me()).id) with check (person_id = (me()).id)'],
    ['checks_audit_read', 'create policy checks_audit_read on audit_events for select to authenticated using (has_perm(''undo'') or has_perm(''edit_config'') or has_perm(''system''))'],
    ['checks_recycle_read', 'create policy checks_recycle_read on recycle for select to authenticated using (has_perm(''undo''))'],
    ['checks_storage_read', 'create policy checks_storage_read on storage.objects for select to authenticated using (bucket_id = ''checks'' and exists (select 1 from public.checks c where c.id::text = (storage.foldername(name))[1]))'],
    ['checks_storage_insert', 'create policy checks_storage_insert on storage.objects for insert to authenticated with check (bucket_id = ''checks'' and exists (select 1 from public.checks c where c.id::text = (storage.foldername(name))[1] and c.person_id = (public.me()).id and c.status <> ''sent''))'],
    ['checks_storage_update', 'create policy checks_storage_update on storage.objects for update to authenticated using (bucket_id = ''checks'' and exists (select 1 from public.checks c where c.id::text = (storage.foldername(name))[1] and c.person_id = (public.me()).id and c.status <> ''sent''))']
  ] loop
    if not exists (select 1 from pg_policies where policyname = p[1]) then execute p[2]; end if;
  end loop;
end $$;

-- The activity log is append only. Nobody writes to it except the functions above,
-- and there is no policy that lets anybody remove a row.
revoke insert, update, truncate, references, trigger on audit_events from anon, authenticated;
revoke all on check_refs from anon, authenticated;
grant execute on function can_sign_in(text) to anon;
grant execute on function sheet_push(text, text, text, jsonb) to anon;
grant execute on function sheet_columns_for(text, text) to anon;

-- Photo storage. Private: each check's photos sit under its id.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('checks', 'checks', false, 2097152, array['image/jpeg','image/png'])
on conflict (id) do nothing;

-- Only emails an admin has added can create an account.
create or replace trigger checks_auth_user_created before insert on auth.users
  for each row execute function public.on_auth_user_created();

-- Realtime: phones hear about spreadsheet saves and new versions as they happen.
do $$ begin
  begin alter publication supabase_realtime add table trailers; exception when others then null; end;
  begin alter publication supabase_realtime add table fleet_hires; exception when others then null; end;
  begin alter publication supabase_realtime add table sheet_sync; exception when others then null; end;
  begin alter publication supabase_realtime add table config_versions; exception when others then null; end;
  begin alter publication supabase_realtime add table notifications; exception when others then null; end;
end $$;
