const assert = require("assert");

function isDateKey(value) {
  return /^\d{4}-\d{2}-\d{2}$/.test(String(value || ""))
    && !Number.isNaN(Date.parse(`${value}T00:00:00Z`));
}

function addDateDays(value, days) {
  const date = new Date(`${value}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function dateRangeKeys(startDate, endDate) {
  if (!isDateKey(startDate) || !isDateKey(endDate) || startDate > endDate) return [];
  const dates = [];
  let current = startDate;
  while (current <= endDate && dates.length < 366) {
    dates.push(current);
    current = addDateDays(current, 1);
  }
  return dates;
}

function expenseAllocationDates(expense) {
  if (!expense.spreadAcrossDays) return [expense.scheduleDate].filter(isDateKey);
  return dateRangeKeys(
    expense.allocationStartDate || expense.lodgingStartDate || expense.scheduleDate,
    expense.allocationEndDate || expense.lodgingEndDate || expense.allocationStartDate || expense.scheduleDate
  );
}

function expenseAllocationBreakdown(expense) {
  const dates = expenseAllocationDates(expense);
  const total = Math.round(Number(expense.amount) || 0);
  const baseAmount = Math.floor(total / dates.length);
  const remainder = total - baseAmount * dates.length;
  return dates.map((date, index) => ({
    date,
    amount: baseAmount + (index < remainder ? 1 : 0)
  }));
}

function expenseShares(amount, participantIds, payerId) {
  const baseShare = Math.floor(amount / participantIds.length);
  const remainder = amount % participantIds.length;
  if (remainder === 0) return new Map(participantIds.map((id) => [id, baseShare]));
  if (participantIds.includes(payerId)) {
    const nonPayerShare = Math.ceil(amount / participantIds.length);
    const payerShare = amount - nonPayerShare * (participantIds.length - 1);
    return new Map(participantIds.map((id) => [id, id === payerId ? payerShare : nonPayerShare]));
  }
  return new Map(participantIds.map((id, index) => [id, baseShare + (index < remainder ? 1 : 0)]));
}

function distributeAmountByWeights(total, weights) {
  const base = Math.floor(total / weights.length);
  let remainder = total - base * weights.length;
  return weights.map(() => {
    const amount = base + (remainder > 0 ? 1 : 0);
    remainder -= remainder > 0 ? 1 : 0;
    return amount;
  });
}

function expenseShareForPerson(expense, personId) {
  return expense.items.reduce((total, item) => {
    const participantIds = item.participantIds?.length ? item.participantIds : expense.participantIds;
    if (!participantIds.includes(personId)) return total;
    return total + (expenseShares(item.amount, participantIds, expense.payerId).get(personId) || 0);
  }, 0);
}

function perspectiveBreakdown(expense, personId) {
  const dates = expenseAllocationDates(expense);
  const amounts = distributeAmountByWeights(expenseShareForPerson(expense, personId), dates.map(() => 1));
  return dates.map((date, index) => ({ date, amount: amounts[index] }));
}

function inferMajorCategory(category = "", title = "") {
  const titleText = String(title || "").toLowerCase();
  const categoryText = String(category || "").toLowerCase();
  if (/(교통|이동|택시|버스|기차|항공|비행|지하철|렌트|주차|transport|taxi|train|flight)/.test(titleText)) return "transport";
  if (/(교통|이동|transport)/.test(categoryText)) return "transport";
  if (/(숙소|숙박|lodg|hotel)/.test(categoryText)) return "lodging";
  if (/(식비|음식|식사|food|meal)/.test(categoryText)) return "food";
  if (/(숙소|숙박|호텔|리조트|게스트하우스|호스텔|에어비앤비|lodg|hotel)/.test(titleText)) return "lodging";
  if (/(식비|음식|식사|점심|저녁|아침|간식|야식|카페|밥|food|meal|restaurant)/.test(titleText)) return "food";
  return "other";
}

function inferMealSlot(title = "") {
  const text = String(title).toLowerCase();
  if (/(아침|조식|breakfast)/.test(text)) return "breakfast";
  if (/(점심|중식|lunch)/.test(text)) return "lunch";
  if (/(저녁|석식|dinner)/.test(text)) return "dinner";
  if (/(간식|카페|디저트|snack|dessert|cafe)/.test(text)) return "snack";
  return "food-other";
}

function canonicalMealSlot(slot = "") {
  return slot === "late-night" ? "food-other" : slot;
}

function normalizeMealOrder(tokens) {
  return Array.from(new Set(tokens.map((token) => (
    token === "meal:late-night" ? "meal:food-other" : token
  ))));
}

function normalizeMealExpenseOrderSlots(slotOrders) {
  const normalized = {};
  for (const [rawSlot, expenseIds] of Object.entries(slotOrders)) {
    const slot = canonicalMealSlot(rawSlot);
    normalized[slot] = Array.from(new Set([...(normalized[slot] || []), ...expenseIds]));
  }
  return normalized;
}

function insertAtDropIndex(items, value, requestedIndex) {
  const originalIndex = items.indexOf(value);
  const filtered = items.filter((item) => item !== value);
  let index = Math.max(0, Math.min(Number(requestedIndex) || 0, items.length));
  if (originalIndex >= 0 && originalIndex < index) index -= 1;
  filtered.splice(Math.min(index, filtered.length), 0, value);
  return filtered;
}

function fullDropIndex(visibleItems, fullItems, requestedIndex) {
  const index = Math.max(0, Math.min(Number(requestedIndex) || 0, visibleItems.length));
  const nextVisible = visibleItems[index];
  if (nextVisible && fullItems.includes(nextVisible)) return fullItems.indexOf(nextVisible);
  const previousVisible = visibleItems[index - 1];
  if (previousVisible && fullItems.includes(previousVisible)) return fullItems.indexOf(previousVisible) + 1;
  return fullItems.length;
}

function movedAllocationRange(expense, sourceDate, targetDate) {
  let startDate = expense.allocationStartDate || expense.lodgingStartDate || expense.scheduleDate;
  let endDate = expense.allocationEndDate || expense.lodgingEndDate || startDate;
  if (!expense.spreadAcrossDays || sourceDate === targetDate) return { startDate, endDate };
  if (targetDate < startDate) startDate = targetDate;
  else if (targetDate > endDate) endDate = targetDate;
  else if (sourceDate === startDate) startDate = targetDate;
  else if (sourceDate === endDate) endDate = targetDate;
  else if (targetDate > sourceDate) startDate = targetDate;
  else if (targetDate < sourceDate) endDate = targetDate;
  return startDate <= endDate
    ? { startDate, endDate }
    : { startDate: targetDate, endDate: targetDate };
}

function normalizedCardLabel(value = "") {
  return String(value || "").trim().replace(/\s+/g, "").toLowerCase();
}

function expenseCardCopy(expense, primaryLabel) {
  const title = String(expense.title || "").trim();
  const category = String(expense.category || "").trim();
  const primaryKey = normalizedCardLabel(primaryLabel);
  const titleKey = normalizedCardLabel(title);
  const categoryKey = normalizedCardLabel(category);
  return {
    title: titleKey && titleKey !== primaryKey ? title : "",
    category: categoryKey && categoryKey !== primaryKey && categoryKey !== titleKey ? category : ""
  };
}

const dates = dateRangeKeys("2026-07-16", "2026-07-20");
assert.deepStrictEqual(dates, [
  "2026-07-16",
  "2026-07-17",
  "2026-07-18",
  "2026-07-19",
  "2026-07-20"
]);
assert.deepStrictEqual(dateRangeKeys("2026-07-20", "2026-07-16"), []);

assert.strictEqual(inferMajorCategory("교통", "공항버스"), "transport");
assert.strictEqual(inferMajorCategory("숙소", "루앙프라방 호텔"), "lodging");
assert.strictEqual(inferMajorCategory("식비", "택시비(숙소→은행)"), "transport");
assert.strictEqual(inferMajorCategory("식비", "호텔 조식"), "food");
assert.strictEqual(inferMajorCategory("식비", "둘째 날 저녁"), "food");
assert.strictEqual(inferMajorCategory("관광", "입장권"), "other");
assert.strictEqual(inferMealSlot("둘째 날 점심"), "lunch");
assert.strictEqual(inferMealSlot("카페와 디저트"), "snack");
assert.strictEqual(inferMealSlot("시장 식비"), "food-other");
assert.strictEqual(inferMealSlot("여행 마지막 야식"), "food-other");
assert.strictEqual(canonicalMealSlot("late-night"), "food-other");
assert.deepStrictEqual(
  normalizeMealOrder(["meal:late-night", "meal:food-other", "expense:1"]),
  ["meal:food-other", "expense:1"]
);
assert.deepStrictEqual(
  normalizeMealExpenseOrderSlots({ "late-night": ["meal-1"], "food-other": ["meal-2", "meal-1"] }),
  { "food-other": ["meal-1", "meal-2"] }
);
assert.deepStrictEqual(insertAtDropIndex(["a", "b", "c"], "c", 0), ["c", "a", "b"]);
assert.deepStrictEqual(insertAtDropIndex(["a", "b", "c"], "a", 3), ["b", "c", "a"]);
assert.deepStrictEqual(insertAtDropIndex(["a", "b"], "c", 1), ["a", "c", "b"]);
assert.strictEqual(fullDropIndex(["visible-a", "visible-b"], ["hidden-a", "visible-a", "hidden-b", "visible-b"], 1), 3);
assert.strictEqual(fullDropIndex(["visible-a", "visible-b"], ["hidden-a", "visible-a", "hidden-b", "visible-b"], 2), 4);
assert.deepStrictEqual(expenseCardCopy({ title: "숙소", category: "숙소" }, "숙소"), { title: "", category: "" });
assert.deepStrictEqual(
  expenseCardCopy({ title: "비엔티안 호텔", category: "숙소" }, "숙소"),
  { title: "비엔티안 호텔", category: "" }
);

const lodging = {
  id: "hotel-1",
  amount: 300000,
  scheduleDate: "2026-07-16",
  spreadAcrossDays: true,
  allocationStartDate: "2026-07-16",
  allocationEndDate: "2026-07-19",
  lodgingStartDate: "2026-07-16",
  lodgingEndDate: "2026-07-19"
};
const displayedDays = expenseAllocationDates(lodging)
  .filter((date) => dates.includes(date));
assert.strictEqual(displayedDays.length, 4);
assert.strictEqual([lodging].reduce((sum, expense) => sum + expense.amount, 0), 300000);

const rental = {
  id: "rental-1",
  amount: 10000,
  scheduleDate: "2026-07-16",
  spreadAcrossDays: true,
  allocationStartDate: "2026-07-16",
  allocationEndDate: "2026-07-18"
};
const rentalBreakdown = expenseAllocationBreakdown(rental);
assert.deepStrictEqual(rentalBreakdown, [
  { date: "2026-07-16", amount: 3334 },
  { date: "2026-07-17", amount: 3333 },
  { date: "2026-07-18", amount: 3333 }
]);
assert.strictEqual(rentalBreakdown.reduce((sum, item) => sum + item.amount, 0), rental.amount);
const fourDayRental = {
  ...rental,
  allocationStartDate: "2026-07-16",
  allocationEndDate: "2026-07-19"
};
assert.deepStrictEqual(
  movedAllocationRange(fourDayRental, "2026-07-17", "2026-07-18"),
  { startDate: "2026-07-18", endDate: "2026-07-19" }
);
assert.deepStrictEqual(
  movedAllocationRange(fourDayRental, "2026-07-18", "2026-07-17"),
  { startDate: "2026-07-16", endDate: "2026-07-17" }
);
assert.deepStrictEqual(
  movedAllocationRange(fourDayRental, "2026-07-19", "2026-07-18"),
  { startDate: "2026-07-16", endDate: "2026-07-18" }
);
assert.deepStrictEqual(
  movedAllocationRange(fourDayRental, "2026-07-17", "2026-07-20"),
  { startDate: "2026-07-16", endDate: "2026-07-20" }
);

const sameDayExpense = {
  id: "same-day-1",
  amount: 27500,
  scheduleDate: "2026-07-17",
  spreadAcrossDays: true,
  allocationStartDate: "2026-07-17",
  allocationEndDate: "2026-07-17"
};
assert.deepStrictEqual(expenseAllocationBreakdown(sameDayExpense), [
  { date: "2026-07-17", amount: 27500 }
]);

const personalizedExpense = {
  amount: 10000,
  payerId: "p1",
  participantIds: ["p1", "p2", "p3"],
  scheduleDate: "2026-07-16",
  spreadAcrossDays: true,
  allocationStartDate: "2026-07-16",
  allocationEndDate: "2026-07-18",
  items: [{ amount: 10000, participantIds: ["p1", "p2", "p3"] }]
};
assert.strictEqual(expenseShareForPerson(personalizedExpense, "p1"), 3332);
assert.strictEqual(expenseShareForPerson(personalizedExpense, "p2"), 3334);
assert.deepStrictEqual(perspectiveBreakdown(personalizedExpense, "p2"), [
  { date: "2026-07-16", amount: 1112 },
  { date: "2026-07-17", amount: 1111 },
  { date: "2026-07-18", amount: 1111 }
]);
assert.strictEqual(
  perspectiveBreakdown(personalizedExpense, "p2").reduce((sum, item) => sum + item.amount, 0),
  expenseShareForPerson(personalizedExpense, "p2")
);

const payerOnlyExpense = {
  amount: 9000,
  payerId: "p1",
  participantIds: ["p2", "p3"],
  scheduleDate: "2026-07-17",
  items: [{ amount: 9000, participantIds: ["p2", "p3"] }]
};
assert.strictEqual(expenseShareForPerson(payerOnlyExpense, "p1"), 0);
assert.strictEqual(payerOnlyExpense.payerId === "p1" || expenseShareForPerson(payerOnlyExpense, "p1") > 0, true);

const crossingLodging = {
  id: "hotel-2",
  amount: 180000,
  scheduleDate: "2026-07-14",
  spreadAcrossDays: true,
  allocationStartDate: "2026-07-14",
  allocationEndDate: "2026-07-17",
  lodgingStartDate: "2026-07-14",
  lodgingEndDate: "2026-07-17"
};
const crossingDisplayedDays = expenseAllocationDates(crossingLodging)
  .filter((date) => dates.includes(date));
assert.deepStrictEqual(crossingDisplayedDays, ["2026-07-16", "2026-07-17"]);
assert.strictEqual(crossingDisplayedDays[0], "2026-07-16");
assert.deepStrictEqual(expenseAllocationDates(lodging), [
  "2026-07-16",
  "2026-07-17",
  "2026-07-18",
  "2026-07-19"
]);

const expenses = [
  lodging,
  { id: "meal-1", amount: 45000, scheduleDate: "2026-07-17" },
  { id: "old-1", amount: 10000, scheduleDate: "2026-07-10" }
];
const outside = expenses.filter((expense) => !dates.includes(expense.scheduleDate)
  && !expenseAllocationDates(expense).some((date) => dates.includes(date)));
assert.deepStrictEqual(outside.map((expense) => expense.id), ["old-1"]);

console.log("itinerary tests passed");
