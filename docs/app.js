import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm";

const config = window.TRIP_SPLIT_CONFIG || {};
const isConfigured = Boolean(
  config.supabaseUrl &&
  config.supabaseAnonKey &&
  !config.supabaseUrl.includes("YOUR_PROJECT_REF") &&
  !config.supabaseAnonKey.includes("YOUR_SUPABASE_ANON_KEY")
);

const params = new URLSearchParams(window.location.search);
let tripId = params.get("trip") || "";
let editToken = params.get("edit") || "";
let supabase = null;
let tripChannel = null;

const elements = {
  setupPanel: document.querySelector("#setup-panel"),
  tripName: document.querySelector("#trip-name"),
  openDashboard: document.querySelector("#open-dashboard"),
  newTripLink: document.querySelector("#new-trip-link"),
  copyViewLink: document.querySelector("#copy-view-link"),
  copyEditLink: document.querySelector("#copy-edit-link"),
  liveStatus: document.querySelector("#live-status"),
  summaryTitle: document.querySelector("#summary-title"),
  summaryCaption: document.querySelector("#summary-caption"),
  totalSpent: document.querySelector("#total-spent"),
  peopleCount: document.querySelector("#people-count"),
  expenseCount: document.querySelector("#expense-count"),
  peoplePanel: document.querySelector("#people-panel"),
  peopleBody: document.querySelector("#people-body"),
  togglePeoplePanel: document.querySelector("#toggle-people-panel"),
  personForm: document.querySelector("#person-form"),
  personName: document.querySelector("#person-name"),
  peopleList: document.querySelector("#people-list"),
  expenseForm: document.querySelector("#expense-form"),
  expenseTitle: document.querySelector("#expense-title"),
  expenseAmount: document.querySelector("#expense-amount"),
  expensePayer: document.querySelector("#expense-payer"),
  expenseDate: document.querySelector("#expense-date"),
  expenseMemo: document.querySelector("#expense-memo"),
  participantList: document.querySelector("#participant-list"),
  selectAll: document.querySelector("#select-all"),
  clearAll: document.querySelector("#clear-all"),
  addExpense: document.querySelector("#add-expense"),
  balanceList: document.querySelector("#balance-list"),
  settlementList: document.querySelector("#settlement-list"),
  expenseList: document.querySelector("#expense-list"),
  dashboardBackdrop: document.querySelector("#dashboard-backdrop"),
  closeDashboard: document.querySelector("#close-dashboard"),
  dashboardList: document.querySelector("#dashboard-list"),
  toast: document.querySelector("#toast")
};

let state = null;
let participantSelection = new Set();
let knownPeople = new Set();
let participantsTouched = false;
let toastTimer = null;
let tripNameTimer = null;
let saving = false;
let editingExpenseId = "";

const peopleCollapsedKey = "tripSplitPeopleCollapsed";
let peopleCollapsed = localStorage.getItem(peopleCollapsedKey) === "true";
const dashboardTripsKey = "tripSplitDashboardTrips";

const moneyFormatter = new Intl.NumberFormat("ko-KR", {
  style: "currency",
  currency: "KRW",
  maximumFractionDigits: 0
});

function canEdit() {
  return Boolean(editToken);
}

function formatMoney(value) {
  return moneyFormatter.format(Math.round(Number(value) || 0));
}

function getPersonName(id) {
  return state?.people.find((person) => person.id === id)?.name || "알 수 없음";
}

function showToast(message) {
  clearTimeout(toastTimer);
  elements.toast.textContent = message;
  elements.toast.classList.add("is-visible");
  toastTimer = setTimeout(() => {
    elements.toast.classList.remove("is-visible");
  }, 2400);
}

function setLiveStatus(kind, text) {
  elements.liveStatus.classList.remove("is-connecting", "is-live", "is-offline");
  elements.liveStatus.classList.add(kind);
  elements.liveStatus.lastChild.textContent = ` ${text}`;
}

function makeId(prefix = "") {
  if (crypto.randomUUID) {
    return `${prefix}${crypto.randomUUID()}`;
  }
  const bytes = crypto.getRandomValues(new Uint8Array(8));
  return `${prefix}${Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("")}`;
}

function localDateString() {
  const date = new Date();
  date.setMinutes(date.getMinutes() - date.getTimezoneOffset());
  return date.toISOString().slice(0, 10);
}

function pageUrl(searchParams) {
  const url = new URL(window.location.href);
  url.search = searchParams.toString();
  url.hash = "";
  return url.toString();
}

