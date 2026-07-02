const http = require("http");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const PORT = Number(process.env.PORT || 4173);
const DATA_DIR = process.env.DATA_DIR
  ? path.resolve(process.env.DATA_DIR)
  : path.join(__dirname, "data");
const STORE_FILE = path.join(DATA_DIR, "trips.json");
const PUBLIC_DIR = path.join(__dirname, "public");

const clients = new Map();

const mimeTypes = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".svg": "image/svg+xml",
  ".json": "application/json; charset=utf-8"
};

function ensureStore() {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  if (!fs.existsSync(STORE_FILE)) {
    fs.writeFileSync(STORE_FILE, JSON.stringify({ trips: {} }, null, 2));
  }
}

function readStore() {
  ensureStore();
  try {
    return JSON.parse(fs.readFileSync(STORE_FILE, "utf8"));
  } catch (error) {
    return { trips: {} };
  }
}

let store = readStore();

function saveStore() {
  const tmpFile = `${STORE_FILE}.tmp`;
  fs.writeFileSync(tmpFile, JSON.stringify(store, null, 2));
  fs.renameSync(tmpFile, STORE_FILE);
}

function nowIso() {
  return new Date().toISOString();
}

function localDateString() {
  const date = new Date();
  date.setMinutes(date.getMinutes() - date.getTimezoneOffset());
  return date.toISOString().slice(0, 10);
}

function makeId(prefix = "") {
  return `${prefix}${crypto.randomBytes(5).toString("hex")}`;
}

function safeTripId(rawId) {
  const id = String(rawId || "").trim();
  if (!/^[a-zA-Z0-9_-]{4,48}$/.test(id)) {
    return null;
  }
  return id;
}

function createTrip(id) {
  const createdAt = nowIso();
  return {
    id,
    name: "새 여행 정산",
    currency: "KRW",
    createdAt,
    updatedAt: createdAt,
    people: [],
    expenses: []
  };
}

function getTrip(id) {
  if (!store.trips[id]) {
    store.trips[id] = createTrip(id);
    saveStore();
  }
  return store.trips[id];
}

function touchTrip(trip) {
  trip.updatedAt = nowIso();
  saveStore();
}

function normalizeAmount(value) {
  const numeric = Number(String(value).replace(/[^\d.-]/g, ""));
  if (!Number.isFinite(numeric) || numeric <= 0) {
    return null;
  }
  return Math.round(numeric);
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

  return {
    total,
    people: peopleSummary,
    settlements
  };
}

function publicState(trip) {
  return {
    ...trip,
    summary: calculateSummary(trip)
  };
}

function sendJson(res, status, body) {
  const payload = JSON.stringify(body);
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Content-Length": Buffer.byteLength(payload)
  });
  res.end(payload);
}

function sendError(res, status, message) {
  sendJson(res, status, { error: message });
}

function readJson(req) {
  return new Promise((resolve, reject) => {
    let body = "";
    req.on("data", (chunk) => {
      body += chunk;
      if (body.length > 1_000_000) {
        reject(new Error("요청이 너무 큽니다."));
        req.destroy();
      }
    });
    req.on("end", () => {
      if (!body) {
        resolve({});
        return;
      }
      try {
        resolve(JSON.parse(body));
      } catch (error) {
        reject(new Error("JSON 형식이 올바르지 않습니다."));
      }
    });
    req.on("error", reject);
  });
}

function broadcast(tripId) {
  const trip = getTrip(tripId);
  const payload = `event: state\ndata: ${JSON.stringify(publicState(trip))}\n\n`;
  const tripClients = clients.get(tripId) || new Set();

  for (const res of tripClients) {
    res.write(payload);
  }
}

function addSseClient(tripId, req, res) {
  getTrip(tripId);
  res.writeHead(200, {
    "Content-Type": "text/event-stream; charset=utf-8",
    "Cache-Control": "no-cache, no-transform",
    Connection: "keep-alive",
    "X-Accel-Buffering": "no"
  });
  res.write(": connected\n\n");
  res.write(`event: state\ndata: ${JSON.stringify(publicState(getTrip(tripId)))}\n\n`);

  if (!clients.has(tripId)) {
    clients.set(tripId, new Set());
  }

  const tripClients = clients.get(tripId);
  tripClients.add(res);

  const heartbeat = setInterval(() => {
    res.write(": ping\n\n");
  }, 25000);

  req.on("close", () => {
    clearInterval(heartbeat);
    tripClients.delete(res);
    if (tripClients.size === 0) {
      clients.delete(tripId);
    }
  });
}

function serveFile(res, pathname) {
  const filePath = pathname === "/" || pathname.startsWith("/t/")
    ? path.join(PUBLIC_DIR, "index.html")
    : path.join(PUBLIC_DIR, pathname);

  const normalized = path.normalize(filePath);
  if (!normalized.startsWith(PUBLIC_DIR)) {
    sendError(res, 403, "접근할 수 없는 경로입니다.");
    return;
  }

  fs.readFile(normalized, (error, content) => {
    if (error) {
      sendError(res, 404, "파일을 찾을 수 없습니다.");
      return;
    }

    const ext = path.extname(normalized);
    res.writeHead(200, {
      "Content-Type": mimeTypes[ext] || "application/octet-stream",
      "Cache-Control": "no-cache"
    });
    res.end(content);
  });
}

