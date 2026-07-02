const pathParts = window.location.pathname.split("/").filter(Boolean);
const tripId = pathParts[0] === "t" ? pathParts[1] : "";

const elements = {
  tripName: document.querySelector("#trip-name"),
  copyLink: document.querySelector("#copy-link"),
  liveStatus: document.querySelector("#live-status"),
  summaryTitle: document.querySelector("#summary-title"),
  summaryCaption: document.querySelector("#summary-caption"),
  totalSpent: document.querySelector("#total-spent"),
  peopleCount: document.querySelector("#people-count"),
  expenseCount: document.querySelector("#expense-count"),
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
  toast: document.querySelector("#toast")
};

let state = null;
let participantSelection = new Set();
let knownPeople = new Set();
let participantsTouched = false;
let toastTimer = null;
let tripNameTimer = null;

const moneyFormatter = new Intl.NumberFormat("ko-KR", {
  style: "currency",
  currency: "KRW",
  maximumFractionDigits: 0
});

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
  }, 2200);
}

function setLiveStatus(kind, text) {
  elements.liveStatus.classList.remove("is-connecting", "is-live", "is-offline");
  elements.liveStatus.classList.add(kind);
  elements.liveStatus.lastChild.textContent = ` ${text}`;
}

async function request(path, options = {}) {
  const response = await fetch(path, {
    headers: {
      "Content-Type": "application/json",
      ...(options.headers || {})
    },
    ...options
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(payload.error || "요청을 처리하지 못했습니다.");
  }
  return payload;
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

  syncParticipantSelection();
  renderHeader();
  renderSummary();
  renderPeople();
  renderExpenseForm();
  renderBalances();
  renderSettlements();
  renderExpenses();
}

function renderHeader() {
  if (document.activeElement !== elements.tripName) {
    elements.tripName.value = state.name;
  }
}

function renderSummary() {
  const peopleCount = state.people.length;
  const expenseCount = state.expenses.length;
  const settlementCount = state.summary.settlements.length;

  elements.totalSpent.textContent = formatMoney(state.summary.total);
  elements.peopleCount.textContent = `${peopleCount}명`;
  elements.expenseCount.textContent = `${expenseCount}개`;

  if (peopleCount === 0) {
    elements.summaryTitle.textContent = "친구를 추가하면 정산이 시작됩니다";
    elements.summaryCaption.textContent = "여행 링크를 공유하고, 각 지출마다 실제 n빵 참여자를 고르면 됩니다.";
  } else if (expenseCount === 0) {
    elements.summaryTitle.textContent = `${peopleCount}명이 준비 중입니다`;
    elements.summaryCaption.textContent = "숙소, 교통, 식비처럼 먼저 낸 사람이 있는 항목을 입력해 주세요.";
  } else if (settlementCount === 0) {
    elements.summaryTitle.textContent = "현재 정산은 딱 맞습니다";
    elements.summaryCaption.textContent = "모두가 각자 부담할 만큼 지출했거나 정산할 차액이 없습니다.";
  } else {
    elements.summaryTitle.textContent = `${settlementCount}번 송금하면 정산 끝`;
    elements.summaryCaption.textContent = "오른쪽 송금표대로 보내면 전체 여행 n빵이 정리됩니다.";
  }
}

function renderPeople() {
  if (state.people.length === 0) {
    elements.peopleList.className = "people-list empty-state";
    elements.peopleList.textContent = "아직 추가된 친구가 없습니다.";
    return;
  }

  elements.peopleList.className = "people-list";
  elements.peopleList.innerHTML = state.people.map((person) => `
    <div class="person-chip">
      <span>${escapeHtml(person.name)}</span>
      <button type="button" title="${escapeHtml(person.name)} 삭제" aria-label="${escapeHtml(person.name)} 삭제" data-remove-person="${person.id}">×</button>
    </div>
  `).join("");
}

function renderExpenseForm() {
  const hasPeople = state.people.length > 0;
  elements.addExpense.disabled = !hasPeople;
  elements.expenseTitle.disabled = !hasPeople;
  elements.expenseAmount.disabled = !hasPeople;
  elements.expensePayer.disabled = !hasPeople;
  elements.expenseDate.disabled = !hasPeople;
  elements.expenseMemo.disabled = !hasPeople;
  elements.selectAll.disabled = !hasPeople;
  elements.clearAll.disabled = !hasPeople;

  const currentPayer = elements.expensePayer.value;
  elements.expensePayer.innerHTML = state.people.map((person) => (
    `<option value="${person.id}">${escapeHtml(person.name)}</option>`
  )).join("");

  if (state.people.some((person) => person.id === currentPayer)) {
    elements.expensePayer.value = currentPayer;
  }

  if (!hasPeople) {
    elements.participantList.className = "participant-list empty-state";
    elements.participantList.textContent = "친구를 먼저 추가해 주세요.";
    return;
  }

  elements.participantList.className = "participant-list";
  elements.participantList.innerHTML = state.people.map((person) => {
    const checked = participantSelection.has(person.id) ? "checked" : "";
    return `
      <label class="participant-option">
        <input type="checkbox" value="${person.id}" ${checked}>
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
  if (state.expenses.length === 0) {
    elements.expenseList.className = "expense-list empty-state";
    elements.expenseList.textContent = "저장된 지출이 없습니다.";
    return;
  }

  elements.expenseList.className = "expense-list";
  elements.expenseList.innerHTML = state.expenses.map((expense) => {
    const participants = expense.participantIds.map(getPersonName).join(", ");
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
          <button class="expense-delete" type="button" title="지출 삭제" aria-label="지출 삭제" data-remove-expense="${expense.id}">×</button>
        </div>
      </article>
    `;
  }).join("");
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function today() {
  const date = new Date();
  date.setMinutes(date.getMinutes() - date.getTimezoneOffset());
  return date.toISOString().slice(0, 10);
}

elements.expenseDate.value = today();

elements.copyLink.addEventListener("click", async () => {
  try {
    await navigator.clipboard.writeText(window.location.href);
    showToast("공유 링크를 복사했습니다.");
  } catch (error) {
    showToast(window.location.href);
  }
});

elements.tripName.addEventListener("input", () => {
  clearTimeout(tripNameTimer);
  tripNameTimer = setTimeout(async () => {
    const name = elements.tripName.value.trim();
    if (!name || name === state?.name) return;
    try {
      await request(`/api/trips/${tripId}`, {
        method: "PATCH",
        body: JSON.stringify({ name })
      });
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

elements.personForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const name = elements.personName.value.trim();
  if (!name) return;

  try {
    await request(`/api/trips/${tripId}/people`, {
      method: "POST",
      body: JSON.stringify({ name })
    });
    elements.personName.value = "";
  } catch (error) {
    showToast(error.message);
  }
});

elements.peopleList.addEventListener("click", async (event) => {
  const button = event.target.closest("[data-remove-person]");
  if (!button) return;

  try {
    await request(`/api/trips/${tripId}/people/${button.dataset.removePerson}`, {
      method: "DELETE"
    });
  } catch (error) {
    showToast(error.message);
  }
});

elements.participantList.addEventListener("change", (event) => {
  const input = event.target.closest("input[type='checkbox']");
  if (!input) return;

  participantsTouched = true;
  if (input.checked) {
    participantSelection.add(input.value);
  } else {
    participantSelection.delete(input.value);
  }
});

elements.selectAll.addEventListener("click", () => {
  participantsTouched = true;
  participantSelection = new Set(state.people.map((person) => person.id));
  renderExpenseForm();
});

elements.clearAll.addEventListener("click", () => {
  participantsTouched = true;
  participantSelection = new Set();
  renderExpenseForm();
});

elements.expenseForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const participantIds = Array.from(participantSelection);

  if (participantIds.length === 0) {
    showToast("n빵 참여자를 한 명 이상 선택해 주세요.");
    return;
  }

  try {
    await request(`/api/trips/${tripId}/expenses`, {
      method: "POST",
      body: JSON.stringify({
        title: elements.expenseTitle.value,
        amount: elements.expenseAmount.value,
        payerId: elements.expensePayer.value,
        participantIds,
        spentAt: elements.expenseDate.value,
        memo: elements.expenseMemo.value
      })
    });
    elements.expenseTitle.value = "";
    elements.expenseAmount.value = "";
    elements.expenseMemo.value = "";
    elements.expenseDate.value = today();
    participantsTouched = false;
    participantSelection = new Set(state.people.map((person) => person.id));
    renderExpenseForm();
  } catch (error) {
    showToast(error.message);
  }
});

elements.expenseList.addEventListener("click", async (event) => {
  const button = event.target.closest("[data-remove-expense]");
  if (!button) return;

  try {
    await request(`/api/trips/${tripId}/expenses/${button.dataset.removeExpense}`, {
      method: "DELETE"
    });
  } catch (error) {
    showToast(error.message);
  }
});

function connectEvents() {
  setLiveStatus("is-connecting", "연결 중");
  const events = new EventSource(`/events/${tripId}`);

  events.addEventListener("open", () => {
    setLiveStatus("is-live", "실시간");
  });

  events.addEventListener("state", (event) => {
    state = JSON.parse(event.data);
    setLiveStatus("is-live", "실시간");
    render();
  });

  events.addEventListener("error", () => {
    setLiveStatus("is-offline", "재연결 중");
  });
}

if (!tripId) {
  window.location.href = "/";
} else {
  connectEvents();
}
