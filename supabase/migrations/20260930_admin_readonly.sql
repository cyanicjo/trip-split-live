-- Apply after 20260929_security_hardening.sql, as database owner.
begin;
create index if not exists trips_admin_created_idx on public.trips(created_at desc, id desc);
create schema if not exists trip_private;
revoke all on schema trip_private from public, anon, authenticated;
create table if not exists trip_private.admin_users (
  user_id uuid primary key references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);
alter table trip_private.admin_users enable row level security;
revoke all on trip_private.admin_users from public, anon, authenticated;

create or replace function trip_private.require_admin()
returns void language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null or not exists (
    select 1 from trip_private.admin_users a where a.user_id = auth.uid()
  ) then
    raise exception using errcode = '42501', message = '관리자 권한이 필요합니다.';
  end if;
end $$;
revoke all on function trip_private.require_admin() from public, anon, authenticated;

create or replace function public.admin_list_trips(
  p_before_created_at timestamptz default null, p_before_id uuid default null
) returns table (id uuid, name text, people_count integer, expense_count integer,
  created_at timestamptz, updated_at timestamptz)
language plpgsql security definer set search_path = '' as $$
begin
  perform trip_private.require_admin();
  if (p_before_created_at is null) <> (p_before_id is null) then
    raise exception using errcode = '22023', message = '잘못된 페이지 위치입니다.';
  end if;
  return query select t.id, t.name, jsonb_array_length(t.people), jsonb_array_length(t.expenses), t.created_at, t.updated_at
    from public.trips t
    where p_before_created_at is null or (t.created_at, t.id) < (p_before_created_at, p_before_id)
    order by t.created_at desc, t.id desc limit 50;
end $$;

create or replace function public.admin_get_trip(p_trip_id uuid)
returns table (id uuid, name text, people jsonb, expenses jsonb, settings jsonb,
  version bigint, created_at timestamptz, updated_at timestamptz)
language plpgsql security definer set search_path = '' as $$
begin
  perform trip_private.require_admin();
  return query select t.id,t.name,t.people,t.expenses,t.settings,t.version,t.created_at,t.updated_at
    from public.trips t where t.id = p_trip_id;
end $$;
revoke all on function public.admin_list_trips(timestamptz,uuid), public.admin_get_trip(uuid) from public, anon, authenticated;
grant usage on schema public to authenticated;
grant execute on function public.admin_list_trips(timestamptz,uuid), public.admin_get_trip(uuid) to authenticated;
-- Client roles still cannot access any table or mutate trips through admin functions.
revoke all on public.trips, public.trip_secrets from public, anon, authenticated;
notify pgrst, 'reload schema';
commit;
