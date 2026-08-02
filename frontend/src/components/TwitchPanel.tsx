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

export default function TwitchPanel() {
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
    api.listCameras().then((c) => { setCams(c); setSel((s) => (s.length ? s : c.filter((x) => x.enabled).map((x) => x.id))); }).catch(() => {});
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

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-bold text-fg">Re-stream a Twitch</h2>
        <span className={`rounded-full px-3 py-1 text-xs font-bold uppercase ${st.running ? 'bg-emerald-500/20 text-emerald-300' : 'bg-rose-500/20 text-rose-300'}`}>
          {st.running ? 'EN VIVO' : 'detenido'}
        </span>
      </div>

      {st.running && (
        <div className="rounded-xl bg-panel p-3 text-sm">
          <div className="text-fg">Stream activo (pid {st.pid})</div>
          <div className="text-xs text-muted">Iniciado {st.started_at} · {st.cameras?.length} cámaras · {st.use_sub ? 'sub-stream' : 'main-stream'}</div>
        </div>
      )}

      <div className="rounded-xl bg-panel p-3">
        <div className="mb-2 text-sm font-semibold text-fg">Cámaras en el grid</div>
        <div className="grid grid-cols-2 gap-1.5">
          {cams.map((c) => (
            <label key={c.id} className="flex items-center gap-2 rounded bg-muted/5 px-2 py-1.5 text-sm text-fg">
              <input type="checkbox" checked={sel.includes(c.id)} onChange={() => toggle(c.id)} disabled={st.running} />
              {c.name}
            </label>
          ))}
        </div>
        <label className="mt-2 flex items-center gap-2 text-sm text-muted">
          <input type="checkbox" checked={useSub} onChange={(e) => setUseSub(e.target.checked)} disabled={st.running} />
          Usar sub-stream (SD) para ahorrar WiFi
        </label>
      </div>

      <div className="rounded-xl bg-panel p-3">
        <div className="mb-2 text-sm font-semibold text-fg">Configuración</div>
        <div className="grid gap-2 sm:grid-cols-2">
          <label className="flex flex-col gap-1 text-xs text-muted">
            Clave de stream (ingest)
            <input type="password" value={cfg.key} onChange={(e) => setCfg((c) => ({ ...c, key: e.target.value }))} placeholder="deja vacío para no cambiar" className="rounded bg-muted/10 px-2 py-1.5 text-sm text-fg" />
          </label>
          <label className="flex flex-col gap-1 text-xs text-muted">
            URL ingest
            <input value={cfg.url} onChange={(e) => setCfg((c) => ({ ...c, url: e.target.value }))} className="rounded bg-muted/10 px-2 py-1.5 text-sm text-fg" />
          </label>
          <label className="flex flex-col gap-1 text-xs text-muted">
            Archivo de audio (loop, opcional)
            <input value={cfg.audio} onChange={(e) => setCfg((c) => ({ ...c, audio: e.target.value }))} placeholder="/ruta/musica.mp3" className="rounded bg-muted/10 px-2 py-1.5 text-sm text-fg" />
          </label>
          <label className="flex flex-col gap-1 text-xs text-muted">
            Bitrate de video
            <input value={cfg.bitrate} onChange={(e) => setCfg((c) => ({ ...c, bitrate: e.target.value }))} className="rounded bg-muted/10 px-2 py-1.5 text-sm text-fg" />
          </label>
          <label className="flex flex-col gap-1 text-xs text-muted">
            Resolución (ancho)
            <input type="number" value={cfg.width} onChange={(e) => setCfg((c) => ({ ...c, width: Number(e.target.value) }))} className="rounded bg-muted/10 px-2 py-1.5 text-sm text-fg" />
          </label>
          <label className="flex flex-col gap-1 text-xs text-muted">
            Resolución (alto)
            <input type="number" value={cfg.height} onChange={(e) => setCfg((c) => ({ ...c, height: Number(e.target.value) }))} className="rounded bg-muted/10 px-2 py-1.5 text-sm text-fg" />
          </label>
        </div>
        <button onClick={saveCfg} className="mt-2 rounded bg-muted/10 px-3 py-1.5 text-sm hover:bg-muted/20">Guardar configuración</button>
      </div>

      <div className="flex gap-2">
        <button onClick={start} disabled={st.running} className="flex-1 rounded-xl bg-accent px-4 py-2.5 font-bold text-black hover:opacity-90 disabled:opacity-40">
          ▶ Iniciar stream
        </button>
        <button onClick={stop} disabled={!st.running} className="flex-1 rounded-xl bg-rose-500/20 px-4 py-2.5 font-bold text-rose-300 hover:bg-rose-500/30 disabled:opacity-40">
          ■ Detener
        </button>
      </div>
      {msg && <div className="rounded bg-muted/10 px-3 py-2 text-sm text-muted">{msg}</div>}
    </div>
  );
}
