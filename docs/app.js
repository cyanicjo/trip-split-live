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
  openExport: document.querySelector("#open-export"),
  openImport: document.querySelector("#open-import"),
  newTripLink: document.querySelector("#new-trip-link"),
  copyViewLink: document.querySelector("#copy-view-link"),
  liveStatus: document.querySelector("#live-status"),
  summaryTitle: document.querySelector("#summary-title"),
  summaryCaption: document.querySelector("#summary-caption"),
  totalSpent: document.querySelector("#total-spent"),
  peopleCount: document.querySelector("#people-count"),
  expenseCount: document.querySelector("#expense-count"),
  overseasPanel: document.querySelector("#overseas-panel"),
  overseasEnabled: document.querySelector("#overseas-enabled"),
  overseasQuickEnabled: document.querySelector("#overseas-quick-enabled"),
  toggleOverseasPanel: document.querySelector("#toggle-overseas-panel"),
  overseasBody: document.querySelector("#overseas-body"),
  overseasForm: document.querySelector("#overseas-form"),
  currencyOne: document.querySelector("#currency-one"),
  currencyOneRate: document.querySelector("#currency-one-rate"),
  currencyTwo: document.querySelector("#currency-two"),
  currencyTwoRate: document.querySelector("#currency-two-rate"),
  exchangeForm: document.querySelector("#exchange-form"),
  exchangeFromCurrency: document.querySelector("#exchange-from-currency"),
  exchangeFromAmount: document.querySelector("#exchange-from-amount"),
  exchangeToCurrency: document.querySelector("#exchange-to-currency"),
  exchangeToAmount: document.querySelector("#exchange-to-amount"),
  exchangeDate: document.querySelector("#exchange-date"),
  exchangeMemo: document.querySelector("#exchange-memo"),
  exchangeList: document.querySelector("#exchange-list"),
  peoplePanel: document.querySelector("#people-panel"),
  peopleBody: document.querySelector("#people-body"),
  togglePeoplePanel: document.querySelector("#toggle-people-panel"),
  personForm: document.querySelector("#person-form"),
  personName: document.querySelector("#person-name"),
  personBank: document.querySelector("#person-bank"),
  personAccount: document.querySelector("#person-account"),
  peopleList: document.querySelector("#people-list"),
  openExpenseModal: document.querySelector("#open-expense-modal"),
  expensePanel: document.querySelector(".expense-panel"),
  expenseLaunchLabel: document.querySelector("#expense-launch-label"),
  expenseBackdrop: document.querySelector("#expense-backdrop"),
  closeExpenseModal: document.querySelector("#close-expense-modal"),
  expenseForm: document.querySelector("#expense-form"),
  expenseTitle: document.querySelector("#expense-title"),
  expenseCategory: document.querySelector("#expense-category"),
  categoryName: document.querySelector("#category-name"),
  addCategory: document.querySelector("#add-category"),
  categoryList: document.querySelector("#category-list"),
  expenseCurrencyField: document.querySelector("#expense-currency-field"),
  expenseCurrency: document.querySelector("#expense-currency"),
  expenseAmountLabel: document.querySelector("#expense-amount-label"),
  expenseAmount: document.querySelector("#expense-amount"),
  expenseItemsTotal: document.querySelector("#expense-items-total"),
  expenseItemList: document.querySelector("#expense-item-list"),
  addExpenseItem: document.querySelector("#add-expense-item"),
  expenseRateField: document.querySelector("#expense-rate-field"),
  expenseRate: document.querySelector("#expense-rate"),
  expenseCardKrwField: document.querySelector("#expense-card-krw-field"),
  expenseCardKrw: document.querySelector("#expense-card-krw"),
  expensePayer: document.querySelector("#expense-payer"),
  expenseDate: document.querySelector("#expense-date"),
  expenseMemo: document.querySelector("#expense-memo"),
  participantList: document.querySelector("#participant-list"),
  selectAll: document.querySelector("#select-all"),
  clearAll: document.querySelector("#clear-all"),
  addExpense: document.querySelector("#add-expense"),
  balanceList: document.querySelector("#balance-list"),
  settlementList: document.querySelector("#settlement-list"),
  completedSettlementList: document.querySelector("#completed-settlement-list"),
  expenseFilterStartDate: document.querySelector("#expense-filter-start-date"),
  expenseFilterEndDate: document.querySelector("#expense-filter-end-date"),
  expenseFilterCategory: document.querySelector("#expense-filter-category"),
  clearExpenseFilters: document.querySelector("#clear-expense-filters"),
  expenseList: document.querySelector("#expense-list"),
  dashboardBackdrop: document.querySelector("#dashboard-backdrop"),
  closeDashboard: document.querySelector("#close-dashboard"),
  dashboardList: document.querySelector("#dashboard-list"),
  accountBackdrop: document.querySelector("#account-backdrop"),
  closeAccountModal: document.querySelector("#close-account-modal"),
  accountPersonName: document.querySelector("#account-person-name"),
  accountForm: document.querySelector("#account-form"),
  accountBank: document.querySelector("#account-bank"),
  accountNumber: document.querySelector("#account-number"),
  exportBackdrop: document.querySelector("#export-backdrop"),
  closeExport: document.querySelector("#close-export"),
  exportForm: document.querySelector("#export-form"),
  importBackdrop: document.querySelector("#import-backdrop"),
  closeImport: document.querySelector("#close-import"),
  importForm: document.querySelector("#import-form"),
  importFile: document.querySelector("#import-file"),
  importMappingPanel: document.querySelector("#import-mapping-panel"),
  importMappingGrid: document.querySelector("#import-mapping-grid"),
  refreshImportPreview: document.querySelector("#refresh-import-preview"),
  importPreviewSummary: document.querySelector("#import-preview-summary"),
  importPreview: document.querySelector("#import-preview"),
  resetImport: document.querySelector("#reset-import"),
  saveImport: document.querySelector("#save-import"),
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
let editingAccountPersonId = "";
let openCustomSelect = null;
let csvImportState = {
  fileName: "",
  headers: [],
  rows: [],
  mappings: {}
};

const peopleCollapsedKey = "tripSplitPeopleCollapsed";
let peopleCollapsed = localStorage.getItem(peopleCollapsedKey) === "true";
const overseasCollapsedKey = "tripSplitOverseasCollapsed";
let overseasCollapsed = localStorage.getItem(overseasCollapsedKey) === "true";
const dashboardTripsKey = "tripSplitDashboardTrips";

const exportSectionLabels = {
  summary: "요약",
  expenses: "지출 목록",
  balances: "개인별 차액",
  settlements: "송금표",
  exchange: "환전 기록"
};

const csvImportFields = [
  { key: "spentAt", label: "날짜" },
  { key: "title", label: "내용" },
  { key: "itemTitle", label: "품목" },
  { key: "quantity", label: "수량" },
  { key: "amount", label: "금액/단가", required: true },
  { key: "payerName", label: "결제자", required: true },
  { key: "participantNames", label: "참여자" },
  { key: "category", label: "카테고리" },
  { key: "itemCategory", label: "품목 카테고리" },
  { key: "itemParticipantNames", label: "품목 참여자" },
  { key: "memo", label: "메모" }
];

const csvImportAliases = {
  spentAt: ["날짜", "결제일", "사용일", "date", "spentat", "spentdate"],
  title: ["내용", "지출내용", "항목", "이름", "title", "description", "name"],
  itemTitle: ["품목", "품목명", "상품", "메뉴", "item", "itemname"],
  quantity: ["수량", "개수", "qty", "quantity"],
  amount: ["금액", "단가", "품목단가", "원화금액", "가격", "비용", "amount", "price", "cost"],
  payerName: ["결제자", "낸사람", "결제", "payer", "paidby", "paid"],
  participantNames: ["참여자", "n빵참여자", "엔빵참여자", "정산참여자", "participants", "split", "members"],
  category: ["카테고리", "분류", "category", "type"],
  itemCategory: ["품목카테고리", "품목분류", "itemcategory", "itemtype"],
  itemParticipantNames: ["품목참여자", "품목n빵참여자", "itemparticipants", "itemsplit"],
  memo: ["메모", "비고", "memo", "note", "notes"]
};

const defaultCategories = ["숙소", "교통", "식비", "관광", "쇼핑", "기타"];

const currencyOptions = [
  "USD",
  "JPY",
  "EUR",
  "GBP",
  "CNY",
  "HKD",
  "TWD",
  "THB",
  "LAK",
  "VND",
  "PHP",
  "SGD",
  "MYR",
  "AUD",
  "CAD",
  "CHF"
];

const currencySymbols = {
  KRW: "₩",
  USD: "$",
  JPY: "¥",
  EUR: "€",
  GBP: "£",
  CNY: "¥",
  HKD: "HK$",
  TWD: "NT$",
  THB: "฿",
  LAK: "₭",
  VND: "₫",
  PHP: "₱",
  SGD: "S$",
  MYR: "RM",
  AUD: "A$",
  CAD: "C$",
  CHF: "CHF"
};

const zeroDecimalCurrencies = new Set(["JPY", "LAK", "VND"]);

const defaultOverseasSettings = {
  enabled: false,
  currencies: ["JPY", "USD"],
  rates: {
    JPY: 9.5,
    USD: 1350
  },
  exchangeRecords: []
};

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

function parsePositiveNumber(value) {
  const numeric = Number(String(value).replace(/[^\d.-]/g, ""));
  if (!Number.isFinite(numeric) || numeric <= 0) {
    return null;
  }
  return numeric;
}

function formatRate(value) {
  const numeric = Number(value) || 0;
  return new Intl.NumberFormat("ko-KR", {
    maximumFractionDigits: 4
  }).format(numeric);
}

function currencySymbol(currency) {
  return currencySymbols[currency] || currency;
}

function formatCurrencyAmount(value, currency = "KRW") {
  const numeric = Number(value) || 0;
  if (currency === "KRW") {
    return formatMoney(numeric);
  }

  const formatted = new Intl.NumberFormat("ko-KR", {
    maximumFractionDigits: zeroDecimalCurrencies.has(currency) ? 0 : 2
  }).format(numeric);
  return `${currencySymbol(currency)}${formatted} ${currency}`;
}

function directionalRateDisplay(rateValue, baseCurrency, quoteCurrency, label = "환율") {
  const directRate = Number(rateValue) || 0;
  if (directRate <= 0) {
    return null;
  }

  const shouldInvert = directRate < 1;
  const displayRate = shouldInvert ? 1 / directRate : directRate;
  const displayBaseCurrency = shouldInvert ? quoteCurrency : baseCurrency;
  const displayQuoteCurrency = shouldInvert ? baseCurrency : quoteCurrency;

  return {
    label: `${label} ${formatRate(displayRate)}`,
    direction: `${displayBaseCurrency} 1 = ${displayQuoteCurrency} ${formatRate(displayRate)}`
  };
}

function exchangeRateDisplay(record) {
  const fromAmount = Number(record.fromAmount) || 0;
  const toAmount = Number(record.toAmount) || 0;
  if (fromAmount <= 0 || toAmount <= 0) {
    return null;
  }

  return directionalRateDisplay(
    toAmount / fromAmount,
    record.fromCurrency,
    record.toCurrency,
    "환산"
  );
}

function getPersonName(id) {
  return state?.people.find((person) => person.id === id)?.name || "알 수 없음";
}

function personBankName(person = {}) {
  return String(person.bankName || person.bank || "").trim().slice(0, 30);
}

function personAccountNumber(person = {}) {
  return String(person.accountNumber || person.account || "").trim().slice(0, 80);
}

function personAccountCopyText(person = {}) {
  const accountNumber = personAccountNumber(person);
  const bankName = personBankName(person);
  if (!accountNumber) return "";
  return bankName ? `${accountNumber} ${bankName}` : accountNumber;
}

function personById(id) {
  return state?.people.find((person) => person.id === id);
}

function settlementRecipientHtml(personId, name) {
  const accountCopyText = personAccountCopyText(personById(personId));
  return `
    <span class="settlement-recipient">
      <strong>${escapeHtml(name)}</strong>
      ${accountCopyText ? `<button class="account-copy settlement-account-copy" type="button" data-copy-account="${escapeHtml(personId)}" title="계좌 정보 복사">${escapeHtml(accountCopyText)}</button>` : ""}
    </span>
  `;
}

