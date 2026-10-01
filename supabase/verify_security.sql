-- Read-only post-deployment verification. Raises an error if critical protections are absent.
begin transaction read only;
do $$
declare r text; tbl text;
begin
  foreach r in array array['anon','authenticated'] loop
    foreach tbl in array array['public.trips','public.trip_secrets'] loop
      if has_table_privilege(r,tbl,'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER') then
        raise exception 'Client role % still has privileges on %',r,tbl;
      end if;
    end loop;
  end loop;
  if exists(select 1 from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relname in ('trips','trip_secrets') and not c.relrowsecurity) then
    raise exception 'Row level security is not enabled';
  end if;
  if exists(select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='trips') then
    raise exception 'Trip data is still published to Realtime';
  end if;
  if to_regprocedure('public.update_trip_state(text,text,text,jsonb,jsonb)') is not null or to_regprocedure('public.update_trip_state(text,text,text,jsonb,jsonb,jsonb)') is not null or to_regprocedure('public.get_trip(text)') is not null then
    raise exception 'An old RPC overload is still installed';
  end if;
  if not has_function_privilege('anon','public.get_trip(text,text)','EXECUTE') or has_function_privilege('authenticated','public.get_trip(text,text)','EXECUTE') then
    raise exception 'RPC permissions do not match the link access model';
  end if;
  if has_function_privilege('anon','public.trip_token_hash(text)','EXECUTE') then raise exception 'Hash helper is exposed'; end if;
end $$;
select 'security checks passed' as result;
select count(*) filter(where public_id !~ '^trip-[a-f0-9]{64}$') as legacy_trips_awaiting_link_reissue from public.trips;
select count(*) as revoked_trips_awaiting_owner_recovery from public.trip_secrets where edit_token_hash like 'revoked:%';
commit;
