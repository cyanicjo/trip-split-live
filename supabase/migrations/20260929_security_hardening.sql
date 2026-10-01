-- Security baseline and idempotent upgrade. Run as the database owner.
-- Existing trip rows and secret hashes are preserved. Old view-only links stop working.
begin;
create schema if not exists extensions;
create extension if not exists pgcrypto with schema extensions;
create schema if not exists trip_private;
revoke all on schema trip_private from public, anon, authenticated;

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
alter table public.trips add column if not exists settings jsonb not null default '{}'::jsonb;
create table if not exists public.trip_secrets (
  trip_id uuid primary key references public.trips(id) on delete cascade,
  edit_token_hash text not null,
  created_at timestamptz not null default now()
);
alter table public.trips enable row level security;
alter table public.trip_secrets enable row level security;
drop policy if exists "Anyone can read trips" on public.trips;
revoke all on public.trips, public.trip_secrets from public, anon, authenticated;
grant usage on schema public to anon;

-- Edit capabilities published in historical repository commits must be revoked,
-- even when a user still possesses the old URL. Owner-only recovery is documented.
update public.trip_secrets
set edit_token_hash = 'revoked:' || edit_token_hash
where edit_token_hash in ('9ef48508636b13a1da64bcb5f8910295836a00de52c1f8ad8dccc3db03e4d50b');

-- Realtime must not publish full trip rows. The client uses the scoped RPC instead.
do $$
begin
  if exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'trips') then
    alter publication supabase_realtime drop table public.trips;
  end if;
end $$;

create or replace function public.trip_token_hash(p_token text)
returns text language sql immutable set search_path = '' as $$
  select encode(extensions.digest(coalesce(p_token, ''), 'sha256'), 'hex')
$$;
revoke all on function public.trip_token_hash(text) from public, anon, authenticated;

create or replace function trip_private.require(p_ok boolean, p_message text)
returns void language plpgsql set search_path = '' as $$
begin
  if p_ok is distinct from true then raise exception using errcode = '22023', message = p_message; end if;
end $$;