async function copyAccountFromButton(accountCopyButton) {
  const person = personById(accountCopyButton.dataset.copyAccount);
  const accountCopyText = personAccountCopyText(person);
  if (accountCopyText) {
    await copyText(accountCopyText, "계좌 정보를 복사했습니다.");
  }
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

function uniqueCurrencies(currencies) {
  const result = [];
  for (const currency of currencies) {
    if (currency && !result.includes(currency)) {
      result.push(currency);
    }
  }
  for (const fallback of defaultOverseasSettings.currencies) {
    if (result.length >= 2) break;
    if (!result.includes(fallback)) {
      result.push(fallback);
    }
  }
  return result.slice(0, 2);
}

function normalizeOverseasSettings(settings = {}) {
  const source = settings.overseas || {};
  const currencies = uniqueCurrencies(Array.isArray(source.currencies) ? source.currencies : []);
  const rates = { ...defaultOverseasSettings.rates };
  for (const currency of currencies) {
    const rate = Number(source.rates?.[currency]);
    rates[currency] = Number.isFinite(rate) && rate > 0
      ? rate
      : Number(defaultOverseasSettings.rates[currency]) || 1;
  }

  const exchangeRecords = Array.isArray(source.exchangeRecords)
    ? source.exchangeRecords
      .filter((record) => record && record.id)
      .map((record) => ({
        id: record.id,
        fromCurrency: record.fromCurrency || "KRW",
        fromAmount: Number(record.fromAmount) || 0,
        toCurrency: record.toCurrency || currencies[0],
        toAmount: Number(record.toAmount) || 0,
        memo: record.memo || "",
        exchangedAt: record.exchangedAt || localDateString(),
        createdAt: record.createdAt || new Date().toISOString()
      }))
    : [];

  return {
    enabled: Boolean(source.enabled),
    currencies,
    rates,
    exchangeRecords
  };
}

function normalizeCompletedSettlements(settings = {}) {
  const records = Array.isArray(settings.completedSettlements)
    ? settings.completedSettlements
    : [];

  return records
    .filter((record) => record && record.fromId && record.toId)
    .map((record, index) => ({
      id: record.id || `done_${record.fromId}_${record.toId}_${Math.round(Number(record.amount) || 0)}_${index}`,
      fromId: record.fromId,
      toId: record.toId,
      amount: Math.round(Number(record.amount) || 0),
      completedAt: record.completedAt || record.createdAt || new Date().toISOString()
    }))
    .filter((record) => record.amount > 0 && record.fromId !== record.toId);
}

function normalizeCategories(settings = {}) {
  const source = Array.isArray(settings.categories)
    ? settings.categories
    : defaultCategories;
  const categories = [];

  for (const item of source) {
    const category = String(item || "").trim().slice(0, 20);
    if (category && !categories.includes(category)) {
      categories.push(category);
    }
  }

  return categories;
}

function normalizeSettings(settings = {}) {
  return {
    ...settings,
    overseas: normalizeOverseasSettings(settings),
    completedSettlements: normalizeCompletedSettlements(settings),
    categories: normalizeCategories(settings)
  };
}

function overseasSettings() {
  return state?.settings?.overseas || normalizeOverseasSettings();
}

function completedSettlements() {
  return state?.settings?.completedSettlements || [];
}

function tripCategories() {
  return Array.isArray(state?.settings?.categories)
    ? state.settings.categories
    : [...defaultCategories];
}

function uniqueCategoryList(extraCategories = []) {
  const categories = [];
  for (const category of [...tripCategories(), ...extraCategories]) {
    const value = String(category || "").trim().slice(0, 20);
    if (value && !categories.includes(value)) {
      categories.push(value);
    }
  }
  return categories;
}

function categoryOptionsHtml(selected = "", { includeEmpty = true, extraCategories = [] } = {}) {
  const options = uniqueCategoryList(extraCategories);
  const emptyOption = includeEmpty
    ? `<option value="" ${selected ? "" : "selected"}>카테고리 없음</option>`
    : "";
  return `${emptyOption}${options.map((category) => {
    const selectedAttr = category === selected ? "selected" : "";
    return `<option value="${escapeHtml(category)}" ${selectedAttr}>${escapeHtml(category)}</option>`;
  }).join("")}`;
}

function overseasCurrencies({ includeKrw = false } = {}) {
  const currencies = overseasSettings().currencies || defaultOverseasSettings.currencies;
  return includeKrw ? ["KRW", ...currencies] : currencies;
}

function defaultRateFor(currency) {
  if (currency === "KRW") return 1;
  const settings = overseasSettings();
  return Number(settings.rates?.[currency]) || 1;
}

function createCurrencyOptions(selected, { includeKrw = false } = {}) {
  const options = includeKrw ? ["KRW", ...currencyOptions] : currencyOptions;
  return options.map((currency) => {
    const selectedAttr = currency === selected ? "selected" : "";
    return `<option value="${currency}" ${selectedAttr}>${currency}</option>`;
  }).join("");
}

function customSelectParts(select) {
  const shell = select.nextElementSibling;
  if (!shell?.classList.contains("custom-select")) {
    return null;
  }

  return {
    shell,
    button: shell.querySelector(".custom-select-button"),
    value: shell.querySelector(".custom-select-value"),
    menu: shell.querySelector(".custom-select-menu")
  };
}

function closeCustomSelect() {
  if (!openCustomSelect) return;

  const parts = customSelectParts(openCustomSelect);
  if (parts) {
    parts.shell.classList.remove("is-open");
    parts.button.setAttribute("aria-expanded", "false");
    parts.menu.hidden = true;
  }

  openCustomSelect = null;
}

function selectCustomOption(select, value) {
  select.value = value;
  select.dispatchEvent(new Event("change", { bubbles: true }));
  syncCustomSelect(select);
  closeCustomSelect();
}

function renderCustomSelectOptions(select) {
  const parts = customSelectParts(select);
  if (!parts) return;

  parts.menu.replaceChildren();

  for (const option of Array.from(select.options)) {
    const item = document.createElement("button");
    const isSelected = option.value === select.value;
    item.type = "button";
    item.className = `custom-select-option${isSelected ? " is-selected" : ""}`;
    item.dataset.value = option.value;
    item.disabled = option.disabled;
    item.setAttribute("role", "option");
    item.setAttribute("aria-selected", String(isSelected));
    item.innerHTML = `<span></span><span class="custom-select-check" aria-hidden="true">${isSelected ? "✓" : ""}</span>`;
    item.querySelector("span").textContent = option.textContent;
    item.addEventListener("click", () => selectCustomOption(select, option.value));
    parts.menu.append(item);
  }
}

function syncCustomSelect(select) {
  const parts = customSelectParts(select);
  if (!parts) return;

  const selectedOption = select.selectedOptions[0] || select.options[0];
  parts.value.textContent = selectedOption?.textContent || "선택";
  parts.shell.classList.toggle("is-disabled", select.disabled);
  parts.button.disabled = select.disabled;
  parts.button.tabIndex = select.disabled ? -1 : 0;
  renderCustomSelectOptions(select);
}

function focusCustomOption(select, direction = 1) {
  const parts = customSelectParts(select);
  if (!parts) return;

  const options = Array.from(parts.menu.querySelectorAll(".custom-select-option:not(:disabled)"));
  if (options.length === 0) return;

  const activeIndex = options.indexOf(document.activeElement);
  const selectedIndex = options.findIndex((option) => option.classList.contains("is-selected"));
  const baseIndex = activeIndex >= 0 ? activeIndex : selectedIndex;
  const nextIndex = baseIndex < 0
    ? 0
    : (baseIndex + direction + options.length) % options.length;
  options[nextIndex].focus();
}

function openCustomSelectMenu(select) {
  const parts = customSelectParts(select);
  if (!parts || select.disabled) return;

  if (openCustomSelect && openCustomSelect !== select) {
    closeCustomSelect();
  }

  openCustomSelect = select;
  parts.shell.classList.add("is-open");
  parts.button.setAttribute("aria-expanded", "true");
  parts.menu.hidden = false;
  renderCustomSelectOptions(select);
}

function toggleCustomSelect(select) {
  if (openCustomSelect === select) {
    closeCustomSelect();
  } else {
    openCustomSelectMenu(select);
  }
}

function handleCustomSelectKeydown(event, select) {
  const isOpen = openCustomSelect === select;
  if (event.key === "Escape") {
    closeCustomSelect();
    customSelectParts(select)?.button.focus();
    return;
  }

  if (event.key === "Enter" || event.key === " ") {
    const option = event.target.closest(".custom-select-option");
    event.preventDefault();
    if (option) {
      selectCustomOption(select, option.dataset.value);
    } else {
      toggleCustomSelect(select);
    }
    return;
  }

  if (event.key === "ArrowDown" || event.key === "ArrowUp") {
    event.preventDefault();
    if (!isOpen) {
      openCustomSelectMenu(select);
    }
    focusCustomOption(select, event.key === "ArrowDown" ? 1 : -1);
  }
}

function enhanceCustomSelect(select) {
  if (select.dataset.customSelect === "true") {
    syncCustomSelect(select);
    return;
  }

  const shell = document.createElement("div");
  shell.className = "custom-select";

  const button = document.createElement("button");
  button.type = "button";
  button.className = "custom-select-button";
  button.setAttribute("aria-haspopup", "listbox");
  button.setAttribute("aria-expanded", "false");
  button.innerHTML = `
    <span class="custom-select-value"></span>
    <span class="custom-select-arrow" aria-hidden="true">▾</span>
  `;

  const menu = document.createElement("div");
  menu.className = "custom-select-menu";
  menu.setAttribute("role", "listbox");
  menu.hidden = true;

  shell.append(button, menu);
  select.classList.add("native-select-hidden");
  select.dataset.customSelect = "true";
  select.tabIndex = -1;
  select.setAttribute("aria-hidden", "true");
  select.insertAdjacentElement("afterend", shell);

  button.addEventListener("click", (event) => {
    event.stopPropagation();
    toggleCustomSelect(select);
  });
  shell.addEventListener("keydown", (event) => handleCustomSelectKeydown(event, select));
  select.addEventListener("change", () => syncCustomSelect(select));
  syncCustomSelect(select);
}

function refreshCustomSelects(root = document) {
  for (const select of root.querySelectorAll("select")) {
    enhanceCustomSelect(select);
  }
}

function calculateExpenseAmount({ currency, foreignAmount, exchangeRate, cardKrwAmount }) {
  if (currency === "KRW") {
    return Math.round(Number(foreignAmount) || 0);
  }

  const actualCharge = Number(cardKrwAmount) || 0;
  if (actualCharge > 0) {
    return Math.round(actualCharge);
  }

  return Math.round((Number(foreignAmount) || 0) * (Number(exchangeRate) || 0));
}

function itemLineAmount(quantity, unitAmount, currency = "KRW") {
  const count = Number(quantity) || 0;
  const price = Number(unitAmount) || 0;
  const total = count * price;
  if (currency === "KRW" || zeroDecimalCurrencies.has(currency)) {
    return Math.round(total);
  }
  return Math.round(total * 100) / 100;
}

function formatItemOriginalAmount(value, currency = "KRW") {
  if (currency === "KRW") {
    return formatMoney(value);
  }
  return formatCurrencyAmount(value, currency);
}

function normalizeParticipantIds(ids = []) {
  return Array.from(new Set(Array.isArray(ids) ? ids : []))
    .filter(Boolean);
}

function normalizeExpenseItems(expense = {}) {
  const currency = expense.currency || "KRW";
  const sourceItems = Array.isArray(expense.items) && expense.items.length > 0
    ? expense.items
    : [{
        id: `${expense.id || "legacy"}_item`,
        title: expense.title || "품목",
        quantity: 1,
        unitAmount: currency === "KRW" ? expense.amount : expense.foreignAmount || expense.amount,
        amount: currency === "KRW" ? expense.amount : expense.foreignAmount || expense.amount,
        category: expense.category || "",
        participantIds: []
      }];

  return sourceItems
    .map((item, index) => {
      const quantity = Number(item.quantity) > 0 ? Number(item.quantity) : 1;
      const rawUnitAmount = Number(item.unitAmount) > 0
        ? Number(item.unitAmount)
        : Number(item.amount) > 0
          ? Number(item.amount) / quantity
          : 0;
      const unitAmount = currency === "KRW" || zeroDecimalCurrencies.has(currency)
        ? Math.round(rawUnitAmount)
        : Math.round(rawUnitAmount * 100) / 100;
      const amount = itemLineAmount(quantity, unitAmount, currency);

      return {
        id: item.id || makeId("it_"),
        title: String(item.title || `품목 ${index + 1}`).trim().slice(0, 70) || `품목 ${index + 1}`,
        quantity,
        unitAmount,
        amount,
        category: String(item.category || expense.category || "").trim().slice(0, 20),
        participantIds: normalizeParticipantIds(item.participantIds)
      };
    })
    .filter((item) => item.amount > 0);
}

function expenseItemsTotal(items = []) {
  return items.reduce((sum, item) => sum + (Number(item.amount) || 0), 0);
}

function distributeAmountByWeights(total, weights) {
  const roundedTotal = Math.round(Number(total) || 0);
  const normalizedWeights = weights.map((weight) => Math.max(0, Number(weight) || 0));
  const weightTotal = normalizedWeights.reduce((sum, weight) => sum + weight, 0);
  if (roundedTotal <= 0 || weightTotal <= 0) {
    return normalizedWeights.map(() => 0);
  }

  const allocations = normalizedWeights.map((weight, index) => {
    const exact = (roundedTotal * weight) / weightTotal;
    return {
      index,
      floor: Math.floor(exact),
      fraction: exact - Math.floor(exact)
    };
  });
  let remainder = roundedTotal - allocations.reduce((sum, item) => sum + item.floor, 0);

  allocations
    .slice()
    .sort((a, b) => b.fraction - a.fraction)
    .forEach((item) => {
      if (remainder <= 0) return;
      allocations[item.index].floor += 1;
      remainder -= 1;
    });

  return allocations.map((item) => item.floor);
}

function expenseItemKrwAmounts(expense, items = normalizeExpenseItems(expense)) {
  const currency = expense.currency || "KRW";
  const expenseAmount = Math.round(Number(expense.amount) || 0);
  if (currency === "KRW") {
    return distributeAmountByWeights(expenseAmount, items.map((item) => item.amount));
  }
  return distributeAmountByWeights(expenseAmount, items.map((item) => item.amount));
}

function normalizePeople(people = []) {
  return people
    .filter((person) => person && person.id)
    .map((person) => {
      const accountNumber = personAccountNumber(person);
      const bankName = personBankName(person);
      return {
        ...person,
        id: person.id,
        name: String(person.name || "이름 없음").slice(0, 40),
        bankName,
        accountNumber,
        account: accountNumber
      };
    });
}

function normalizeExpenses(expenses = []) {
  return expenses
    .filter((expense) => expense && expense.id)
    .map((expense) => {
      const category = String(expense.category || "").trim().slice(0, 20);
      const currency = expense.currency || "KRW";
      const items = normalizeExpenseItems({ ...expense, category, currency });
      const itemTotal = expenseItemsTotal(items);
      const foreignAmount = currency === "KRW" ? null : Number(expense.foreignAmount) || itemTotal;
      const amount = Math.round(Number(expense.amount) || calculateExpenseAmount({
        currency,
        foreignAmount: currency === "KRW" ? itemTotal : foreignAmount,
        exchangeRate: expense.exchangeRate || 1,
        cardKrwAmount: expense.cardKrwAmount || null
      }));

      return {
        ...expense,
        category,
        currency,
        amount,
        foreignAmount,
        items
      };
    });
}

function normalizeTrip(row) {
  const people = normalizePeople(Array.isArray(row.people) ? row.people : []);
  const expenses = normalizeExpenses(Array.isArray(row.expenses) ? row.expenses : []);
  const settings = normalizeSettings(row.settings || {});
  return {
    id: row.public_id,
    publicId: row.public_id,
    name: row.name || "새 여행 정산",
    people,
    expenses,
    settings,
    version: row.version || 0,
    updatedAt: row.updated_at,
    summary: calculateSummary({
      people,
      expenses,
      completedSettlements: settings.completedSettlements
    })
  };
}

function expenseShares(amount, participantIds, payerId) {
  const count = participantIds.length;
  const baseShare = Math.floor(amount / count);
  const remainder = amount % count;

  if (remainder === 0) {
    return new Map(participantIds.map((id) => [id, baseShare]));
  }

  if (participantIds.includes(payerId)) {
    const nonPayerShare = Math.ceil(amount / count);
    const payerShare = amount - nonPayerShare * (count - 1);
    return new Map(participantIds.map((id) => [
      id,
      id === payerId ? payerShare : nonPayerShare
    ]));
  }

  return new Map(participantIds.map((id, index) => [
    id,
    baseShare + (index < remainder ? 1 : 0)
  ]));
}

function calculateSummary(trip) {
  const people = trip.people || [];
  const peopleById = new Map(people.map((person) => [person.id, person]));
  const balances = new Map(people.map((person) => [person.id, 0]));
  const paidTotals = new Map(people.map((person) => [person.id, 0]));
  const shareTotals = new Map(people.map((person) => [person.id, 0]));
  const completedSentTotals = new Map(people.map((person) => [person.id, 0]));
  const completedReceivedTotals = new Map(people.map((person) => [person.id, 0]));
  let total = 0;

  for (const expense of trip.expenses || []) {
    const amount = Math.round(Number(expense.amount) || 0);
    if (amount <= 0 || !peopleById.has(expense.payerId)) {
      continue;
    }

    const expenseParticipantIds = Array.from(new Set(expense.participantIds || []))
      .filter((id) => peopleById.has(id));

    const items = normalizeExpenseItems(expense);
    const itemAmounts = expenseItemKrwAmounts(expense, items);
    const shareJobs = items.map((item, index) => {
      const participantIds = (item.participantIds?.length ? item.participantIds : expenseParticipantIds)
        .filter((id) => peopleById.has(id));
      return {
        amount: itemAmounts[index] || 0,
        participantIds
      };
    }).filter((job) => job.amount > 0 && job.participantIds.length > 0);

    if (shareJobs.length === 0) {
      continue;
    }

    const appliedAmount = shareJobs.reduce((sum, job) => sum + job.amount, 0);
    total += appliedAmount;
    balances.set(expense.payerId, balances.get(expense.payerId) + appliedAmount);
    paidTotals.set(expense.payerId, paidTotals.get(expense.payerId) + appliedAmount);

    for (const job of shareJobs) {
      const shares = expenseShares(job.amount, job.participantIds, expense.payerId);
      job.participantIds.forEach((id) => {
        const share = shares.get(id) || 0;
        balances.set(id, balances.get(id) - share);
        shareTotals.set(id, shareTotals.get(id) + share);
      });
    }
  }

  for (const record of trip.completedSettlements || []) {
    const amount = Math.round(Number(record.amount) || 0);
    if (
      amount <= 0 ||
      record.fromId === record.toId ||
      !peopleById.has(record.fromId) ||
      !peopleById.has(record.toId)
    ) {
      continue;
    }

    balances.set(record.fromId, balances.get(record.fromId) + amount);
    balances.set(record.toId, balances.get(record.toId) - amount);
    completedSentTotals.set(record.fromId, completedSentTotals.get(record.fromId) + amount);
    completedReceivedTotals.set(record.toId, completedReceivedTotals.get(record.toId) + amount);
  }

  const peopleSummary = people.map((person) => {
    const balance = balances.get(person.id) || 0;
    return {
      id: person.id,
      name: person.name,
      paid: paidTotals.get(person.id) || 0,
      share: shareTotals.get(person.id) || 0,
      completedSent: completedSentTotals.get(person.id) || 0,
      completedReceived: completedReceivedTotals.get(person.id) || 0,
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
    let result;
    const nextSettings = nextState.settings || state.settings || {};
    const settingsChanged = JSON.stringify(nextSettings) !== JSON.stringify(state.settings || {});
    try {
      result = await callRpc("update_trip_state", {
        p_public_id: tripId,
        p_edit_token: editToken,
        p_name: nextState.name,
        p_people: nextState.people,
        p_expenses: nextState.expenses,
        p_settings: nextSettings
      });
    } catch (error) {
      if (error.message.includes("p_settings") || error.message.includes("settings") || error.message.includes("function")) {
        if (settingsChanged) {
          throw new Error("Supabase SQL Editor에서 최신 schema.sql을 다시 실행해야 외화 정산 설정을 저장할 수 있습니다.");
        }
        result = await callRpc("update_trip_state", {
          p_public_id: tripId,
          p_edit_token: editToken,
          p_name: nextState.name,
          p_people: nextState.people,
          p_expenses: nextState.expenses
        });
      } else {
        throw error;
      }
    }
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
  renderOverseasPanel();
  renderPeople();
  renderExpenseForm();
  renderBalances();
  renderSettlements();
  renderExpenses();
  renderDashboard();
  renderAccountModal();
  refreshCustomSelects();
}

function renderHeader() {
  if (document.activeElement !== elements.tripName) {
    elements.tripName.value = state.name;
  }
  elements.tripName.readOnly = !canEdit();
  elements.openImport.disabled = !canEdit();
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
      : settlementCount === 0
        ? "현재 정산은 딱 맞습니다"
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

function renderAccountModal() {
  if (elements.accountBackdrop.hidden) return;

  const person = currentAccountPerson();
  if (!person || !canEdit()) {
    closeAccountModal();
    return;
  }

  elements.accountPersonName.textContent = person.name;
}

function currentAccountPerson() {
  return state?.people.find((person) => person.id === editingAccountPersonId) || null;
}

function openAccountModal(personId) {
  if (!canEdit() || !state) return;
  const person = state.people.find((item) => item.id === personId);
  if (!person) return;

  editingAccountPersonId = personId;
  elements.accountPersonName.textContent = person.name;
  elements.accountBank.value = personBankName(person);
  elements.accountNumber.value = personAccountNumber(person);
  elements.accountBackdrop.hidden = false;
  document.body.classList.add("account-modal-open");
  requestAnimationFrame(() => elements.accountBank.focus());
}

function closeAccountModal() {
  elements.accountBackdrop.hidden = true;
  document.body.classList.remove("account-modal-open");
  editingAccountPersonId = "";
}

function renderOverseasPanel() {
  const overseas = overseasSettings();
  const editable = canEdit();
  const [currencyOne, currencyTwo] = overseas.currencies;
  document.body.classList.toggle("has-overseas", overseas.enabled);
  elements.overseasPanel.hidden = !overseas.enabled;
  elements.overseasEnabled.checked = overseas.enabled;
  elements.overseasQuickEnabled.checked = overseas.enabled;
  elements.overseasEnabled.disabled = !editable;
  elements.overseasQuickEnabled.disabled = !editable;
  elements.overseasBody.hidden = !overseas.enabled || overseasCollapsed;
  elements.overseasPanel.classList.toggle("is-collapsed", overseas.enabled && overseasCollapsed);
  elements.toggleOverseasPanel.setAttribute("aria-expanded", String(overseas.enabled && !overseasCollapsed));
  elements.toggleOverseasPanel.title = overseasCollapsed ? "외화 정산 펼치기" : "외화 정산 접기";
  elements.toggleOverseasPanel.querySelector("span").textContent = overseasCollapsed ? "▾" : "▴";

  elements.currencyOne.innerHTML = createCurrencyOptions(currencyOne);
  elements.currencyTwo.innerHTML = createCurrencyOptions(currencyTwo);
  elements.currencyOne.value = currencyOne;
  elements.currencyTwo.value = currencyTwo;
  elements.currencyOneRate.value = overseas.rates[currencyOne] || "";
  elements.currencyTwoRate.value = overseas.rates[currencyTwo] || "";

  for (const input of elements.overseasForm.elements) {
    input.disabled = !editable;
  }
  for (const input of elements.exchangeForm.elements) {
    input.disabled = !editable || !overseas.enabled;
  }

  const exchangeCurrencies = overseasCurrencies({ includeKrw: true });
  const previousFromCurrency = elements.exchangeFromCurrency.value || "KRW";
  const previousToCurrency = elements.exchangeToCurrency.value || currencyOne;
  elements.exchangeFromCurrency.innerHTML = exchangeCurrencies.map((currency) => (
    `<option value="${currency}">${currency}</option>`
  )).join("");
  elements.exchangeToCurrency.innerHTML = exchangeCurrencies.map((currency) => (
    `<option value="${currency}">${currency}</option>`
  )).join("");

  if (!elements.exchangeDate.value) {
    elements.exchangeDate.value = localDateString();
  }
  elements.exchangeFromCurrency.value = exchangeCurrencies.includes(previousFromCurrency)
    ? previousFromCurrency
    : "KRW";
  elements.exchangeToCurrency.value = exchangeCurrencies.includes(previousToCurrency)
    ? previousToCurrency
    : currencyOne;
  if (elements.exchangeFromCurrency.value === elements.exchangeToCurrency.value) {
    elements.exchangeToCurrency.value = elements.exchangeFromCurrency.value === currencyOne ? currencyTwo : currencyOne;
  }

  renderExchangeList();
}

function renderExchangeList() {
  const records = overseasSettings().exchangeRecords || [];
  if (records.length === 0) {
    elements.exchangeList.className = "exchange-list empty-state";
    elements.exchangeList.textContent = "저장된 환전 기록이 없습니다.";
    return;
  }

  elements.exchangeList.className = "exchange-list";
  elements.exchangeList.innerHTML = records.map((record) => {
    const from = formatCurrencyAmount(record.fromAmount, record.fromCurrency);
    const to = formatCurrencyAmount(record.toAmount, record.toCurrency);
    const rate = exchangeRateDisplay(record);
    return `
      <article class="exchange-item">
        <div class="exchange-main">
          <strong>${escapeHtml(from)}</strong>
          <span>→</span>
          <strong>${escapeHtml(to)}</strong>
        </div>
        <div class="expense-meta">
          <span>${escapeHtml(record.exchangedAt || "")}</span>
          ${rate ? `
            <span class="exchange-rate-chip">
              <strong>${escapeHtml(rate.label)}</strong>
              <small>${escapeHtml(rate.direction)}</small>
            </span>
          ` : ""}
          ${record.memo ? `<span>${escapeHtml(record.memo)}</span>` : ""}
        </div>
        ${canEdit() ? `<button class="expense-delete" type="button" title="환전 기록 삭제" aria-label="환전 기록 삭제" data-remove-exchange="${escapeHtml(record.id)}">×</button>` : ""}
      </article>
    `;
  }).join("");
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
  elements.peopleList.innerHTML = state.people.map((person) => {
    const accountCopyText = personAccountCopyText(person);
    return `
      <div class="person-chip">
        <div class="person-main">
          <span class="person-name">${escapeHtml(person.name)}</span>
          ${accountCopyText ? `
            <span class="account-line">
              <button class="account-copy" type="button" data-copy-account="${person.id}" title="계좌 정보 복사">${escapeHtml(accountCopyText)}</button>
            </span>
          ` : ""}
        </div>
        ${canEdit() ? `
          <div class="person-actions">
            <button class="text-button account-edit" type="button" data-edit-person-account="${person.id}">계좌</button>
            <button type="button" title="${escapeHtml(person.name)} 삭제" aria-label="${escapeHtml(person.name)} 삭제" data-remove-person="${person.id}">×</button>
          </div>
        ` : ""}
      </div>
    `;
  }).join("");
}

function renderCategoryControls({ disableExpenseCategory = false } = {}) {
  const editable = canEdit();
  const categories = tripCategories();
  const currentCategory = elements.expenseCategory.value;
  elements.expenseCategory.innerHTML = categoryOptionsHtml(currentCategory);
  elements.expenseCategory.value = categories.includes(currentCategory) ? currentCategory : "";
  elements.expenseCategory.disabled = !editable || disableExpenseCategory;
  elements.categoryName.disabled = !editable;
  elements.addCategory.disabled = !editable;

  if (categories.length === 0) {
    elements.categoryList.className = "category-list empty-state";
    elements.categoryList.textContent = "사용 중인 카테고리가 없습니다.";
    return;
  }

  elements.categoryList.className = "category-list";
  elements.categoryList.innerHTML = categories.map((category) => `
    <span class="category-chip">
      <span>${escapeHtml(category)}</span>
      ${editable ? `<button type="button" title="${escapeHtml(category)} 삭제" aria-label="${escapeHtml(category)} 삭제" data-remove-category="${escapeHtml(category)}">×</button>` : ""}
    </span>
  `).join("");
}

function renderExpenseForm() {
  const hasPeople = state.people.length > 0;
  const editable = canEdit();
  const overseas = overseasSettings();
  elements.openExpenseModal.disabled = !editable || !hasPeople;
  elements.expenseLaunchLabel.textContent = !editable
    ? "보기 전용"
    : hasPeople
      ? "지출 추가"
      : "친구를 먼저 추가";
  elements.personName.disabled = !editable;
  elements.personBank.disabled = !editable;
  elements.personAccount.disabled = !editable;
  elements.personForm.querySelector("button").disabled = !editable;
  elements.addExpense.disabled = !editable || !hasPeople;
  elements.expenseTitle.disabled = !editable || !hasPeople;
  elements.expenseCategory.disabled = !editable || !hasPeople;
  elements.expenseCurrency.disabled = !editable || !hasPeople;
  elements.expenseAmount.disabled = !editable || !hasPeople;
  elements.addExpenseItem.disabled = !editable || !hasPeople;
  elements.expenseRate.disabled = !editable || !hasPeople;
  elements.expenseCardKrw.disabled = !editable || !hasPeople;
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

  renderCategoryControls({ disableExpenseCategory: !hasPeople });

  elements.expenseCurrencyField.hidden = !overseas.enabled;
  const currentCurrency = elements.expenseCurrency.value || overseas.currencies[0];
  elements.expenseCurrency.innerHTML = overseasCurrencies({ includeKrw: true }).map((currency) => (
    `<option value="${currency}">${currency}</option>`
  )).join("");
  elements.expenseCurrency.value = overseasCurrencies({ includeKrw: true }).includes(currentCurrency)
    ? currentCurrency
    : overseas.currencies[0];
  syncExpenseCurrencyFields();

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

  renderExpenseItemInputs({
    container: elements.expenseItemList,
    totalElement: elements.expenseItemsTotal,
    amountInput: elements.expenseAmount,
    currency: elements.expenseCurrency.value || "KRW",
    defaultCategory: elements.expenseCategory.value,
    defaultParticipantIds: Array.from(participantSelection),
    editable
  });
}

function defaultExpenseItem({ category = "", participantIds = [] } = {}) {
  return {
    id: makeId("it_"),
    title: "",
    quantity: 1,
    unitAmount: "",
    amount: 0,
    category,
    participantIds
  };
}

function itemParticipantOptionsHtml(selectedIds = [], disabled = false) {
  const selected = new Set(selectedIds);
  return state.people.map((person) => `
    <label class="participant-option item-participant-option">
      <input type="checkbox" value="${person.id}" data-expense-item-participant ${selected.has(person.id) ? "checked" : ""} ${disabled ? "disabled" : ""}>
      <span>${escapeHtml(person.name)}</span>
    </label>
  `).join("");
}

function expenseItemRowHtml(item, index, {
  currency = "KRW",
  defaultCategory = "",
  editable = true
} = {}) {
  const category = item.category || defaultCategory || "";
  const useDefaultParticipants = !item.participantIds || item.participantIds.length === 0;
  const disabled = editable ? "" : "disabled";
  const removable = index > 0 ? "" : "disabled";
  const unitLabel = currency === "KRW" ? "단가" : `${currency} 단가`;

  return `
    <article class="expense-item-row" data-expense-item-row data-item-id="${escapeHtml(item.id || makeId("it_"))}">
      <div class="expense-item-grid">
        <label>
          <span>품목명</span>
          <input data-expense-item-title type="text" maxlength="70" value="${escapeHtml(item.title || "")}" placeholder="예: 파스타" autocomplete="off" ${disabled}>
        </label>
        <label>
          <span>수량</span>
          <input data-expense-item-quantity type="text" inputmode="decimal" value="${escapeHtml(item.quantity || 1)}" autocomplete="off" ${disabled}>
        </label>
        <label>
          <span>${escapeHtml(unitLabel)}</span>
          <input data-expense-item-unit type="text" inputmode="decimal" value="${escapeHtml(item.unitAmount || "")}" placeholder="예: 18000" autocomplete="off" ${disabled}>
        </label>
        <label>
          <span>카테고리</span>
          <select data-expense-item-category ${disabled}>${categoryOptionsHtml(category, { extraCategories: [category] })}</select>
        </label>
        <button class="expense-delete expense-item-remove" type="button" title="품목 삭제" aria-label="품목 삭제" data-remove-expense-item ${removable}>×</button>
      </div>
      <label class="item-default-participants">
        <input type="checkbox" data-expense-item-default-participants ${useDefaultParticipants ? "checked" : ""} ${disabled}>
        <span>이 품목은 지출 전체 참여자와 같이 나눔</span>
      </label>
      <div class="participant-list item-participants" ${useDefaultParticipants ? "hidden" : ""}>
        ${itemParticipantOptionsHtml(item.participantIds || [], !editable)}
      </div>
    </article>
  `;
}

function readExpenseItemsFromContainer(container, { currency = "KRW", defaultCategory = "" } = {}) {
  return Array.from(container.querySelectorAll("[data-expense-item-row]")).map((row, index) => {
    const quantity = parsePositiveNumber(row.querySelector("[data-expense-item-quantity]")?.value) || 1;
    const unitAmount = parsePositiveNumber(row.querySelector("[data-expense-item-unit]")?.value) || 0;
    const useDefaultParticipants = row.querySelector("[data-expense-item-default-participants]")?.checked !== false;
    const participantIds = useDefaultParticipants
      ? []
      : Array.from(row.querySelectorAll("[data-expense-item-participant]:checked")).map((input) => input.value);

    return {
      id: row.dataset.itemId || makeId("it_"),
      title: row.querySelector("[data-expense-item-title]")?.value.trim().slice(0, 70) || "",
      quantity,
      unitAmount,
      amount: itemLineAmount(quantity, unitAmount, currency),
      category: row.querySelector("[data-expense-item-category]")?.value.trim().slice(0, 20) || defaultCategory,
      participantIds,
      useDefaultParticipants,
      index
    };
  });
}

function syncExpenseItemsTotal({
  container = elements.expenseItemList,
  totalElement = elements.expenseItemsTotal,
  amountInput = elements.expenseAmount,
  currency = elements.expenseCurrency.value || "KRW",
  defaultCategory = elements.expenseCategory.value
} = {}) {
  const items = readExpenseItemsFromContainer(container, { currency, defaultCategory });
  const total = expenseItemsTotal(items);
  const formatted = formatItemOriginalAmount(total, currency);
  if (amountInput) {
    amountInput.value = total > 0 ? formatted : "";
  }
  if (totalElement) {
    totalElement.textContent = `합계 ${formatted}`;
  }
  return { items, total };
}

function renderExpenseItemInputs({
  container,
  totalElement,
  amountInput,
  currency = "KRW",
  defaultCategory = "",
  defaultParticipantIds = [],
  editable = true,
  items = null
}) {
  const currentItems = Array.isArray(items)
    ? items
    : readExpenseItemsFromContainer(container, { currency, defaultCategory });
  const nextItems = currentItems.length > 0
    ? currentItems
    : [defaultExpenseItem({ category: defaultCategory, participantIds: [] })];

  container.innerHTML = nextItems.map((item, index) => (
    expenseItemRowHtml(item, index, { currency, defaultCategory, defaultParticipantIds, editable })
  )).join("");
  refreshCustomSelects(container);
  syncExpenseItemsTotal({ container, totalElement, amountInput, currency, defaultCategory });
}

function applyBulkCategoryToItems(container, category) {
  for (const select of container.querySelectorAll("[data-expense-item-category]")) {
    select.value = category;
    syncCustomSelect(select);
  }
}

function toggleItemParticipantPicker(row) {
  const useDefault = row.querySelector("[data-expense-item-default-participants]")?.checked !== false;
  const participants = row.querySelector(".item-participants");
  if (participants) {
    participants.hidden = useDefault;
  }
}

function syncEditExpenseItemsTotal(form) {
  const currency = form.querySelector("[data-edit-currency]")?.value || "KRW";
  const defaultCategory = form.querySelector("[data-edit-category]")?.value || "";
  return syncExpenseItemsTotal({
    container: form.querySelector(".expense-item-list"),
    totalElement: form.querySelector("[data-edit-items-total]"),
    amountInput: form.querySelector("[data-edit-amount]"),
    currency,
    defaultCategory
  });
}

function syncExpenseCurrencyFields({ resetRate = false } = {}) {
  const overseas = overseasSettings();
  const currency = overseas.enabled ? elements.expenseCurrency.value : "KRW";
  const isForeign = overseas.enabled && currency !== "KRW";
  elements.expenseAmountLabel.textContent = isForeign ? "외화 총액" : "총액";
  elements.expenseRateField.hidden = !isForeign;
  elements.expenseCardKrwField.hidden = !isForeign;

  if (isForeign && (resetRate || !elements.expenseRate.value)) {
    elements.expenseRate.value = defaultRateFor(currency);
  }
  if (!isForeign) {
    elements.expenseRate.value = "";
    elements.expenseCardKrw.value = "";
  }
  if (elements.expenseItemList) {
    renderExpenseItemInputs({
      container: elements.expenseItemList,
      totalElement: elements.expenseItemsTotal,
      amountInput: elements.expenseAmount,
      currency,
      defaultCategory: elements.expenseCategory.value,
      defaultParticipantIds: Array.from(participantSelection),
      editable: canEdit() && state?.people.length > 0
    });
  }
}

async function saveOverseasSettings(overseas) {
  await saveTrip({
    ...state,
    settings: {
      ...state.settings,
      overseas
    }
  });
}

async function saveCompletedSettlements(records) {
  await saveTrip({
    ...state,
    settings: {
      ...state.settings,
      completedSettlements: normalizeCompletedSettlements({ completedSettlements: records })
    }
  });
}

async function setOverseasEnabled(enabled) {
  if (!canEdit() || !state) return;
  try {
    await saveOverseasSettings({
      ...overseasSettings(),
      enabled
    });
  } catch (error) {
    renderOverseasPanel();
    showToast(error.message);
  }
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
          ${person.completedSent ? `<span>완료 송금 ${formatMoney(person.completedSent)}</span>` : ""}
          ${person.completedReceived ? `<span>완료 수령 ${formatMoney(person.completedReceived)}</span>` : ""}
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
    renderCompletedSettlements();
    return;
  }

  elements.settlementList.className = "settlement-list";
  elements.settlementList.innerHTML = settlements.map((item, index) => `
    <div class="settlement-item">
      <div class="settlement-route">
        <strong>${escapeHtml(item.fromName)}</strong>
        <span> → </span>
        ${settlementRecipientHtml(item.toId, item.toName)}
      </div>
      <div class="settlement-side">
        <div class="settlement-amount">${formatMoney(item.amount)}</div>
        ${canEdit() ? `<button class="text-button" type="button" data-complete-settlement="${index}">완료</button>` : ""}
      </div>
    </div>
  `).join("");
  renderCompletedSettlements();
}

function renderCompletedSettlements() {
  const records = completedSettlements();
  if (records.length === 0) {
    elements.completedSettlementList.hidden = true;
    elements.completedSettlementList.innerHTML = "";
    return;
  }

  elements.completedSettlementList.hidden = false;
  elements.completedSettlementList.innerHTML = `
    <div class="completed-title">완료된 송금</div>
    ${records.map((record) => `
      <div class="completed-settlement-item">
        <div class="settlement-route">
          <strong>${escapeHtml(getPersonName(record.fromId))}</strong>
          <span> → </span>
          ${settlementRecipientHtml(record.toId, getPersonName(record.toId))}
        </div>
        <div class="settlement-side">
          <div class="settlement-amount done">${formatMoney(record.amount)}</div>
          ${canEdit() ? `<button class="text-button" type="button" data-undo-settlement="${escapeHtml(record.id)}">되돌리기</button>` : ""}
        </div>
      </div>
    `).join("")}
  `;
}

function renderExpenseFilters() {
  const selectedStartDate = elements.expenseFilterStartDate.value;
  const selectedEndDate = elements.expenseFilterEndDate.value;
  const selectedCategory = elements.expenseFilterCategory.value;
  const categoryValues = uniqueCategoryList(state.expenses.map((expense) => expense.category));
  elements.expenseFilterCategory.innerHTML = `
    <option value="">전체 카테고리</option>
    ${categoryValues.map((category) => (
      `<option value="${escapeHtml(category)}">${escapeHtml(category)}</option>`
    )).join("")}
  `;
  elements.expenseFilterCategory.value = categoryValues.includes(selectedCategory)
    ? selectedCategory
    : "";

  const disabled = state.expenses.length === 0;
  elements.expenseFilterStartDate.disabled = disabled;
  elements.expenseFilterEndDate.disabled = disabled;
  elements.expenseFilterCategory.disabled = disabled;
  elements.clearExpenseFilters.disabled = !selectedStartDate && !selectedEndDate && !elements.expenseFilterCategory.value;
}

function filteredExpenses() {
  const startDate = elements.expenseFilterStartDate.value;
  const endDate = elements.expenseFilterEndDate.value;
  const category = elements.expenseFilterCategory.value;
  const rangeStart = startDate && endDate && startDate > endDate ? endDate : startDate;
  const rangeEnd = startDate && endDate && startDate > endDate ? startDate : endDate;
  return state.expenses.filter((expense) => {
    const spentAt = expense.spentAt || "";
    const matchesStart = !rangeStart || spentAt >= rangeStart;
    const matchesEnd = !rangeEnd || spentAt <= rangeEnd;
    const matchesCategory = !category || expense.category === category;
    return matchesStart && matchesEnd && matchesCategory;
  });
}

function renderExpenses() {
  if (!canEdit()) {
    editingExpenseId = "";
  }
  renderExpenseFilters();
  const expenses = filteredExpenses();

  if (editingExpenseId && !expenses.some((expense) => expense.id === editingExpenseId)) {
    editingExpenseId = "";
  }

  if (state.expenses.length === 0) {
    elements.expenseList.className = "expense-list empty-state";
    elements.expenseList.textContent = "저장된 지출이 없습니다.";
    refreshCustomSelects();
    return;
  }

  if (expenses.length === 0) {
    elements.expenseList.className = "expense-list empty-state";
    elements.expenseList.textContent = "조건에 맞는 지출이 없습니다.";
    refreshCustomSelects();
    return;
  }

  elements.expenseList.className = "expense-list";
  elements.expenseList.innerHTML = expenses.map((expense) => {
    if (expense.id === editingExpenseId) {
      return renderExpenseEditor(expense);
    }

    const participants = (expense.participantIds || []).map(getPersonName).join(", ");
    const items = normalizeExpenseItems(expense);
    const originalAmount = expenseOriginalText(expense);
    const rate = expenseRateDisplay(expense);
    return `
      <article class="expense-item">
        <div class="expense-main">
          <div class="expense-title">${escapeHtml(expense.title)}</div>
          <div class="expense-amount-stack">
            <div class="expense-amount">${formatMoney(expense.amount)}</div>
            ${originalAmount ? `<div class="expense-original">${escapeHtml(originalAmount)}</div>` : ""}
          </div>
        </div>
        <div class="expense-meta">
          ${expense.category ? `<span>${escapeHtml(expense.category)}</span>` : ""}
          <span>결제 ${escapeHtml(getPersonName(expense.payerId))}</span>
          <span>${escapeHtml(expense.spentAt)}</span>
          <span>${items.length}개 품목</span>
          ${rate ? rate.direction ? `
            <span class="exchange-rate-chip">
              <strong>${escapeHtml(rate.label)}</strong>
              <small>${escapeHtml(rate.direction)}</small>
            </span>
          ` : `<span>${escapeHtml(rate.label)}</span>` : ""}
          <span>${escapeHtml(participants)}</span>
        </div>
        ${expenseItemsSummaryHtml(expense)}
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
  refreshCustomSelects();
}

function expenseOriginalText(expense) {
  if (!expense.currency || expense.currency === "KRW" || !expense.foreignAmount) {
    return "";
  }
  return formatCurrencyAmount(expense.foreignAmount, expense.currency);
}

function expenseItemsSummaryHtml(expense) {
  const items = normalizeExpenseItems(expense);
  if (items.length === 0) return "";
  const currency = expense.currency || "KRW";
  const visibleItems = items.slice(0, 4);
  const hiddenCount = items.length - visibleItems.length;
  return `
    <div class="expense-item-snippets" aria-label="품목 요약">
      ${visibleItems.map((item) => `
        <span>
          <strong>${escapeHtml(item.title)}</strong>
          <small>${escapeHtml(item.quantity)}개 · ${escapeHtml(formatItemOriginalAmount(item.unitAmount, currency))}</small>
        </span>
      `).join("")}
      ${hiddenCount > 0 ? `<span><strong>+${hiddenCount}</strong><small>품목 더 있음</small></span>` : ""}
    </div>
  `;
}

function expenseRateDisplay(expense) {
  if (!expense.currency || expense.currency === "KRW" || !expense.exchangeRate) {
    return null;
  }
  if (expense.cardKrwAmount) {
    return { label: `청구 ${formatMoney(expense.cardKrwAmount)}` };
  }
  return directionalRateDisplay(expense.exchangeRate, expense.currency, "KRW", "환율");
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
      <article class="dashboard-trip${current}" data-open-dashboard-trip="${escapeHtml(trip.publicId)}" tabindex="0">
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

function openExportModal() {
  if (!state) {
    showToast("여행 정보를 불러오는 중입니다.");
    return;
  }

  elements.exportBackdrop.hidden = false;
  document.body.classList.add("export-open");
  elements.closeExport.focus();
}

function closeExportModal() {
  elements.exportBackdrop.hidden = true;
  document.body.classList.remove("export-open");
  elements.openExport.focus();
}

function openExpenseModal() {
  if (!canEdit()) {
    showToast("보기 전용 링크에서는 수정할 수 없습니다.");
    return;
  }
  if (!state?.people.length) {
    showToast("친구를 먼저 추가해 주세요.");
    return;
  }

  renderExpenseForm();
  elements.expenseBackdrop.hidden = false;
  document.body.classList.add("expense-modal-open");
  requestAnimationFrame(() => elements.expenseTitle.focus());
}

function closeExpenseModal() {
  elements.expenseBackdrop.hidden = true;
  document.body.classList.remove("expense-modal-open");
  elements.openExpenseModal.focus();
}

function renderExpenseEditor(expense) {
  const participantIds = new Set(expense.participantIds || []);
  const showFx = overseasSettings().enabled || (expense.currency && expense.currency !== "KRW");
  const currency = expense.currency || "KRW";
  const editCurrencies = Array.from(new Set([...overseasCurrencies({ includeKrw: true }), currency]));
  const items = normalizeExpenseItems(expense);
  const itemTotal = expenseItemsTotal(items);
  const amountValue = currency === "KRW" ? itemTotal : expense.foreignAmount || itemTotal;
  const rateValue = currency === "KRW" ? "" : expense.exchangeRate || defaultRateFor(currency);
  const cardKrwValue = currency === "KRW" ? "" : expense.cardKrwAmount || "";
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
            <span>카테고리</span>
            <select data-edit-category>${categoryOptionsHtml(expense.category || "", { extraCategories: [expense.category] })}</select>
          </label>
          ${showFx ? `
            <label>
              <span>결제 통화</span>
              <select data-edit-currency>${editCurrencies.map((item) => (
                `<option value="${item}" ${item === currency ? "selected" : ""}>${item}</option>`
              )).join("")}</select>
            </label>
          ` : ""}
          <label>
            <span>${showFx && currency !== "KRW" ? "외화 총액" : "총액"}</span>
            <input data-edit-amount type="text" inputmode="numeric" value="${escapeHtml(formatItemOriginalAmount(amountValue, currency))}" autocomplete="off" readonly>
          </label>
          ${showFx ? `
            <label>
              <span>원화 계산 환율</span>
              <input data-edit-rate type="text" inputmode="decimal" value="${escapeHtml(rateValue)}" autocomplete="off">
              <small class="field-help">선택한 통화 1단위를 몇 원으로 계산할지입니다. 예: 1 USD = 1350원.</small>
            </label>
            <label>
              <span>카드 실제 청구액</span>
              <input data-edit-card-krw type="text" inputmode="numeric" value="${escapeHtml(cardKrwValue)}" autocomplete="off">
            </label>
          ` : ""}
          <label>
            <span>결제자</span>
            <select data-edit-payer>${payerOptions}</select>
          </label>
          <label>
            <span>날짜</span>
            <input data-edit-date type="date" value="${escapeHtml(expense.spentAt || localDateString())}">
          </label>
        </div>

        <section class="itemized-section">
          <div class="participant-row">
            <div>
              <div class="field-label">품목</div>
              <div class="items-total" data-edit-items-total>합계 ${escapeHtml(formatItemOriginalAmount(amountValue, currency))}</div>
            </div>
            <button class="text-button" type="button" data-add-edit-item>품목 추가</button>
          </div>
          <div class="expense-item-list">
            ${items.map((item, index) => expenseItemRowHtml(item, index, {
              currency,
              defaultCategory: expense.category || "",
              editable: true
            })).join("")}
          </div>
        </section>

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

function parseCsv(text) {
  const rows = [];
  let row = [];
  let cell = "";
  let quoted = false;
  const source = String(text || "").replace(/^\uFEFF/, "");

  for (let index = 0; index < source.length; index += 1) {
    const char = source[index];
    const next = source[index + 1];

    if (quoted) {
      if (char === '"' && next === '"') {
        cell += '"';
        index += 1;
      } else if (char === '"') {
        quoted = false;
      } else {
        cell += char;
      }
      continue;
    }

    if (char === '"') {
      quoted = true;
    } else if (char === ",") {
      row.push(cell);
      cell = "";
    } else if (char === "\n") {
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
    } else if (char !== "\r") {
      cell += char;
    }
  }

  row.push(cell);
  rows.push(row);
  return rows.filter((items) => items.some((item) => String(item || "").trim()));
}

function normalizeImportHeader(value) {
  return String(value || "")
    .replace(/^\uFEFF/, "")
    .trim()
    .toLowerCase()
    .replace(/[\s_()-]/g, "");
}

function guessCsvImportMappings(headers) {
  const normalized = headers.map(normalizeImportHeader);
  const used = new Set();
  const mappings = {};

  for (const field of csvImportFields) {
    const aliases = csvImportAliases[field.key] || [];
    const foundIndex = normalized.findIndex((header, index) => (
      !used.has(index) &&
      aliases.some((alias) => header === normalizeImportHeader(alias))
    ));

    if (foundIndex >= 0) {
      mappings[field.key] = foundIndex;
      used.add(foundIndex);
    } else {
      mappings[field.key] = -1;
    }
  }

  return mappings;
}

function currentCsvImportMappings() {
  const mappings = {};
  for (const select of elements.importMappingGrid.querySelectorAll("[data-import-field]")) {
    mappings[select.dataset.importField] = select.value === "" ? -1 : Number(select.value);
  }
  return mappings;
}

function csvImportCell(row, fieldKey) {
  const index = Number(csvImportState.mappings[fieldKey]);
  return index >= 0 ? String(row[index] || "").trim() : "";
}

function normalizeImportDate(value) {
  const text = String(value || "").trim();
  if (!text) return "";

  const yyyyFirst = text.match(/^(\d{4})[./-](\d{1,2})[./-](\d{1,2})$/);
  if (yyyyFirst) {
    return [
      yyyyFirst[1],
      yyyyFirst[2].padStart(2, "0"),
      yyyyFirst[3].padStart(2, "0")
    ].join("-");
  }

  const parsed = new Date(text);
  if (Number.isNaN(parsed.getTime())) {
    return "";
  }
  parsed.setMinutes(parsed.getMinutes() - parsed.getTimezoneOffset());
  return parsed.toISOString().slice(0, 10);
}

function splitImportNames(value) {
  const names = [];
  for (const item of String(value || "").split(/[,，、;]/)) {
    const name = item.trim().slice(0, 40);
    if (name && !names.includes(name)) {
      names.push(name);
    }
  }
  return names;
}

function csvImportRowsFromMapping() {
  return csvImportState.rows.map((row, index) => ({
    sourceIndex: index + 2,
    spentAt: normalizeImportDate(csvImportCell(row, "spentAt")),
    title: csvImportCell(row, "title").slice(0, 70),
    itemTitle: csvImportCell(row, "itemTitle").slice(0, 70),
    quantity: csvImportCell(row, "quantity"),
    amount: csvImportCell(row, "amount"),
    payerName: csvImportCell(row, "payerName").slice(0, 40),
    participantNames: csvImportCell(row, "participantNames"),
    category: csvImportCell(row, "category").slice(0, 20),
    itemCategory: csvImportCell(row, "itemCategory").slice(0, 20),
    itemParticipantNames: csvImportCell(row, "itemParticipantNames"),
    memo: csvImportCell(row, "memo").slice(0, 140)
  }));
}

function importExpenseKey({ spentAt, title, amount, payerName }) {
  return [
    spentAt || localDateString(),
    String(title || "CSV 지출").trim().toLowerCase(),
    Math.round(Number(amount) || 0),
    String(payerName || "").trim().toLowerCase()
  ].join("|");
}

function existingImportExpenseKeys() {
  return new Set(state.expenses.map((expense) => importExpenseKey({
    spentAt: expense.spentAt,
    title: expense.title,
    amount: expense.amount,
    payerName: getPersonName(expense.payerId)
  })));
}

function importPreviewStatus(row) {
  const amount = amountFromInput(row.amount);
  const payerName = String(row.payerName || "").trim();
  const messages = [];

  if (!amount) messages.push("금액 필요");
  if (!payerName) messages.push("결제자 필요");
  if (messages.length > 0) {
    return { kind: "error", label: messages.join(", ") };
  }

  if (!row.title || !row.itemTitle || !row.quantity || !row.spentAt || !row.participantNames) {
    return { kind: "warn", label: "기본값 사용" };
  }

  return { kind: "ready", label: "저장 예정" };
}

function renderCsvImportMapping() {
  if (csvImportState.headers.length === 0) {
    elements.importMappingPanel.hidden = true;
    elements.importMappingGrid.innerHTML = "";
    return;
  }

  elements.importMappingPanel.hidden = false;
  elements.importMappingGrid.innerHTML = csvImportFields.map((field) => {
    const selectedIndex = Number(csvImportState.mappings[field.key]);
    const options = [
      `<option value="">사용 안 함</option>`,
      ...csvImportState.headers.map((header, index) => {
        const selected = index === selectedIndex ? "selected" : "";
        return `<option value="${index}" ${selected}>${escapeHtml(header || `컬럼 ${index + 1}`)}</option>`;
      })
    ].join("");

    return `
      <label>
        <span>${escapeHtml(field.label)}${field.required ? " *" : ""}</span>
        <select data-import-field="${field.key}">${options}</select>
      </label>
    `;
  }).join("");
  refreshCustomSelects(elements.importMappingPanel);
}

function renderCsvImportPreview() {
  if (csvImportState.rows.length === 0) {
    elements.importPreviewSummary.className = "import-preview-summary empty-state";
    elements.importPreviewSummary.textContent = "CSV 파일을 선택해 주세요.";
    elements.importPreview.innerHTML = "";
    elements.saveImport.disabled = true;
    return;
  }

  const rows = csvImportRowsFromMapping();
  const statuses = rows.map((row) => importPreviewStatus(row));
  const readyCount = statuses.filter((status) => status.kind === "ready" || status.kind === "warn").length;
  const skipCount = statuses.filter((status) => status.kind === "skip").length;
  const errorCount = statuses.filter((status) => status.kind === "error").length;

  elements.importPreviewSummary.className = "import-preview-summary";
  elements.importPreviewSummary.innerHTML = `
    <strong>${escapeHtml(csvImportState.fileName)}</strong>
    <span>${rows.length}개 행 · 저장 ${readyCount}개 · 중복 ${skipCount}개 · 수정 필요 ${errorCount}개</span>
  `;

  elements.importPreview.innerHTML = `
    <div class="import-table-wrap">
      <table class="import-table">
        <thead>
          <tr>
            <th>상태</th>
            <th>날짜</th>
            <th>내용</th>
            <th>품목</th>
            <th>수량</th>
            <th>금액</th>
            <th>결제자</th>
            <th>참여자</th>
            <th>카테고리</th>
            <th>품목 카테고리</th>
            <th>품목 참여자</th>
            <th>메모</th>
          </tr>
        </thead>
        <tbody>
          ${rows.map((row, index) => {
            const status = statuses[index];
            return `
              <tr data-import-row="${row.sourceIndex}" class="import-row-${status.kind}">
                <td>
                  <span class="import-status ${status.kind}">${escapeHtml(status.label)}</span>
                  <small>${row.sourceIndex}행</small>
                </td>
                <td><input data-import-spent-at type="date" value="${escapeHtml(row.spentAt)}"></td>
                <td><input data-import-title type="text" maxlength="70" value="${escapeHtml(row.title)}" placeholder="CSV 지출"></td>
                <td><input data-import-item-title type="text" maxlength="70" value="${escapeHtml(row.itemTitle)}" placeholder="비우면 내용과 같음"></td>
                <td><input data-import-quantity type="text" inputmode="decimal" value="${escapeHtml(row.quantity)}" placeholder="1"></td>
                <td><input data-import-amount type="text" inputmode="numeric" value="${escapeHtml(row.amount)}" placeholder="필수"></td>
                <td><input data-import-payer type="text" maxlength="40" value="${escapeHtml(row.payerName)}" placeholder="필수"></td>
                <td><input data-import-participants type="text" value="${escapeHtml(row.participantNames)}" placeholder="비우면 전체 참여"></td>
                <td><input data-import-category type="text" maxlength="20" value="${escapeHtml(row.category)}"></td>
                <td><input data-import-item-category type="text" maxlength="20" value="${escapeHtml(row.itemCategory)}"></td>
                <td><input data-import-item-participants type="text" value="${escapeHtml(row.itemParticipantNames)}"></td>
                <td><input data-import-memo type="text" maxlength="140" value="${escapeHtml(row.memo)}"></td>
              </tr>
            `;
          }).join("")}
        </tbody>
      </table>
    </div>
  `;
  elements.saveImport.disabled = readyCount === 0 || !canEdit();
}

function refreshCsvImportPreviewStatuses() {
  const rowElements = Array.from(elements.importPreview.querySelectorAll("[data-import-row]"));
  if (rowElements.length === 0) return;

  let readyCount = 0;
  let skipCount = 0;
  let errorCount = 0;

  for (const rowElement of rowElements) {
    const row = {
      sourceIndex: Number(rowElement.dataset.importRow),
      spentAt: rowElement.querySelector("[data-import-spent-at]").value || "",
      title: rowElement.querySelector("[data-import-title]").value.trim(),
      itemTitle: rowElement.querySelector("[data-import-item-title]").value.trim(),
      quantity: rowElement.querySelector("[data-import-quantity]").value,
      amount: rowElement.querySelector("[data-import-amount]").value,
      payerName: rowElement.querySelector("[data-import-payer]").value.trim(),
      participantNames: rowElement.querySelector("[data-import-participants]").value
    };
    const status = importPreviewStatus(row);
    const statusElement = rowElement.querySelector(".import-status");

    rowElement.className = `import-row-${status.kind}`;
    statusElement.className = `import-status ${status.kind}`;
    statusElement.textContent = status.label;

    if (status.kind === "skip") {
      skipCount += 1;
    } else if (status.kind === "error") {
      errorCount += 1;
    } else {
      readyCount += 1;
    }
  }

  const summary = elements.importPreviewSummary.querySelector("span");
  if (summary) {
    summary.textContent = `${rowElements.length}개 행 · 저장 ${readyCount}개 · 중복 ${skipCount}개 · 수정 필요 ${errorCount}개`;
  }
  elements.saveImport.disabled = readyCount === 0 || !canEdit();
}

function resetCsvImport() {
  csvImportState = {
    fileName: "",
    headers: [],
    rows: [],
    mappings: {}
  };
  elements.importFile.value = "";
  renderCsvImportMapping();
  renderCsvImportPreview();
}

function readCsvImportPreviewRows() {
  return Array.from(elements.importPreview.querySelectorAll("[data-import-row]")).map((row) => ({
    sourceIndex: Number(row.dataset.importRow),
    spentAt: row.querySelector("[data-import-spent-at]").value || "",
    title: row.querySelector("[data-import-title]").value.trim().slice(0, 70),
    itemTitle: row.querySelector("[data-import-item-title]").value.trim().slice(0, 70),
    quantityInput: row.querySelector("[data-import-quantity]").value,
    amountInput: row.querySelector("[data-import-amount]").value,
    payerName: row.querySelector("[data-import-payer]").value.trim().slice(0, 40),
    participantNames: row.querySelector("[data-import-participants]").value,
    category: row.querySelector("[data-import-category]").value.trim().slice(0, 20),
    itemCategory: row.querySelector("[data-import-item-category]").value.trim().slice(0, 20),
    itemParticipantNames: row.querySelector("[data-import-item-participants]").value,
    memo: row.querySelector("[data-import-memo]").value.trim().slice(0, 140)
  }));
}

function buildCsvImportPlan() {
  const rows = readCsvImportPreviewRows();
  const existingKeys = existingImportExpenseKeys();
  const importKeys = new Set();
  const errors = [];
  const skipped = [];
  const preparedGroups = new Map();

  for (const row of rows) {
    const unitAmount = amountFromInput(row.amountInput);
    const payerName = row.payerName;
    if (!unitAmount || !payerName) {
      errors.push(`${row.sourceIndex}행`);
      continue;
    }

    const quantity = parsePositiveNumber(row.quantityInput) || 1;
    const title = row.title || row.itemTitle || "CSV 지출";
    const itemTitle = row.itemTitle || row.title || `품목 ${row.sourceIndex}행`;
    const category = row.category || row.itemCategory || "";
    const itemCategory = row.itemCategory || category;
    const participantNames = splitImportNames(row.participantNames);
    const itemParticipantNames = splitImportNames(row.itemParticipantNames);
    const groupKey = [
      row.spentAt || localDateString(),
      title.trim().toLowerCase(),
      payerName.trim().toLowerCase(),
      participantNames.join(",").toLowerCase(),
      String(row.memo || "").trim().toLowerCase()
    ].join("|");

    if (!preparedGroups.has(groupKey)) {
      preparedGroups.set(groupKey, {
        sourceIndexes: [],
        firstSourceIndex: row.sourceIndex,
        spentAt: row.spentAt || localDateString(),
        title,
        payerName,
        participantNames,
        category,
        memo: row.memo,
        items: []
      });
    }

    const group = preparedGroups.get(groupKey);
    group.sourceIndexes.push(row.sourceIndex);
    if (!group.category && category) group.category = category;
    group.items.push({
      id: makeId("it_"),
      title: itemTitle,
      quantity,
      unitAmount,
      amount: itemLineAmount(quantity, unitAmount, "KRW"),
      category: itemCategory,
      itemParticipantNames,
      sourceIndex: row.sourceIndex
    });
  }

  const preparedRows = [];
  for (const group of preparedGroups.values()) {
    const amount = expenseItemsTotal(group.items);
    const prepared = {
      ...group,
      amount
    };
    const key = importExpenseKey({
      spentAt: prepared.spentAt,
      title: prepared.title,
      amount,
      payerName: prepared.payerName
    });

    if (existingKeys.has(key) || importKeys.has(key)) {
      skipped.push(...group.sourceIndexes);
      continue;
    }

    importKeys.add(key);
    preparedRows.push(prepared);
  }

  if (errors.length > 0) {
    return { errors, skipped, preparedRows: [], people: state.people, expenses: [], categories: tripCategories() };
  }

  const people = [...state.people];
  const peopleByName = new Map(people.map((person) => [person.name.trim(), person]));
  const ensurePerson = (name) => {
    const cleanName = String(name || "").trim().slice(0, 40);
    if (!cleanName) return null;
    const existing = peopleByName.get(cleanName);
    if (existing) return existing;

    const nextPerson = {
      id: makeId("p_"),
      name: cleanName,
      bankName: "",
      accountNumber: "",
      account: "",
      createdAt: new Date().toISOString()
    };
    people.push(nextPerson);
    peopleByName.set(cleanName, nextPerson);
    return nextPerson;
  };

  for (const row of preparedRows) {
    ensurePerson(row.payerName);
    row.participantNames.forEach(ensurePerson);
    row.items.forEach((item) => item.itemParticipantNames.forEach(ensurePerson));
  }

  const categories = uniqueCategoryList(preparedRows.flatMap((row) => [
    row.category,
    ...row.items.map((item) => item.category)
  ]));
  const expenses = preparedRows.map((row) => {
    const payer = ensurePerson(row.payerName);
    const participants = row.participantNames.length > 0
      ? row.participantNames.map(ensurePerson).filter(Boolean)
      : people;
    const items = row.items.map((item) => ({
      id: item.id,
      title: item.title,
      quantity: item.quantity,
      unitAmount: item.unitAmount,
      amount: item.amount,
      category: item.category,
      participantIds: item.itemParticipantNames.length > 0
        ? item.itemParticipantNames.map(ensurePerson).filter(Boolean).map((person) => person.id)
        : []
    }));

    return {
      id: makeId("e_"),
      title: row.title,
      category: row.category,
      amount: row.amount,
      currency: "KRW",
      foreignAmount: null,
      exchangeRate: null,
      cardKrwAmount: null,
      payerId: payer.id,
      participantIds: participants.map((person) => person.id),
      items,
      memo: row.memo,
      spentAt: row.spentAt,
      createdAt: new Date().toISOString()
    };
  });

  return { errors, skipped, preparedRows, people, expenses, categories };
}

function openImportModal() {
  if (!canEdit()) {
    showToast("보기 전용 링크에서는 수정할 수 없습니다.");
    return;
  }
  if (!state) {
    showToast("여행 정보를 불러오는 중입니다.");
    return;
  }

  elements.importBackdrop.hidden = false;
  document.body.classList.add("import-open");
  requestAnimationFrame(() => elements.importFile.focus());
}

function closeImportModal() {
  elements.importBackdrop.hidden = true;
  document.body.classList.remove("import-open");
  elements.openImport.focus();
}

async function copyText(text, message) {
  try {
    await navigator.clipboard.writeText(text);
    showToast(message);
  } catch (error) {
    showToast(text);
  }
}

function exportViewLink() {
  return tripId ? viewLink() : window.location.href;
}

function safeFileName(value) {
  return String(value || "trip")
    .trim()
    .replace(/[\\/:*?"<>|]+/g, "-")
    .replace(/\s+/g, "-")
    .slice(0, 60) || "trip";
}

function exportFileName(extension) {
  return `${safeFileName(state?.name)}-${localDateString()}.${extension}`;
}

function downloadBlob(blob, fileName) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1200);
}

function selectedExportSections() {
  return Array.from(elements.exportForm.querySelectorAll("input[name='section']:checked"))
    .map((input) => input.value);
}

function selectedExportFormat() {
  return elements.exportForm.querySelector("input[name='format']:checked")?.value || "csv";
}

function buildExportData(sections) {
  const overseas = overseasSettings();
  const included = new Set(sections);
  const data = {
    exportedAt: new Date().toISOString(),
    viewLink: exportViewLink(),
    includedSections: sections.map((section) => exportSectionLabels[section] || section),
    trip: {
      name: state.name,
      total: state.summary.total,
      peopleCount: state.people.length,
      expenseCount: state.expenses.length,
      updatedAt: state.updatedAt || ""
    }
  };

  if (included.has("summary")) {
    data.summary = {
      total: state.summary.total,
      peopleCount: state.people.length,
      expenseCount: state.expenses.length,
      settlementCount: state.summary.settlements.length,
      overseasEnabled: overseas.enabled,
      currencies: overseas.enabled ? overseas.currencies : [],
      rates: overseas.enabled ? overseas.rates : {}
    };
  }

  if (included.has("expenses")) {
    data.expenses = state.expenses.map((expense) => {
      const items = normalizeExpenseItems(expense);
      return {
        title: expense.title,
        category: expense.category || "",
        spentAt: expense.spentAt || "",
        payer: getPersonName(expense.payerId),
        amountKrw: Math.round(Number(expense.amount) || 0),
        currency: expense.currency || "KRW",
        foreignAmount: expense.foreignAmount || "",
        exchangeRate: expense.exchangeRate || "",
        cardKrwAmount: expense.cardKrwAmount || "",
        participants: (expense.participantIds || []).map(getPersonName).join(", "),
        memo: expense.memo || "",
        items: items.map((item) => ({
          title: item.title,
          quantity: item.quantity,
          unitAmount: item.unitAmount,
          amount: item.amount,
          category: item.category || expense.category || "",
          participants: item.participantIds?.length
            ? item.participantIds.map(getPersonName).join(", ")
            : ""
        }))
      };
    });
  }

  if (included.has("balances")) {
    data.balances = state.summary.people.map((person) => ({
      name: person.name,
      balance: person.balance,
      paid: person.paid,
      share: person.share,
      completedSent: person.completedSent || 0,
      completedReceived: person.completedReceived || 0
    }));
  }

  if (included.has("settlements")) {
    data.settlements = state.summary.settlements.map((item) => ({
      from: item.fromName,
      to: item.toName,
      amount: item.amount
    }));
    data.completedSettlements = completedSettlements().map((record) => ({
      from: getPersonName(record.fromId),
      to: getPersonName(record.toId),
      amount: record.amount,
      completedAt: record.completedAt || ""
    }));
  }

  if (included.has("exchange")) {
    data.exchangeRecords = (overseas.exchangeRecords || []).map((record) => ({
      exchangedAt: record.exchangedAt || "",
      fromCurrency: record.fromCurrency,
      fromAmount: record.fromAmount,
      toCurrency: record.toCurrency,
      toAmount: record.toAmount,
      memo: record.memo || ""
    }));
  }

  return data;
}

function csvCell(value) {
  const text = String(value ?? "");
  return /[",\n\r]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

function appendCsvSection(rows, title, header, items, mapItem) {
  rows.push([]);
  rows.push([title]);
  rows.push(header);
  if (items.length === 0) {
    rows.push(["기록 없음"]);
    return;
  }
  for (const item of items) {
    rows.push(mapItem(item));
  }
}

function buildCsv(data) {
  const rows = [
    ["여행 이름", data.trip.name],
    ["보기 링크", data.viewLink],
    ["내보낸 시간", data.exportedAt]
  ];

  if (data.summary) {
    appendCsvSection(rows, "요약", ["항목", "값"], [
      ["총 지출", formatMoney(data.summary.total)],
      ["참여자", `${data.summary.peopleCount}명`],
      ["지출 항목", `${data.summary.expenseCount}개`],
      ["송금 수", `${data.summary.settlementCount}개`],
      ["외화 정산", data.summary.overseasEnabled ? "사용" : "미사용"],
      ["외화", data.summary.currencies.join(", ")],
      ["환율", Object.entries(data.summary.rates).map(([currency, rate]) => `${currency} ${rate}`).join(", ")]
    ], (item) => item);
  }

  if (data.expenses) {
    appendCsvSection(
      rows,
      "지출 목록",
      ["날짜", "내용", "품목", "수량", "금액", "품목 금액", "카테고리", "품목 카테고리", "결제자", "원화 총액", "결제 통화", "외화 총액", "원화 계산 환율", "카드 청구액", "참여자", "품목 참여자", "메모"],
      data.expenses.flatMap((expense) => (
        (expense.items?.length ? expense.items : [{
          title: expense.title,
          quantity: 1,
          unitAmount: expense.currency === "KRW" ? expense.amountKrw : expense.foreignAmount,
          amount: expense.currency === "KRW" ? expense.amountKrw : expense.foreignAmount,
          category: expense.category,
          participants: ""
        }]).map((item) => ({ expense, item }))
      )),
      ({ expense, item }) => [
        expense.spentAt,
        expense.title,
        item.title,
        item.quantity,
        item.unitAmount,
        item.amount,
        expense.category,
        item.category,
        expense.payer,
        expense.amountKrw,
        expense.currency,
        expense.foreignAmount,
        expense.exchangeRate,
        expense.cardKrwAmount,
        expense.participants,
        item.participants,
        expense.memo
      ]
    );
  }

  if (data.balances) {
    appendCsvSection(
      rows,
      "개인별 차액",
      ["이름", "차액", "낸 돈", "부담액", "완료 송금", "완료 수령"],
      data.balances,
      (person) => [person.name, person.balance, person.paid, person.share, person.completedSent, person.completedReceived]
    );
  }

  if (data.settlements) {
    appendCsvSection(
      rows,
      "남은 송금표",
      ["보낼 사람", "받을 사람", "금액"],
      data.settlements,
      (item) => [item.from, item.to, item.amount]
    );
  }

  if (data.completedSettlements) {
    appendCsvSection(
      rows,
      "완료된 송금",
      ["보낸 사람", "받은 사람", "금액", "완료 시간"],
      data.completedSettlements,
      (item) => [item.from, item.to, item.amount, item.completedAt]
    );
  }

  if (data.exchangeRecords) {
    appendCsvSection(
      rows,
      "환전 기록",
      ["날짜", "낸 통화", "낸 금액", "받은 통화", "받은 금액", "메모"],
      data.exchangeRecords,
      (record) => [
        record.exchangedAt,
        record.fromCurrency,
        record.fromAmount,
        record.toCurrency,
        record.toAmount,
        record.memo
      ]
    );
  }

  return `\uFEFF${rows.map((row) => row.map(csvCell).join(",")).join("\n")}`;
}

function buildPdfLines(data) {
  const lines = [
    { text: data.trip.name, type: "title" },
    { text: `보기 링크: ${data.viewLink}`, type: "meta" },
    { text: `내보낸 시간: ${new Date(data.exportedAt).toLocaleString("ko-KR")}`, type: "meta" },
    { text: "", type: "space" }
  ];

  const addSection = (title) => {
    lines.push({ text: title, type: "section" });
  };
  const addLine = (text) => {
    lines.push({ text, type: "body" });
  };
  const addEmpty = (text) => {
    lines.push({ text, type: "empty" });
  };
  const endSection = () => {
    lines.push({ text: "", type: "space" });
  };

  if (data.summary) {
    addSection("요약");
    addLine(`총 지출: ${formatMoney(data.summary.total)}`);
    addLine(`참여자: ${data.summary.peopleCount}명`);
    addLine(`지출 항목: ${data.summary.expenseCount}개`);
    addLine(`송금 수: ${data.summary.settlementCount}개`);
    addLine(`외화 정산: ${data.summary.overseasEnabled ? "사용" : "미사용"}`);
    if (data.summary.overseasEnabled) {
      addLine(`외화: ${data.summary.currencies.join(", ")}`);
      addLine(`환율: ${Object.entries(data.summary.rates).map(([currency, rate]) => `${currency} ${rate}`).join(", ")}`);
    }
    endSection();
  }

  if (data.expenses) {
    addSection("지출 목록");
    if (data.expenses.length === 0) {
      addEmpty("저장된 지출이 없습니다.");
    } else {
      data.expenses.forEach((expense, index) => {
        const foreign = expense.currency !== "KRW" && expense.foreignAmount
          ? ` / ${formatCurrencyAmount(expense.foreignAmount, expense.currency)}`
          : "";
        const category = expense.category ? `[${expense.category}] ` : "";
        addLine(`${index + 1}. ${expense.spentAt} ${category}${expense.title} - ${formatMoney(expense.amountKrw)}${foreign}`);
        addLine(`   결제자: ${expense.payer} / 참여자: ${expense.participants || "-"}`);
        if (expense.items?.length) {
          expense.items.forEach((item) => {
            const itemAmount = expense.currency === "KRW"
              ? formatMoney(item.amount)
              : formatCurrencyAmount(item.amount, expense.currency);
            const itemParticipants = item.participants ? ` / 참여자: ${item.participants}` : "";
            const itemCategory = item.category ? `[${item.category}] ` : "";
            addLine(`   - ${itemCategory}${item.title}: ${item.quantity}개, ${itemAmount}${itemParticipants}`);
          });
        }
        if (expense.exchangeRate) addLine(`   원화 계산 환율: ${expense.exchangeRate}`);
        if (expense.cardKrwAmount) addLine(`   카드 청구액: ${formatMoney(expense.cardKrwAmount)}`);
        if (expense.memo) addLine(`   메모: ${expense.memo}`);
      });
    }
    endSection();
  }

  if (data.balances) {
    addSection("개인별 차액");
    if (data.balances.length === 0) {
      addEmpty("표시할 차액이 없습니다.");
    } else {
      data.balances.forEach((person) => {
        addLine(`${person.name}: 차액 ${formatMoney(person.balance)}, 낸 돈 ${formatMoney(person.paid)}, 부담액 ${formatMoney(person.share)}`);
        if (person.completedSent || person.completedReceived) {
          addLine(`   완료 송금 ${formatMoney(person.completedSent)}, 완료 수령 ${formatMoney(person.completedReceived)}`);
        }
      });
    }
    endSection();
  }

  if (data.settlements) {
    addSection("남은 송금표");
    if (data.settlements.length === 0) {
      addEmpty("정산할 송금이 없습니다.");
    } else {
      data.settlements.forEach((item) => {
        addLine(`${item.from} → ${item.to}: ${formatMoney(item.amount)}`);
      });
    }
    endSection();
  }

  if (data.completedSettlements) {
    addSection("완료된 송금");
    if (data.completedSettlements.length === 0) {
      addEmpty("완료된 송금이 없습니다.");
    } else {
      data.completedSettlements.forEach((item) => {
        addLine(`${item.from} → ${item.to}: ${formatMoney(item.amount)}`);
      });
    }
    endSection();
  }

  if (data.exchangeRecords) {
    addSection("환전 기록");
    if (data.exchangeRecords.length === 0) {
      addEmpty("저장된 환전 기록이 없습니다.");
    } else {
      data.exchangeRecords.forEach((record, index) => {
        addLine(`${index + 1}. ${record.exchangedAt} ${formatCurrencyAmount(record.fromAmount, record.fromCurrency)} → ${formatCurrencyAmount(record.toAmount, record.toCurrency)}`);
        if (record.memo) addLine(`   메모: ${record.memo}`);
      });
    }
  }

  return lines;
}

function wrapCanvasText(context, text, maxWidth) {
  if (!text) return [""];
  const words = String(text).split(" ");
  const lines = [];
  let current = "";

  const pushLongWord = (word) => {
    let part = "";
    for (const char of word) {
      const test = part + char;
      if (part && context.measureText(test).width > maxWidth) {
        lines.push(part);
        part = char;
      } else {
        part = test;
      }
    }
    return part;
  };

  for (const word of words) {
    const test = current ? `${current} ${word}` : word;
    if (context.measureText(test).width <= maxWidth) {
      current = test;
      continue;
    }
    if (current) {
      lines.push(current);
    }
    current = context.measureText(word).width > maxWidth ? pushLongWord(word) : word;
  }

  if (current) lines.push(current);
  return lines;
}

function dataUrlToBytes(dataUrl) {
  const base64 = dataUrl.split(",")[1] || "";
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes;
}

function createPdfFromJpegs(images) {
  const encoder = new TextEncoder();
  const parts = [];
  const offsets = [0];
  let position = 0;

  const addString = (text) => {
    const bytes = encoder.encode(text);
    parts.push(bytes);
    position += bytes.length;
  };
  const addBytes = (bytes) => {
    parts.push(bytes);
    position += bytes.length;
  };
  const startObject = (id) => {
    offsets[id] = position;
    addString(`${id} 0 obj\n`);
  };

  addString("%PDF-1.4\n");
  startObject(1);
  addString("<< /Type /Catalog /Pages 2 0 R >>\nendobj\n");

  const kids = images.map((_, index) => `${3 + index * 3} 0 R`).join(" ");
  startObject(2);
  addString(`<< /Type /Pages /Kids [${kids}] /Count ${images.length} >>\nendobj\n`);

  images.forEach((image, index) => {
    const pageId = 3 + index * 3;
    const imageId = pageId + 1;
    const contentId = pageId + 2;
    const pageWidth = 595;
    const pageHeight = 842;
    const imageName = `Im${index + 1}`;
    const content = `q\n${pageWidth} 0 0 ${pageHeight} 0 0 cm\n/${imageName} Do\nQ\n`;

    startObject(pageId);
    addString(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${pageWidth} ${pageHeight}] /Resources << /XObject << /${imageName} ${imageId} 0 R >> >> /Contents ${contentId} 0 R >>\nendobj\n`);

    startObject(imageId);
    addString(`<< /Type /XObject /Subtype /Image /Width ${image.width} /Height ${image.height} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${image.bytes.length} >>\nstream\n`);
    addBytes(image.bytes);
    addString("\nendstream\nendobj\n");

    startObject(contentId);
    addString(`<< /Length ${encoder.encode(content).length} >>\nstream\n${content}endstream\nendobj\n`);
  });

  const xrefPosition = position;
  addString(`xref\n0 ${offsets.length}\n`);
  addString("0000000000 65535 f \n");
  for (let id = 1; id < offsets.length; id += 1) {
    addString(`${String(offsets[id]).padStart(10, "0")} 00000 n \n`);
  }
  addString(`trailer\n<< /Size ${offsets.length} /Root 1 0 R >>\nstartxref\n${xrefPosition}\n%%EOF`);

  return new Blob(parts, { type: "application/pdf" });
}

async function buildPdfBlob(data) {
  const lines = buildPdfLines(data);
  const pageWidth = 1240;
  const pageHeight = 1754;
  const margin = 82;
  const maxWidth = pageWidth - margin * 2;
  const pages = [];
  let canvas;
  let context;
  let cursorY;

  const beginPage = () => {
    canvas = document.createElement("canvas");
    canvas.width = pageWidth;
    canvas.height = pageHeight;
    context = canvas.getContext("2d");
    context.fillStyle = "#ffffff";
    context.fillRect(0, 0, pageWidth, pageHeight);
    context.fillStyle = "#1d2428";
    cursorY = margin;
  };
  const finishPage = () => {
    pages.push({
      width: pageWidth,
      height: pageHeight,
      bytes: dataUrlToBytes(canvas.toDataURL("image/jpeg", 0.92))
    });
  };
  const ensureSpace = (height) => {
    if (cursorY + height <= pageHeight - margin) return;
    finishPage();
    beginPage();
  };

  beginPage();

  for (const line of lines) {
    const type = line.type || "body";
    const font = type === "title"
      ? "700 36px sans-serif"
      : type === "section"
        ? "700 26px sans-serif"
        : type === "meta"
          ? "500 18px sans-serif"
          : "400 21px sans-serif";
    const lineHeight = type === "title" ? 48 : type === "section" ? 38 : type === "space" ? 22 : 31;

    if (type === "space") {
      ensureSpace(lineHeight);
      cursorY += lineHeight;
      continue;
    }

    context.font = font;
    context.fillStyle = type === "meta" || type === "empty" ? "#66747b" : "#1d2428";
    const wrapped = wrapCanvasText(context, line.text, maxWidth);
    ensureSpace(wrapped.length * lineHeight + (type === "section" ? 8 : 0));
    for (const wrappedLine of wrapped) {
      context.fillText(wrappedLine, margin, cursorY);
      cursorY += lineHeight;
    }
    if (type === "section") {
      cursorY += 8;
    }
  }

  finishPage();
  return createPdfFromJpegs(pages);
}

async function exportCurrentTrip() {
  if (!state) {
    showToast("여행 정보를 불러오는 중입니다.");
    return false;
  }

  const sections = selectedExportSections();
  if (sections.length === 0) {
    showToast("내보낼 내용을 한 가지 이상 선택해 주세요.");
    return false;
  }

  const data = buildExportData(sections);
  const format = selectedExportFormat();

  if (format === "json") {
    downloadBlob(
      new Blob([JSON.stringify(data, null, 2)], { type: "application/json;charset=utf-8" }),
      exportFileName("json")
    );
  } else if (format === "pdf") {
    const pdfBlob = await buildPdfBlob(data);
    downloadBlob(pdfBlob, exportFileName("pdf"));
  } else {
    downloadBlob(
      new Blob([buildCsv(data)], { type: "text/csv;charset=utf-8" }),
      exportFileName("csv")
    );
  }

  showToast("내보내기 파일을 만들었습니다.");
  return true;
}

elements.expenseDate.value = localDateString();
elements.exchangeDate.value = localDateString();

elements.overseasEnabled.addEventListener("change", () => {
  setOverseasEnabled(elements.overseasEnabled.checked);
});

elements.overseasQuickEnabled.addEventListener("change", () => {
  setOverseasEnabled(elements.overseasQuickEnabled.checked);
});

elements.toggleOverseasPanel.addEventListener("click", () => {
  overseasCollapsed = !overseasCollapsed;
  localStorage.setItem(overseasCollapsedKey, String(overseasCollapsed));
  renderOverseasPanel();
});

elements.currencyOne.addEventListener("change", () => {
  elements.currencyOneRate.value = overseasSettings().rates[elements.currencyOne.value]
    || defaultOverseasSettings.rates[elements.currencyOne.value]
    || "";
});

elements.currencyTwo.addEventListener("change", () => {
  elements.currencyTwoRate.value = overseasSettings().rates[elements.currencyTwo.value]
    || defaultOverseasSettings.rates[elements.currencyTwo.value]
    || "";
});

elements.overseasForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  if (!canEdit() || !state) return;

  const currencyOne = elements.currencyOne.value;
  const currencyTwo = elements.currencyTwo.value;
  const currencyOneRate = parsePositiveNumber(elements.currencyOneRate.value);
  const currencyTwoRate = parsePositiveNumber(elements.currencyTwoRate.value);

  if (currencyOne === currencyTwo) {
    showToast("서로 다른 외화 2개를 선택해 주세요.");
    return;
  }
  if (!currencyOneRate || !currencyTwoRate) {
    showToast("두 외화의 기본 환율을 입력해 주세요.");
    return;
  }

  const previous = overseasSettings();
  try {
    await saveOverseasSettings({
      ...previous,
      enabled: true,
      currencies: [currencyOne, currencyTwo],
      rates: {
        ...previous.rates,
        [currencyOne]: currencyOneRate,
        [currencyTwo]: currencyTwoRate
      }
    });
    syncExpenseCurrencyFields({ resetRate: true });
    showToast("기본 환율을 저장했습니다.");
  } catch (error) {
    showToast(error.message);
  }
});

elements.exchangeForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  if (!canEdit() || !state) return;

  const fromCurrency = elements.exchangeFromCurrency.value;
  const toCurrency = elements.exchangeToCurrency.value;
  const fromAmount = parsePositiveNumber(elements.exchangeFromAmount.value);
  const toAmount = parsePositiveNumber(elements.exchangeToAmount.value);

  if (fromCurrency === toCurrency) {
    showToast("서로 다른 통화를 선택해 주세요.");
    return;
  }
  if (!fromAmount || !toAmount) {
    showToast("환전 금액을 입력해 주세요.");
    return;
  }

  const overseas = overseasSettings();
  const nextRecord = {
    id: makeId("x_"),
    fromCurrency,
    fromAmount,
    toCurrency,
    toAmount,
    memo: elements.exchangeMemo.value.trim().slice(0, 100),
    exchangedAt: elements.exchangeDate.value || localDateString(),
    createdAt: new Date().toISOString()
  };

  try {
    await saveOverseasSettings({
      ...overseas,
      exchangeRecords: [nextRecord, ...(overseas.exchangeRecords || [])]
    });
    elements.exchangeFromAmount.value = "";
    elements.exchangeToAmount.value = "";
    elements.exchangeMemo.value = "";
    elements.exchangeDate.value = localDateString();
    showToast("환전 기록을 추가했습니다.");
  } catch (error) {
    showToast(error.message);
  }
});

