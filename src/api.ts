import type { Row } from './types';

const PASS_KEY = 'ivf-pass';
const EXP_KEY = 'ivf-pass-exp';
const TRUST_DAYS = 30;

// 30-day device trust: opening the app should take zero taps, like a real app.
// The phone's own lock screen is the security boundary between sessions.
export function getPass(): string {
  try {
    const exp = Number(localStorage.getItem(EXP_KEY) || 0);
    if (exp && Date.now() < exp) return localStorage.getItem(PASS_KEY) || '';
    localStorage.removeItem(PASS_KEY);
    localStorage.removeItem(EXP_KEY);
  } catch { /* storage unavailable */ }
  return sessionStorage.getItem(PASS_KEY) || '';
}
export function setPass(p: string) {
  sessionStorage.setItem(PASS_KEY, p);
  try {
    localStorage.setItem(PASS_KEY, p);
    localStorage.setItem(EXP_KEY, String(Date.now() + TRUST_DAYS * 86400000));
  } catch { /* private mode — session-only */ }
}
export function clearPass() {
  sessionStorage.removeItem(PASS_KEY);
  try {
    localStorage.removeItem(PASS_KEY);
    localStorage.removeItem(EXP_KEY);
  } catch { /* ignore */ }
}

async function req(path: string, init: RequestInit = {}): Promise<any> {
  const r = await fetch(`/api/${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      'x-app-pass': getPass(),
      ...(init.headers || {}),
    },
  });
  if (r.status === 401) throw new Error('unauthorized');
  const body = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(body.error || `error ${r.status}`);
  return body;
}

// Validate a passcode on login.
export async function login(pass: string): Promise<boolean> {
  setPass(pass);
  try {
    await req('config');
    return true;
  } catch {
    clearPass();
    return false;
  }
}

export function listDb(db: string, sort?: string, dir: 'asc' | 'desc' = 'desc'): Promise<Row[]> {
  const q = sort ? `&sort=${encodeURIComponent(sort)}&dir=${dir}` : '';
  return req(`notion?db=${db}${q}`).then((r) => r.rows as Row[]);
}

export function createRow(db: string, fields: Record<string, any>): Promise<Row> {
  return req(`notion?db=${db}`, { method: 'POST', body: JSON.stringify({ fields }) }).then((r) => r.row);
}

export function updateRow(db: string, id: string, fields: Record<string, any>): Promise<Row> {
  return req(`notion?db=${db}&id=${id}`, { method: 'PATCH', body: JSON.stringify({ fields }) }).then((r) => r.row);
}

// --- push reminders -------------------------------------------------------------
// iOS requires the PWA to be installed (Add to Home Screen) before push works.
export type PushState = 'unsupported' | 'needs-install' | 'off' | 'on' | 'denied';

const isStandalone = () =>
  window.matchMedia('(display-mode: standalone)').matches || (navigator as any).standalone === true;

export async function pushState(): Promise<PushState> {
  if (!('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window)) {
    // iOS Safari hides the Push API until the app is installed to the home screen
    const iOS = /iphone|ipad|ipod/i.test(navigator.userAgent);
    return iOS && !isStandalone() ? 'needs-install' : 'unsupported';
  }
  if (Notification.permission === 'denied') return 'denied';
  try {
    const reg = await navigator.serviceWorker.getRegistration();
    if (!reg) return 'unsupported'; // dev mode — SW registers in prod builds only
    const sub = await reg.pushManager.getSubscription();
    return sub ? 'on' : 'off';
  } catch {
    return 'off';
  }
}

function b64ToUint8(base64: string): Uint8Array {
  const pad = '='.repeat((4 - (base64.length % 4)) % 4);
  const raw = atob((base64 + pad).replace(/-/g, '+').replace(/_/g, '/'));
  return Uint8Array.from(raw, (c) => c.charCodeAt(0));
}

export async function enablePush(member: string): Promise<PushState> {
  const perm = await Notification.requestPermission();
  if (perm !== 'granted') return perm === 'denied' ? 'denied' : 'off';
  const { key } = await req('push?action=key');
  const reg = await navigator.serviceWorker.getRegistration();
  if (!reg) throw new Error('app not installed');
  const sub = await reg.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: b64ToUint8(key) as unknown as BufferSource,
  });
  const device = /iphone|ipad|ipod/i.test(navigator.userAgent) ? 'iPhone' : /android/i.test(navigator.userAgent) ? 'Android' : 'Desktop';
  await req('push', { method: 'POST', body: JSON.stringify({ subscription: sub.toJSON(), member, device: `${member} · ${device}` }) });
  return 'on';
}

export async function disablePush(): Promise<PushState> {
  const reg = await navigator.serviceWorker.getRegistration();
  if (!reg) return 'off';
  const sub = await reg.pushManager.getSubscription();
  if (sub) {
    await req('push', { method: 'POST', body: JSON.stringify({ unsubscribe: sub.endpoint }) }).catch(() => {});
    await sub.unsubscribe();
  }
  return 'off';
}

// Agent: enqueue a question, then poll the Copilot Queue row for the answer.
export function ask(question: string, author: string): Promise<{ id: string }> {
  return req('ask', { method: 'POST', body: JSON.stringify({ question, author }) });
}
export function pollAsk(id: string): Promise<{ status: string; answer?: string; question?: string }> {
  return req(`ask?id=${id}`);
}
