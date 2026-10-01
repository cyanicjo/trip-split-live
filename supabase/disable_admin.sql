-- Owner-only emergency disable. Preserves all data, admin registrations and link protections.
begin;
revoke all on function public.admin_list_trips(timestamptz,uuid), public.admin_get_trip(uuid) from public, anon, authenticated;
notify pgrst, 'reload schema';
commit;
