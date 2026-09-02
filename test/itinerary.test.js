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
  if (/(야식|late.?night)/.test(text)) return "late-night";
  return "food-other";
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

const lodging = {
  id: "hotel-1",
  amount: 300000,
  scheduleDate: "2026-07-16",
  lodgingStartDate: "2026-07-16",
  lodgingEndDate: "2026-07-19"
};
const displayedDays = dateRangeKeys(lodging.lodgingStartDate, lodging.lodgingEndDate)
  .filter((date) => dates.includes(date));
assert.strictEqual(displayedDays.length, 4);
assert.strictEqual([lodging].reduce((sum, expense) => sum + expense.amount, 0), 300000);

const crossingLodging = {
  id: "hotel-2",
  amount: 180000,
  scheduleDate: "2026-07-14",
  lodgingStartDate: "2026-07-14",
  lodgingEndDate: "2026-07-17"
};
const crossingDisplayedDays = dateRangeKeys(crossingLodging.lodgingStartDate, crossingLodging.lodgingEndDate)
  .filter((date) => dates.includes(date));
assert.deepStrictEqual(crossingDisplayedDays, ["2026-07-16", "2026-07-17"]);
assert.strictEqual(crossingDisplayedDays[0], "2026-07-16");

const expenses = [
  lodging,
  { id: "meal-1", amount: 45000, scheduleDate: "2026-07-17" },
  { id: "old-1", amount: 10000, scheduleDate: "2026-07-10" }
];
const outside = expenses.filter((expense) => !dates.includes(expense.scheduleDate)
  && !(expense.lodgingStartDate && dateRangeKeys(expense.lodgingStartDate, expense.lodgingEndDate).some((date) => dates.includes(date))));
assert.deepStrictEqual(outside.map((expense) => expense.id), ["old-1"]);

console.log("itinerary tests passed");
