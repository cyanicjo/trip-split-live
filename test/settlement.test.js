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

function normalizeParticipantIds(ids = []) {
  return Array.from(new Set(Array.isArray(ids) ? ids : []))
    .filter(Boolean);
}

function itemLineAmount(quantity, unitAmount) {
  const count = Number(quantity) > 0 ? Number(quantity) : 1;
  const price = Number(unitAmount) || 0;
  return Math.round(count * price);
}

function normalizeExpenseItems(expense = {}) {
  const sourceItems = Array.isArray(expense.items) && expense.items.length > 0
    ? expense.items
    : [{
        id: `${expense.id || "legacy"}_item`,
        title: expense.title || "품목",
        quantity: 1,
        unitAmount: expense.amount,
        amount: expense.amount,
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
      const unitAmount = Math.round(rawUnitAmount);

      return {
        id: item.id || `it_${index}`,
        title: item.title || `품목 ${index + 1}`,
        quantity,
        unitAmount,
        amount: itemLineAmount(quantity, unitAmount),
        category: item.category || expense.category || "",
        participantIds: normalizeParticipantIds(item.participantIds)
      };
    })
    .filter((item) => item.amount > 0);
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
  return distributeAmountByWeights(expense.amount, items.map((item) => item.amount));
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

    const defaultParticipantIds = normalizeParticipantIds(expense.participantIds)
      .filter((id) => peopleById.has(id));

    const items = normalizeExpenseItems(expense);
    const itemAmounts = expenseItemKrwAmounts(expense, items);
    const shareJobs = items.map((item, index) => {
      const participantIds = (item.participantIds.length > 0 ? item.participantIds : defaultParticipantIds)
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

const itemizedSummary = calculateSummary({
  people: [
    { id: "a", name: "민수" },
    { id: "b", name: "지연" },
    { id: "c", name: "하나" }
  ],
  expenses: [
    {
      id: "e4",
      title: "저녁",
      amount: 60000,
      payerId: "a",
      participantIds: ["a", "b", "c"],
      items: [
        {
          id: "i1",
          title: "파스타",
          quantity: 1,
          unitAmount: 30000,
          amount: 30000,
          participantIds: []
        },
        {
          id: "i2",
          title: "와인",
          quantity: 1,
          unitAmount: 30000,
          amount: 30000,
          participantIds: ["a", "b"]
        }
      ]
    }
  ]
});

assert.deepStrictEqual(
  itemizedSummary.people.map((person) => [person.id, person.paid, person.share, person.balance]),
  [
    ["a", 60000, 25000, 35000],
    ["b", 0, 25000, -25000],
    ["c", 0, 10000, -10000]
  ]
);
assert.deepStrictEqual(
  itemizedSummary.settlements.map((item) => [item.fromId, item.toId, item.amount]),
  [
    ["b", "a", 25000],
    ["c", "a", 10000]
  ]
);

console.log("settlement tests passed");
