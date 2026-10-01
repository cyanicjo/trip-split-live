-- OWNER ONLY: run in the Supabase SQL Editor after the security migration.
-- Returns new capability links' components. Keep results private; do not put them in Git.
-- Each revoked trip is recovered once. A second run returns zero rows.
-- If the response is lost, an owner can identify the trip's internal UUID in the dashboard
-- and rotate its credentials with the same pattern; never reopen anonymous table access.
begin;
with credentials as materialized (
  select t.id, 'trip-' || encode(extensions.gen_random_bytes(32), 'hex') as public_id,
         encode(extensions.gen_random_bytes(32), 'hex') as edit_token
  from public.trips t join public.trip_secrets s on s.trip_id = t.id
  where s.edit_token_hash like 'revoked:%'
  for update of t, s
), trips_updated as (
  update public.trips t set public_id = c.public_id, version = t.version + 1, updated_at = now()
  from credentials c where t.id = c.id returning t.id, t.name
), secrets_updated as (
  update public.trip_secrets s set edit_token_hash = public.trip_token_hash(c.edit_token)
  from credentials c, trips_updated t where s.trip_id = c.id and t.id = c.id returning s.trip_id
)
select c.public_id, c.edit_token, t.name from credentials c
join trips_updated t on t.id = c.id join secrets_updated s on s.trip_id = c.id;
commit;