function viewLink() {
  const linkParams = new URLSearchParams();
  linkParams.set("trip", tripId);
  return pageUrl(linkParams);
}

function editLink() {
  const linkParams = new URLSearchParams();
  linkParams.set("trip", tripId);
  if (editToken) {
    linkParams.set("edit", editToken);
  }
  return pageUrl(linkParams);
}

function newTripLink() {
  return pageUrl(new URLSearchParams());
}

function tripLinkFromRecord(record) {
  const linkParams = new URLSearchParams();
  linkParams.set("trip", record.publicId);
  if (record.editToken) {
    linkParams.set("edit", record.editToken);
  }
  return pageUrl(linkParams);
}

function readDashboardTrips() {
  try {
    const parsed = JSON.parse(localStorage.getItem(dashboardTripsKey) || "[]");
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((trip) => trip && typeof trip.publicId === "string" && trip.publicId)
      .map((trip) => ({
        publicId: trip.publicId,
        name: trip.name || "새 여행 정산",
        editToken: trip.editToken || "",
        updatedAt: trip.updatedAt || "",
        lastOpenedAt: trip.lastOpenedAt || "",
        peopleCount: Number(trip.peopleCount) || 0,
        expenseCount: Number(trip.expenseCount) || 0,
        total: Number(trip.total) || 0
      }));
  } catch (error) {
    return [];
  }
}

function writeDashboardTrips(trips) {
  const limitedTrips = trips
    .slice(0, 80)
    .sort((a, b) => String(b.lastOpenedAt || b.updatedAt).localeCompare(String(a.lastOpenedAt || a.updatedAt)));
  localStorage.setItem(dashboardTripsKey, JSON.stringify(limitedTrips));
}

function rememberCurrentTrip() {
  if (!state || !tripId) return;

  const trips = readDashboardTrips();
  const existing = trips.find((trip) => trip.publicId === tripId);
  if (!canEdit() && !existing) {
    return;
  }

  const nextTrip = {
    publicId: tripId,
    name: state.name,
    editToken: editToken || existing?.editToken || "",
    updatedAt: state.updatedAt || new Date().toISOString(),
    lastOpenedAt: new Date().toISOString(),
    peopleCount: state.people.length,
    expenseCount: state.expenses.length,
    total: state.summary.total
  };

  writeDashboardTrips([
    nextTrip,
    ...trips.filter((trip) => trip.publicId !== tripId)
  ]);

  if (!elements.dashboardBackdrop.hidden) {
    renderDashboard();
  }
}

function removeDashboardTrip(publicId) {
  writeDashboardTrips(readDashboardTrips().filter((trip) => trip.publicId !== publicId));
  renderDashboard();
}

function normalizeTrip(row) {
  return {
    id: row.public_id,
    publicId: row.public_id,
    name: row.name || "새 여행 정산",
    people: Array.isArray(row.people) ? row.people : [],
    expenses: Array.isArray(row.expenses) ? row.expenses : [],
    version: row.version || 0,
    updatedAt: row.updated_at,
    summary: calculateSummary({
      people: Array.isArray(row.people) ? row.people : [],
      expenses: Array.isArray(row.expenses) ? row.expenses : []
    })
  };
}

