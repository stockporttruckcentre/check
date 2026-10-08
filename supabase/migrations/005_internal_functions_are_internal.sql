-- =============================================================
-- 005. Functions that only the database itself calls are not callable
-- from outside.
--
-- Without this, anybody signed in could write a row into the activity
-- log through /rest/v1/rpc/log_event. The log is the evidence, so only
-- the functions in 003 may write to it. Safe to run twice.
-- =============================================================
set search_path = public, extensions;

revoke execute on function log_event(text, text, text, text, jsonb) from public, anon, authenticated;
revoke execute on function audit_people() from public, anon, authenticated;
revoke execute on function audit_roles() from public, anon, authenticated;
revoke execute on function audit_settings() from public, anon, authenticated;
revoke execute on function audit_columns() from public, anon, authenticated;
revoke execute on function guard_checks() from public, anon, authenticated;
revoke execute on function guard_children() from public, anon, authenticated;
revoke execute on function on_auth_user_created() from public, anon, authenticated;
revoke execute on function on_auth_user_linked() from public, anon, authenticated;
revoke execute on function sheet_key_ok(text) from public, anon, authenticated;

-- Signed in only: everything a person does in the app.
revoke execute on function add_correction(uuid, text) from public, anon;
revoke execute on function delete_unfinished(uuid, text) from public, anon;
revoke execute on function discard_draft() from public, anon;
revoke execute on function finalize_check(uuid) from public, anon;
revoke execute on function last_checks() from public, anon;
revoke execute on function pin_locked() from public, anon;
revoke execute on function publish_draft(text, int) from public, anon;
revoke execute on function put_back_version(int, text) from public, anon;
revoke execute on function recycle_item(text, jsonb) from public, anon;
revoke execute on function remove_person(uuid) from public, anon;
revoke execute on function reopen_check(uuid, text) from public, anon;
revoke execute on function restore_recycled(uuid) from public, anon;
revoke execute on function save_draft(jsonb) from public, anon;
revoke execute on function set_trailer_fact(text, int, text) from public, anon;
revoke execute on function touch_me() from public, anon;
revoke execute on function undo_event(bigint, text) from public, anon;
grant execute on function add_correction(uuid, text), delete_unfinished(uuid, text), discard_draft(), finalize_check(uuid), last_checks(),
  pin_locked(), publish_draft(text, int), put_back_version(int, text), recycle_item(text, jsonb), remove_person(uuid), reopen_check(uuid, text),
  restore_recycled(uuid), save_draft(jsonb), set_trailer_fact(text, int, text), touch_me(), undo_event(bigint, text) to authenticated;

-- Open to anybody: asking whether an email may sign in, and the two calls the workbook macros make (they carry their own key).
grant execute on function can_sign_in(text), sheet_push(text, text, text, jsonb), sheet_columns_for(text, text) to anon, authenticated;

alter function norm_key(text) set search_path = public;
alter function axles_from(text) set search_path = public;
alter function sheet_cell(jsonb, text) set search_path = public;
alter function to_date_or_null(text) set search_path = public;