elements.exchangeList.addEventListener("click", async (event) => {
  const button = event.target.closest("[data-remove-exchange]");
  if (!button || !canEdit() || !state) return;

  const overseas = overseasSettings();
  try {
    await saveOverseasSettings({
      ...overseas,
      exchangeRecords: (overseas.exchangeRecords || [])
        .filter((record) => record.id !== button.dataset.removeExchange)
    });
    showToast("환전 기록을 삭제했습니다.");
  } catch (error) {
    showToast(error.message);
  }
});

elements.expenseCurrency.addEventListener("change", () => {
  syncExpenseCurrencyFields({ resetRate: true });
});

elements.expenseCategory.addEventListener("change", () => {
  applyBulkCategoryToItems(elements.expenseItemList, elements.expenseCategory.value);
  syncExpenseItemsTotal();
});

elements.addExpenseItem.addEventListener("click", () => {
  if (!canEdit() || !state) return;
  const currency = elements.expenseCurrency.value || "KRW";
  const items = readExpenseItemsFromContainer(elements.expenseItemList, {
    currency,
    defaultCategory: elements.expenseCategory.value
  });
  items.push(defaultExpenseItem({ category: elements.expenseCategory.value }));
  renderExpenseItemInputs({
    container: elements.expenseItemList,
    totalElement: elements.expenseItemsTotal,
    amountInput: elements.expenseAmount,
    currency,
    defaultCategory: elements.expenseCategory.value,
    defaultParticipantIds: Array.from(participantSelection),
    editable: true,
    items
  });
});