function calculateSummary(trip) {
  const people = trip.people || [];
  const peopleById = new Map(people.map((person) => [person.id, person]));
  const balances = new Map(people.map((person) => [person.id, 0]));
  const paidTotals = new Map(people.map((person) => [person.id, 0]));
  const shareTotals = new Map(people.map((person) => [person.id, 0]));
  let total = 0;

  for (const expense of trip.expenses || []) {
    const amount = Math.round(Number(expense.amount) || 0);
    if (amount <= 0 || !peopleById.has(expense.payerId)) {
      continue;
    }

    const participantIds = Array.from(new Set(expense.participantIds || []))
      .filter((id) => peopleById.has(id));

    if (participantIds.length === 0) {
      continue;
    }

    total += amount;
    balances.set(expense.payerId, balances.get(expense.payerId) + amount);
    paidTotals.set(expense.payerId, paidTotals.get(expense.payerId) + amount);

    const baseShare = Math.floor(amount / participantIds.length);
    const remainder = amount % participantIds.length;

    participantIds.forEach((id, index) => {
      const share = baseShare + (index < remainder ? 1 : 0);
      balances.set(id, balances.get(id) - share);
      shareTotals.set(id, shareTotals.get(id) + share);
    });
  }

  const peopleSummary = people.map((person) => {
    const balance = balances.get(person.id) || 0;
    return {
      id: person.id,
      name: person.name,
      paid: paidTotals.get(person.id) || 0,
      share: shareTotals.get(person.id) || 0,
      balance
    };
  });

  const debtors = peopleSummary
    .filter((person) => person.balance < 0)
    .map((person) => ({ ...person, amount: Math.abs(person.balance) }))
    .sort((a, b) => b.amount - a.amount);

  const creditors = peopleSummary
    .filter((person) => person.balance > 0)
    .map((person) => ({ ...person, amount: person.balance }))
    .sort((a, b) => b.amount - a.amount);

  const settlements = [];
  let debtorIndex = 0;
  let creditorIndex = 0;

  while (debtorIndex < debtors.length && creditorIndex < creditors.length) {
    const debtor = debtors[debtorIndex];
    const creditor = creditors[creditorIndex];
    const amount = Math.min(debtor.amount, creditor.amount);

    if (amount > 0) {
      settlements.push({
        fromId: debtor.id,
        fromName: debtor.name,
        toId: creditor.id,
        toName: creditor.name,
        amount
      });
    }

    debtor.amount -= amount;
    creditor.amount -= amount;

    if (debtor.amount === 0) debtorIndex += 1;
    if (creditor.amount === 0) creditorIndex += 1;
  }

  return { total, people: peopleSummary, settlements };
}

async function callRpc(name, args = {}) {
  const { data, error } = await supabase.rpc(name, args);
  if (error) {
    throw new Error(error.message || "Supabase 요청에 실패했습니다.");
  }
  return data;
}

async function createTrip() {
  setLiveStatus("is-connecting", "여행방 생성 중");
  const result = await callRpc("create_trip");
  const row = Array.isArray(result) ? result[0] : result;
  if (!row?.public_id || !row?.edit_token) {
    throw new Error("여행방을 만들지 못했습니다.");
  }

  const linkParams = new URLSearchParams();
  linkParams.set("trip", row.public_id);
  linkParams.set("edit", row.edit_token);
  window.location.replace(pageUrl(linkParams));
}

async function loadTrip({ quiet = false } = {}) {
  if (!quiet) setLiveStatus("is-connecting", "불러오는 중");
  const result = await callRpc("get_trip", { p_public_id: tripId });
  const row = Array.isArray(result) ? result[0] : result;
  if (!row) {
    throw new Error("여행방을 찾지 못했습니다.");
  }

  state = normalizeTrip(row);
  rememberCurrentTrip();
  render();
  if (!quiet) setLiveStatus("is-live", canEdit() ? "편집 가능" : "보기 전용");
}

async function saveTrip(nextState) {
  if (!canEdit()) {
    showToast("보기 전용 링크에서는 수정할 수 없습니다.");
    return;
  }

  saving = true;
  setLiveStatus("is-connecting", "저장 중");
  try {
    const result = await callRpc("update_trip_state", {
      p_public_id: tripId,
      p_edit_token: editToken,
      p_name: nextState.name,
      p_people: nextState.people,
      p_expenses: nextState.expenses
    });
    const row = Array.isArray(result) ? result[0] : result;
    state = normalizeTrip(row);
    rememberCurrentTrip();
    render();
    setLiveStatus("is-live", "저장됨");
  } finally {
    saving = false;
  }
}

function connectRealtime() {
  if (tripChannel) {
    supabase.removeChannel(tripChannel);
  }

  tripChannel = supabase
    .channel(`trip-${tripId}`)
    .on(
      "postgres_changes",
      {
        event: "UPDATE",
        schema: "public",
        table: "trips",
        filter: `public_id=eq.${tripId}`
      },
      async () => {
        if (!saving) {
          await loadTrip({ quiet: true });
        }
      }
    )
    .subscribe((status) => {
      if (status === "SUBSCRIBED") {
        setLiveStatus("is-live", canEdit() ? "편집 가능" : "보기 전용");
      } else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
        setLiveStatus("is-offline", "재연결 중");
      }
    });
}

function syncParticipantSelection() {
  const currentIds = new Set((state?.people || []).map((person) => person.id));

  if (!participantsTouched || participantSelection.size === 0) {
    participantSelection = new Set(currentIds);
  } else {
    for (const id of participantSelection) {
      if (!currentIds.has(id)) {
        participantSelection.delete(id);
      }
    }
    for (const id of currentIds) {
      if (!knownPeople.has(id)) {
        participantSelection.add(id);
      }
    }
  }

  knownPeople = currentIds;
}

