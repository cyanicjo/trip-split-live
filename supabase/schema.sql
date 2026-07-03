create schema if not exists extensions;
create extension if not exists pgcrypto with schema extensions;

create table if not exists public.trips (
  id uuid primary key default extensions.gen_random_uuid(),
  public_id text not null unique,
  name text not null default '새 여행 정산',
  people jsonb not null default '[]'::jsonb,
  expenses jsonb not null default '[]'::jsonb,
  settings jsonb not null default '{}'::jsonb,
  version bigint not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.trips
  add column if not exists settings jsonb not null default '{}'::jsonb;

create table if not exists public.trip_secrets (
  trip_id uuid primary key references public.trips(id) on delete cascade,
  edit_token_hash text not null,
  created_at timestamptz not null default now()
);

alter table public.trips enable row level security;
alter table public.trip_secrets enable row level security;
alter table public.trips replica identity full;

drop policy if exists "Anyone can read trips" on public.trips;
create policy "Anyone can read trips"
  on public.trips
  for select
  to anon
  using (true);

grant usage on schema public to anon;
grant select on public.trips to anon;

create or replace function public.trip_token_hash(p_token text)
returns text
language sql
stable
as $$
  select encode(extensions.digest(coalesce(p_token, ''), 'sha256'), 'hex')
$$;

create or replace function public.create_trip()
returns table(public_id text, edit_token text)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_trip_id uuid;
  v_public_id text;
  v_edit_token text;
begin
  v_public_id := 'trip-' || encode(extensions.gen_random_bytes(8), 'hex');
  v_edit_token := encode(extensions.gen_random_bytes(18), 'hex');

  insert into public.trips (public_id)
  values (v_public_id)
  returning id into v_trip_id;

  insert into public.trip_secrets (trip_id, edit_token_hash)
  values (v_trip_id, public.trip_token_hash(v_edit_token));

  return query select v_public_id, v_edit_token;
end;
$$;

drop function if exists public.get_trip(text);
create or replace function public.get_trip(p_public_id text)
returns table(
  public_id text,
  name text,
  people jsonb,
  expenses jsonb,
  settings jsonb,
  version bigint,
  created_at timestamptz,
  updated_at timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  select
    t.public_id,
    t.name,
    t.people,
    t.expenses,
    t.settings,
    t.version,
    t.created_at,
    t.updated_at
  from public.trips t
  where t.public_id = p_public_id
  limit 1
$$;

drop function if exists public.update_trip_state(text, text, text, jsonb, jsonb);
drop function if exists public.update_trip_state(text, text, text, jsonb, jsonb, jsonb);
create or replace function public.update_trip_state(
  p_public_id text,
  p_edit_token text,
  p_name text,
  p_people jsonb,
  p_expenses jsonb,
  p_settings jsonb default '{}'::jsonb
)
returns table(
  public_id text,
  name text,
  people jsonb,
  expenses jsonb,
  settings jsonb,
  version bigint,
  created_at timestamptz,
  updated_at timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_trip_id uuid;
begin
  if jsonb_typeof(coalesce(p_people, '[]'::jsonb)) <> 'array' then
    raise exception 'people must be an array';
  end if;

  if jsonb_typeof(coalesce(p_expenses, '[]'::jsonb)) <> 'array' then
    raise exception 'expenses must be an array';
  end if;

  if jsonb_typeof(coalesce(p_settings, '{}'::jsonb)) <> 'object' then
    raise exception 'settings must be an object';
  end if;

  select t.id
    into v_trip_id
  from public.trips t
  join public.trip_secrets s on s.trip_id = t.id
  where t.public_id = p_public_id
    and s.edit_token_hash = public.trip_token_hash(p_edit_token)
  limit 1;

  if v_trip_id is null then
    raise exception 'invalid edit token';
  end if;

  return query
  update public.trips t
    set
      name = coalesce(left(nullif(trim(coalesce(p_name, '')), ''), 80), '새 여행 정산'),
      people = coalesce(p_people, '[]'::jsonb),
      expenses = coalesce(p_expenses, '[]'::jsonb),
      settings = coalesce(p_settings, '{}'::jsonb),
      version = t.version + 1,
      updated_at = now()
    where t.id = v_trip_id
    returning
      t.public_id,
      t.name,
      t.people,
      t.expenses,
      t.settings,
      t.version,
      t.created_at,
      t.updated_at;
end;
$$;

grant execute on function public.create_trip() to anon;
grant execute on function public.get_trip(text) to anon;
grant execute on function public.update_trip_state(text, text, text, jsonb, jsonb, jsonb) to anon;

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
    and not exists (
      select 1
      from pg_publication_tables
      where pubname = 'supabase_realtime'
        and schemaname = 'public'
        and tablename = 'trips'
    )
  then
    alter publication supabase_realtime add table public.trips;
  end if;
end $$;