-- Bound every nested value, including fields not yet used by the UI.
create or replace function trip_private.validate_json(p_value jsonb, p_depth integer default 0)
returns void language plpgsql set search_path = '' as $$
declare v record; item jsonb;
begin
  perform trip_private.require(p_depth <= 12, '입력 구조가 너무 깊습니다.');
  case jsonb_typeof(p_value)
    when 'object' then
      perform trip_private.require((select count(*) <= 1000 from jsonb_object_keys(p_value)), '항목이 너무 많습니다.');
      for v in select * from jsonb_each(p_value) loop
        perform trip_private.require(length(v.key) <= 200 and v.key not in ('__proto__', 'prototype', 'constructor'), '허용하지 않는 필드입니다.');
        perform trip_private.validate_json(v.value, p_depth + 1);
      end loop;
    when 'array' then
      perform trip_private.require(jsonb_array_length(p_value) <= 5000, '항목은 최대 5,000개입니다.');
      for item in select value from jsonb_array_elements(p_value) loop
        perform trip_private.validate_json(item, p_depth + 1);
      end loop;
    when 'string' then perform trip_private.require(length(p_value #>> '{}') <= 1000, '문자열이 너무 깁니다.');
    when 'number' then perform trip_private.require(abs((p_value #>> '{}')::numeric) <= 9007199254740991, '숫자가 허용 범위를 벗어났습니다.');
    else null;
  end case;
end $$;

create or replace function trip_private.text_field(p_object jsonb, p_key text, p_max integer, p_required boolean default false)
returns void language plpgsql set search_path = '' as $$
begin
  if not p_required and (not p_object ? p_key or p_object->p_key = 'null'::jsonb) then return; end if;
  perform trip_private.require(jsonb_typeof(p_object->p_key) = 'string' and length(p_object->>p_key) <= p_max and (not p_required or length(trim(p_object->>p_key)) > 0), '문자열 형식 또는 길이를 확인해 주세요: ' || p_key);
end $$;

create or replace function trip_private.number_field(p_value jsonb, p_max numeric, p_integer boolean default false)
returns void language plpgsql set search_path = '' as $$
declare n numeric;
begin
  perform trip_private.require(jsonb_typeof(p_value) = 'number', '금액과 수량은 숫자여야 합니다.');
  n := (p_value #>> '{}')::numeric;
  perform trip_private.require(n > 0 and n <= p_max and (not p_integer or trunc(n) = n), '금액 또는 수량이 허용 범위를 벗어났습니다.');
end $$;

create or replace function trip_private.id_field(p_value jsonb)
returns void language plpgsql set search_path = '' as $$
begin
  perform trip_private.require(jsonb_typeof(p_value) = 'string' and (p_value #>> '{}') ~ '^[A-Za-z0-9_-]{1,200}$', '식별자 형식이 올바르지 않습니다.');
end $$;

create or replace function trip_private.participants(p_value jsonb, p_ids text[], p_allow_empty boolean default false)
returns void language plpgsql set search_path = '' as $$
declare item jsonb;
begin
  perform trip_private.require(jsonb_typeof(p_value) = 'array', '참여자 목록을 확인해 주세요.');
  perform trip_private.require(jsonb_array_length(p_value) <= 100 and (p_allow_empty or jsonb_array_length(p_value) > 0), '참여자를 한 명 이상 선택해 주세요.');
  perform trip_private.require((select count(*) = count(distinct value) from jsonb_array_elements(p_value)), '참여자가 중복되었습니다.');
  for item in select value from jsonb_array_elements(p_value) loop
    perform trip_private.id_field(item);
    perform trip_private.require((item #>> '{}') = any(p_ids), '여행에 없는 참여자입니다.');
  end loop;
end $$;

create or replace function trip_private.dates(p_object jsonb)
returns void language plpgsql set search_path = '' as $$
declare k text; v text; parsed date;
begin
  foreach k in array array['spentAt','scheduleDate','allocationStartDate','allocationEndDate','lodgingStartDate','lodgingEndDate','startDate','endDate','exchangedAt'] loop
    if p_object ? k and p_object->k <> 'null'::jsonb and p_object->>k <> '' then
      perform trip_private.text_field(p_object, k, 10, true);
      v := p_object->>k;
      perform trip_private.require(v ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$', '날짜 형식을 확인해 주세요.');
      begin parsed := v::date; exception when others then raise exception using errcode = '22023', message = '유효하지 않은 날짜입니다.'; end;
      perform trip_private.require(parsed between date '1900-01-01' and date '2199-12-31', '날짜 범위는 1900~2199년입니다.');
    end if;
  end loop;
end $$;

create or replace function trip_private.validate_state(p_name text, p_people jsonb, p_expenses jsonb, p_settings jsonb)
returns void language plpgsql set search_path = '' as $$
declare person jsonb; expense jsonb; item jsonb; record jsonb; v jsonb; ids text[]; k text;
  currencies text[] := array['KRW','USD','JPY','EUR','GBP','CNY','HKD','TWD','THB','LAK','VND','PHP','SGD','MYR','AUD','CAD','CHF'];
begin
  perform trip_private.require(p_name is not null and length(trim(p_name)) between 1 and 80, '여행 이름은 1~80자여야 합니다.');
  perform trip_private.require(jsonb_typeof(p_people) = 'array' and jsonb_typeof(p_expenses) = 'array' and jsonb_typeof(p_settings) = 'object', '저장 데이터의 형식이 올바르지 않습니다.');
  perform trip_private.require(octet_length(p_people::text) + octet_length(p_expenses::text) + octet_length(p_settings::text) <= 2097152, '여행 데이터는 2MB 이하만 저장할 수 있습니다.');
  perform trip_private.validate_json(p_people);
  perform trip_private.validate_json(p_expenses);
  perform trip_private.validate_json(p_settings);
  perform trip_private.require(jsonb_array_length(p_people) <= 100, '친구는 최대 100명입니다.');
  perform trip_private.require((select count(*) = count(distinct value->>'id') from jsonb_array_elements(p_people)), '친구 식별자가 중복되었거나 없습니다.');
  select coalesce(array_agg(value->>'id'), array[]::text[]) into ids from jsonb_array_elements(p_people);
  for person in select value from jsonb_array_elements(p_people) loop
    perform trip_private.require(jsonb_typeof(person) = 'object', '친구 형식이 올바르지 않습니다.');
    perform trip_private.id_field(person->'id');
    perform trip_private.text_field(person, 'name', 40, true);
    perform trip_private.text_field(person, 'bankName', 30);
    perform trip_private.text_field(person, 'accountNumber', 80);
    perform trip_private.text_field(person, 'account', 80);
  end loop;
  perform trip_private.require((select count(*) = count(distinct value->>'id') from jsonb_array_elements(p_expenses)), '지출 식별자가 중복되었거나 없습니다.');
  for expense in select value from jsonb_array_elements(p_expenses) loop
    perform trip_private.require(jsonb_typeof(expense) = 'object', '지출 형식이 올바르지 않습니다.');
    perform trip_private.id_field(expense->'id');
    perform trip_private.text_field(expense, 'title', 70, true);
    perform trip_private.text_field(expense, 'memo', 140);
    perform trip_private.text_field(expense, 'category', 20);
    perform trip_private.number_field(expense->'amount', 1000000000000, true);
    perform trip_private.require(jsonb_typeof(expense->'payerId') = 'string' and expense->>'payerId' = any(ids), '여행에 없는 결제자입니다.');
    perform trip_private.participants(expense->'participantIds', ids);
    perform trip_private.dates(expense);
    if expense ? 'currency' then perform trip_private.require(expense->>'currency' = any(currencies), '지원하지 않는 통화입니다.'); end if;
    foreach k in array array['foreignAmount','exchangeRate','cardKrwAmount'] loop
      if expense ? k and expense->k <> 'null'::jsonb then perform trip_private.number_field(expense->k, 1000000000000); end if;
    end loop;
    if expense ? 'majorCategory' then perform trip_private.require(expense->>'majorCategory' in ('transport','lodging','food','other'), '대분류를 확인해 주세요.'); end if;
    if expense ? 'mealSlot' then perform trip_private.require(expense->>'mealSlot' in ('','breakfast','lunch','dinner','snack','food-other','late-night'), '식사 분류를 확인해 주세요.'); end if;
    if expense ? 'spreadAcrossDays' then perform trip_private.require(jsonb_typeof(expense->'spreadAcrossDays') = 'boolean', '기간 배분 설정을 확인해 주세요.'); end if;
    if coalesce(expense->>'allocationStartDate','') <> '' and coalesce(expense->>'allocationEndDate','') <> '' then
      perform trip_private.require((expense->>'allocationEndDate')::date - (expense->>'allocationStartDate')::date between 0 and 365, '지출 기간은 최대 366일입니다.');
    end if;
    if expense ? 'items' then
      perform trip_private.require(jsonb_typeof(expense->'items') = 'array', '품목 형식이 올바르지 않습니다.');
      perform trip_private.require(jsonb_array_length(expense->'items') between 1 and 200, '품목은 1~200개여야 합니다.');
      perform trip_private.require((select count(*) = count(distinct value->>'id') from jsonb_array_elements(expense->'items')), '품목 식별자가 중복되었거나 없습니다.');
      for item in select value from jsonb_array_elements(expense->'items') loop
        perform trip_private.id_field(item->'id');
        perform trip_private.text_field(item, 'title', 70, true);
        perform trip_private.text_field(item, 'category', 20);
        perform trip_private.number_field(item->'quantity', 1000000);
        perform trip_private.number_field(item->'unitAmount', 1000000000000);
        perform trip_private.number_field(item->'amount', 1000000000000);
        perform trip_private.participants(coalesce(item->'participantIds','[]'::jsonb), ids, true);
      end loop;
    end if;
  end loop;
  if p_settings ? 'categories' then
    perform trip_private.require(jsonb_typeof(p_settings->'categories') = 'array', '카테고리 형식이 올바르지 않습니다.');
    for v in select value from jsonb_array_elements(p_settings->'categories') loop
      perform trip_private.require(jsonb_typeof(v) = 'string' and length(v #>> '{}') between 1 and 20, '카테고리는 1~20자여야 합니다.');
    end loop;
  end if;
  if p_settings ? 'itinerary' and p_settings->'itinerary' <> 'null'::jsonb then
    v := p_settings->'itinerary';
    perform trip_private.require(jsonb_typeof(v) = 'object', '일정 형식이 올바르지 않습니다.');
    perform trip_private.dates(v);
    perform trip_private.require((v->>'endDate')::date - (v->>'startDate')::date between 0 and 365, '여행 기간은 1~366일이어야 합니다.');
    foreach k in array array['hiddenSlots','extraMealSlots','dayOrders','mealExpenseOrders'] loop
      if v ? k then perform trip_private.require(jsonb_typeof(v->k) = 'object', '일정 순서 형식이 올바르지 않습니다.'); end if;
    end loop;
  end if;
  if p_settings ? 'overseas' then
    v := p_settings->'overseas';
    perform trip_private.require(jsonb_typeof(v) = 'object', '외화 설정 형식이 올바르지 않습니다.');
    if v ? 'enabled' then perform trip_private.require(jsonb_typeof(v->'enabled') = 'boolean', '외화 사용 설정을 확인해 주세요.'); end if;
    if v ? 'currencies' then
      perform trip_private.require(jsonb_typeof(v->'currencies') = 'array', '통화 목록을 확인해 주세요.');
      for item in select value from jsonb_array_elements(v->'currencies') loop
        perform trip_private.require(item #>> '{}' = any(currencies), '지원하지 않는 통화입니다.');
      end loop;
    end if;
    if v ? 'rates' then
      perform trip_private.require(jsonb_typeof(v->'rates') = 'object', '환율 형식이 올바르지 않습니다.');
      for k, item in select * from jsonb_each(v->'rates') loop
        perform trip_private.require(k = any(currencies), '지원하지 않는 통화입니다.');
        perform trip_private.number_field(item, 1000000000);
      end loop;
    end if;
    if v ? 'exchangeRecords' then
      perform trip_private.require(jsonb_typeof(v->'exchangeRecords') = 'array', '환전 기록 형식이 올바르지 않습니다.');
      for record in select value from jsonb_array_elements(v->'exchangeRecords') loop
        perform trip_private.id_field(record->'id');
        perform trip_private.require(record->>'fromCurrency' = any(currencies) and record->>'toCurrency' = any(currencies), '지원하지 않는 통화입니다.');
        perform trip_private.number_field(record->'fromAmount', 1000000000000);
        perform trip_private.number_field(record->'toAmount', 1000000000000);
        perform trip_private.text_field(record, 'memo', 100);
        perform trip_private.dates(record);
      end loop;
    end if;
  end if;
  if p_settings ? 'completedSettlements' then
    perform trip_private.require(jsonb_typeof(p_settings->'completedSettlements') = 'array', '완료 송금 형식이 올바르지 않습니다.');
    for record in select value from jsonb_array_elements(p_settings->'completedSettlements') loop
      perform trip_private.id_field(record->'id');
      perform trip_private.require(record->>'fromId' = any(ids) and record->>'toId' = any(ids) and record->>'fromId' <> record->>'toId', '완료 송금의 참여자를 확인해 주세요.');
      perform trip_private.number_field(record->'amount', 1000000000000, true);
      if record ? 'settledExpenses' then
        perform trip_private.require(jsonb_typeof(record->'settledExpenses') = 'array', '완료 송금 내역을 확인해 주세요.');
        for item in select value from jsonb_array_elements(record->'settledExpenses') loop
          perform trip_private.require(jsonb_typeof(item) = 'object', '완료 송금 내역을 확인해 주세요.');
          perform trip_private.id_field(item->'id');
          perform trip_private.text_field(item, 'title', 70, true);
          perform trip_private.text_field(item, 'payerName', 40);
          perform trip_private.text_field(item, 'category', 20);
          perform trip_private.number_field(item->'amount', 1000000000000, true);
          perform trip_private.dates(item);
        end loop;
      end if;
    end loop;
  end if;
end $$;
revoke all on all functions in schema trip_private from public, anon, authenticated;

create or replace function public.create_trip()
returns table(public_id text, edit_token text)
language plpgsql security definer set search_path = '' as $$
declare v_id uuid; v_public text := 'trip-' || encode(extensions.gen_random_bytes(32), 'hex'); v_token text := encode(extensions.gen_random_bytes(32), 'hex');
begin
  insert into public.trips(public_id) values (v_public) returning id into v_id;
  insert into public.trip_secrets(trip_id, edit_token_hash) values(v_id, public.trip_token_hash(v_token));
  return query select v_public, v_token;
end $$;

-- Remove old signatures: an overlooked overload would bypass the new checks.
drop function if exists public.get_trip(text);
drop function if exists public.get_trip(text, text);
create function public.get_trip(p_public_id text, p_edit_token text default null)
returns table(public_id text, name text, people jsonb, expenses jsonb, settings jsonb, version bigint, created_at timestamptz, updated_at timestamptz, can_edit boolean)
language sql stable security definer set search_path = '' as $$
  select t.public_id, t.name, t.people, t.expenses, t.settings, t.version, t.created_at, t.updated_at,
    coalesce(length(p_edit_token) between 32 and 128 and s.edit_token_hash = public.trip_token_hash(p_edit_token), false)
  from public.trips t join public.trip_secrets s on s.trip_id = t.id
  where t.public_id = p_public_id and length(p_public_id) <= 100
    and (t.public_id ~ '^trip-[a-f0-9]{64}$' or (length(p_edit_token) between 32 and 128 and s.edit_token_hash = public.trip_token_hash(p_edit_token)))
  limit 1
$$;

drop function if exists public.update_trip_state(text, text, text, jsonb, jsonb);
drop function if exists public.update_trip_state(text, text, text, jsonb, jsonb, jsonb);
drop function if exists public.update_trip_state(text, text, text, jsonb, jsonb, bigint, jsonb);
create function public.update_trip_state(p_public_id text, p_edit_token text, p_name text, p_people jsonb, p_expenses jsonb, p_expected_version bigint, p_settings jsonb default '{}'::jsonb)
returns table(public_id text, name text, people jsonb, expenses jsonb, settings jsonb, version bigint, created_at timestamptz, updated_at timestamptz)
language plpgsql security definer set search_path = '' as $$
declare v_id uuid; v_version bigint;
begin
  select t.id, t.version into v_id, v_version
  from public.trips t join public.trip_secrets s on s.trip_id = t.id
  where t.public_id = p_public_id and length(p_public_id) <= 100 and length(p_edit_token) between 32 and 128 and s.edit_token_hash = public.trip_token_hash(p_edit_token)
  for update of t;
  if v_id is null then raise exception using errcode = '42501', message = '유효한 편집 링크가 필요합니다.'; end if;
  if p_expected_version is null or p_expected_version <> v_version then raise exception using errcode = '40001', message = '다른 사람이 먼저 수정했습니다.'; end if;
  perform trip_private.validate_state(p_name, p_people, p_expenses, p_settings);
  return query update public.trips t set name = trim(p_name), people = p_people, expenses = p_expenses, settings = p_settings, version = t.version + 1, updated_at = now()
    where t.id = v_id returning t.public_id, t.name, t.people, t.expenses, t.settings, t.version, t.created_at, t.updated_at;
end $$;

drop function if exists public.rotate_trip_links(text,text,bigint);
create or replace function public.rotate_trip_links(p_public_id text, p_edit_token text, p_expected_version bigint, p_new_public_id text, p_new_edit_token text)
returns table(public_id text, edit_token text)
language plpgsql security definer set search_path = '' as $$
declare v_id uuid; v_version bigint;
begin
  perform trip_private.require(p_new_public_id ~ '^trip-[a-f0-9]{64}$' and p_new_edit_token ~ '^[a-f0-9]{64}$' and p_new_public_id <> p_public_id and p_new_edit_token <> p_edit_token, '새 링크 형식이 올바르지 않습니다.');
  -- Retrying after a lost response proves possession of the newly selected key.
  if exists (select 1 from public.trips t join public.trip_secrets s on s.trip_id = t.id where t.public_id = p_new_public_id and s.edit_token_hash = public.trip_token_hash(p_new_edit_token)) then
    return query select p_new_public_id, p_new_edit_token;
    return;
  end if;
  select t.id, t.version into v_id, v_version from public.trips t join public.trip_secrets s on s.trip_id = t.id
    where t.public_id = p_public_id and length(p_public_id) <= 100 and length(p_edit_token) between 32 and 128 and s.edit_token_hash = public.trip_token_hash(p_edit_token)
    for update of t;
  if v_id is null then raise exception using errcode = '42501', message = '유효한 편집 링크가 필요합니다.'; end if;
  if p_expected_version is null or p_expected_version <> v_version then raise exception using errcode = '40001', message = '다른 사람이 먼저 수정했습니다.'; end if;
  update public.trips set public_id = p_new_public_id, version = version + 1, updated_at = now() where id = v_id;
  update public.trip_secrets set edit_token_hash = public.trip_token_hash(p_new_edit_token) where trip_id = v_id;
  return query select p_new_public_id, p_new_edit_token;
end $$;

revoke all on function public.create_trip(), public.get_trip(text,text), public.update_trip_state(text,text,text,jsonb,jsonb,bigint,jsonb), public.rotate_trip_links(text,text,bigint,text,text) from public, anon, authenticated;
grant execute on function public.create_trip(), public.get_trip(text,text), public.update_trip_state(text,text,text,jsonb,jsonb,bigint,jsonb), public.rotate_trip_links(text,text,bigint,text,text) to anon;
notify pgrst, 'reload schema';
commit;