function render() {
  if (!state) return;

  document.body.classList.toggle("is-readonly", !canEdit());
  syncParticipantSelection();
  renderHeader();
  renderSummary();
  renderPeople();
  renderExpenseForm();
  renderBalances();
  renderSettlements();
  renderExpenses();
  renderDashboard();
}

function renderHeader() {
  if (document.activeElement !== elements.tripName) {
    elements.tripName.value = state.name;
  }
  elements.tripName.readOnly = !canEdit();
  elements.copyEditLink.hidden = !canEdit();
}

function renderSummary() {
  const peopleCount = state.people.length;
  const expenseCount = state.expenses.length;
  const settlementCount = state.summary.settlements.length;

  elements.totalSpent.textContent = formatMoney(state.summary.total);
  elements.peopleCount.textContent = `${peopleCount}명`;
  elements.expenseCount.textContent = `${expenseCount}개`;

  if (!canEdit()) {
    elements.summaryTitle.textContent = expenseCount === 0
      ? "여행 정산을 볼 수 있습니다"
      : `${settlementCount}번 송금하면 정산 끝`;
    elements.summaryCaption.textContent = "보기 전용 링크입니다. 지출을 수정하려면 편집 링크가 필요합니다.";
  } else if (peopleCount === 0) {
    elements.summaryTitle.textContent = "친구를 추가하면 정산이 시작됩니다";
    elements.summaryCaption.textContent = "친구에게는 보기 링크를, 입력할 사람에게는 편집 링크를 공유하세요.";
  } else if (expenseCount === 0) {
    elements.summaryTitle.textContent = `${peopleCount}명이 준비 중입니다`;
    elements.summaryCaption.textContent = "숙소, 교통, 식비처럼 먼저 낸 사람이 있는 항목을 입력해 주세요.";
  } else if (settlementCount === 0) {
    elements.summaryTitle.textContent = "현재 정산은 딱 맞습니다";
    elements.summaryCaption.textContent = "모두가 각자 부담할 만큼 지출했거나 정산할 차액이 없습니다.";
  } else {
    elements.summaryTitle.textContent = `${settlementCount}번 송금하면 정산 끝`;
    elements.summaryCaption.textContent = "송금표대로 보내면 전체 여행 n빵이 정리됩니다.";
  }
}

function renderPeople() {
  elements.peoplePanel.classList.toggle("is-collapsed", peopleCollapsed);
  elements.peopleBody.hidden = peopleCollapsed;
  elements.togglePeoplePanel.setAttribute("aria-expanded", String(!peopleCollapsed));
  elements.togglePeoplePanel.title = peopleCollapsed ? "친구 펼치기" : "친구 접기";
  elements.togglePeoplePanel.querySelector("span").textContent = peopleCollapsed ? "▾" : "▴";

  if (state.people.length === 0) {
    elements.peopleList.className = "people-list empty-state";
    elements.peopleList.textContent = "아직 추가된 친구가 없습니다.";
    return;
  }

  elements.peopleList.className = "people-list";
  elements.peopleList.innerHTML = state.people.map((person) => `
    <div class="person-chip">
      <span>${escapeHtml(person.name)}</span>
      ${canEdit() ? `<button type="button" title="${escapeHtml(person.name)} 삭제" aria-label="${escapeHtml(person.name)} 삭제" data-remove-person="${person.id}">×</button>` : ""}
    </div>
  `).join("");
}

function renderExpenseForm() {
  const hasPeople = state.people.length > 0;
  const editable = canEdit();
  elements.personName.disabled = !editable;
  elements.personForm.querySelector("button").disabled = !editable;
  elements.addExpense.disabled = !editable || !hasPeople;
  elements.expenseTitle.disabled = !editable || !hasPeople;
  elements.expenseAmount.disabled = !editable || !hasPeople;
  elements.expensePayer.disabled = !editable || !hasPeople;
  elements.expenseDate.disabled = !editable || !hasPeople;
  elements.expenseMemo.disabled = !editable || !hasPeople;
  elements.selectAll.disabled = !editable || !hasPeople;
  elements.clearAll.disabled = !editable || !hasPeople;

  const currentPayer = elements.expensePayer.value;
  elements.expensePayer.innerHTML = state.people.map((person) => (
    `<option value="${person.id}">${escapeHtml(person.name)}</option>`
  )).join("");

  if (state.people.some((person) => person.id === currentPayer)) {
    elements.expensePayer.value = currentPayer;
  }

  if (!hasPeople) {
    elements.participantList.className = "participant-list empty-state";
    elements.participantList.textContent = editable ? "친구를 먼저 추가해 주세요." : "아직 추가된 친구가 없습니다.";
    return;
  }

  elements.participantList.className = "participant-list";
  elements.participantList.innerHTML = state.people.map((person) => {
    const checked = participantSelection.has(person.id) ? "checked" : "";
    const disabled = editable ? "" : "disabled";
    return `
      <label class="participant-option">
        <input type="checkbox" value="${person.id}" ${checked} ${disabled}>
        <span>${escapeHtml(person.name)}</span>
      </label>
    `;
  }).join("");
}

