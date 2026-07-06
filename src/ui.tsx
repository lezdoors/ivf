import React, { useCallback, useEffect, useState } from 'react';

// hand-drawn line doodles that "grow" in the year garden
const doodlePaths = [
  'M12 21v-6 M12 15c-3 0-4-2-4-3s2-1 4 1c2-2 4-2 4-1s-1 3-4 3z M12 9a2 2 0 100-4 2 2 0 000 4z M9 6l1 2 M15 6l-1 2 M12 4v2',
  'M12 21v-8 M12 13c-4 0-5-4-5-4s4-1 5 4z M12 13c3 0 4-3 4-3s-3-1-4 3z',
  'M9 21h6 M11 15v6 M13 15v6 M6 13c0-4 3-6 6-6s6 2 6 6z M10 10v1 M14 11v1',
  'M12 21v-7 M8 8c0 4 2 6 4 6s4-2 4-6c-1 2-3 2-4 0-1 2-3 2-4 0z',
  'M12 21V8 M12 12c-3 0-3-3-3-3s3 0 3 3z M12 12c3 0 3-3 3-3s-3 0-3 3z M12 8c-2.5 0-2.5-3-2.5-3s2.5 0 2.5 3z M12 8c2.5 0 2.5-3 2.5-3s-2.5 0-2.5 3z',
  'M12 21v-6 M12 15c-2 2-5 1-5-1s3-3 5 1 M12 15c2 2 5 1 5-1s-3-3-5 1 M12 15c0-3-2-5 0-7 2 2 0 4 0 7z',
];

export function Doodle({ index, size = 22 }: { index: number; size?: number }) {
  const d = doodlePaths[((index % doodlePaths.length) + doodlePaths.length) % doodlePaths.length];
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round">
      <path d={d} />
    </svg>
  );
}

// --- date helpers ------------------------------------------------------------
export const todayISO = () => new Date().toISOString().slice(0, 10);
export const dISO = (v?: string) => (v ? v.slice(0, 10) : '');
export function compact(iso?: string) {
  if (!iso) return '—';
  return new Date(`${dISO(iso)}T00:00:00`).toLocaleDateString('en', { day: 'numeric', month: 'short' });
}
export function longDate(iso?: string) {
  if (!iso) return '—';
  return new Date(`${dISO(iso)}T00:00:00`)
    .toLocaleDateString('en-GB', { weekday: 'long', day: '2-digit', month: '2-digit' })
    .toLowerCase()
    .replace(/\//g, '.');
}
export function daysUntil(iso?: string) {
  if (!iso) return null;
  return Math.ceil((new Date(`${dISO(iso)}T00:00:00`).getTime() - Date.now()) / 86400000);
}

// --- async loader ------------------------------------------------------------
export function useAsync<T>(fn: () => Promise<T>, deps: any[] = []): {
  data: T | null;
  error: string | null;
  loading: boolean;
  reload: () => void;
} {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [nonce, setNonce] = useState(0);
  const reload = useCallback(() => setNonce((n) => n + 1), []);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const run = useCallback(fn, deps);
  useEffect(() => {
    let live = true;
    setLoading(true);
    setError(null);
    run()
      .then((d) => live && setData(d))
      .catch((e) => live && setError(String(e.message || e)))
      .finally(() => live && setLoading(false));
    return () => {
      live = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [run, nonce]);
  return { data, error, loading, reload };
}

export function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label>
      {label}
      {children}
    </label>
  );
}