elements.expenseItemList.addEventListener("click", (event) => {
  const removeButton = event.target.closest("[data-remove-expense-item]");
  if (!removeButton || !canEdit()) return;
  const rows = Array.from(elements.expenseItemList.querySelectorAll("[data-expense-item-row]"));
  if (rows.length <= 1) return;
  removeButton.closest("[data-expense-item-row]")?.remove();
  syncExpenseItemsTotal();
});

elements.expenseItemList.addEventListener("input", () => {
  syncExpenseItemsTotal();
});

elements.expenseItemList.addEventListener("change", (event) => {
  const row = event.target.closest("[data-expense-item-row]");
  if (row && event.target.matches("[data-expense-item-default-participants]")) {
    toggleItemParticipantPicker(row);
  }
  syncExpenseItemsTotal();
});

elements.openExpenseModal.addEventListener("click", openExpenseModal);

elements.expensePanel.addEventListener("click", (event) => {
  if (event.target.closest(".quick-switch-field")) {
    return;
  }
  openExpenseModal();
});

elements.closeExpenseModal.addEventListener("click", closeExpenseModal);

elements.expenseBackdrop.addEventListener("click", (event) => {
  if (event.target === elements.expenseBackdrop) {
    closeExpenseModal();
  }
});

elements.openDashboard.addEventListener("click", openDashboard);

