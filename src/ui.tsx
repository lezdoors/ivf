import { useCallback, useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import type { ReactNode } from 'react';

// --- motion -------------------------------------------------------------------
// a slow, organic "breath": blur lifts as content settles into place.
export const EASE = [0.22, 1, 0.36, 1] as const;

export function Reveal({ children, delay = 0, className }: { children: ReactNode; delay?: number; className?: string }) {
  return (
    <motion.div
      className={className}
      initial={{ filter: 'blur(4px)', opacity: 0, y: 10 }}
      animate={{ filter: 'blur(0px)', opacity: 1, y: 0 }}
      transition={{ duration: 0.5, ease: EASE, delay }}
    >
      {children}
    </motion.div>
  );
}

export function Card({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <section className={`card-inset rounded-2xl bg-white p-6 sm:p-8 ${className}`}>{children}</section>;
}

export function Eyebrow({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <span className={`block text-[11px] font-medium uppercase tracking-[0.15em] text-taupe-500 ${className}`}>{children}</span>;
}

// --- sparkline ---------------------------------------------------------------
// Tiny dependency-free trend line. `values` in chronological order.
export function Sparkline({ values, stroke = '#B8735A', fill = 'rgba(184,115,90,0.10)', h = 44 }: {
  values: number[]; stroke?: string; fill?: string; h?: number;
}) {
  const pts = values.filter((v) => typeof v === 'number' && !Number.isNaN(v));
  if (pts.length < 2) return null;
  const w = 100;
  const min = Math.min(...pts), max = Math.max(...pts);
  const span = max - min || 1;
  const step = w / (pts.length - 1);
  const y = (v: number) => h - 4 - ((v - min) / span) * (h - 8);
  const coords = pts.map((v, i) => [i * step, y(v)] as const);
  const line = coords.map(([x, yy], i) => `${i ? 'L' : 'M'}${x.toFixed(1)} ${yy.toFixed(1)}`).join(' ');
  const area = `${line} L${w} ${h} L0 ${h} Z`;
  return (
    <svg viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" className="w-full" style={{ height: h }} aria-hidden>
      <path d={area} fill={fill} />
      <path d={line} fill="none" stroke={stroke} strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
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