function renderBalances() {
  const balances = state.summary.people;
  if (balances.length === 0 || state.expenses.length === 0) {
    elements.balanceList.className = "balance-list empty-state";
    elements.balanceList.textContent = "지출을 입력하면 받을 돈과 보낼 돈이 표시됩니다.";
    return;
  }

  elements.balanceList.className = "balance-list";
  elements.balanceList.innerHTML = balances.map((person) => {
    const statusClass = person.balance > 0 ? "positive" : person.balance < 0 ? "negative" : "";
    const statusLabel = person.balance > 0 ? "받을 돈" : person.balance < 0 ? "보낼 돈" : "정산 완료";
    return `
      <div class="balance-card">
        <div class="balance-topline">
          <span class="balance-name">${escapeHtml(person.name)}</span>
          <span class="balance-amount ${statusClass}">${statusLabel} ${formatMoney(Math.abs(person.balance))}</span>
        </div>
        <div class="balance-detail">
          <span>낸 돈 ${formatMoney(person.paid)}</span>
          <span>부담액 ${formatMoney(person.share)}</span>
        </div>
      </div>
    `;
  }).join("");
}

function renderSettlements() {
  const settlements = state.summary.settlements;
  if (settlements.length === 0) {
    elements.settlementList.className = "settlement-list empty-state";
    elements.settlementList.textContent = state.expenses.length === 0
      ? "아직 정산할 송금이 없습니다."
      : "보낼 돈 없이 정산이 맞아떨어졌습니다.";
    return;
  }

  elements.settlementList.className = "settlement-list";
  elements.settlementList.innerHTML = settlements.map((item) => `
    <div class="settlement-item">
      <div class="settlement-route">
        <strong>${escapeHtml(item.fromName)}</strong>
        <span> → </span>
        <strong>${escapeHtml(item.toName)}</strong>
      </div>
      <div class="settlement-amount">${formatMoney(item.amount)}</div>
    </div>
  `).join("");
}

function renderExpenses() {
  if (!canEdit()) {
    editingExpenseId = "";
  }
  if (editingExpenseId && !state.expenses.some((expense) => expense.id === editingExpenseId)) {
    editingExpenseId = "";
  }

  if (state.expenses.length === 0) {
    elements.expenseList.className = "expense-list empty-state";
    elements.expenseList.textContent = "저장된 지출이 없습니다.";
    return;
  }

  elements.expenseList.className = "expense-list";
  elements.expenseList.innerHTML = state.expenses.map((expense) => {
    if (expense.id === editingExpenseId) {
      return renderExpenseEditor(expense);
    }

    const participants = (expense.participantIds || []).map(getPersonName).join(", ");
    return `
      <article class="expense-item">
        <div class="expense-main">
          <div class="expense-title">${escapeHtml(expense.title)}</div>
          <div class="expense-amount">${formatMoney(expense.amount)}</div>
        </div>
        <div class="expense-meta">
          <span>결제 ${escapeHtml(getPersonName(expense.payerId))}</span>
          <span>${escapeHtml(expense.spentAt)}</span>
          <span>${escapeHtml(participants)}</span>
        </div>
        <div class="expense-actions">
          <div class="expense-memo">${escapeHtml(expense.memo || "")}</div>
          ${canEdit() ? `
            <div class="expense-button-row">
              <button class="text-button expense-edit-button" type="button" data-edit-expense="${expense.id}">수정</button>
              <button class="expense-delete" type="button" title="지출 삭제" aria-label="지출 삭제" data-remove-expense="${expense.id}">×</button>
            </div>
          ` : ""}
        </div>
      </article>
    `;
  }).join("");
}

