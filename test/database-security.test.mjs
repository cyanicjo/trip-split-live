import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { startDatabase, asRole } from './helpers/database.mjs';
const server = await startDatabase();
const { client } = server;
let passed = 0;
async function check(name, run) { await run(); passed++; console.log(`PASS ${name}`); }
const anon = (sql, params) => asRole(client, 'anon', sql, params);
const rotate = (id, token, version, next = {publicId:'trip-'+randomBytes(32).toString('hex'),editToken:randomBytes(32).toString('hex')}) => anon('select * from public.rotate_trip_links($1,$2,$3,$4,$5)', [id,token,version,next.publicId,next.editToken]);
const get = (id, token = null) => anon('select * from public.get_trip($1,$2)', [id, token]);
const people = [{ id: 'p_a', name: '가짜 친구 A', bankName: '테스트 은행', accountNumber: '0000' }, { id: 'p_b', name: '가짜 친구 B' }];
const expenses = [{ id: 'e_a', title: '가짜 식사', amount: 12000, payerId: 'p_a', participantIds: ['p_a','p_b'], currency: 'KRW', spentAt: '2026-09-29', items: [{id:'it_a',title:'음식',quantity:2,unitAmount:6000,amount:12000,participantIds:[]}]}];
const update = (trip, version, changes = {}) => anon('select * from public.update_trip_state($1,$2,$3,$4,$5,$6,$7)', [trip.public_id, trip.edit_token, changes.name ?? '테스트 여행', JSON.stringify(changes.people ?? people), JSON.stringify(changes.expenses ?? expenses), version, JSON.stringify(changes.settings ?? {})]);
try {
  await client.query(await readFile(new URL('./fixtures/legacy-schema.sql', import.meta.url), 'utf8'));
  const oldA = (await anon('select * from create_trip()')).rows[0];
  const oldB = (await anon('select * from create_trip()')).rows[0];
  await check('baseline: anonymous role can list both fake trips', async () => assert.equal((await anon('select count(*)::int n from public.trips')).rows[0].n, 2));
  await check('baseline: editor can persist an HTML attribute payload in a person ID', async () => {
    const injected=[{id:'p_x" onmouseover="window.__securityMarker=1',name:'가짜 입력',accountNumber:'0000'}];
    const r=await anon('select * from public.update_trip_state($1,$2,$3,$4,$5,$6)',[oldB.public_id,oldB.edit_token,'가짜 저장형 공격',JSON.stringify(injected),'[]','{}']);
    assert.equal(r.rows[0].people[0].id,injected[0].id);
  });
  const compromised = (await anon('select * from create_trip()')).rows[0];
  const audit = JSON.parse(await readFile(new URL('../security/history-scan.json', import.meta.url), 'utf8'));
  await client.query('update public.trip_secrets s set edit_token_hash=$1 from public.trips t where s.trip_id=t.id and t.public_id=$2', [audit.revoked_edit_token_sha256[0], compromised.public_id]);
  const snapshot = (await client.query('select * from public.trips order by id')).rows;
  const schema = await readFile(new URL('../supabase/schema.sql', import.meta.url), 'utf8');
  assert.equal(schema,await readFile(new URL('../supabase/migrations/20260929_security_hardening.sql',import.meta.url),'utf8'));
  await client.query(schema);
  await check('migration preserves all existing trip rows', async () => assert.deepEqual((await client.query('select * from public.trips order by id')).rows, snapshot));
  await check('migration is repeatable', async () => { await client.query(schema); assert.deepEqual((await client.query('select * from public.trips order by id')).rows, snapshot); });
  for (const role of ['anon', 'authenticated']) for (const table of ['trips','trip_secrets']) {
    await check(`${role}: direct ${table} read blocked`, () => assert.rejects(asRole(client, role, `select * from public.${table}`), {code:'42501'}));
    await check(`${role}: direct ${table} write blocked`, () => assert.rejects(asRole(client, role, `delete from public.${table} where false`), {code:'42501'}));
  }
  await check('no full-row Realtime publication remains', async () => assert.equal((await client.query("select * from pg_publication_tables where pubname='supabase_realtime' and tablename='trips'")).rowCount, 0));
  await check('legacy public links stop reading immediately', async () => assert.equal((await get(oldA.public_id)).rowCount, 0));
  await check('legacy editor can recover its own trip', async () => assert.equal((await get(oldA.public_id, oldA.edit_token)).rows[0].can_edit, true));
  await check('another editor cannot recover a legacy trip', async () => assert.equal((await get(oldA.public_id, oldB.edit_token)).rowCount, 0));
  await check('historically exposed edit hash is irreversibly revoked by migration', async () => {
    const r=await client.query('select s.edit_token_hash from public.trip_secrets s join public.trips t on t.id=s.trip_id where t.public_id=$1',[compromised.public_id]);
    assert.equal(r.rows[0].edit_token_hash, 'revoked:'+audit.revoked_edit_token_sha256[0]);
    assert.equal((await get(compromised.public_id,compromised.edit_token)).rowCount,0);
  });
  await check('owner recovery preserves trip and returns working fresh credentials once', async () => {
    const sql=await readFile(new URL('../supabase/recover_revoked_links.sql',import.meta.url),'utf8');
    const results=await client.query(sql); const recovered=results.find(r=>r.command==='SELECT').rows;
    assert.equal(recovered.length,1); assert.equal((await get(recovered[0].public_id,recovered[0].edit_token)).rows[0].can_edit,true);
    assert.equal((await client.query(sql)).find(r=>r.command==='SELECT').rowCount,0);
  });
  const a = (await anon('select * from public.create_trip()')).rows[0];
  const b = (await anon('select * from public.create_trip()')).rows[0];
  await check('new links use independent 256-bit random values', async () => { assert.match(a.public_id, /^trip-[a-f0-9]{64}$/); assert.match(a.edit_token,/^[a-f0-9]{64}$/); assert.notEqual(a.public_id,b.public_id); });
  await check('viewer only sees its specific trip and cannot edit', async () => { const r = await get(a.public_id); assert.equal(r.rowCount,1); assert.equal(r.rows[0].can_edit,false); });
  for (const id of ['', '*', "' OR true --", 'trip-not-found']) await check(`unknown/non-exact ID returns no trip (${JSON.stringify(id)})`, async () => assert.equal((await get(id)).rowCount,0));
  for (const token of [null, '', 'wrong', b.edit_token]) await check('missing/wrong/other-trip edit key rejected', () => assert.rejects(update({...a,edit_token:token},0), {code:'42501'}));
  await check('valid expense and participant data save', async () => assert.equal((await update(a,0)).rows[0].version,'1'));
  await check('stale save rejected without overwriting', async () => { await assert.rejects(update(a,0,{name:'overwrite'}),{code:'40001'}); assert.equal((await get(a.public_id)).rows[0].name,'테스트 여행'); });
  const invalid = [
    {people:{}}, {people:[...people,people[0]]}, {people:[{id:'x" onmouseover="void 0',name:'x'}]},
    {expenses:[{...expenses[0],amount:-1}]}, {expenses:[{...expenses[0],amount:1.5}]},
    {expenses:[{...expenses[0],payerId:'another-trip-person'}]},
    {expenses:[{...expenses[0],participantIds:['unknown']}]},
    {expenses:[{...expenses[0],participantIds:['p_a','p_a']}]},
    {expenses:[{...expenses[0],currency:'<img src=x>'}]},
    {expenses:[{...expenses[0],title:'x'.repeat(71)}]},
    {expenses:[{...expenses[0],spentAt:'2026-02-30'}]},
    {expenses:[{...expenses[0],items:[{...expenses[0].items[0],quantity:0}]}]},
    {settings:JSON.parse('{"__proto__":{"x":1}}')},
    {settings:{itinerary:{startDate:'2026-01-01',endDate:'2028-01-01'}}},
    {settings:{overseas:{rates:{USD:0}}}},
    {settings:{completedSettlements:[{id:'done_a',fromId:'p_a',toId:'missing',amount:1}]}}
  ];
  for (const [index, changes] of invalid.entries()) await check(`malformed input ${index+1} rejected atomically`, async () => { await assert.rejects(update(a,1,changes), {code:'22023'}); assert.equal((await get(a.public_id)).rows[0].version,'1'); });
  await check('oversized payload rejected', () => assert.rejects(update(a,1,{settings:{large:'x'.repeat(2100000)}}),{code:'22023'}));
  await check('nested payload depth bounded', async () => { let value={}; for(let i=0;i<14;i++) value={a:value}; await assert.rejects(update(a,1,{settings:value}),{code:'22023'}); });
  await check('supported foreign expenses and settings save', async () => {
    const foreign = {...expenses[0],amount:13500,currency:'USD',foreignAmount:10,exchangeRate:1350,items:[{...expenses[0].items[0],quantity:1,unitAmount:10,amount:10}]};
    const settings={itinerary:{startDate:'2026-09-29',endDate:'2026-10-01'},overseas:{enabled:true,currencies:['USD','JPY'],rates:{USD:1350,JPY:9.5},exchangeRecords:[{id:'fx_a',fromCurrency:'KRW',fromAmount:13500,toCurrency:'USD',toAmount:10,memo:'가짜 환전',exchangedAt:'2026-09-29'}]},completedSettlements:[{id:'done_a',fromId:'p_b',toId:'p_a',amount:6750,settledExpenses:[]}],categories:['식비']};
    assert.equal((await update(a,1,{expenses:[foreign],settings})).rows[0].version,'2');
  });
  await check('authenticated role does not inherit RPC execute', () => assert.rejects(asRole(client,'authenticated','select * from public.create_trip()'),{code:'42501'}));
  await check('private validation helpers unavailable through client role', () => assert.rejects(anon("select trip_private.validate_json('{}')"),{code:'42501'}));
  await check('hash helper is not a public RPC', () => assert.rejects(anon("select public.trip_token_hash('x')"),{code:'42501'}));
  await check('old update overloads are removed', async () => assert.equal((await client.query("select count(*)::int n from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname='update_trip_state' and p.pronargs<7")).rows[0].n,0));
  await check('foreign key cannot rotate links', () => assert.rejects(rotate(a.public_id,b.edit_token,2),{code:'42501'}));
  await check('link rotation keeps trip contents and invalidates both old capabilities', async () => {
    const before=(await get(a.public_id,a.edit_token)).rows[0];
    const next=(await rotate(a.public_id,a.edit_token,2)).rows[0];
    assert.equal((await get(a.public_id,a.edit_token)).rowCount,0);
    const retry=(await rotate(a.public_id,a.edit_token,2,{publicId:next.public_id,editToken:next.edit_token})).rows[0];
    assert.deepEqual(retry,next);
    assert.equal((await get(next.public_id,a.edit_token)).rows[0].can_edit,false);
    await assert.rejects(update({...next,edit_token:a.edit_token},3),{code:'42501'});
    const after=(await get(next.public_id,next.edit_token)).rows[0];
    assert.deepEqual(after.people,before.people); assert.deepEqual(after.expenses,before.expenses); assert.deepEqual(after.settings,before.settings); assert.equal(after.can_edit,true);
  });
  await check('two simultaneous saves cannot silently overwrite each other', async () => {
    const c1=server.db.getPgClient(), c2=server.db.getPgClient();await c1.connect();await c2.connect();
    try {
      const sql='select * from public.update_trip_state($1,$2,$3,$4,$5,$6,$7)';
      const params=[b.public_id,b.edit_token,'동시 편집 테스트',JSON.stringify(people),JSON.stringify(expenses),0,'{}'];
      const r=await Promise.allSettled([asRole(c1,'anon',sql,params),asRole(c2,'anon',sql,params)]);
      assert.equal(r.filter(x=>x.status==='fulfilled').length,1);
      assert.equal(r.find(x=>x.status==='rejected').reason.code,'40001');
      assert.equal((await get(b.public_id)).rows[0].version,'1');
    } finally {await c1.end();await c2.end();}
  });
  await check('legacy editor upgrades without losing the trip', async () => {
    const next=(await rotate(oldA.public_id,oldA.edit_token,0)).rows[0];
    assert.equal((await get(next.public_id)).rowCount,1); assert.equal((await get(oldA.public_id,oldA.edit_token)).rowCount,0);
  });
  await check('read-only post-deployment verification passes', async () => { await client.query(await readFile(new URL('../supabase/verify_security.sql',import.meta.url),'utf8')); });
  console.log(`Database security: ${passed} checks passed (isolated PostgreSQL; not production Supabase).`);
} finally { await server.close(); }
