const assert = require("assert");

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

    const participantIds = Array.from(new Set(expense.participantIds || []))
      .filter((id) => peopleById.has(id));

    if (participantIds.length === 0) {
      continue;
    }

    total += amount;
    balances.set(expense.payerId, balances.get(expense.payerId) + amount);
    paidTotals.set(expense.payerId, paidTotals.get(expense.payerId) + amount);

    const shares = expenseShares(amount, participantIds, expense.payerId);

    participantIds.forEach((id) => {
      const share = shares.get(id) || 0;
      balances.set(id, balances.get(id) - share);
      shareTotals.set(id, shareTotals.get(id) + share);
    });
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

const completedSummary = calculateSummary({
  ...trip,
  completedSettlements: [
    { fromId: "c", toId: "a", amount: 30000 }
  ]
});

assert.deepStrictEqual(
  completedSummary.people.map((person) => [person.id, person.balance, person.completedSent, person.completedReceived]),
  [
    ["a", 15000, 0, 30000],
    ["b", -15000, 0, 0],
    ["c", 0, 30000, 0]
  ]
);
assert.deepStrictEqual(
  completedSummary.settlements.map((item) => [item.fromId, item.toId, item.amount]),
  [
    ["b", "a", 15000]
  ]
);

const roundedSummary = calculateSummary({
  people: [
    { id: "a", name: "민수" },
    { id: "b", name: "지연" },
    { id: "c", name: "하나" }
  ],
  expenses: [
    {
      id: "e3",
      title: "테스트",
      amount: 100,
      payerId: "a",
      participantIds: ["a", "b", "c"]
    }
  ]
});

assert.deepStrictEqual(
  roundedSummary.people.map((person) => [person.id, person.share, person.balance]),
  [
    ["a", 32, 68],
    ["b", 34, -34],
    ["c", 34, -34]
  ]
);
assert.deepStrictEqual(
  roundedSummary.settlements.map((item) => [item.fromId, item.toId, item.amount]),
  [
    ["b", "a", 34],
    ["c", "a", 34]
  ]
);

console.log("settlement tests passed");
