-- =============================================================
-- 001. STC Checks: everything the app needs, in one go.
--
-- Safe to run twice: every statement creates if missing or replaces.
-- The seed rows (roles, the Carrington site, checklist version 1,
-- the stock sheet column map) are inserted only when absent.
-- =============================================================

create extension if not exists pgcrypto with schema extensions;
create extension if not exists citext with schema extensions;
set search_path = public, extensions;

-- -------------------------------------------------------------
-- People, roles, sites
-- -------------------------------------------------------------
create table if not exists sites (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  created_at timestamptz not null default now(),
  deleted_at timestamptz
);

create table if not exists roles (
  id text primary key,
  name text not null,
  perms jsonb not null,
  fixed boolean not null default false,
  sort int not null default 100
);

create table if not exists people (
  id uuid primary key default gen_random_uuid(),
  user_id uuid unique references auth.users(id) on delete set null,
  email citext not null unique,
  name text not null,
  role_id text not null references roles(id),
  site_id uuid references sites(id),          -- null means all sites
  status text not null default 'invited' check (status in ('invited','active','locked','removed')),
  aliases text[] not null default '{}',        -- names the spreadsheets use for them: Dean, DAVID REAY, Dave Reay
  last_active timestamptz,
  pin_reset_at timestamptz,
  locked_until timestamptz,
  created_at timestamptz not null default now(),
  deleted_at timestamptz
);

-- -------------------------------------------------------------
-- Who is asking, and what they may do
-- -------------------------------------------------------------
create or replace function me() returns people
language sql stable security definer set search_path = public as $$
  select * from people where user_id = auth.uid() and deleted_at is null and status in ('active','invited','locked') limit 1
$$;

create or replace function has_perm(p text) returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((select (r.perms ->> p)::boolean
                     from people pe join roles r on r.id = pe.role_id
                    where pe.user_id = auth.uid() and pe.deleted_at is null and pe.status = 'active'), false)
$$;

