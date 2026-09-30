import { calculateSummary } from './settlement.mjs';
export const ADMIN_STORAGE_KEY = 'trip-split-admin-session';
const money = value => `${Number(value || 0).toLocaleString('ko-KR')}원`;
const dateTime = value => value ? new Date(value).toLocaleString('ko-KR') : '—';
const labels = { id:'식별자', title:'내용', name:'이름', amount:'원화 금액', currency:'통화', foreignAmount:'외화 금액', exchangeRate:'적용 환율', cardKrwAmount:'카드 청구액', payerId:'결제자', participantIds:'참여자', items:'품목', quantity:'수량', unitAmount:'단가', category:'카테고리', majorCategory:'대분류', mealSlot:'식사 구분', spentAt:'지출 날짜', scheduleDate:'일정 날짜', lodgingStartDate:'숙박 시작일', lodgingEndDate:'숙박 종료일', spreadAcrossDays:'여러 날짜에 배분', allocationStartDate:'배분 시작일', allocationEndDate:'배분 종료일', memo:'메모', createdAt:'생성 시간', completedAt:'완료 시간', fromId:'보낸 사람', toId:'받은 사람', startDate:'시작일', endDate:'종료일', enabled:'사용 여부', currencies:'통화', rates:'환율', exchangeRecords:'환전 기록', exchangedAt:'환전 날짜', fromCurrency:'낸 통화', toCurrency:'받은 통화', fromAmount:'낸 금액', toAmount:'받은 금액', settledExpenses:'정산한 지출', itinerary:'일정', overseas:'외화 설정', completedSettlements:'완료된 송금', categories:'카테고리', dayOrders:'날짜별 순서', hiddenSlots:'숨긴 일정 칸', extraMealSlots:'추가 식사 칸', mealExpenseOrders:'식사별 지출 순서', settlementStartedAt:'정산 시작 시간' };
function element(doc, tag, text) { const node=doc.createElement(tag); if(text !== undefined) node.textContent=String(text); return node; }
function table(doc, headers, rows) {
  const wrap=element(doc,'div'); wrap.className='table-scroll';
  const t=element(doc,'table'), head=element(doc,'thead'), hr=element(doc,'tr'), body=element(doc,'tbody');
  for(const h of headers) { const th=element(doc,'th',h); th.scope='col'; hr.append(th); } head.append(hr);
  for(const row of rows) {const tr=element(doc,'tr'); for(const value of row) tr.append(element(doc,'td',value ?? '—'));body.append(tr);}
  t.append(head,body);wrap.append(t);return wrap;
}
function fields(doc, data, names, depth=0) {
  if(depth>12) return element(doc,'p','표시 가능한 깊이를 초과했습니다.');
  if(data===null || data===undefined) return element(doc,'span','—');
  if(typeof data!=='object') return element(doc,'span',typeof data==='boolean' ? (data?'사용':'미사용') : data);
  const dl=element(doc,'dl');
  for(const [key,value] of Object.entries(data)) {
    dl.append(element(doc,'dt',Object.hasOwn(labels,key) ? labels[key] : (Array.isArray(data)?`${Number(key)+1}번째`:key)));
    const dd=element(doc,'dd');
    if(['payerId','fromId','toId'].includes(key)) dd.textContent=names.get(value) || value;
    else if(key==='participantIds' && Array.isArray(value)) dd.textContent=value.map(id=>names.get(id)||id).join(', ') || '지출 참여자와 동일';
    else dd.append(fields(doc,value,names,depth+1));
    dl.append(dd);
  }
  return dl;
}
export function renderAdminDetail(doc, host, trip) {
  host.replaceChildren(); host.hidden=false;
  const people=(trip.people || []).filter(Boolean), expenses=(trip.expenses || []).filter(Boolean), settings=trip.settings || {};
  const names=new Map(people.map(p=>[p.id,p.name]));
  const summary=calculateSummary({ people, expenses, completedSettlements:settings.completedSettlements || [] });
  host.append(element(doc,'h2',trip.name),element(doc,'p',`총 지출 ${money(summary.total)} · 최근 변경 ${dateTime(trip.updated_at)}`));
  host.append(element(doc,'h3','참여자와 계좌'),table(doc,['이름','은행','계좌'],people.map(p=>[p.name,p.bankName || p.bank || '',p.accountNumber || p.account || ''])));
  host.append(element(doc,'h3','개인별 정산'),table(doc,['이름','낸 돈','부담액','완료 송금','완료 수령','남은 차액'],summary.people.map(p=>[p.name,...['paid','share','completedSent','completedReceived','balance'].map(k=>money(p[k]))])));
  host.append(element(doc,'h3','남은 송금'),table(doc,['보낼 사람','받을 사람','금액'],summary.settlements.map(s=>[s.fromName,s.toName,money(s.amount)])));
  if(!summary.settlements.length) host.append(element(doc,'p','남은 송금이 없습니다.'));
  host.append(element(doc,'h3','일정·외화 설정·완료된 송금'),fields(doc,settings,names));
  host.append(element(doc,'h3',`지출 ${expenses.length}개`));
  for(const expense of expenses) {
    const details=element(doc,'details'); details.append(element(doc,'summary',`${expense.spentAt || ''} · ${expense.title || '지출'} · ${money(expense.amount)}`),fields(doc,expense,names)); host.append(details);
  }
}

