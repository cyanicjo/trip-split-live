// Disposable local integration preview. All records are synthetic; never connects to Supabase.
import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { resolve, extname } from 'node:path';
import { startDatabase, asRole } from './helpers/database.mjs';
const database=await startDatabase();
await database.client.query(await readFile(new URL('../supabase/schema.sql',import.meta.url),'utf8'));
const a=(await asRole(database.client,'anon','select * from public.create_trip()')).rows[0];
const b=(await asRole(database.client,'anon','select * from public.create_trip()')).rows[0];
const adminId='11111111-1111-4111-8111-111111111111';
await database.client.query("insert into auth.users values($1);",[adminId]);
await database.client.query("insert into trip_private.admin_users(user_id) values($1)",[adminId]);
await asRole(database.client,'anon','select * from public.update_trip_state($1,$2,$3,$4,$5,$6,$7)',[
  a.public_id,a.edit_token,'가짜 관리자 점검 여행',JSON.stringify([{id:'p_a',name:'가짜 민수',bankName:'테스트 은행',accountNumber:'0000'},{id:'p_b',name:'가짜 지연'}]),
  JSON.stringify([{id:'e_a',title:'가짜 식사',amount:12000,payerId:'p_a',participantIds:['p_a','p_b'],currency:'KRW',spentAt:'2026-10-01'}]),0,
  JSON.stringify({itinerary:{startDate:'2026-10-01',endDate:'2026-10-03'},overseas:{enabled:true,currencies:['USD','JPY'],rates:{USD:1350,JPY:9.5}}})
]);
const root=fileURLToPath(new URL('../docs/',import.meta.url));
const calls={admin_list_trips:['p_before_created_at','p_before_id'],admin_get_trip:['p_trip_id'],create_trip:[],get_trip:['p_public_id','p_edit_token'],update_trip_state:['p_public_id','p_edit_token','p_name','p_people','p_expenses','p_expected_version','p_settings'],rotate_trip_links:['p_public_id','p_edit_token','p_expected_version','p_new_public_id','p_new_edit_token']};
const server=http.createServer(async(req,res)=>{
  try {
    const url=new URL(req.url,'http://127.0.0.1');
    res.setHeader('Cache-Control','no-store');
    if(req.method==='POST' && url.pathname.startsWith('/rest/v1/rpc/')) {
      const name=url.pathname.split('/').at(-1); if(!Object.hasOwn(calls,name)){res.writeHead(404).end();return;}
      let body='';for await(const chunk of req){body+=chunk;if(body.length>2200000){res.writeHead(413).end();return;}}
      const args=JSON.parse(body); const params=calls[name].map(k=>typeof args[k]==='object' && args[k]!==null ? JSON.stringify(args[k]) : args[k] ?? null);
      const client=database.db.getPgClient();await client.connect();
      try {
        let r;const sql=`select * from public.${name}(${params.map((_,i)=>'$'+(i+1)).join(',')})`;
        if(name.startsWith('admin_')) {
          await client.query('begin');await client.query('set local role authenticated');
          await client.query("select set_config('request.jwt.claim.sub',$1,true)",[req.headers.authorization==='Bearer fake-local-admin'?adminId:'']);
          r=await client.query(sql,params);await client.query('commit');
        } else r=await asRole(client,'anon',sql,params);res.setHeader('Content-Type','application/json');res.end(JSON.stringify(r.rows));}
      catch(error){res.writeHead(error.code==='40001'?409:400,{'Content-Type':'application/json'});res.end(JSON.stringify({code:error.code,message:error.message}));}
      finally{await client.end();}return;
    }
    if(url.pathname==='/config.js') {res.setHeader('Content-Type','text/javascript');res.end(`window.TRIP_SPLIT_CONFIG={supabaseUrl:'http://127.0.0.1:${server.address().port}',supabaseAnonKey:'test-only-anon'};`);return;}
    if(url.pathname==='/fixtures') {res.setHeader('Content-Type','text/html; charset=utf-8');res.end(`<h1>가짜 여행 보안 테스트</h1><a href='/admin-demo.html'>관리자 화면 (로컬 인증 대역)</a><br><a href='/?trip=${a.public_id}#edit=${a.edit_token}'>가짜 여행 A 편집</a><br><a href='/?trip=${a.public_id}'>가짜 여행 A 보기</a><br><a href='/?trip=${b.public_id}#edit=${b.edit_token}'>가짜 여행 B 편집</a>`);return;}
    if(url.pathname==='/admin-fixture.mjs') {res.setHeader('Content-Type','text/javascript');res.end(`
      import {mountAdmin} from './admin.mjs';
      let callback;const client={rpc:async(name,args)=>{const r=await fetch('/rest/v1/rpc/'+name,{method:'POST',headers:{Authorization:'Bearer fake-local-admin'},body:JSON.stringify(args)});const data=await r.json();return r.ok?{data}:{error:data};},auth:{getSession:async()=>({data:{session:{user:{id:'local-fixture'}}}}),onAuthStateChange:fn=>{callback=fn;return {data:{subscription:{unsubscribe(){}}}};},signOut:async()=>{callback('SIGNED_OUT',null);return {};},signInWithOAuth:async()=>({error:new Error('Use production Google setup')})}};
      mountAdmin({client,document,window});
    `);return;}
    const path=resolve(root,'.'+(url.pathname==='/'?'/index.html':url.pathname==='/admin-demo.html'?'/admin.html':decodeURIComponent(url.pathname)));
    if(!path.startsWith(root)){res.writeHead(403).end();return;}
    let data=await readFile(path);
    if(url.pathname==='/admin-demo.html') data=Buffer.from(data.toString().replace('./admin-entry.mjs','./admin-fixture.mjs'));
    if(extname(path)==='.html') data=Buffer.from(data.toString().replace('connect-src https://edyaihnztjshxsfissck.supabase.co',"connect-src 'self'"));
    res.setHeader('Content-Type',({'.html':'text/html; charset=utf-8','.js':'text/javascript','.mjs':'text/javascript','.css':'text/css','.svg':'image/svg+xml'})[extname(path)]||'application/octet-stream');res.end(data);
  }catch{res.writeHead(404).end();}
});
server.listen(0,'127.0.0.1',()=>console.log(`Local fake-data preview: http://127.0.0.1:${server.address().port}/fixtures`));
async function stop(){server.close();await database.close();process.exit(0);}
process.on('SIGTERM',stop);process.on('SIGINT',stop);
