const assert = require("assert");
const { calculateSummary } = require("../server");

const trip = {
  people: [
    { id: "a", name: "민수" },
    { id: "b", name: "지연" },
    { id: "c", name: "하나" }
  ],
  expenses: [
    {
      id: "e1",
      title: "숙소",
      amount: 90000,
      payerId: "a",
      participantIds: ["a", "b", "c"]
    },
    {
      id: "e2",
      title: "와인",
      amount: 30000,
      payerId: "b",
      participantIds: ["a", "b"]
    }
  ]
};

const summary = calculateSummary(trip);

assert.strictEqual(summary.total, 120000);
assert.deepStrictEqual(
  summary.people.map((person) => [person.id, person.paid, person.share, person.balance]),
  [
    ["a", 90000, 45000, 45000],
    ["b", 30000, 45000, -15000],
    ["c", 0, 30000, -30000]
  ]
);
assert.deepStrictEqual(
  summary.settlements.map((item) => [item.fromId, item.toId, item.amount]),
  [
    ["c", "a", 30000],
    ["b", "a", 15000]
  ]
);

console.log("settlement tests passed");