export function mountAdmin({ client, document:doc, window:win }) {
  const el=Object.fromEntries(['login','logout','refresh','status','list-panel','list','prev','next','page','detail'].map(k=>[k,doc.getElementById(`admin-${k}`)]));
  let session=null, epoch=0, busy=false, cursors=[null], page=0, rows=[], selected=null, detailVersion=null, stopped=false;
  const clear=()=>{ epoch++; rows=[]; selected=null; detailVersion=null; el.list.replaceChildren();el.detail.replaceChildren();el.detail.hidden=true;el['list-panel'].hidden=true; };
  const status=text=>{el.status.textContent=text;};
  const controls=()=>{el.login.hidden=Boolean(session);el.logout.hidden=!session;el.refresh.hidden=!session;el.login.disabled=busy;el.refresh.disabled=busy;el.prev.disabled=busy || page===0;el.next.disabled=busy || rows.length<50;};
  async function request(name,args,token) {
    const {data,error}=await client.rpc(name,args);
    if(token!==epoch || stopped) return null;
    if(error) { clear(); throw new Error(['42501','PGRST301','PGRST303'].includes(error.code) ? '관리자 권한이 없습니다. 본인 Google 계정을 확인하고 계정 등록을 요청해 주세요.' : '여행을 불러오지 못했습니다. 목록 새로고침으로 다시 시도해 주세요.'); }
    return data;
  }
  async function loadPage(reset=false) {
    if(!session || busy || doc.hidden || stopped) return;
    clear(); if(reset){cursors=[null];page=0;} busy=true;controls();const token=epoch;
    try {
      const cursor=cursors[page];
      const data=await request('admin_list_trips',{p_before_created_at:cursor?.created_at || null,p_before_id:cursor?.id || null},token);
      if(data===null) return;
      rows=data;el['list-panel'].hidden=false;el.page.textContent=`${page+1}페이지`;
      status(rows.length?'여행을 선택하면 상세 내용을 볼 수 있습니다.':'표시할 여행이 없습니다.');
      for(const row of rows) {
        const button=element(doc,'button');button.type='button';button.className='trip-card';
        button.append(element(doc,'span',row.name),element(doc,'small',`${dateTime(row.created_at)} · ${row.people_count}명 · 지출 ${row.expense_count}개`));
        button.addEventListener('click',()=>void loadDetail(row.id));el.list.append(button);
      }
    } catch(error){status(error.message);} finally {busy=false;controls();}
  }
  async function loadDetail(id,quiet=false) {
    if(!session || busy || doc.hidden || stopped) return;
    // Advancing the generation prevents an older response restoring cleared information.
    epoch++;const token=epoch;busy=true;controls();
    if(!quiet) {el.detail.replaceChildren();el.detail.hidden=true;}
    try {
      const data=await request('admin_get_trip',{p_trip_id:id},token);if(data===null)return;
      if(!data[0]) {selected=null;detailVersion=null;el.detail.replaceChildren();el.detail.hidden=true;status('여행을 찾을 수 없습니다.');return;}
      if(!quiet || selected!==id || detailVersion!==data[0].version) renderAdminDetail(doc,el.detail,data[0]);
      selected=id;detailVersion=data[0].version;status('관리자 조회 전용입니다.');
      const index=rows.findIndex(row=>row.id===id);
      if(index>=0) {
        const row=rows[index];row.name=data[0].name;row.people_count=data[0].people.length;row.expense_count=data[0].expenses.length;
        const button=el.list.children[index];
        button.firstElementChild.textContent=row.name;
        button.lastElementChild.textContent=`${dateTime(row.created_at)} · ${row.people_count}명 · 지출 ${row.expense_count}개`;
      }
      if(!quiet) el.detail.scrollIntoView?.({behavior:'smooth',block:'start'});
    }catch(error){status(error.message);}finally{busy=false;controls();}
  }
  async function signOut() {
    clear();session=null;controls();status('로그아웃했습니다.');
    // Clear local credentials even if the logout request cannot reach the server.
    try {await client.auth.signOut({scope:'local'});} finally {
      for(const suffix of ['', '-code-verifier','-user']) win.sessionStorage.removeItem(ADMIN_STORAGE_KEY+suffix);
    }
  }
  el.login.addEventListener('click',async()=>{
    busy=true;controls();
    try {
      const redirect=new URL('./admin.html',win.location.href).href;
      const {error}=await client.auth.signInWithOAuth({provider:'google',options:{redirectTo:redirect,queryParams:{prompt:'select_account'}}});
      if(error) throw error;
    }catch{status('Google 로그인을 시작하지 못했습니다. 인증 설정을 확인해 주세요.');}
    finally{busy=false;controls();}
  });
  el.logout.addEventListener('click',()=>void signOut().catch(()=>status('이 탭에서 로그아웃했습니다.')));
  el.refresh.addEventListener('click',()=>void loadPage(true));
  el.prev.addEventListener('click',()=>{if(page>0&&!busy){page--;void loadPage();}});
  el.next.addEventListener('click',()=>{if(rows.length===50&&!busy){cursors[page+1]=rows.at(-1);page++;void loadPage();}});
  const visibility=()=>{if(doc.hidden){clear();status('다시 돌아오면 관리자 권한을 확인합니다.');}else void loadPage();};
  doc.addEventListener('visibilitychange',visibility);
  const timer=win.setInterval(()=>{if(!doc.hidden && !busy && session) void (selected?loadDetail(selected,true):loadPage());},30000);
  const subscription=client.auth.onAuthStateChange((event,next)=>{
    if(stopped)return;
    if(event==='SIGNED_OUT'){session=null;clear();status('로그인이 필요합니다.');controls();}
    else if(next && session?.user.id!==next.user.id) {
      clear();session=next;controls();win.setTimeout(()=>void loadPage(true),0);
    }else if(next) session=next;
  }).data.subscription;
  const ready=(async()=>{
    try {
      const {data,error}=await client.auth.getSession();if(stopped)return;
      // OAuth code and error parameters should not remain in browser history.
      win.history.replaceState(null,'',new URL('./admin.html',win.location.href));
      if(error) throw error;
      session=data.session;controls();
      if(session) await loadPage(true);else status('Google 계정으로 로그인해 주세요.');
    }catch{clear();status('로그인을 확인하지 못했습니다. 다시 로그인해 주세요.');controls();}
  })();
  const pagehide=()=>{clear();};win.addEventListener('pagehide',pagehide);
  return {ready, clear, async refresh(){await loadPage(true);}, async showTrip(id){await loadDetail(id);}, signOut,
    stop(){stopped=true;clear();subscription.unsubscribe();win.clearInterval(timer);doc.removeEventListener('visibilitychange',visibility);win.removeEventListener('pagehide',pagehide);} };
}
