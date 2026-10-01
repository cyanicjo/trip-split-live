import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import { JSDOM } from 'jsdom';
import { loadApp, fakeRow } from './helpers/app.mjs';
import { mountAdmin, renderAdminDetail, ADMIN_STORAGE_KEY } from '../docs/admin.mjs';
import { calculateSummary } from '../docs/settlement.mjs';
import { createClient } from '../docs/vendor/supabase-2.117.2.mjs';
const html=readFileSync(new URL('../docs/admin.html',import.meta.url),'utf8');
const trip={...fakeRow,id:'11111111-1111-4111-8111-111111111111'};
function setup(rpc,session={user:{id:'owner'}}) {
  const dom=new JSDOM(html,{url:'https://example.test/admin.html',pretendToBeVisual:true});
  let callback;
  const client={rpc,auth:{getSession:async()=>({data:{session},error:null}),onAuthStateChange:fn=>{callback=fn;return {data:{subscription:{unsubscribe(){}}}};},signOut:async()=>{callback('SIGNED_OUT',null);return {};},signInWithOAuth:async()=>({})}};
  const app=mountAdmin({client,document:dom.window.document,window:dom.window});
  return {...app,dom,event:(...args)=>callback(...args),close(){app.stop();dom.window.close();}};
}
test('standard CSV downloads have BOM and exact recognized headers',()=>{
  const app=loadApp();try{
    for(const kind of ['blank','example']){
      const buffer=readFileSync(new URL(`../docs/templates/trip-expenses-${kind}.csv`,import.meta.url));
      assert.deepEqual([...buffer.subarray(0,3)],[239,187,191]);app.window.csv=buffer.toString();
      const mappings=app.eval('guessCsvImportMappings(parseCsv(csv)[0])');assert.equal(Object.keys(mappings).length,11);assert.ok(Object.values(mappings).every(v=>v>=0));
    }
  }finally{app.close();}
});
test('downloaded example imports as two expenses with item participants and correct totals; reimport skips both',()=>{
  const app=loadApp();try{
    app.window.csv=readFileSync(new URL('../docs/templates/trip-expenses-example.csv',import.meta.url),'utf8');
    app.eval(`state=normalizeTrip({people:[],expenses:[],settings:{}});editVerified=true;
      {const rows=parseCsv(csv);csvImportState={fileName:'example.csv',headers:rows[0],rows:rows.slice(1),mappings:guessCsvImportMappings(rows[0])};renderCsvImportMapping();renderCsvImportPreview();}`);
    const result=app.eval('buildCsvImportPlan()');assert.equal(result.errors.length,0);assert.equal(result.people.length,3);assert.equal(result.expenses.length,2);
    assert.equal(result.expenses[0].amount,12000);assert.equal(result.expenses[1].amount,24000);assert.equal(result.expenses[1].items[1].participantIds.length,2);
    const summary=calculateSummary({people:result.people,expenses:result.expenses});assert.equal(summary.total,36000);assert.deepEqual(Array.from(summary.people,p=>p.share),[13000,13000,10000]);
    app.window.result=result;app.eval('state=normalizeTrip({people:result.people,expenses:result.expenses,settings:{}});renderCsvImportPreview();');
    assert.equal(app.eval('buildCsvImportPlan().expenses.length'),0);assert.equal(app.eval('buildCsvImportPlan().skipped.length'),3);
  }finally{app.close();}
});
test('admin detail shows accounts, schedule, FX, settlement and malicious text without HTML execution',()=>{
  const dom=new JSDOM(html),doc=dom.window.document;
  const value=structuredClone(trip);value.name='<img src=x onerror=alert(1)>';value.settings.overseas={enabled:true,currencies:['USD'],rates:{USD:1350}};
  renderAdminDetail(doc,doc.querySelector('#admin-detail'),value);
  const host=doc.querySelector('#admin-detail');for(const text of ['0000','2026-09-29','USD','1,350','6,000원']) assert.ok(host.textContent.includes(text.replace('1,350','1350')));
  assert.equal(host.querySelectorAll('img,[onerror],input,button').length,0);assert.ok(host.textContent.includes(value.name));dom.window.close();
});
test('logged out admin never calls a data API',async()=>{
  const app=setup(async()=>{throw Error('must not call');},null);try{await app.ready;assert.equal(app.dom.window.document.querySelector('#admin-list-panel').hidden,true);}finally{app.close();}
});
test('permission denial clears previously displayed list and detail',async()=>{
  let allowed=true;const app=setup(async name=>allowed?{data:name==='admin_list_trips'?[{...trip,people_count:2,expense_count:1}]:[trip]}:{error:{code:'42501'}});
  try{await app.ready;await app.showTrip(trip.id);assert.ok(app.dom.window.document.querySelector('#admin-detail').textContent.includes('0000'));allowed=false;await app.refresh();assert.equal(app.dom.window.document.querySelector('#admin-detail').textContent,'');assert.equal(app.dom.window.document.querySelector('#admin-list').textContent,'');assert.ok(app.dom.window.document.querySelector('#admin-status').textContent.includes('권한이 없습니다'));}finally{app.close();}
});
test('logout discards a late detail response and clears session storage',async()=>{
  let resolve;const app=setup(async name=>name==='admin_list_trips'?{data:[trip]}:await new Promise(r=>resolve=r));
  try{await app.ready;app.dom.window.sessionStorage.setItem(ADMIN_STORAGE_KEY,'test-session');const pending=app.showTrip(trip.id);await app.signOut();resolve({data:[trip]});await pending;assert.equal(app.dom.window.document.querySelector('#admin-detail').textContent,'');assert.equal(app.dom.window.sessionStorage.getItem(ADMIN_STORAGE_KEY),null);}finally{app.close();}
});
test('administrator uses Google PKCE, session storage and user bearer token with pinned SDK',async()=>{
  const values=new Map(),requests=[];
  const storage={getItem:k=>values.get(k)||null,setItem:(k,v)=>values.set(k,v),removeItem:k=>values.delete(k)};
  const token=[{alg:'HS256',typ:'JWT'},{sub:trip.id,exp:Math.floor(Date.now()/1000)+3600,role:'authenticated'},'signature'].map((x,i)=>i<2?Buffer.from(JSON.stringify(x)).toString('base64url'):x).join('.');
  const client=createClient('https://backend.test','anon-public',{auth:{flowType:'pkce',storage,storageKey:ADMIN_STORAGE_KEY,persistSession:true,autoRefreshToken:false,detectSessionInUrl:false},global:{fetch:async(url,options)=>{
    requests.push({url:String(url),options});return new Response(JSON.stringify(String(url).includes('/token')?{access_token:token,refresh_token:'fake-refresh',token_type:'bearer',expires_in:3600,user:{id:trip.id,app_metadata:{provider:'google'}}}:[]),{status:200,headers:{'Content-Type':'application/json'}});
  }}});
  const {data,error}=await client.auth.signInWithOAuth({provider:'google',options:{redirectTo:'https://example.test/admin.html',skipBrowserRedirect:true}});
  assert.equal(error,null);const url=new URL(data.url);assert.equal(url.searchParams.get('provider'),'google');assert.ok(url.searchParams.get('code_challenge'));assert.ok(values.has(ADMIN_STORAGE_KEY+'-code-verifier'));
  const exchanged=await client.auth.exchangeCodeForSession('fake-code');assert.equal(exchanged.error,null);assert.ok(values.has(ADMIN_STORAGE_KEY));
  await client.rpc('admin_list_trips');const req=requests.at(-1);assert.equal(new Headers(req.options.headers).get('authorization'),'Bearer '+token);
  assert.ok(!req.url.includes(token));await client.auth.signOut({scope:'local'});client.auth.stopAutoRefresh();
});