elements.closeDashboard.addEventListener("click", closeDashboard);

elements.dashboardBackdrop.addEventListener("click", (event) => {
  if (event.target === elements.dashboardBackdrop) {
    closeDashboard();
  }
});

elements.closeAccountModal.addEventListener("click", closeAccountModal);

elements.accountBackdrop.addEventListener("click", (event) => {
  if (event.target === elements.accountBackdrop) {
    closeAccountModal();
  }
});

elements.accountForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  if (!canEdit() || !state) return;

  const person = currentAccountPerson();
  if (!person) return;

  const bankName = elements.accountBank.value.trim().slice(0, 30);
  const accountNumber = elements.accountNumber.value.trim().slice(0, 80);

  try {
    await saveTrip({
      ...state,
      people: state.people.map((item) => (
        item.id === person.id
          ? {
              ...item,
              bankName,
              accountNumber,
              account: accountNumber
            }
          : item
      ))
    });
    closeAccountModal();
    showToast(accountNumber ? "계좌 정보를 저장했습니다." : "계좌 정보를 비웠습니다.");
  } catch (error) {
    showToast(error.message);
  }
});

elements.openExport.addEventListener("click", openExportModal);

elements.closeExport.addEventListener("click", closeExportModal);

elements.exportBackdrop.addEventListener("click", (event) => {
  if (event.target === elements.exportBackdrop) {
    closeExportModal();
  }
});

