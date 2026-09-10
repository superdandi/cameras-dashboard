import { useCallback, useEffect, useState } from 'react';
import type { Camera } from '../types';
import { api } from '../api';

interface TwitchStatus {
  running: boolean;
  cameras?: number[];
  use_sub?: boolean;
  started_at?: string;
  pid?: number;
  last_code?: number;
}

export function useTwitch() {
  const [cams, setCams] = useState<Camera[]>([]);
  const [st, setSt] = useState<TwitchStatus>({ running: false });
  const [sel, setSel] = useState<number[]>([]);
  const [useSub, setUseSub] = useState(true);
  const [cfg, setCfg] = useState({ key: '', url: '', audio: '', bitrate: '2500k', width: 1280, height: 720 });
  const [msg, setMsg] = useState('');

  const refresh = useCallback(() => {
    api.twitchStatus().then(setSt).catch(() => {});
  }, []);

  useEffect(() => {
    api.listCameras().then((c) => {
      setCams(c);
      setSel((s) => (s.length ? s : c.filter((x) => x.enabled).map((x) => x.id)));
    }).catch(() => {});
    api.twitchConfig().then((c) => setCfg({ key: '', ...c })).catch(() => {});
    refresh();
    const t = setInterval(refresh, 5000);
    return () => clearInterval(t);
  }, [refresh]);

  const start = async () => {
    setMsg('');
    try {
      const r = await api.twitchStart(sel, useSub);
      setMsg(r.error ?? `Iniciado (pid ${r.pid})`);
      refresh();
    } catch (e) {
      setMsg(String((e as Error).message));
    }
  };

  const stop = async () => {
    setMsg('');
    try {
      const r = await api.twitchStop();
      setMsg(r.error ?? 'Detenido');
      refresh();
    } catch (e) {
      setMsg(String((e as Error).message));
    }
  };

  const saveCfg = async () => {
    setMsg('');
    try {
      await api.twitchConfigSave(cfg);
      setMsg('Configuración guardada');
    } catch (e) {
      setMsg(String((e as Error).message));
    }
  };

  const toggle = (id: number) =>
    setSel((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));

  return { cams, st, sel, useSub, cfg, msg, start, stop, saveCfg, toggle, setUseSub, setCfg };
}
