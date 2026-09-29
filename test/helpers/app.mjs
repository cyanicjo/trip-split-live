import { JSDOM } from 'jsdom';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import * as security from '../../docs/security.mjs';
const html = readFileSync(new URL('../../docs/index.html', import.meta.url), 'utf8');
const app = readFileSync(new URL('../../docs/app.js', import.meta.url), 'utf8');
export function loadApp({ url = 'https://example.test/?trip=trip-test#edit=fake-key', local = {}, configured = false } = {}) {
  const dom = new JSDOM(html, { url, runScripts: 'outside-only', pretendToBeVisual: true });
  const { window } = dom;
  Object.assign(window, security);
  if (configured) window.TRIP_SPLIT_CONFIG = {supabaseUrl:"https://backend.test",supabaseAnonKey:"public-key"};
  window.matchMedia = () => ({ matches: false, addEventListener() {}, removeEventListener() {} });
  window.CSS = { escape: value => String(value).replace(/[^a-z0-9_-]/gi, ch => `\\${ch}`) };
  window.confirm = () => false;
  for (const [key, value] of Object.entries(local)) window.localStorage.setItem(key, value);
  const context = dom.getInternalVMContext();
  vm.runInContext(app.replace(/^import .*;\n/, '').replace('\nstart();', '\n'), context);
  return { dom, window, eval: code => vm.runInContext(code, context), close: () => window.close() };
}
export const fakeRow = {
  public_id: 'trip-test', name: '가짜 여행', version: 1, updated_at: '2026-09-29T00:00:00Z',
  people: [{ id: 'p_a', name: '가짜 A', accountNumber: '0000' }, { id: 'p_b', name: '가짜 B' }],
  expenses: [{ id: 'e_a', title: '식사', amount: 12000, payerId: 'p_a', participantIds: ['p_a','p_b'], currency: 'KRW', spentAt: '2026-09-29', createdAt:'2026-09-29T00:00:00Z' }],
  settings: { itinerary: { startDate: '2026-09-29', endDate: '2026-10-01' } }
};