elements.exportForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const exported = await exportCurrentTrip();
  if (exported) {
    closeExportModal();
  }
});

elements.openImport.addEventListener("click", openImportModal);

elements.closeImport.addEventListener("click", closeImportModal);

elements.importBackdrop.addEventListener("click", (event) => {
  if (event.target === elements.importBackdrop) {
    closeImportModal();
  }
});

elements.importFile.addEventListener("change", async () => {
  const file = elements.importFile.files?.[0];
  if (!file) {
    resetCsvImport();
    return;
  }

  try {
    const rows = parseCsv(await file.text());
    if (rows.length < 2) {
      resetCsvImport();
      showToast("컬럼명과 지출 행이 있는 CSV 파일을 선택해 주세요.");
      return;
    }

    const headers = rows[0].map((header, index) => String(header || `컬럼 ${index + 1}`).trim() || `컬럼 ${index + 1}`);
    csvImportState = {
      fileName: file.name,
      headers,
      rows: rows.slice(1),
      mappings: guessCsvImportMappings(headers)
    };
    renderCsvImportMapping();
    renderCsvImportPreview();
  } catch (error) {
    resetCsvImport();
    showToast("CSV 파일을 읽지 못했습니다.");
  }
});

elements.importMappingGrid.addEventListener("change", () => {
  csvImportState.mappings = currentCsvImportMappings();
  renderCsvImportPreview();
});

