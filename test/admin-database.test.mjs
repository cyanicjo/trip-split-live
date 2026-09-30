import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { startDatabase, asRole } from './helpers/database.mjs';
const db=await startDatabase(), c=db.client;
const owner='11111111-1111-4111-8111-111111111111', other='22222222-2222-4222-8222-222222222222';
let passed=0;
async function check(name,fn){await fn();passed++;console.log(`PASS ${name}`);}
async function auth(uid,sql,args=[]){
  await c.query('begin');try{
    await c.query('set local role authenticated');
    await c.query("select set_config('request.jwt.claim.sub',$1,true)",[uid || '']);
    const result=await c.query(sql,args);await c.query('commit');return result;
  }catch(error){await c.query('rollback');throw error;}
}
const list=(uid,args=[null,null])=>auth(uid,'select * from public.admin_list_trips($1,$2)',args);
try {
  await c.query(await readFile(new URL('../supabase/schema.sql',import.meta.url),'utf8'));
  await c.query('insert into auth.users values ($1),($2)',[owner,other]);
  await c.query("insert into auth.identities values($1,'google'),($2,'google')",[owner,other]);
  const fixture=(await asRole(c,'anon','select * from public.create_trip()')).rows[0];
  const target=(await c.query('select id from public.trips where public_id=$1',[fixture.public_id])).rows[0].id;
  await c.query("update public.trip_secrets set edit_token_hash='revoked:'||edit_token_hash where trip_id=$1",[target]);
  await c.query("update public.trips set public_id='legacy-admin-fixture',name='가짜 폐기 여행' where id=$1",[target]);
  await c.query("insert into public.trips(public_id,name,created_at) select 'trip-fake-'||n,'가짜 여행 '||n,'2026-09-01'::timestamptz from generate_series(1,101) n");
  await check('anonymous admin APIs denied',async()=>{
    await assert.rejects(asRole(c,'anon','select * from public.admin_list_trips()'),{code:'42501'});
    await assert.rejects(asRole(c,'anon','select * from public.admin_get_trip($1)',[target]),{code:'42501'});
  });
  await check('authenticated without identity denied',()=>assert.rejects(list(null),{code:'42501'}));
  await check('first Google login has no automatic administrator role',()=>assert.rejects(list(owner),{code:'42501'}));
  const provision=await readFile(new URL('../supabase/manage_admin.sql',import.meta.url),'utf8');
  await check('owner provisioning placeholders fail closed',async()=>{await assert.rejects(c.query(provision));await c.query('rollback');});
  await c.query(provision.replace("target_user uuid := '00000000-0000-0000-0000-000000000000'",`target_user uuid := '${owner}'`).replace("action text := 'CHOOSE_GRANT_OR_REVOKE'","action text := 'grant'"));
  await check('other Google account cannot list or read arbitrary trip',async()=>{
    await assert.rejects(list(other),{code:'42501'});
    await assert.rejects(auth(other,'select * from public.admin_get_trip($1)',[target]),{code:'42501'});
  });
  await check('pagination covers 102 trips exactly once, including timestamp ties',async()=>{
    let cursor=[null,null], ids=[];let sizes=[];
    while(true){const r=await list(owner,cursor);sizes.push(r.rowCount);ids.push(...r.rows.map(x=>x.id));if(r.rowCount<50)break;const last=r.rows.at(-1);cursor=[last.created_at,last.id];}
    assert.deepEqual(sizes,[50,50,2]);assert.equal(new Set(ids).size,102);
  });
  await check('invalid partial cursor rejected',()=>assert.rejects(list(owner,[null,target]),{code:'22023'}));
  await check('revoked legacy trip visible only through administrator detail',async()=>{
    const row=(await auth(owner,'select * from public.admin_get_trip($1)',[target])).rows[0];
    assert.equal(row.name,'가짜 폐기 여행');assert.ok(Array.isArray(row.people));assert.ok(Array.isArray(row.expenses));assert.ok(row.settings);
    for(const key of ['edit_token','edit_token_hash','public_id']) assert.equal(Object.hasOwn(row,key),false);
    assert.equal((await asRole(c,'anon','select * from public.get_trip($1,$2)',['legacy-admin-fixture',fixture.edit_token])).rowCount,0);
  });
  await check('administrator cannot access tables or private allowlist',async()=>{
    for(const name of ['public.trips','public.trip_secrets','trip_private.admin_users']) await assert.rejects(auth(owner,`select * from ${name}`),{code:'42501'});
  });
  await check('administrator cannot update, delete, rotate links or grant self permissions',async()=>{
    for(const sql of ['delete from public.trips',"update public.trips set name='overwrite'",`insert into trip_private.admin_users(user_id) values('${other}')`]) await assert.rejects(auth(owner,sql),{code:'42501'});
    await assert.rejects(auth(owner,'select * from public.update_trip_state($1,$2,$3,$4,$5,$6,$7)',[fixture.public_id,fixture.edit_token,'no','[]','[]',0,'{}']),{code:'42501'});
    await assert.rejects(auth(owner,'select * from public.rotate_trip_links($1,$2,$3,$4,$5)',[fixture.public_id,fixture.edit_token,0,'trip-'+'a'.repeat(64),'b'.repeat(64)]),{code:'42501'});
  });
  await check('migration preserves owner registration and trip data on repeat',async()=>{
    await c.query(await readFile(new URL('../supabase/schema.sql',import.meta.url),'utf8'));
    assert.equal((await list(owner)).rowCount,50);assert.equal((await c.query('select count(*)::int n from public.trips')).rows[0].n,102);
  });
  await c.query(provision.replace("target_user uuid := '00000000-0000-0000-0000-000000000000'",`target_user uuid := '${owner}'`).replace("action text := 'CHOOSE_GRANT_OR_REVOKE'","action text := 'revoke'"));
  await check('removed administrator denied with same session identity',async()=>{
    await assert.rejects(list(owner),{code:'42501'});await assert.rejects(auth(owner,'select * from public.admin_get_trip($1)',[target]),{code:'42501'});
  });
  await check('read-only database deployment checks pass',async()=>{
    await c.query(await readFile(new URL('../supabase/verify_security.sql',import.meta.url),'utf8'));
    await c.query(await readFile(new URL('../supabase/verify_admin.sql',import.meta.url),'utf8'));
  });
  console.log(`\n${passed} administrator database checks passed.`);
}finally{await db.close();}
