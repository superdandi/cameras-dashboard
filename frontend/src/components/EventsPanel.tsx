import { useCallback, useEffect, useState } from 'react';
import { api } from '../api';

interface Ev {
  id: number;
  camera_id: number;
  camera_name: string | null;
  ts: string;
  type: string;
  payload: string;
}

export default function EventsPanel() {
  const [events, setEvents] = useState<Ev[]>([]);

  const load = useCallback(() => {
    api.events(100).then(setEvents).catch(() => {});
  }, []);
  useEffect(() => {
    load();
    const t = setInterval(load, 5000);
    return () => clearInterval(t);
  }, [load]);

  const clear = async () => {
    await api.clearEvents();
    load();
  };

  return (
    <div className="flex h-full flex-col gap-3">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-bold text-fg">Timeline de eventos</h2>
        <button onClick={clear} className="rounded-lg bg-rose-500/20 px-3 py-1.5 text-sm text-rose-300 hover:bg-rose-500/30">
          Limpiar
        </button>
      </div>

      <div className="scrollbar-thin flex-1 space-y-1.5 overflow-y-auto">
        {events.length === 0 && (
          <div className="py-12 text-center text-sm text-muted">
            Sin eventos todavía. La detección de movimiento registra aquí cada detección.
          </div>
        )}
        {events.map((e) => (
          <div key={e.id} className="flex items-center gap-3 rounded-lg bg-panel px-3 py-2">
            <span className="flex h-2 w-2 shrink-0 rounded-full bg-accent" />
            <div className="min-w-0 flex-1">
              <div className="text-sm text-fg">
                {e.camera_name ?? `Cámara ${e.camera_id}`}
                <span className="ml-2 rounded bg-muted/15 px-1.5 py-0.5 text-[10px] uppercase text-muted">{e.type}</span>
              </div>
              <div className="truncate text-xs text-muted">{e.payload}</div>
            </div>
            <div className="shrink-0 text-xs tabular-nums text-muted">{e.ts}</div>
          </div>
        ))}
      </div>
    </div>
  );
}