elements.refreshImportPreview.addEventListener("click", () => {
  csvImportState.mappings = currentCsvImportMappings();
  renderCsvImportPreview();
});

elements.resetImport.addEventListener("click", resetCsvImport);

elements.importPreview.addEventListener("input", refreshCsvImportPreviewStatuses);

elements.importPreview.addEventListener("change", refreshCsvImportPreviewStatuses);

elements.importForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  if (!canEdit() || !state) return;

  const plan = buildCsvImportPlan();
  if (plan.errors.length > 0) {
    showToast(`${plan.errors.join(", ")}의 금액 또는 결제자를 입력해 주세요.`);
    return;
  }
  if (plan.expenses.length === 0) {
    showToast(plan.skipped.length > 0 ? "모든 행이 중복이라 저장하지 않았습니다." : "저장할 지출이 없습니다.");
    return;
  }

  try {
    await saveTrip({
      ...state,
      people: plan.people,
      expenses: [...plan.expenses, ...state.expenses],
      settings: {
        ...state.settings,
        categories: normalizeCategories({ categories: plan.categories })
      }
    });
    resetCsvImport();
    closeImportModal();
    const skippedText = plan.skipped.length > 0 ? ` 중복 ${plan.skipped.length}개는 건너뛰었습니다.` : "";
    showToast(`CSV 지출 ${plan.expenses.length}개를 저장했습니다.${skippedText}`);
  } catch (error) {
    showToast(error.message);
  }
});