function renderDashboard() {
  const trips = readDashboardTrips();
  if (trips.length === 0) {
    elements.dashboardList.className = "dashboard-list empty-state";
    elements.dashboardList.textContent = "아직 저장된 여행이 없습니다.";
    return;
  }

  elements.dashboardList.className = "dashboard-list";
  elements.dashboardList.innerHTML = trips.map((trip) => {
    const current = trip.publicId === tripId ? " is-current" : "";
    const updated = trip.updatedAt ? new Date(trip.updatedAt).toLocaleDateString("ko-KR") : "";
    return `
      <article class="dashboard-trip${current}">
        <div class="dashboard-trip-main">
          <div class="dashboard-trip-title">${escapeHtml(trip.name)}</div>
          <div class="dashboard-trip-meta">
            <span>${trip.peopleCount}명</span>
            <span>${trip.expenseCount}개</span>
            <span>${formatMoney(trip.total)}</span>
            ${updated ? `<span>${escapeHtml(updated)}</span>` : ""}
          </div>
        </div>
        <div class="dashboard-trip-actions">
          <a class="text-button" href="${escapeHtml(tripLinkFromRecord(trip))}">열기</a>
          <button class="text-button" type="button" data-copy-dashboard-trip="${escapeHtml(trip.publicId)}">복사</button>
          <button class="expense-delete" type="button" title="목록에서 삭제" aria-label="목록에서 삭제" data-remove-dashboard-trip="${escapeHtml(trip.publicId)}">×</button>
        </div>
      </article>
    `;
  }).join("");
}

function openDashboard() {
  renderDashboard();
  elements.dashboardBackdrop.hidden = false;
  document.body.classList.add("dashboard-open");
  elements.closeDashboard.focus();
}

function closeDashboard() {
  elements.dashboardBackdrop.hidden = true;
  document.body.classList.remove("dashboard-open");
}

function renderExpenseEditor(expense) {
  const participantIds = new Set(expense.participantIds || []);
  const payerOptions = state.people.map((person) => {
    const selected = person.id === expense.payerId ? "selected" : "";
    return `<option value="${person.id}" ${selected}>${escapeHtml(person.name)}</option>`;
  }).join("");
  const participantOptions = state.people.map((person) => {
    const checked = participantIds.has(person.id) ? "checked" : "";
    return `
      <label class="participant-option">
        <input type="checkbox" value="${person.id}" data-edit-participant ${checked}>
        <span>${escapeHtml(person.name)}</span>
      </label>
    `;
  }).join("");

  return `
    <article class="expense-item expense-editor">
      <form class="expense-edit-form" data-edit-expense-form="${expense.id}">
        <div class="expense-edit-grid">
          <label>
            <span>내용</span>
            <input data-edit-title type="text" maxlength="70" value="${escapeHtml(expense.title)}" autocomplete="off">
          </label>
          <label>
            <span>금액</span>
            <input data-edit-amount type="text" inputmode="numeric" value="${escapeHtml(expense.amount)}" autocomplete="off">
          </label>
          <label>
            <span>결제자</span>
            <select data-edit-payer>${payerOptions}</select>
          </label>
          <label>
            <span>날짜</span>
            <input data-edit-date type="date" value="${escapeHtml(expense.spentAt || localDateString())}">
          </label>
        </div>

        <div>
          <div class="field-label">n빵 참여자</div>
          <div class="participant-list expense-edit-participants">${participantOptions}</div>
        </div>

        <label class="memo-field">
          <span>메모</span>
          <input data-edit-memo type="text" maxlength="140" value="${escapeHtml(expense.memo || "")}" autocomplete="off">
        </label>

        <div class="edit-actions">
          <button class="text-button" type="button" data-cancel-expense-edit="${expense.id}">취소</button>
          <button class="primary-button compact" type="submit">수정 저장</button>
        </div>
      </form>
    </article>
  `;
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function amountFromInput(value) {
  const numeric = Number(String(value).replace(/[^\d.-]/g, ""));
  if (!Number.isFinite(numeric) || numeric <= 0) {
    return null;
  }
  return Math.round(numeric);
}

async function copyText(text, message) {
  try {
    await navigator.clipboard.writeText(text);
    showToast(message);
  } catch (error) {
    showToast(text);
  }
}

elements.expenseDate.value = localDateString();

elements.openDashboard.addEventListener("click", openDashboard);

elements.closeDashboard.addEventListener("click", closeDashboard);

elements.dashboardBackdrop.addEventListener("click", (event) => {
  if (event.target === elements.dashboardBackdrop) {
    closeDashboard();
  }
});

document.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && !elements.dashboardBackdrop.hidden) {
    closeDashboard();
  }
});

