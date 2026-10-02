import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import { JSDOM } from 'jsdom';
import { csvCell, canonicalTripUrl, readLink, createCredentialStore, createRpcClient, startPolling, generateTripCredentials } from '../docs/security.mjs';
import { loadApp, fakeRow } from './helpers/app.mjs';

const memory = () => { const values = new Map(); return {getItem:k=>values.get(k),setItem:(k,v)=>values.set(k,v),removeItem:k=>values.delete(k)}; };

function settingsApp() {
  const app = loadApp();
  const dialog = app.window.document.querySelector('#security-settings');
  // jsdom lacks the native dialog methods; browsers provide focus trapping and Escape.
  dialog.showModal = () => dialog.setAttribute('open', '');
  dialog.close = () => { dialog.removeAttribute('open'); dialog.dispatchEvent(new app.window.Event('close')); };
  app.eval('editVerified = true; renderSecurityControls();');
  return {app, dialog, get: id => app.window.document.getElementById(id)};
}
test('sensitive actions live outside the travel menu; unsaved retention changes are discarded', () => {
  const {app, dialog, get} = settingsApp();
  try {
    assert.equal(app.window.document.querySelector('#action-menu a[href="./admin.html"]'), null);
    assert.equal(get('rotate-trip-links').closest('#action-menu'), null);
    get('open-security-settings').click();
    assert.equal(dialog.open, true);
    get('remember-edit-access').click();
    app.eval('renderSecurityControls()');
    assert.equal(get('remember-edit-access').checked, true);
    assert.equal(app.eval('credentials.isPersistent(tripId)'), false);
    get('close-security-settings').click();
    get('open-security-settings').click();
    assert.equal(get('remember-edit-access').checked, false);
    get('remember-edit-access').click();
    get('save-edit-access').click();
    assert.equal(app.eval('credentials.isPersistent(tripId)'), true);
    get('remember-edit-access').click();
    get('save-edit-access').click();
    assert.equal(app.eval('credentials.isPersistent(tripId)'), false);
  } finally { app.close(); }
});
test('rotation requires an open settings dialog, fresh acknowledgement and final confirmation', () => {
  const {app, get} = settingsApp();
  let confirmations = 0;
  app.window.confirm = () => { confirmations++; return false; };
  try {
    get('open-security-settings').click();
    get('rotate-trip-links').click();
    assert.equal(confirmations, 0);
    get('acknowledge-link-rotation').click();
    get('rotate-trip-links').click();
    assert.equal(confirmations, 1);
    assert.equal(app.eval('saving'), false);
    get('close-security-settings').click();
    get('open-security-settings').click();
    assert.equal(get('acknowledge-link-rotation').checked, false);
    assert.equal(get('rotate-trip-links').disabled, true);
    app.eval('editVerified = false; renderSecurityControls();');
    assert.equal(get('security-settings').open, false);
    assert.equal(get('open-security-settings').hidden, true);
    get('open-security-settings').click();
    assert.equal(get('security-settings').open, false);
  } finally { app.close(); }
});

