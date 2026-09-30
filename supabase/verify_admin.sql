-- Read-only verification, run as database owner after the migrations.
do $$
begin
  if has_table_privilege('anon','trip_private.admin_users','SELECT')
    or has_table_privilege('authenticated','trip_private.admin_users','SELECT')
    or has_table_privilege('authenticated','public.trips','SELECT')
    or has_table_privilege('anon','public.trips','SELECT') then raise exception 'Unsafe table grants'; end if;
  if has_function_privilege('anon','public.admin_list_trips(timestamptz,uuid)','EXECUTE')
    or has_function_privilege('anon','public.admin_get_trip(uuid)','EXECUTE')
    or not has_function_privilege('authenticated','public.admin_get_trip(uuid)','EXECUTE') then
    raise exception 'Incorrect admin function grants';
  end if;
  if has_function_privilege('authenticated','public.update_trip_state(text,text,text,jsonb,jsonb,bigint,jsonb)','EXECUTE') then
    raise exception 'Authenticated role must not inherit edit access';
  end if;
end $$;
select count(*) as registered_administrators from trip_private.admin_users;