document.addEventListener("keydown", (event) => {
  if (event.key !== "Escape") return;
  if (!elements.accountBackdrop.hidden) {
    closeAccountModal();
    return;
  }
  if (!elements.expenseBackdrop.hidden) {
    closeExpenseModal();
    return;
  }
  if (!elements.exportBackdrop.hidden) {
    closeExportModal();
    return;
  }
  if (!elements.importBackdrop.hidden) {
    closeImportModal();
    return;
  }
  if (!elements.dashboardBackdrop.hidden) {
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
    return;
  }

  if (event.target.closest("a, button")) {
    return;
  }

  const tripItem = event.target.closest("[data-open-dashboard-trip]");
  if (tripItem) {
    const trip = readDashboardTrips()
      .find((item) => item.publicId === tripItem.dataset.openDashboardTrip);
    if (trip) {
      window.location.assign(tripLinkFromRecord(trip));
    }
  }
});

elements.dashboardList.addEventListener("keydown", (event) => {
  if (event.key !== "Enter" && event.key !== " ") {
    return;
  }
  if (event.target.closest("a, button")) {
    return;
  }

  const tripItem = event.target.closest("[data-open-dashboard-trip]");
  if (!tripItem) return;

  const trip = readDashboardTrips()
    .find((item) => item.publicId === tripItem.dataset.openDashboardTrip);
  if (trip) {
    event.preventDefault();
    window.location.assign(tripLinkFromRecord(trip));
  }
});

elements.settlementList.addEventListener("click", async (event) => {
  const accountCopyButton = event.target.closest("[data-copy-account]");
  if (accountCopyButton) {
    await copyAccountFromButton(accountCopyButton);
    return;
  }

  const button = event.target.closest("[data-complete-settlement]");
  if (!button || !canEdit() || !state) return;

  const settlement = state.summary.settlements[Number(button.dataset.completeSettlement)];
  if (!settlement) return;

  try {
    await saveCompletedSettlements([
      {
        id: makeId("done_"),
        fromId: settlement.fromId,
        toId: settlement.toId,
        amount: settlement.amount,
        completedAt: new Date().toISOString()
      },
      ...completedSettlements()
    ]);
    showToast("완료한 송금으로 표시했습니다.");
  } catch (error) {
    showToast(error.message);
  }
});

elements.completedSettlementList.addEventListener("click", async (event) => {
  const accountCopyButton = event.target.closest("[data-copy-account]");
  if (accountCopyButton) {
    await copyAccountFromButton(accountCopyButton);
    return;
  }

  const button = event.target.closest("[data-undo-settlement]");
  if (!button || !canEdit() || !state) return;

  try {
    await saveCompletedSettlements(
      completedSettlements().filter((record) => record.id !== button.dataset.undoSettlement)
    );
    showToast("완료 표시를 되돌렸습니다.");
  } catch (error) {
    showToast(error.message);
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
  const bankName = elements.personBank.value.trim();
  const accountNumber = elements.personAccount.value.trim();
  if (!name) return;

  const nextPeople = [
    ...state.people,
    {
      id: makeId("p_"),
      name: name.slice(0, 40),
      bankName: bankName.slice(0, 30),
      accountNumber: accountNumber.slice(0, 80),
      account: accountNumber.slice(0, 80),
      createdAt: new Date().toISOString()
    }
  ];

  try {
    await saveTrip({ ...state, people: nextPeople });
    elements.personName.value = "";
    elements.personBank.value = "";
    elements.personAccount.value = "";
  } catch (error) {
    showToast(error.message);
  }
});

elements.peopleList.addEventListener("click", async (event) => {
  const accountCopyButton = event.target.closest("[data-copy-account]");
  if (accountCopyButton) {
    await copyAccountFromButton(accountCopyButton);
    return;
  }

  const accountEditButton = event.target.closest("[data-edit-person-account]");
  if (accountEditButton && canEdit() && state) {
    openAccountModal(accountEditButton.dataset.editPersonAccount);
    return;
  }

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

elements.addCategory.addEventListener("click", async () => {
  if (!canEdit() || !state) return;

  const category = elements.categoryName.value.trim().slice(0, 20);
  if (!category) {
    showToast("카테고리 이름을 입력해 주세요.");
    return;
  }

  const categories = tripCategories();
  if (categories.includes(category)) {
    showToast("이미 있는 카테고리입니다.");
    elements.expenseCategory.value = category;
    return;
  }

  try {
    await saveTrip({
      ...state,
      settings: {
        ...state.settings,
        categories: normalizeCategories({ categories: [...categories, category] })
      }
    });
    elements.categoryName.value = "";
    elements.expenseCategory.value = category;
    showToast("카테고리를 추가했습니다.");
  } catch (error) {
    showToast(error.message);
  }
});

elements.categoryName.addEventListener("keydown", (event) => {
  if (event.key === "Enter") {
    event.preventDefault();
    elements.addCategory.click();
  }
});

elements.categoryList.addEventListener("click", async (event) => {
  const button = event.target.closest("[data-remove-category]");
  if (!button || !canEdit() || !state) return;

  const category = button.dataset.removeCategory;
  const nextCategories = tripCategories().filter((item) => item !== category);
  const nextExpenses = state.expenses.map((expense) => (
    expense.category === category ? { ...expense, category: "" } : expense
  ));

  if (elements.expenseCategory.value === category) {
    elements.expenseCategory.value = "";
  }
  if (elements.expenseFilterCategory.value === category) {
    elements.expenseFilterCategory.value = "";
  }

  try {
    await saveTrip({
      ...state,
      expenses: nextExpenses,
      settings: {
        ...state.settings,
        categories: normalizeCategories({ categories: nextCategories })
      }
    });
    showToast("카테고리를 삭제했습니다.");
  } catch (error) {
    showToast(error.message);
  }
});

elements.expenseFilterStartDate.addEventListener("change", () => {
  editingExpenseId = "";
  renderExpenses();
});

elements.expenseFilterEndDate.addEventListener("change", () => {
  editingExpenseId = "";
  renderExpenses();
});

elements.expenseFilterCategory.addEventListener("change", () => {
  editingExpenseId = "";
  renderExpenses();
});

elements.clearExpenseFilters.addEventListener("click", () => {
  elements.expenseFilterStartDate.value = "";
  elements.expenseFilterEndDate.value = "";
  elements.expenseFilterCategory.value = "";
  editingExpenseId = "";
  renderExpenses();
});

elements.expenseForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  if (!canEdit() || !state) return;

  const title = elements.expenseTitle.value.trim().slice(0, 70);
  const category = elements.expenseCategory.value.trim().slice(0, 20);
  const overseas = overseasSettings();
  const currency = overseas.enabled ? elements.expenseCurrency.value : "KRW";
  const itemDrafts = readExpenseItemsFromContainer(elements.expenseItemList, { currency, defaultCategory: category });
  const items = itemDrafts.map((item, index) => ({
    id: item.id || makeId("it_"),
    title: item.title || `품목 ${index + 1}`,
    quantity: item.quantity,
    unitAmount: item.unitAmount,
    amount: item.amount,
    category: item.category,
    participantIds: item.useDefaultParticipants ? [] : item.participantIds
  }));
  const itemTotal = expenseItemsTotal(items);
  const foreignAmount = itemTotal;
  const exchangeRate = currency === "KRW"
    ? 1
    : parsePositiveNumber(elements.expenseRate.value) || defaultRateFor(currency);
  const cardKrwAmount = currency === "KRW"
    ? null
    : amountFromInput(elements.expenseCardKrw.value);
  const amount = calculateExpenseAmount({
    currency,
    foreignAmount,
    exchangeRate,
    cardKrwAmount
  });
  const payerId = elements.expensePayer.value;
  const participantIds = Array.from(participantSelection);

  if (!title) {
    showToast("지출 내용을 입력해 주세요.");
    return;
  }
  if (items.length === 0 || !itemTotal) {
    showToast("품목과 금액을 한 개 이상 입력해 주세요.");
    return;
  }
  if (itemDrafts.some((item) => !item.title || !item.quantity || !item.unitAmount || !item.amount)) {
    showToast("모든 품목의 이름, 수량, 단가를 입력해 주세요.");
    return;
  }
  if (currency !== "KRW" && !exchangeRate) {
    showToast("원화 계산 환율을 입력해 주세요.");
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
  if (itemDrafts.some((item) => !item.useDefaultParticipants && item.participantIds.length === 0)) {
    showToast("품목별 참여자를 쓰는 품목은 참여자를 한 명 이상 선택해 주세요.");
    return;
  }

  const nextExpense = {
    id: makeId("e_"),
    title,
    category,
    amount,
    currency,
    foreignAmount: currency === "KRW" ? null : foreignAmount,
    exchangeRate: currency === "KRW" ? null : exchangeRate,
    cardKrwAmount,
    payerId,
    participantIds,
    items,
    memo: elements.expenseMemo.value.trim().slice(0, 140),
    spentAt: elements.expenseDate.value || localDateString(),
    createdAt: new Date().toISOString()
  };

  try {
    await saveTrip({ ...state, expenses: [nextExpense, ...state.expenses] });
    elements.expenseTitle.value = "";
    elements.expenseAmount.value = "";
    elements.expenseCardKrw.value = "";
    elements.expenseMemo.value = "";
    elements.expenseDate.value = localDateString();
    renderExpenseItemInputs({
      container: elements.expenseItemList,
      totalElement: elements.expenseItemsTotal,
      amountInput: elements.expenseAmount,
      currency: elements.expenseCurrency.value || "KRW",
      defaultCategory: elements.expenseCategory.value,
      defaultParticipantIds: Array.from(participantSelection),
      editable: true,
      items: [defaultExpenseItem({ category: elements.expenseCategory.value })]
    });
    participantsTouched = false;
    participantSelection = new Set(state.people.map((person) => person.id));
    renderExpenseForm();
    closeExpenseModal();
    showToast("지출을 저장했습니다.");
  } catch (error) {
    showToast(error.message);
  }
});

elements.expenseList.addEventListener("click", async (event) => {
  const addItemButton = event.target.closest("[data-add-edit-item]");
  if (addItemButton && canEdit() && state) {
    const form = addItemButton.closest("[data-edit-expense-form]");
    const container = form.querySelector(".expense-item-list");
    const currency = form.querySelector("[data-edit-currency]")?.value || "KRW";
    const defaultCategory = form.querySelector("[data-edit-category]")?.value || "";
    const items = readExpenseItemsFromContainer(container, { currency, defaultCategory });
    items.push(defaultExpenseItem({ category: defaultCategory }));
    renderExpenseItemInputs({
      container,
      totalElement: form.querySelector("[data-edit-items-total]"),
      amountInput: form.querySelector("[data-edit-amount]"),
      currency,
      defaultCategory,
      defaultParticipantIds: Array.from(form.querySelectorAll("[data-edit-participant]:checked")).map((input) => input.value),
      editable: true,
      items
    });
    return;
  }

  const removeItemButton = event.target.closest("[data-remove-expense-item]");
  if (removeItemButton && canEdit() && state) {
    const form = removeItemButton.closest("[data-edit-expense-form]");
    const rows = Array.from(form.querySelectorAll("[data-expense-item-row]"));
    if (rows.length > 1) {
      removeItemButton.closest("[data-expense-item-row]")?.remove();
      syncEditExpenseItemsTotal(form);
    }
    return;
  }

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

elements.expenseList.addEventListener("input", (event) => {
  const form = event.target.closest("[data-edit-expense-form]");
  if (!form || !event.target.closest("[data-expense-item-row]")) return;
  syncEditExpenseItemsTotal(form);
});

elements.expenseList.addEventListener("change", (event) => {
  const form = event.target.closest("[data-edit-expense-form]");
  if (!form) return;

  const itemRow = event.target.closest("[data-expense-item-row]");
  if (itemRow && event.target.matches("[data-expense-item-default-participants]")) {
    toggleItemParticipantPicker(itemRow);
  }

  if (event.target.matches("[data-edit-category]")) {
    applyBulkCategoryToItems(form.querySelector(".expense-item-list"), event.target.value);
  }

  if (event.target.matches("[data-edit-currency]")) {
    const currency = event.target.value;
    const defaultCategory = form.querySelector("[data-edit-category]")?.value || "";
    const container = form.querySelector(".expense-item-list");
    const items = readExpenseItemsFromContainer(container, { currency, defaultCategory });
    renderExpenseItemInputs({
      container,
      totalElement: form.querySelector("[data-edit-items-total]"),
      amountInput: form.querySelector("[data-edit-amount]"),
      currency,
      defaultCategory,
      defaultParticipantIds: Array.from(form.querySelectorAll("[data-edit-participant]:checked")).map((input) => input.value),
      editable: true,
      items
    });
    return;
  }

  if (itemRow || event.target.matches("[data-edit-category]")) {
    syncEditExpenseItemsTotal(form);
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
  const category = form.querySelector("[data-edit-category]").value.trim().slice(0, 20);
  const currency = form.querySelector("[data-edit-currency]")?.value || "KRW";
  const itemDrafts = readExpenseItemsFromContainer(form.querySelector(".expense-item-list"), { currency, defaultCategory: category });
  const items = itemDrafts.map((item, index) => ({
    id: item.id || makeId("it_"),
    title: item.title || `품목 ${index + 1}`,
    quantity: item.quantity,
    unitAmount: item.unitAmount,
    amount: item.amount,
    category: item.category,
    participantIds: item.useDefaultParticipants ? [] : item.participantIds
  }));
  const itemTotal = expenseItemsTotal(items);
  const foreignAmount = itemTotal;
  const exchangeRate = currency === "KRW"
    ? 1
    : parsePositiveNumber(form.querySelector("[data-edit-rate]")?.value) || defaultRateFor(currency);
  const cardKrwAmount = currency === "KRW"
    ? null
    : amountFromInput(form.querySelector("[data-edit-card-krw]")?.value);
  const amount = calculateExpenseAmount({
    currency,
    foreignAmount,
    exchangeRate,
    cardKrwAmount
  });
  const payerId = form.querySelector("[data-edit-payer]").value;
  const participantIds = Array.from(form.querySelectorAll("[data-edit-participant]:checked"))
    .map((input) => input.value);

  if (!title) {
    showToast("지출 내용을 입력해 주세요.");
    return;
  }
  if (items.length === 0 || !itemTotal) {
    showToast("품목과 금액을 한 개 이상 입력해 주세요.");
    return;
  }
  if (itemDrafts.some((item) => !item.title || !item.quantity || !item.unitAmount || !item.amount)) {
    showToast("모든 품목의 이름, 수량, 단가를 입력해 주세요.");
    return;
  }
  if (currency !== "KRW" && !exchangeRate) {
    showToast("원화 계산 환율을 입력해 주세요.");
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
  if (itemDrafts.some((item) => !item.useDefaultParticipants && item.participantIds.length === 0)) {
    showToast("품목별 참여자를 쓰는 품목은 참여자를 한 명 이상 선택해 주세요.");
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
              category,
              amount,
              currency,
              foreignAmount: currency === "KRW" ? null : foreignAmount,
              exchangeRate: currency === "KRW" ? null : exchangeRate,
              cardKrwAmount,
              payerId,
              participantIds,
              items,
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

document.addEventListener("click", (event) => {
  if (!event.target.closest(".custom-select")) {
    closeCustomSelect();
  }
});

document.addEventListener("keydown", (event) => {
  if (event.key === "Escape") {
    closeCustomSelect();
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
      settings: {},
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
