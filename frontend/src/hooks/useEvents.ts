import { useCallback, useEffect, useState } from 'react';
import { api } from '../api';

export interface Event {
  id: number;
  camera_id: number;
  camera_name: string | null;
  ts: string;
  type: string;
  payload: string;
}

export function useEvents(limit = 100) {
  const [events, setEvents] = useState<Event[]>([]);

  const load = useCallback(() => {
    api.events(limit).then(setEvents).catch(() => {});
  }, [limit]);

  useEffect(() => {
    load();
    const t = setInterval(load, 5000);
    return () => clearInterval(t);
  }, [load]);

  const clear = async () => {
    await api.clearEvents();
    load();
  };

  return { events, clear };
}
