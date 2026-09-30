-- OWNER ONLY. Replace the UUID after verifying the Google user in Authentication > Users.
-- Choose ONE action (grant/revoke); leaving the placeholders unchanged aborts safely.
begin;
do $$
declare
  target_user uuid := '00000000-0000-0000-0000-000000000000';
  action text := 'CHOOSE_GRANT_OR_REVOKE';
begin
  if target_user = '00000000-0000-0000-0000-000000000000'::uuid or action not in ('grant','revoke') then
    raise exception 'Set target_user and action before executing';
  end if;
  if action = 'grant' then
    if not exists (select 1 from auth.identities where user_id=target_user and provider='google') then
      raise exception 'Verified Google identity required';
    end if;
    insert into trip_private.admin_users(user_id) values(target_user) on conflict do nothing;
  else
    delete from trip_private.admin_users where user_id=target_user;
  end if;
end $$;
commit;
