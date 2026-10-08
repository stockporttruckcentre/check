-- =============================================================
-- 007. Who did the last check on each trailer, and its reference.
--
-- The phone asks before a trailer is checked out twice, or checked in
-- twice, in a row. This tells it who did the last one.
--
-- Safe to run twice.
-- =============================================================

create or replace function last_check_by() returns table (stc_no text, ref text, person_name text)
language sql stable security definer set search_path = public as $$
  select distinct on (c.stc_no) c.stc_no, c.ref, p.name
    from checks c join people p on p.id = c.person_id
   where c.status = 'sent' and c.deleted_at is null and has_perm('do_checks')
   order by c.stc_no, c.sent_at desc
$$;
revoke all on function last_check_by() from public, anon;
grant execute on function last_check_by() to authenticated;
