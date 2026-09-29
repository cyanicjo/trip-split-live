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
const root=fileURLToPath(new URL('../docs/',import.meta.url));
const calls={create_trip:[],get_trip:['p_public_id','p_edit_token'],update_trip_state:['p_public_id','p_edit_token','p_name','p_people','p_expenses','p_expected_version','p_settings'],rotate_trip_links:['p_public_id','p_edit_token','p_expected_version','p_new_public_id','p_new_edit_token']};
const server=http.createServer(async(req,res)=>{
  try {
    const url=new URL(req.url,'http://127.0.0.1');
    res.setHeader('Cache-Control','no-store');
    if(req.method==='POST' && url.pathname.startsWith('/rest/v1/rpc/')) {
      const name=url.pathname.split('/').at(-1); if(!Object.hasOwn(calls,name)){res.writeHead(404).end();return;}
      let body='';for await(const chunk of req){body+=chunk;if(body.length>2200000){res.writeHead(413).end();return;}}
      const args=JSON.parse(body); const params=calls[name].map(k=>typeof args[k]==='object' && args[k]!==null ? JSON.stringify(args[k]) : args[k] ?? null);
      const client=database.db.getPgClient();await client.connect();
      try {const r=await asRole(client,'anon',`select * from public.${name}(${params.map((_,i)=>'$'+(i+1)).join(',')})`,params);res.setHeader('Content-Type','application/json');res.end(JSON.stringify(r.rows));}
      catch(error){res.writeHead(error.code==='40001'?409:400,{'Content-Type':'application/json'});res.end(JSON.stringify({code:error.code,message:error.message}));}
      finally{await client.end();}return;
    }
    if(url.pathname==='/config.js') {res.setHeader('Content-Type','text/javascript');res.end(`window.TRIP_SPLIT_CONFIG={supabaseUrl:'http://127.0.0.1:${server.address().port}',supabaseAnonKey:'test-only-anon'};`);return;}
    if(url.pathname==='/fixtures') {res.setHeader('Content-Type','text/html; charset=utf-8');res.end(`<h1>가짜 여행 보안 테스트</h1><a href='/?trip=${a.public_id}#edit=${a.edit_token}'>가짜 여행 A 편집</a><br><a href='/?trip=${a.public_id}'>가짜 여행 A 보기</a><br><a href='/?trip=${b.public_id}#edit=${b.edit_token}'>가짜 여행 B 편집</a>`);return;}
    const path=resolve(root,'.'+(url.pathname==='/'?'/index.html':decodeURIComponent(url.pathname)));
    if(!path.startsWith(root)){res.writeHead(403).end();return;}
    let data=await readFile(path);
    if(extname(path)==='.html') data=Buffer.from(data.toString().replace('connect-src https://edyaihnztjshxsfissck.supabase.co',"connect-src 'self'"));
    res.setHeader('Content-Type',({'.html':'text/html; charset=utf-8','.js':'text/javascript','.mjs':'text/javascript','.css':'text/css','.svg':'image/svg+xml'})[extname(path)]||'application/octet-stream');res.end(data);
  }catch{res.writeHead(404).end();}
});
server.listen(0,'127.0.0.1',()=>console.log(`Local fake-data preview: http://127.0.0.1:${server.address().port}/fixtures`));
async function stop(){server.close();await database.close();process.exit(0);}
process.on('SIGTERM',stop);process.on('SIGINT',stop);
