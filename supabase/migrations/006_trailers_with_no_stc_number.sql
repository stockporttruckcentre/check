-- =============================================================
-- 006. A trailer on the stock sheet with no STC number yet.
--
-- New builds arrive on the sheet with a chassis number and "TBC" for the
-- rest. They used to be left out, so typing the chassis number found
-- nothing. Now they are kept, marked no_stc, and the phone says the
-- trailer has no STC number yet.
--
-- "TBC" and the like are no longer treated as numbers: before this,
-- every row with a TBC C number shared the search key TBC.
--
-- Safe to run twice.
-- =============================================================

alter table trailers add column if not exists no_stc boolean not null default false;

-- A number is something with a digit in it. "TBC", "No CMD" and a note typed into the column are not.
-- A remark after the number, as in "C659643 - (IVA)", is left off.
create or replace function real_no(t text) returns text
language sql immutable set search_path = public as $$
  select case when v is null or v !~ '[0-9]' or length(v) - length(replace(v, ' ', '')) > 3 then null else v end
    from (select nullif(regexp_replace(regexp_replace(trim(coalesce(t, '')), '\.0$', ''), '\s*-?\s*\(.*\)\s*$', ''), '') as v) x
$$;

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
    -- A row with no STC number yet but a real chassis, C or supplier number (new builds) is kept too, under
    -- NOSTC- and that number, so typing the chassis number finds it and the phone can say it has no STC number.
    select coalesce(jsonb_agg(s), '[]'::jsonb) into v_t from (
      select distinct on (stc_no) stc_no, f, tab, sold, no_stc from (
        select regexp_replace(upper(regexp_replace(e->'f'->>'stc_no', '\s+', '', 'g')), '\.0$', '') as stc_no, e->'f' as f, e->>'tab' as tab,
               (e->>'rn')::int as rn, (e->>'tab') ilike 'sold%' as sold, false as no_stc
          from jsonb_array_elements(v_f) e
         where trim(coalesce(e->'f'->>'stc_no','')) ~ '^[0-9]{5,7}(\.0)?$'
            or upper(trim(coalesce(e->'f'->>'stc_no',''))) ~ '^[A-Z]{2}[0-9]{2}\s?[A-Z]{3}$'
        union all
        select 'NOSTC-' || coalesce(real_no(e->'f'->>'chassis_no'), real_no(e->'f'->>'c_no'), real_no(e->'f'->>'supplier_no')), e->'f', e->>'tab',
               (e->>'rn')::int, (e->>'tab') ilike 'sold%', true
          from jsonb_array_elements(v_f) e
         where not (trim(coalesce(e->'f'->>'stc_no','')) ~ '^[0-9]{5,7}(\.0)?$'
                    or upper(trim(coalesce(e->'f'->>'stc_no',''))) ~ '^[A-Z]{2}[0-9]{2}\s?[A-Z]{3}$')
           and coalesce(real_no(e->'f'->>'chassis_no'), real_no(e->'f'->>'c_no'), real_no(e->'f'->>'supplier_no')) is not null
      ) a order by stc_no, sold, rn desc
    ) s;
    v_skipped := jsonb_array_length(v_f) - jsonb_array_length(v_t);

    update trailers set gone = true, updated_at = now()
     where not gone and stc_no not in (select e->>'stc_no' from jsonb_array_elements(v_t) e);

    insert into trailers as t (stc_no, c_no, supplier_no, chassis_no, year, make, model, description, side_aperture, colour, door_type,
                               axle_type, axle_count, mot_date, mot_text, location, status, sales_rep, customer, tab, sold, on_sales_order, keys, no_stc, gone, updated_at)
    select e->>'stc_no', real_no(f->>'c_no'), real_no(f->>'supplier_no'), real_no(f->>'chassis_no'), regexp_replace(f->>'year','\.0$',''), f->>'make', f->>'model', f->>'description',
           f->>'side_aperture', f->>'colour', f->>'door_type', f->>'axle_type', axles_from(f->>'description'),
           to_date_or_null(f->>'mot_date'), case when to_date_or_null(f->>'mot_date') is null then f->>'mot_date' end,
           f->>'location', f->>'status', f->>'sales_rep', f->>'customer', e->>'tab', (e->>'sold')::boolean,
           coalesce(f->>'status','') ilike '%sales order%',
           array_remove(array[case when (e->>'no_stc')::boolean then null else norm_key(e->>'stc_no') end,
                              norm_key(real_no(f->>'c_no')), norm_key(real_no(f->>'supplier_no')), norm_key(real_no(f->>'chassis_no'))], null),
           (e->>'no_stc')::boolean, false, now()
      from jsonb_array_elements(v_t) e, lateral (select e->'f' as f) ff
    on conflict (stc_no) do update set c_no = excluded.c_no, supplier_no = excluded.supplier_no, chassis_no = excluded.chassis_no,
       year = excluded.year, make = excluded.make, model = excluded.model, description = excluded.description,
       side_aperture = excluded.side_aperture, colour = excluded.colour, door_type = excluded.door_type, axle_type = excluded.axle_type,
       axle_count = excluded.axle_count, mot_date = excluded.mot_date, mot_text = excluded.mot_text, location = excluded.location,
       status = excluded.status, sales_rep = excluded.sales_rep, customer = excluded.customer, tab = excluded.tab, sold = excluded.sold,
       on_sales_order = excluded.on_sales_order, keys = excluded.keys, no_stc = excluded.no_stc, gone = false,
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

create or replace view trailers_v with (security_invoker = true) as
select t.stc_no, t.c_no, t.c_no as ministry_no, t.supplier_no, t.chassis_no, t.year, t.make, t.model, t.description,
       t.side_aperture, t.colour, t.door_type, t.axle_type, coalesce(f.axle_count, t.axle_count) as axle_count,
       t.mot_date, t.mot_text, t.location, t.status, t.sales_rep, t.customer, t.tab, t.sold, t.on_sales_order,
       h.hire_customer, h.hire_rate, coalesce(h.on_hire, false) as on_hire, h.hire_salesman, f.trailer_type,
       t.keys, greatest(t.updated_at, h.updated_at, f.updated_at) as updated_at, t.no_stc
  from trailers t
  left join fleet_hires h on h.fleet_no = t.stc_no and not h.gone
  left join trailer_facts f on f.stc_no = t.stc_no
 where not t.gone
union all
select h.fleet_no, h.c_no, h.c_no, null, null, h.year, h.make, h.model, null, null, null, null, null, f.axle_count,
       h.mot_date, h.mot_text, null, null, null, null, 'Fleet Serve', false, false,
       h.hire_customer, h.hire_rate, h.on_hire, h.hire_salesman, f.trailer_type, h.keys, greatest(h.updated_at, f.updated_at), false
  from fleet_hires h
  left join trailer_facts f on f.stc_no = h.fleet_no
 where not h.gone and not exists (select 1 from trailers t where t.stc_no = h.fleet_no and not t.gone);
