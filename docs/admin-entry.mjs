import { createClient } from './vendor/supabase-2.117.2.mjs';
import { mountAdmin, ADMIN_STORAGE_KEY } from './admin.mjs';
const config = window.TRIP_SPLIT_CONFIG || {};
try {
  const client = createClient(config.supabaseUrl, config.supabaseAnonKey, {
    auth: { flowType: 'pkce', storage: window.sessionStorage, storageKey: ADMIN_STORAGE_KEY,
      persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
    global: { fetch: (url, options) => fetch(url, { ...options, signal: options?.signal || AbortSignal.timeout(15000), credentials: 'omit', cache: 'no-store', referrerPolicy: 'no-referrer' }) }
  });
  mountAdmin({ client, document, window });
} catch {
  document.querySelector('#admin-status').textContent = '로그인을 시작할 수 없습니다. 서버 설정과 이 탭의 저장소 허용 여부를 확인해 주세요.';
  document.querySelector('#admin-login').disabled = true;
}
