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

// Agent: enqueue a question, then poll the Copilot Queue row for the answer.
export function ask(question: string, author: string): Promise<{ id: string }> {
  return req('ask', { method: 'POST', body: JSON.stringify({ question, author }) });
}
export function pollAsk(id: string): Promise<{ status: string; answer?: string; question?: string }> {
  return req(`ask?id=${id}`);
}