test('administrator pagination sends the complete cursor and previous page returns to the start',async()=>{
  const requests=[];const data=Array.from({length:50},(_,i)=>({...trip,id:String(i),created_at:'2026-10-01T00:00:00.123456Z',name:`가짜 ${i}`}));
  const app=setup(async(name,args)=>{requests.push(args);return {data:args.p_before_id===null?data:[{...trip,name:'마지막 여행'}]};});
  try {
    await app.ready;app.dom.window.document.querySelector('#admin-next').click();await new Promise(r=>setImmediate(r));
    assert.deepEqual(requests.at(-1),{p_before_id:'49',p_before_created_at:'2026-10-01T00:00:00.123456Z'});
    assert.equal(app.dom.window.document.querySelector('#admin-next').disabled,true);
    app.dom.window.document.querySelector('#admin-prev').click();await new Promise(r=>setImmediate(r));assert.equal(requests.at(-1).p_before_id,null);
  }finally{app.close();}
});
test('hidden tab clears private data immediately and checks permission again on return',async()=>{
  let allowed=true;const app=setup(async()=>allowed?{data:[trip]}:{error:{code:'42501'}});
  try{await app.ready;const doc=app.dom.window.document;Object.defineProperty(doc,'hidden',{value:true,configurable:true});doc.dispatchEvent(new app.dom.window.Event('visibilitychange'));assert.equal(doc.querySelector('#admin-list').textContent,'');allowed=false;Object.defineProperty(doc,'hidden',{value:false});doc.dispatchEvent(new app.dom.window.Event('visibilitychange'));await new Promise(r=>setImmediate(r));assert.ok(doc.querySelector('#admin-status').textContent.includes('권한이 없습니다'));}finally{app.close();}
});