elements.dashboardList.addEventListener("click", async (event) => {
  const copyButton = event.target.closest("[data-copy-dashboard-trip]");
  if (copyButton) {
    const trip = readDashboardTrips()
      .find((item) => item.publicId === copyButton.dataset.copyDashboardTrip);
    if (trip) {
      await copyText(tripLinkFromRecord(trip), trip.editToken ? "편집 링크를 복사했습니다." : "보기 링크를 복사했습니다.");
    }
    return;
  }

  const removeButton = event.target.closest("[data-remove-dashboard-trip]");
  if (removeButton) {
    removeDashboardTrip(removeButton.dataset.removeDashboardTrip);
    showToast("내 여행 목록에서 삭제했습니다.");
  }
});

elements.newTripLink.addEventListener("click", () => {
  if (!isConfigured) {
    showToast("Supabase 설정을 먼저 완료해 주세요.");
    return;
  }

  const opened = window.open(newTripLink(), "_blank");
  if (opened) {
    opened.opener = null;
    showToast("새 탭에서 새 여행방을 만듭니다.");
  } else {
    window.location.assign(newTripLink());
  }
});

elements.copyViewLink.addEventListener("click", () => {
  if (!tripId) return;
  copyText(viewLink(), "보기 링크를 복사했습니다.");
});

elements.copyEditLink.addEventListener("click", () => {
  if (!tripId || !editToken) return;
  copyText(editLink(), "편집 링크를 복사했습니다.");
});

elements.tripName.addEventListener("input", () => {
  if (!canEdit() || !state) return;
  clearTimeout(tripNameTimer);
  tripNameTimer = setTimeout(async () => {
    const name = elements.tripName.value.trim();
    if (!name || name === state.name) return;
    try {
      await saveTrip({ ...state, name });
    } catch (error) {
      showToast(error.message);
    }
  }, 480);
});

elements.tripName.addEventListener("keydown", (event) => {
  if (event.key === "Enter") {
    event.preventDefault();
    elements.tripName.blur();
  }
});

elements.togglePeoplePanel.addEventListener("click", () => {
  peopleCollapsed = !peopleCollapsed;
  localStorage.setItem(peopleCollapsedKey, String(peopleCollapsed));
  renderPeople();
});

elements.personForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  if (!canEdit() || !state) return;
  const name = elements.personName.value.trim();
  if (!name) return;

  const nextPeople = [
    ...state.people,
    { id: makeId("p_"), name: name.slice(0, 40), createdAt: new Date().toISOString() }
  ];

  try {
    await saveTrip({ ...state, people: nextPeople });
    elements.personName.value = "";
  } catch (error) {
    showToast(error.message);
  }
});

elements.peopleList.addEventListener("click", async (event) => {
  const button = event.target.closest("[data-remove-person]");
  if (!button || !canEdit() || !state) return;

  const personId = button.dataset.removePerson;
  const paidExpense = state.expenses.some((expense) => expense.payerId === personId);
  if (paidExpense) {
    showToast("이 사람이 결제한 지출이 있어 먼저 지출을 삭제해야 합니다.");
    return;
  }

  const nextPeople = state.people.filter((person) => person.id !== personId);
  const nextExpenses = state.expenses.map((expense) => ({
    ...expense,
    participantIds: (expense.participantIds || []).filter((id) => id !== personId)
  }));

  try {
    await saveTrip({ ...state, people: nextPeople, expenses: nextExpenses });
  } catch (error) {
    showToast(error.message);
  }
});

elements.participantList.addEventListener("change", (event) => {
  const input = event.target.closest("input[type='checkbox']");
  if (!input || !canEdit()) return;

  participantsTouched = true;
  if (input.checked) {
    participantSelection.add(input.value);
  } else {
    participantSelection.delete(input.value);
  }
});

elements.selectAll.addEventListener("click", () => {
  if (!canEdit() || !state) return;
  participantsTouched = true;
  participantSelection = new Set(state.people.map((person) => person.id));
  renderExpenseForm();
});

elements.clearAll.addEventListener("click", () => {
  if (!canEdit()) return;
  participantsTouched = true;
  participantSelection = new Set();
  renderExpenseForm();
});