-- -------------------------------------------------------------
-- The checklist, versioned. One draft at most, one live.
-- -------------------------------------------------------------
create table if not exists config_versions (
  id bigserial primary key,
  number int not null,
  status text not null check (status in ('draft','live','old')),
  config jsonb not null,
  reason text,
  changed int,
  created_by uuid references people(id),
  published_by uuid references people(id),
  published_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index if not exists config_one_draft on config_versions ((status)) where status = 'draft';
create unique index if not exists config_one_live on config_versions ((status)) where status = 'live';
create unique index if not exists config_number on config_versions (number);

create table if not exists settings (
  key text primary key,
  value jsonb not null,
  updated_at timestamptz not null default now(),
  updated_by uuid references people(id)
);

-- -------------------------------------------------------------
-- The two spreadsheets, as the app sees them. No money columns.
-- -------------------------------------------------------------
create table if not exists trailers (
  stc_no text primary key,
  c_no text, supplier_no text, chassis_no text,
  year text, make text, model text, description text,
  side_aperture text, colour text, door_type text, axle_type text, axle_count int,
  mot_date date, mot_text text, location text, status text, sales_rep text, customer text,
  tab text, sold boolean not null default false, on_sales_order boolean not null default false,
  keys text[] not null default '{}',
  updated_at timestamptz not null default now()
);
create index if not exists trailers_keys on trailers using gin (keys);

create table if not exists fleet_hires (
  fleet_no text primary key,
  c_no text,
  on_hire boolean not null default false,
  hire_customer text, hire_rate numeric, hire_salesman text, on_hire_date date,
  year text, make text, model text, mot_date date, mot_text text,
  keys text[] not null default '{}',
  updated_at timestamptz not null default now()
);

-- What a phone was told about a trailer the sheets do not say, such as how many axles.
create table if not exists trailer_facts (
  stc_no text primary key,
  axle_count int,
  trailer_type text,
  updated_by uuid references people(id),
  updated_at timestamptz not null default now()
);

create table if not exists sheet_sync (
  source text primary key check (source in ('stock','fleet')),
  updated_at timestamptz not null,
  updated_by text,
  rows int not null default 0,
  detail jsonb not null default '{}'
);

-- Which column in which sheet feeds which field. Edited in System, Stock sheet columns.
-- header is matched as a case-insensitive prefix, because Fleet Serve's rate column
-- carries a date in its name.
create table if not exists sheet_columns (
  source text not null check (source in ('stock','fleet')),
  tab text not null default '*',
  field text not null,
  header text not null,
  primary key (source, tab, field)
);

-- The macro's key, hashed. Not reachable through the API.
create schema if not exists private;
create table if not exists private.sheet_keys (
  id serial primary key,
  hash text not null,
  created_at timestamptz not null default now()
);
revoke all on schema private from anon, authenticated;

-- -------------------------------------------------------------
-- Checks
-- -------------------------------------------------------------
create table if not exists checks (
  id uuid primary key,                         -- made on the phone, so a repeated send is the same row
  ref text unique,
  person_id uuid not null references people(id),
  site_id uuid references sites(id),
  direction text not null check (direction in ('OUT','IN')),
  stc_no text not null,
  c_no text,
  customer text, account_no text, order_no text, rate_per_week text, replacement_value text, collecting_reg text,
  config_version int,
  status text not null check (status in ('draft','waiting','sent','reopened')),
  version int not null default 1,
  parent_id uuid references checks(id),
  new_damage int not null default 0,
  data jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  sent_at timestamptz,
  received_at timestamptz,
  deleted_at timestamptz
);
create index if not exists checks_stc on checks (stc_no, sent_at desc);
create index if not exists checks_person on checks (person_id);

create table if not exists damage_pins (
  id uuid primary key,
  check_id uuid not null references checks(id) on delete cascade,
  number int not null,
  view text not null check (view in ('ns','os','front','rear','roof')),
  x real not null, y real not null,
  zone text, type text, note text,
  status text not null default 'new' check (status in ('new','still_there','repaired')),
  previous_pin_id uuid,
  item_id text,
  removed_at timestamptz
);
create index if not exists pins_check on damage_pins (check_id);

create table if not exists photos (
  id uuid primary key,
  check_id uuid not null references checks(id) on delete cascade,
  section text not null check (section in ('P','D','T','R')),
  ref_id text, shot int not null default 1,
  file_name text not null, path text not null,
  bytes int, width int, height int,
  taken_at timestamptz not null, lat double precision, lng double precision,
  from_gallery boolean not null default false,
  uploaded_at timestamptz not null default now(),
  removed_at timestamptz
);
create index if not exists photos_check on photos (check_id);

create table if not exists corrections (
  id uuid primary key default gen_random_uuid(),
  check_id uuid not null references checks(id),
  person_id uuid not null references people(id),
  text text not null,
  at timestamptz not null default now()
);

create table if not exists notifications (
  id uuid primary key default gen_random_uuid(),
  person_id uuid not null references people(id),
  kind text not null,
  body jsonb not null,
  check_id uuid,
  created_at timestamptz not null default now(),
  read_at timestamptz
);

create table if not exists check_refs (prefix text primary key, n int not null);

-- -------------------------------------------------------------
-- Activity log (append only), recycle bin
-- -------------------------------------------------------------
create table if not exists audit_events (
  id bigserial primary key,
  at timestamptz not null default now(),
  person_id uuid,
  person_name text not null,
  action text not null,        -- 'Published v15', 'Changed role'
  kind text not null,          -- admin, check, signin, system
  target text,                 -- 'Check builder', 'Sam Price', 'C10772'
  detail text,
  undo jsonb,                  -- how to put it back, for admin changes
  undo_of bigint references audit_events(id),
  undone_by bigint references audit_events(id)
);
create index if not exists audit_at on audit_events (at desc);

create table if not exists recycle (
  id uuid primary key default gen_random_uuid(),
  kind text not null,          -- check, item, person
  label text not null,
  payload jsonb not null,
  deleted_at timestamptz not null default now(),
  deleted_by uuid references people(id),
  restored_at timestamptz
);

-- -------------------------------------------------------------
-- Seed: roles, as the pack's default grid (source/07, S_people)
-- -------------------------------------------------------------
insert into roles (id, name, perms, fixed, sort) values
  ('yard',   'Yard staff',   '{"do_checks":true,"see_unfinished":false,"reopen":false,"people":false,"edit_config":false,"publish":false,"undo":false,"system":false}', false, 1),
  ('sales',  'Sales rep',    '{"do_checks":true,"see_unfinished":false,"reopen":false,"people":false,"edit_config":false,"publish":false,"undo":false,"system":false}', false, 2),
  ('lead',   'Site lead',    '{"do_checks":true,"see_unfinished":true,"reopen":true,"people":false,"edit_config":false,"publish":false,"undo":false,"system":false}', false, 3),
  ('office', 'Office admin', '{"do_checks":true,"see_unfinished":true,"reopen":true,"people":true,"edit_config":true,"publish":false,"undo":true,"system":false}', false, 4),
  ('owner',  'Owner',        '{"do_checks":true,"see_unfinished":true,"reopen":true,"people":true,"edit_config":true,"publish":true,"undo":true,"system":true}', true, 5)
on conflict (id) do nothing;

insert into sites (name) values ('Carrington') on conflict (name) do nothing;

insert into people (email, name, role_id, site_id, status)
select 'alexellis@stc-uk.com', 'Alex Ellis', 'owner', null, 'invited'
where not exists (select 1 from people where email = 'alexellis@stc-uk.com');

insert into settings (key, value) values
  ('photo', '{"targetKB":100,"longEdge":1600,"hardKB":150}'),
  ('records', '{"years":6}')
on conflict (key) do nothing;

-- Stock sheet columns. The headers are the ones in the real file on Z:.
insert into sheet_columns (source, tab, field, header) values
  ('stock','*','stc_no','STC No'), ('stock','*','supplier_no','Supplier No'), ('stock','*','chassis_no','Chassis Number'),
  ('stock','*','c_no','Ministry No'), ('stock','*','year','Year'), ('stock','*','make','Make'), ('stock','*','model','Model'),
  ('stock','*','description','Description'), ('stock','*','side_aperture','Side Aperture'), ('stock','*','colour','Colour'),
  ('stock','*','door_type','Door Type'), ('stock','*','axle_type','Axle Type'), ('stock','*','mot_date','MOT Date'),
  ('stock','*','location','Location'), ('stock','*','status','Status'), ('stock','*','sales_rep','Sales Rep'),
  ('stock','*','customer','Customer'),
  ('fleet','Fleetserv','fleet_no','Fleet Number'), ('fleet','Fleetserv','c_no','C Number'), ('fleet','Fleetserv','on_hire','On Hire/ Off Hire'),
  ('fleet','Fleetserv','hire_customer','Location'), ('fleet','Fleetserv','hire_rate','Rental Rate (Weekly)'), ('fleet','Fleetserv','mot_date','Mot'),
  ('fleet','Fleetserv','year','Year'), ('fleet','Fleetserv','make','Make'), ('fleet','Fleetserv','model','Model'),
  ('fleet','General Update','fleet_no','Fleet Number'), ('fleet','General Update','on_hire','on / off hire'),
  ('fleet','General Update','on_hire_date','on / off hire date'), ('fleet','General Update','hire_customer','Customer'),
  ('fleet','General Update','hire_salesman','Sales Man'), ('fleet','General Update','hire_rate','Rental Rate')
on conflict do nothing;
