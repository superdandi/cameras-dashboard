import { useCallback, useEffect, useState } from 'react';
import type { Camera, CamStatus } from './types';
import { api } from './api';
import CameraTile from './components/CameraTile';
import DetailView from './components/DetailView';
import InventoryPanel from './components/InventoryPanel';
import SettingsPanel, { applySkin, SKINS } from './components/SettingsPanel';
import EventsPanel from './components/EventsPanel';
import TwitchPanel from './components/TwitchPanel';

type View = 'grid' | 'inventory' | 'settings' | 'events' | 'twitch';

const MODE_SKINS: Record<string, string> = { cyberpunk: 'cyberpunk', vigilancia: 'vigilancia' };

export default function App() {
  const [cameras, setCameras] = useState<Camera[]>([]);
  const [status, setStatus] = useState<Record<number, CamStatus>>({});
  const [selected, setSelected] = useState<Camera | null>(null);
  const [view, setView] = useState<View>('grid');
  const [cols, setCols] = useState(2);
  const [g2rOk, setG2rOk] = useState<boolean | null>(null);
  const [hd, setHd] = useState(() => localStorage.getItem('camHd') === '1');
  const [brand, setBrand] = useState('SENTINEL');
  const [skin, setSkin] = useState('cyberpunk');

  const refresh = useCallback(async () => {
    try {
      const [cam, st] = await Promise.all([api.listCameras(), api.status()]);
      setCameras(cam);
      const m: Record<number, CamStatus> = {};
      st.cameras.forEach((c) => { m[c.id] = c; });
      setStatus(m);
      setG2rOk(st.go2rtc.ok);
    } catch (e) {
      console.error(e);
    }
  }, []);

  useEffect(() => {
    refresh();
    const t = setInterval(refresh, 15000);
    return () => clearInterval(t);
  }, [refresh]);

  useEffect(() => {
    api.getSettings().then((s) => {
      if (s.skin) { setSkin(s.skin); applySkin(s.skin); }
      if (s.grid_cols) setCols(Number(s.grid_cols));
      if (s.brand) setBrand(s.brand);
    }).catch(() => {});
  }, []);

  useEffect(() => {
    document.title = `${brand} // Dashboard`;
  }, [brand]);

  const toggleMode = async () => {
    const next = skin === 'cyberpunk' ? 'vigilancia' : 'cyberpunk';
    setSkin(next);
    applySkin(next);
    await api.setSetting('skin', next);
  };

  const active = cameras.filter((c) => c.enabled);
  const gridClass = cols === 1 ? 'grid-cols-1' : cols === 4 ? 'grid-cols-1 sm:grid-cols-2 xl:grid-cols-4' : 'grid-cols-1 sm:grid-cols-2';

  return (
    <div className="flex h-full flex-col">
      <header className="flex items-center justify-between border-b border-muted/20 px-4 py-2">
        <div className="flex items-center gap-2">
          <h1 style={{ fontFamily: 'var(--font-display)' }} className="text-lg font-bold tracking-wider text-accent">
            {brand}
          </h1>
          <span className="hidden text-xs text-muted sm:inline">
            {active.length} cámaras activas · <HOSTNAME>
          </span>
        </div>
        <nav className="flex items-center gap-1 text-sm">
          <button
            onClick={toggleMode}
            title={`Modo ${skin === 'cyberpunk' ? 'Vigilancia' : 'Cyberpunk'}`}
            className={`rounded-lg px-3 py-1.5 font-mono text-xs uppercase tracking-widest ${skin === 'cyberpunk' ? 'bg-accent/20 text-accent' : 'bg-muted/10 text-muted hover:bg-muted/20'}`}
          >
            {skin === 'cyberpunk' ? '⚡ CYP' : '◉ OPS'}
          </button>
          <button
            onClick={() => {
              const v = !hd;
              setHd(v);
              localStorage.setItem('camHd', v ? '1' : '0');
            }}
            title="Ver el stream principal (HD) en lugar del sub-stream (SD)"
            className={`rounded-lg px-3 py-1.5 ${hd ? 'bg-accent text-black' : 'text-muted hover:bg-muted/10'}`}
          >
            HD
          </button>
          {(['grid', 'events', 'inventory', 'twitch', 'settings'] as View[]).map((v) => (
            <button
              key={v}
              onClick={() => setView(v)}
              className={`rounded-lg px-3 py-1.5 capitalize ${view === v ? 'bg-accent text-black' : 'text-muted hover:bg-muted/10'}`}
            >
              {v === 'grid' ? 'En vivo' : v === 'events' ? 'Eventos' : v === 'inventory' ? 'Inventario' : v === 'twitch' ? 'Twitch' : 'Personalizar'}
            </button>
          ))}
        </nav>
      </header>

      <main className="flex-1 overflow-y-auto p-4">
        {view === 'grid' && (
          <div className="mx-auto max-w-7xl">
            {g2rOk === false && (
              <div className="mb-3 rounded-lg bg-amber-500/15 px-3 py-2 text-sm text-amber-300">
                ⚠ go2rtc no responde en 127.0.0.1:1984. Verifica el servicio (systemctl --user status go2rtc).
              </div>
            )}
            {active.length === 0 ? (
              <div className="py-16 text-center text-muted">
                No hay cámaras habilitadas. Ve a <b>Inventario</b> para añadirlas.
              </div>
            ) : (
              <div className={`grid gap-3 ${gridClass}`}>
                {active.map((c) => (
                  <CameraTile key={c.id} camera={c} active preferMain={hd} onSelect={setSelected} />
                ))}
              </div>
            )}
          </div>
        )}

        {view === 'inventory' && <InventoryPanel onChanged={refresh} />}

        {view === 'events' && (
          <div className="mx-auto max-w-3xl">
            <EventsPanel />
          </div>
        )}

        {view === 'twitch' && <TwitchPanel />}

        {view === 'settings' && (
          <div className="mx-auto max-w-2xl">
            <SettingsPanel />
          </div>
        )}
      </main>

      {selected && <DetailView camera={selected} preferMain={hd} onClose={() => setSelected(null)} />}
    </div>
  );
}
