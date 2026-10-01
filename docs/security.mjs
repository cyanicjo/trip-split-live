// Shared by the browser and security regression tests. No external runtime code.
export function csvCell(value) {
  let text = String(value ?? "");
  // Quote escaping alone does not stop spreadsheet formulas. Keep numbers numeric.
  if (typeof value !== "number" && (/^[\s\u0000-\u001F\u007F-\u009F\uFEFF]*[=+@\-＝＋＠－]/u.test(text) || /^[\t\r\n]/u.test(text))) {
    text = `'${text}`;
  }
  return /[",\n\r]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

export function canonicalTripUrl(href, publicId, editToken = "") {
  const url = new URL(href);
  url.search = "";
  url.hash = "";
  if (publicId) url.searchParams.set("trip", publicId);
  if (editToken) url.hash = new URLSearchParams({ edit: editToken }).toString();
  return url.toString();
}

export function readLink(href) {
  const url = new URL(href);
  const fragment = new URLSearchParams(url.hash.slice(1));
  return { publicId: url.searchParams.get("trip") || "", editToken: fragment.get("edit") || url.searchParams.get("edit") || "" };
}

export function createCredentialStore(session, persistent) {
  const prefix = "tripSplitEdit:";
  const read = (storage, key) => { try { return storage.getItem(key) || ""; } catch { return ""; } };
  const remove = (storage, key) => { try { storage.removeItem(key); } catch { /* Storage may be disabled. */ } };
  const write = (storage, key, value) => { try { storage.setItem(key, value); return true; } catch { return false; } };
  return {
    get: id => read(session, prefix + id) || read(persistent, prefix + id),
    isPersistent: id => Boolean(read(persistent, prefix + id)),
    save(id, token, remember = false) {
      if (!id || !token) return false;
      const saved = write(session, prefix + id, token);
      if (remember) return write(persistent, prefix + id, token);
      remove(persistent, prefix + id);
      return saved;
    },
    forget(id) { remove(session, prefix + id); remove(persistent, prefix + id); },
    pending(id, token) {
      try {
        const value = JSON.parse(read(session, `tripSplitRotation:${id}`));
        return value?.oldToken === token && /^trip-[a-f0-9]{64}$/.test(value.publicId) && /^[a-f0-9]{64}$/.test(value.editToken) ? value : null;
      } catch { return null; }
    },
    prepare(id, token, next) {
      const value = { oldToken: token, ...next };
      if (!write(session, `tripSplitRotation:${id}`, JSON.stringify(value))) throw new Error("링크를 안전하게 재발급하려면 이 탭의 저장소를 허용해 주세요.");
      return value;
    },
    clearPending(id) { remove(session, `tripSplitRotation:${id}`); }
  };
}

export function generateTripCredentials(random = crypto) {
  const hex = () => Array.from(random.getRandomValues(new Uint8Array(32)), byte => byte.toString(16).padStart(2, "0")).join("");
  return { publicId: `trip-${hex()}`, editToken: hex() };
}

export function createRpcClient(baseUrl, anonKey, fetcher = fetch) {
  const url = new URL(baseUrl);
  if (url.protocol !== "https:" && !["127.0.0.1", "localhost"].includes(url.hostname)) throw new Error("안전하지 않은 서버 주소입니다.");
  const allowed = new Set(["create_trip", "get_trip", "update_trip_state", "rotate_trip_links"]);
  return {
    async rpc(name, args = {}) {
      if (!allowed.has(name)) throw new Error("지원하지 않는 요청입니다.");
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 15000);
      try {
        const response = await fetcher(`${url.origin}/rest/v1/rpc/${name}`, {
          method: "POST", mode: "cors", credentials: "omit", cache: "no-store", referrerPolicy: "no-referrer",
          headers: { apikey: anonKey, Authorization: `Bearer ${anonKey}`, "Content-Type": "application/json" },
          body: JSON.stringify(args), signal: controller.signal
        });
        const result = await response.json();
        return response.ok ? { data: result, error: null } : { data: null, error: { code: result.code, message: result.message || "요청을 처리하지 못했습니다." } };
      } catch {
        return { data: null, error: { code: "NETWORK", message: "연결이 원활하지 않습니다. 다시 시도해 주세요." } };
      } finally { clearTimeout(timer); }
    }
  };
}

export function startPolling({ refresh, isHidden, onError = () => {}, schedule = setTimeout, cancel = clearTimeout }) {
  let timer = null;
  let stopped = false;
  let running = false;
  let delay = 3000;
  const queue = () => { if (!stopped && !isHidden()) timer = schedule(tick, delay); };
  async function tick() {
    timer = null;
    if (stopped || running || isHidden()) return;
    running = true;
    try { await refresh(); delay = 3000; }
    catch (error) { delay = Math.min(delay * 2, 60000); onError(error); }
    finally { running = false; queue(); }
  }
  queue();
  return {
    visibilityChanged() {
      cancel(timer); timer = null;
      if (!stopped && !running && !isHidden()) void tick();
    },
    stop() { stopped = true; cancel(timer); }
  };
}
