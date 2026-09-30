// Shared calculation used by the trip and read-only administrator screens.
const zeroDecimalCurrencies = new Set(["JPY", "LAK", "VND"]);

export function itemLineAmount(quantity, unitAmount, currency = "KRW") {
  const count = Number(quantity) || 0;
  const price = Number(unitAmount) || 0;
  const total = count * price;
  if (currency === "KRW" || zeroDecimalCurrencies.has(currency)) {
    return Math.round(total);
  }
  return Math.round(total * 100) / 100;
}

export function normalizeParticipantIds(ids = []) {
  return Array.from(new Set(Array.isArray(ids) ? ids : []))
    .filter(Boolean);
}

export function normalizeExpenseItems(expense = {}) {
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
        id: item.id || `${expense.id || "legacy"}_item_${index}`,
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

export function expenseItemsTotal(items = []) {
  return items.reduce((sum, item) => sum + (Number(item.amount) || 0), 0);
}

export function distributeAmountByWeights(total, weights) {
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

export function expenseItemKrwAmounts(expense, items = normalizeExpenseItems(expense)) {
  const currency = expense.currency || "KRW";
  const expenseAmount = Math.round(Number(expense.amount) || 0);
  if (currency === "KRW") {
    return distributeAmountByWeights(expenseAmount, items.map((item) => item.amount));
  }
  return distributeAmountByWeights(expenseAmount, items.map((item) => item.amount));
}

export function expenseShares(amount, participantIds, payerId) {
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

export function calculateSummary(trip) {
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
