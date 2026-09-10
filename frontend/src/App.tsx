import { useCallback, useEffect, useRef, useState } from 'react';
import type { Camera, CamStatus } from './types';
import { api } from './api';
import { ModeContext, type Mode } from './modes/types';
import { MODES } from './modes/registry';

type View = 'grid' | 'inventory' | 'settings' | 'events' | 'twitch';

export default function App() {
  const [cameras, setCameras] = useState<Camera[]>([]);
  const [status, setStatus] = useState<Record<number, CamStatus>>({});
  const [selected, setSelected] = useState<Camera | null>(null);
  const [detailSolo, setDetailSolo] = useState(false);
  const [gridSelectedId, setGridSelectedId] = useState<number | null>(null);
  const [view, setView] = useState<View>('grid');
  const [cols, setCols] = useState(2);
  const [g2rOk, setG2rOk] = useState<boolean | null>(null);
  const [g2rStreams, setG2rStreams] = useState<string[]>([]);
  const [hd, setHd] = useState(() => localStorage.getItem('camHd') === '1');
  const [mode, setMode] = useState<Mode>('cyberpunk');
  const [brand, setBrand] = useState('SENTINEL');
  const [bootVisible, setBootVisible] = useState(true);
  const orderRef = useRef<number[]>([]);

  const components = MODES[mode];

  const refresh = useCallback(async () => {
    try {
      const [cam, st] = await Promise.all([api.listCameras(), api.status()]);
      // Preserve local reorder if user dragged recently
      if (orderRef.current.length > 0) {
        const orderMap = new Map(orderRef.current.map((id, i) => [id, i]));
        cam.sort((a, b) => (orderMap.get(a.id) ?? 999) - (orderMap.get(b.id) ?? 999));
      }
      setCameras(cam);
      const m: Record<number, CamStatus> = {};
      st.cameras.forEach((c) => { m[c.id] = c; });
      setStatus(m);
      setG2rOk(st.go2rtc.ok);
      setG2rStreams(st.go2rtc.streams);
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
      if (s.mode) {
        setMode(s.mode as Mode);
      } else if (s.skin) {
        setMode('cyberpunk');
      }
      if (s.grid_cols) setCols(Number(s.grid_cols));
      if (s.brand) setBrand(s.brand);
    }).catch(() => {});
  }, []);

  useEffect(() => {
    document.title = `${brand} // Dashboard`;
    document.documentElement.setAttribute('data-mode', mode);
  }, [brand, mode]);

  const toggleMode = async () => {
    const next = mode === 'cyberpunk' ? 'vigilancia' : 'cyberpunk';
    setMode(next);
    setBootVisible(true);
    document.documentElement.setAttribute('data-mode', next);
    await api.setSetting('mode', next);
  };

  const handleLayoutChange = useCallback((n: number) => {
    setCols(n);
    api.setSetting('grid_cols', String(n));
  }, []);

  const handleReorder = useCallback((reordered: Camera[]) => {
    orderRef.current = reordered.map((c) => c.id);
    setCameras((prev) => {
      const enabled = reordered;
      const disabled = prev.filter((c) => !c.enabled);
      return [...enabled, ...disabled];
    });
  }, []);

  const active = cameras.filter((c) => c.enabled);

  const handleSelect = useCallback((c: Camera) => {
    setSelected(c);
    setGridSelectedId(c.id);
    setDetailSolo(false);
  }, []);

  // Keyboard coordination: Enter opens solo view, Escape exits solo first,
  // then closes detail modal, then clears grid selection
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Enter') {
        const isTyping = (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement || e.target instanceof HTMLButtonElement);
        if (selected && !detailSolo && !isTyping) {
          e.preventDefault();
          setDetailSolo(true);
        }
        return;
      }
      if (e.key !== 'Escape') return;
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      if (selected) {
        e.preventDefault();
        if (detailSolo) {
          setDetailSolo(false);
          return;
        }
        setSelected(null);
        setGridSelectedId(null);
        return;
      }
      setGridSelectedId(null);
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [selected, detailSolo]);

  return (
    <ModeContext.Provider value={{ mode, setMode }}>
      <div className="flex h-full flex-col">
        {/* Header */}
        <header className={`header ${mode}`}>
          <div className="header-brand">
            <h1 className="header-title">{brand}</h1>
            <span className="header-subtitle">
              {active.length} CAMS ONLINE // <span className="text-accent">{mode === 'cyberpunk' ? 'CYP' : 'OPS'}</span>
            </span>
          </div>
          <nav className="header-nav">
            <button
              onClick={toggleMode}
              title={`Modo ${mode === 'cyberpunk' ? 'Vigilancia' : 'Cyberpunk'}`}
              className={`header-mode-btn ${mode}`}
            >
              {mode === 'cyberpunk' ? '◉ OPS' : '⚡ CYP'}
            </button>
            <button
              onClick={() => {
                const v = !hd;
                setHd(v);
                localStorage.setItem('camHd', v ? '1' : '0');
              }}
              title="Ver el stream principal (HD) en lugar del sub-stream (SD)"
              className={`header-hd-btn ${hd ? 'active' : ''}`}
            >
              HD
            </button>
            {(['grid', 'events', 'inventory', 'twitch', 'settings'] as View[]).map((v) => (
              <button
                key={v}
                onClick={() => setView(v)}
                className={`header-nav-btn ${view === v ? 'active' : ''}`}
              >
                {v === 'grid' ? 'En vivo' : v === 'events' ? 'Eventos' : v === 'inventory' ? 'Inventario' : v === 'twitch' ? 'Twitch' : 'Personalizar'}
              </button>
            ))}
          </nav>
        </header>

        {/* Main content */}
        <main className="flex-1 overflow-y-auto p-4">
          {view === 'grid' && (
            <components.Grid
              cameras={active}
              status={status}
              cols={cols}
              preferMain={hd}
              g2rOk={g2rOk}
              g2rStreams={g2rStreams}
              bootVisible={bootVisible}
              onBootDone={() => setBootVisible(false)}
              onSelect={handleSelect}
              onLayoutChange={handleLayoutChange}
              onReorder={handleReorder}
              selectedId={gridSelectedId}
              onSelectedChange={setGridSelectedId}
              modalOpen={!!selected}
            />
          )}

          {view === 'inventory' && <components.Inventory onChanged={refresh} onReorder={handleReorder} />}
          {view === 'events' && (
            <div className="mx-auto max-w-3xl">
              <components.Events />
            </div>
          )}
          {view === 'twitch' && <components.Twitch />}
          {view === 'settings' && (
            <div className="mx-auto max-w-2xl">
              <components.Settings />
            </div>
          )}
        </main>

        {/* Detail modal */}
        {selected && (
          <components.Detail
            camera={selected}
            preferMain={hd}
            onClose={() => { setSelected(null); setDetailSolo(false); }}
            status={status[selected.id]}
            solo={detailSolo}
            onSoloChange={setDetailSolo}
          />
        )}
      </div>
    </ModeContext.Provider>
  );
}