test('CSV formula protection, including whitespace, quotes, separators, and numeric values', () => {
  for(const value of ['=1+1','+SUM(1,2)','-1+1','@SUM(1,2)','  =1+1','\t=1+1','\r=1+1','\n=1+1','＝1+1','\u0000=1+1']) assert.ok(csvCell(value).replace(/^"/, '').startsWith("'"));
  assert.equal(csvCell('hello, "friend"'), '"hello, ""friend"""');
  assert.equal(csvCell(-100), '-100');
  assert.equal(csvCell('가짜 친구'), '가짜 친구');
});
test('edit keys only in fragments; view links never contain keys', () => {
  const old = 'https://example.test/app/?trip=a&edit=secret&noise=1';
  const parsed = readLink(old);
  const edit = canonicalTripUrl(old, parsed.publicId, parsed.editToken);
  assert.equal(new URL(edit).searchParams.has('edit'),false);
  assert.equal(new URL(edit).hash,'#edit=secret');
  assert.equal(canonicalTripUrl(edit,'a'),'https://example.test/app/?trip=a');
  assert.equal(readLink('https://example.test/?trip=a&edit=old#edit=new').editToken,'new');
});
test('keys default to session; opt-in persistence, removal, and unavailable storage', () => {
  const session=memory(), persistent=memory(), store=createCredentialStore(session,persistent);
  store.save('a','key'); assert.equal(store.get('a'),'key'); assert.equal(store.isPersistent('a'),false);
  store.save('a','key',true); assert.equal(store.isPersistent('a'),true);
  store.save('a','key',false); assert.equal(store.isPersistent('a'),false);
  store.forget('a'); assert.equal(store.get('a'),'');
  assert.equal(createCredentialStore(null,null).save('a','key'),false);
});
test('legacy dashboard keys migrate to session without changing public viewer privilege', () => {
  const app=loadApp({url:'https://example.test/?trip=a',local:{tripSplitDashboardTrips:JSON.stringify([{publicId:'a',name:'test',editToken:'legacy-secret'}])}});
  try { app.eval('readDashboardTrips()'); assert.ok(!app.window.localStorage.getItem('tripSplitDashboardTrips').includes('legacy-secret')); assert.equal(app.eval('credentials.get("a")'),'legacy-secret'); assert.equal(app.eval('canEdit()'),false); }
  finally {app.close();}
});
test('baseline attribute payload forms an executable event attribute, patched renderers do not', () => {
  const attack='p_x" onmouseover="window.__securityMarker=1" data-audit="';
  const baseline=new JSDOM(`<button data-copy-account="${attack}">test</button>`,{runScripts:'dangerously'});
  assert.equal(baseline.window.document.querySelector('button').getAttribute('onmouseover'),'window.__securityMarker=1');
  baseline.window.document.querySelector('button').dispatchEvent(new baseline.window.MouseEvent('mouseover'));
  assert.equal(baseline.window.__securityMarker,1); // Harmless sentinel, no network or data access.
  baseline.window.close();
  const app=loadApp();
  try {
    const row=structuredClone(fakeRow);
    row.people[0].id=attack; row.people[0].name='<img src=x onerror="window.__securityMarker=1">';
    row.expenses[0].id=attack; row.expenses[0].payerId=attack; row.expenses[0].participantIds=[attack,'p_b'];
    row.expenses[0].title='<svg onload="window.__securityMarker=1">';
    app.window.row=row;
    app.eval('editVerified=true; perspectiveChosen=true; state=normalizeTrip(row); render();');
    const doc=app.window.document;
    for (const el of doc.querySelectorAll('*')) for(const attr of el.attributes) assert.ok(!/^on/i.test(attr.name), `unexpected ${attr.name}`);
    assert.equal(doc.querySelectorAll('img[src="x"],svg[onload]').length,0);
    assert.equal(doc.querySelector('[data-copy-account]').getAttribute('data-copy-account'),attack);
    assert.equal(app.window.__securityMarker,undefined);
    // Exercise the separate expense editor and item participant renderer too.
    const host=doc.createElement('div'); host.innerHTML=app.eval('renderExpenseEditor(state.expenses[0])');
    assert.equal(host.querySelectorAll('[onmouseover],[onerror],[onload]').length,0);
  } finally {app.close();}
});
test('actual app calculation and all export formats keep normal data intact', async () => {
  const app=loadApp();
  try {
    app.window.row=structuredClone(fakeRow); app.eval('editVerified=true; perspectiveChosen=true; state=normalizeTrip(row); render();');
    assert.equal(app.eval('state.summary.total'),12000);
    assert.equal(app.eval('state.summary.settlements[0].amount'),6000);
    const data=app.eval('buildExportData(["summary","expenses","balances","settlements","exchange"])');
    assert.equal(data.trip.name,'가짜 여행');
    const csv=app.eval('buildCsv(buildExportData(["summary","expenses","balances","settlements","exchange"]))');
    assert.ok(csv.includes('식사')); assert.ok(!csv.includes('fake-key'));
    assert.ok(!JSON.stringify(data).includes('fake-key'));
    assert.ok(app.eval('buildPdfLines(buildExportData(["summary","expenses"])).length')>0);
    assert.equal(app.eval('parseCsv("내용,금액\\n식사,12000")[1][1]'),'12000');
  } finally {app.close();}
});
test('RPC never puts edit keys in request URL or referrer; failures carry stable codes', async () => {
  let request;
  const client=createRpcClient('https://backend.test','public-key',async(url,options)=>{request={url,options};return {ok:false,json:async()=>({code:'40001',message:'conflict'})};});
  const result=await client.rpc('update_trip_state',{p_edit_token:'secret'});
  assert.equal(request.url,'https://backend.test/rest/v1/rpc/update_trip_state');
  assert.equal(request.options.referrerPolicy,'no-referrer'); assert.equal(request.options.credentials,'omit');
  assert.equal(JSON.parse(request.options.body).p_edit_token,'secret'); assert.equal(result.error.code,'40001');
  await assert.rejects(client.rpc('arbitrary_function'));
});
test('polling pauses hidden tabs, backs off errors, resumes, and never overlaps', async () => {
  let hidden=false, calls=0, fail=true, pending, queued=[];
  const poller=startPolling({isHidden:()=>hidden,refresh:async()=>{calls++;if(fail)throw Error('offline');if(pending)await pending;},schedule:(fn,ms)=>{queued.push({fn,ms});return queued.length;},cancel:()=>{},onError:()=>{}});
  assert.equal(queued.at(-1).ms,3000);
  await queued.at(-1).fn(); assert.equal(queued.at(-1).ms,6000);
  fail=false; await queued.at(-1).fn(); assert.equal(queued.at(-1).ms,3000);
  hidden=true; const before=calls; await queued.at(-1).fn(); assert.equal(calls,before);
  hidden=false; let resolve; pending=new Promise(r=>resolve=r); poller.visibilityChanged(); poller.visibilityChanged();
  assert.equal(calls,before+1); resolve(); await new Promise(r=>setImmediate(r)); poller.stop();
});
test('no automatic trip creation on opening the homepage', async () => {
  const app=loadApp({url:'https://example.test/', configured:true});
  try {
    let calls=0;
    app.window.createRpcClient=()=>({rpc:async()=>{calls++;throw Error('Unexpected network request');}});
    await app.eval('start()');
    assert.equal(calls,0);
    assert.equal(app.window.document.querySelector('#welcome-panel').hidden,false);
    assert.equal(app.window.document.querySelector('.workspace').hidden,true);
  } finally {app.close();}
});
test('pending rotation survives a lost response and is bound to the original edit key', async () => {
  const session=memory(), persistent=memory(), store=createCredentialStore(session,persistent);
  const next=generateTripCredentials();
  assert.match(next.publicId,/^trip-[a-f0-9]{64}$/); assert.match(next.editToken,/^[a-f0-9]{64}$/);
  store.prepare('old','old-key',next);
  assert.equal(store.pending('old','other-key'),null);
  assert.equal(createCredentialStore(session,persistent).pending('old','old-key').editToken,next.editToken);
  store.clearPending('old'); assert.equal(store.pending('old','old-key'),null);
  assert.throws(()=>createCredentialStore(null,null).prepare('old','old-key',next));
});
test('actual app recovers a committed rotation after reload', async () => {
  const app=loadApp();
  try {
    const next=generateTripCredentials();app.window.next=next;
    app.eval('credentials.prepare(tripId,editToken,next)');
    app.window.recovered={...fakeRow,public_id:next.publicId,can_edit:true};
    app.eval('supabase={rpc:async()=>({data:[recovered],error:null})}');
    await app.eval('recoverPendingRotation()');
    assert.equal(app.eval('tripId'),next.publicId);assert.equal(app.eval('editToken'),next.editToken);
    assert.equal(new URL(app.window.location.href).searchParams.has('edit'),false);
    assert.equal(app.eval('credentials.pending("trip-test","fake-key")'),null);
  } finally {app.close();}
});
test('only self-hosted scripts allowed and no Realtime client remains', () => {
  const html=readFileSync(new URL('../docs/index.html',import.meta.url),'utf8');
  const app=readFileSync(new URL('../docs/app.js',import.meta.url),'utf8');
  assert.ok(html.includes("script-src 'self'")); assert.ok(html.includes('name="referrer" content="no-referrer"'));
  assert.ok(!/<script[^>]+src="https?:/.test(html)); assert.ok(!app.includes('postgres_changes'));
});


test('CSV mapping, preview, and actual import planner retain expenses and block duplicates', () => {
  const app=loadApp();
  try {
    app.window.row=structuredClone(fakeRow);
    app.eval('editVerified=true; perspectiveChosen=true; state=normalizeTrip(row); render();');
    app.window.csv='날짜,내용,금액,결제자,참여자\\n2026-09-30,가짜 택시,18000,가짜 A,가짜 A/가짜 B';
    app.window.csv=app.window.csv.replace('\\n','\n');
    const result=app.eval(`
      (()=>{
        const rows=parseCsv(csv);
        csvImportState={fileName:'fake.csv',headers:rows[0],rows:rows.slice(1),mappings:guessCsvImportMappings(rows[0])};
        renderCsvImportMapping();renderCsvImportPreview();
        return buildCsvImportPlan();
      })()
    `);
    assert.equal(result.errors.length,0);assert.equal(result.expenses.length,1);
    assert.equal(result.expenses[0].amount,18000);assert.equal(result.expenses[0].payerId,'p_a');
    app.window.planned=result;
    app.eval('state=normalizeTrip({...row,people:planned.people,expenses:[...row.expenses,...planned.expenses]});renderCsvImportPreview();');
    assert.equal(app.eval('buildCsvImportPlan().expenses.length'),0);
  } finally {app.close();}
});
