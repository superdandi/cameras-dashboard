import { useEffect, useState } from 'react';

interface Downtime {
  camId: number;
  sinceDown: number;
  sinceUp: number;
}

function loadAll(): Map<number, Downtime> {
  const map = new Map<number, Downtime>();
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k?.startsWith('ops-down-')) {
        const id = Number(k.slice(9));
        const d = JSON.parse(localStorage.getItem(k)!) as Downtime;
        map.set(id, d);
      }
    }
  } catch { /* noop */ }
  return map;
}

function persist(id: number, d: Downtime) {
  localStorage.setItem(`ops-down-${id}`, JSON.stringify(d));
}

export function useDowntimeTracker(status: Record<number, { ok: boolean } | undefined>) {
  const [downtime, setDowntime] = useState<Map<number, Downtime>>(loadAll);
  const [, tick] = useState(0);

  useEffect(() => {
    const t = setInterval(() => tick((v) => v + 1), 1000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    setDowntime((prev) => {
      const next = new Map(prev);
      const now = Date.now();
      Object.entries(status).forEach(([idStr, st]) => {
        const id = Number(idStr);
        if (!st) return;
        const existing = next.get(id);
        if (!st.ok) {
          if (!existing || existing.sinceUp > existing.sinceDown) {
            const d: Downtime = { camId: id, sinceDown: now, sinceUp: existing?.sinceUp ?? now };
            next.set(id, d);
            persist(id, d);
          }
        } else {
          if (existing && existing.sinceUp < existing.sinceDown) {
            const d: Downtime = { ...existing, sinceUp: now };
            next.set(id, d);
            persist(id, d);
          } else if (!existing) {
            const d: Downtime = { camId: id, sinceDown: 0, sinceUp: now };
            next.set(id, d);
            persist(id, d);
          }
        }
      });
      return next;
    });
  }, [JSON.stringify(Object.keys(status))]);

  return downtime;
}

export function formatDowntime(sinceDown: number): string {
  if (!sinceDown) return '';
  const diff = Date.now() - sinceDown;
  const mins = Math.floor(diff / 60000);
  const hours = Math.floor(mins / 60);
  if (hours > 0) return `${hours}h ${mins % 60}m`;
  if (mins > 0) return `${mins}m`;
  const secs = Math.floor(diff / 1000);
  return `${secs}s`;
}