elements.expenseForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  if (!canEdit() || !state) return;

  const title = elements.expenseTitle.value.trim().slice(0, 70);
  const amount = amountFromInput(elements.expenseAmount.value);
  const payerId = elements.expensePayer.value;
  const participantIds = Array.from(participantSelection);

  if (!title) {
    showToast("지출 내용을 입력해 주세요.");
    return;
  }
  if (!amount) {
    showToast("금액을 입력해 주세요.");
    return;
  }
  if (!payerId) {
    showToast("결제자를 선택해 주세요.");
    return;
  }
  if (participantIds.length === 0) {
    showToast("n빵 참여자를 한 명 이상 선택해 주세요.");
    return;
  }

  const nextExpense = {
    id: makeId("e_"),
    title,
    amount,
    payerId,
    participantIds,
    memo: elements.expenseMemo.value.trim().slice(0, 140),
    spentAt: elements.expenseDate.value || localDateString(),
    createdAt: new Date().toISOString()
  };

  try {
    await saveTrip({ ...state, expenses: [nextExpense, ...state.expenses] });
    elements.expenseTitle.value = "";
    elements.expenseAmount.value = "";
    elements.expenseMemo.value = "";
    elements.expenseDate.value = localDateString();
    participantsTouched = false;
    participantSelection = new Set(state.people.map((person) => person.id));
    renderExpenseForm();
  } catch (error) {
    showToast(error.message);
  }
});

elements.expenseList.addEventListener("click", async (event) => {
  const editButton = event.target.closest("[data-edit-expense]");
  if (editButton && canEdit() && state) {
    editingExpenseId = editButton.dataset.editExpense;
    renderExpenses();
    return;
  }

  const cancelButton = event.target.closest("[data-cancel-expense-edit]");
  if (cancelButton && canEdit() && state) {
    editingExpenseId = "";
    renderExpenses();
    return;
  }

  const button = event.target.closest("[data-remove-expense]");
  if (!button || !canEdit() || !state) return;

  try {
    if (editingExpenseId === button.dataset.removeExpense) {
      editingExpenseId = "";
    }
    await saveTrip({
      ...state,
      expenses: state.expenses.filter((expense) => expense.id !== button.dataset.removeExpense)
    });
  } catch (error) {
    showToast(error.message);
  }
});

elements.expenseList.addEventListener("submit", async (event) => {
  const form = event.target.closest("[data-edit-expense-form]");
  if (!form || !canEdit() || !state) return;
  event.preventDefault();

  const expenseId = form.dataset.editExpenseForm;
  const currentExpense = state.expenses.find((expense) => expense.id === expenseId);
  if (!currentExpense) return;

  const title = form.querySelector("[data-edit-title]").value.trim().slice(0, 70);
  const amount = amountFromInput(form.querySelector("[data-edit-amount]").value);
  const payerId = form.querySelector("[data-edit-payer]").value;
  const participantIds = Array.from(form.querySelectorAll("[data-edit-participant]:checked"))
    .map((input) => input.value);

  if (!title) {
    showToast("지출 내용을 입력해 주세요.");
    return;
  }
  if (!amount) {
    showToast("금액을 입력해 주세요.");
    return;
  }
  if (!payerId) {
    showToast("결제자를 선택해 주세요.");
    return;
  }
  if (participantIds.length === 0) {
    showToast("n빵 참여자를 한 명 이상 선택해 주세요.");
    return;
  }

  const previousEditingId = editingExpenseId;
  editingExpenseId = "";

  try {
    await saveTrip({
      ...state,
      expenses: state.expenses.map((expense) => (
        expense.id === expenseId
          ? {
              ...expense,
              title,
              amount,
              payerId,
              participantIds,
              memo: form.querySelector("[data-edit-memo]").value.trim().slice(0, 140),
              spentAt: form.querySelector("[data-edit-date]").value || localDateString(),
              updatedAt: new Date().toISOString()
            }
          : expense
      ))
    });
    showToast("지출을 수정했습니다.");
  } catch (error) {
    editingExpenseId = previousEditingId;
    renderExpenses();
    showToast(error.message);
  }
});

async function start() {
  if (!isConfigured) {
    elements.setupPanel.hidden = false;
    state = normalizeTrip({
      public_id: "",
      name: "새 여행 정산",
      people: [],
      expenses: [],
      version: 0,
      updated_at: null
    });
    setLiveStatus("is-offline", "설정 필요");
    document.body.classList.add("is-readonly");
    render();
    return;
  }

  supabase = createClient(config.supabaseUrl, config.supabaseAnonKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false
    }
  });

  try {
    if (!tripId) {
      await createTrip();
      return;
    }
    await loadTrip();
    connectRealtime();
  } catch (error) {
    setLiveStatus("is-offline", "오류");
    showToast(error.message);
  }
}

start();