function redirectToNewTrip(res) {
  const id = makeId("trip-");
  store.trips[id] = createTrip(id);
  saveStore();
  res.writeHead(302, { Location: `/t/${id}` });
  res.end();
}

async function handleApi(req, res, url) {
  const parts = url.pathname.split("/").filter(Boolean);

  if (parts[0] === "events") {
    const tripId = safeTripId(parts[1]);
    if (!tripId) {
      sendError(res, 400, "여행 링크가 올바르지 않습니다.");
      return;
    }
    addSseClient(tripId, req, res);
    return;
  }

  if (parts[0] !== "api" || parts[1] !== "trips") {
    sendError(res, 404, "알 수 없는 API입니다.");
    return;
  }

  const tripId = safeTripId(parts[2]);
  if (!tripId) {
    sendError(res, 400, "여행 링크가 올바르지 않습니다.");
    return;
  }

  const trip = getTrip(tripId);

  if (req.method === "GET" && parts.length === 3) {
    sendJson(res, 200, publicState(trip));
    return;
  }

  let body;
  try {
    body = await readJson(req);
  } catch (error) {
    sendError(res, 400, error.message);
    return;
  }

  if (req.method === "PATCH" && parts.length === 3) {
    const name = String(body.name || "").trim().slice(0, 80);
    if (!name) {
      sendError(res, 400, "여행 이름을 입력해 주세요.");
      return;
    }
    trip.name = name;
    touchTrip(trip);
    broadcast(tripId);
    sendJson(res, 200, publicState(trip));
    return;
  }

  if (parts[3] === "people" && req.method === "POST" && parts.length === 4) {
    const name = String(body.name || "").trim().slice(0, 40);
    if (!name) {
      sendError(res, 400, "이름을 입력해 주세요.");
      return;
    }
    trip.people.push({
      id: makeId("p_"),
      name,
      createdAt: nowIso()
    });
    touchTrip(trip);
    broadcast(tripId);
    sendJson(res, 201, publicState(trip));
    return;
  }

  if (parts[3] === "people" && req.method === "DELETE" && parts.length === 5) {
    const personId = parts[4];
    const paidExpense = trip.expenses.some((expense) => expense.payerId === personId);
    if (paidExpense) {
      sendError(res, 409, "이 사람이 결제한 지출이 있어 먼저 지출을 삭제해야 합니다.");
      return;
    }

    trip.people = trip.people.filter((person) => person.id !== personId);
    trip.expenses = trip.expenses.map((expense) => ({
      ...expense,
      participantIds: (expense.participantIds || []).filter((id) => id !== personId)
    }));
    touchTrip(trip);
    broadcast(tripId);
    sendJson(res, 200, publicState(trip));
    return;
  }

  if (parts[3] === "expenses" && req.method === "POST" && parts.length === 4) {
    const title = String(body.title || "").trim().slice(0, 70);
    const amount = normalizeAmount(body.amount);
    const payerId = String(body.payerId || "");
    const peopleIds = new Set(trip.people.map((person) => person.id));
    const participantIds = Array.from(new Set(Array.isArray(body.participantIds) ? body.participantIds : []))
      .filter((id) => peopleIds.has(id));

    if (!title) {
      sendError(res, 400, "지출 내용을 입력해 주세요.");
      return;
    }

    if (!amount) {
      sendError(res, 400, "금액을 입력해 주세요.");
      return;
    }

    if (!peopleIds.has(payerId)) {
      sendError(res, 400, "결제자를 선택해 주세요.");
      return;
    }

    if (participantIds.length === 0) {
      sendError(res, 400, "분할 참여자를 한 명 이상 선택해 주세요.");
      return;
    }

    trip.expenses.unshift({
      id: makeId("e_"),
      title,
      amount,
      payerId,
      participantIds,
      memo: String(body.memo || "").trim().slice(0, 140),
      spentAt: String(body.spentAt || "").trim().slice(0, 20) || localDateString(),
      createdAt: nowIso()
    });
    touchTrip(trip);
    broadcast(tripId);
    sendJson(res, 201, publicState(trip));
    return;
  }

  if (parts[3] === "expenses" && req.method === "DELETE" && parts.length === 5) {
    const expenseId = parts[4];
    trip.expenses = trip.expenses.filter((expense) => expense.id !== expenseId);
    touchTrip(trip);
    broadcast(tripId);
    sendJson(res, 200, publicState(trip));
    return;
  }

  sendError(res, 404, "알 수 없는 API입니다.");
}

const server = http.createServer((req, res) => {
  const url = new URL(req.url, `http://${req.headers.host || "localhost"}`);

  if (url.pathname === "/health") {
    sendJson(res, 200, { ok: true });
    return;
  }

  if (url.pathname === "/") {
    redirectToNewTrip(res);
    return;
  }

  if (url.pathname.startsWith("/api/") || url.pathname.startsWith("/events/")) {
    handleApi(req, res, url).catch((error) => {
      console.error(error);
      sendError(res, 500, "서버에서 문제가 발생했습니다.");
    });
    return;
  }

  serveFile(res, decodeURIComponent(url.pathname));
});

if (require.main === module) {
  server.listen(PORT, () => {
    console.log(`Trip Split Live is running at http://localhost:${PORT}`);
  });
}

module.exports = {
  calculateSummary,
  createTrip,
  server
};
