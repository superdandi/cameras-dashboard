import { useEffect, useState } from 'react';
import { api } from '../api';
import { useMode } from '../modes/types';

export default function SettingsPanel() {
  const { mode, setMode } = useMode();
  const [accent, setAccent] = useState('#00ffff');
  const [cols, setCols] = useState('2');
  const [g2r, setG2r] = useState('');
  const [brand, setBrand] = useState('SENTINEL');
  const [motion, setMotion] = useState({ threshold: '9', interval: '2', cooldown: '10', notify: '' });

  useEffect(() => {
    api.getSettings().then((s) => {
      if (s.mode) setMode(s.mode as 'cyberpunk' | 'vigilancia');
      if (s.accent) setAccent(s.accent);
      if (s.grid_cols) setCols(s.grid_cols);
      if (s.brand) setBrand(s.brand);
      setMotion({
        threshold: s.motion_threshold ?? '9',
        interval: s.motion_interval ?? '2',
        cooldown: s.motion_cooldown ?? '10',
        notify: s.notify_url ?? '',
      });
    }).catch(() => {});
    setG2r(localStorage.getItem('g2rBase') ?? '');
  }, []);

  const saveMode = async (id: 'cyberpunk' | 'vigilancia') => {
    setMode(id);
    document.documentElement.setAttribute('data-mode', id);
    await api.setSetting('mode', id);
  };

  const changeAccent = async (v: string) => {
    setAccent(v);
    const r = v.replace('#', '');
    const rgb = [parseInt(r.slice(0, 2), 16), parseInt(r.slice(2, 4), 16), parseInt(r.slice(4, 6), 16)].join(' ');
    document.documentElement.style.setProperty('--accent', rgb);
    await api.setSetting('accent', v);
  };

  const saveBrand = async () => {
    const val = brand.trim() || 'SENTINEL';
    setBrand(val);
    document.title = `${val} // Dashboard`;
    await api.setSetting('brand', val);
  };

  const saveG2r = () => {
    if (g2r.trim()) localStorage.setItem('g2rBase', g2r.trim());
    else localStorage.removeItem('g2rBase');
    window.location.reload();
  };

  return (
    <div className="flex flex-col gap-4">
      <h2 className="text-lg font-bold" style={{ fontFamily: 'var(--font-display)' }}>Sistema</h2>

      {/* Brand */}
      <div>
        <div className="mb-1 text-sm" style={{ color: 'rgb(var(--muted))' }}>Nombre del sistema</div>
        <input value={brand} onChange={(e) => setBrand(e.target.value)} onBlur={saveBrand} placeholder="SENTINEL" className="w-full rounded px-2 py-1.5 text-sm" style={{ background: 'rgb(var(--muted) / 0.1)' }} />
      </div>

      {/* Mode selector */}
      <div>
        <div className="mb-2 text-sm" style={{ color: 'rgb(var(--muted))' }}>Modo de interfaz</div>
        <div className="grid grid-cols-2 gap-2">
          <button
            onClick={() => saveMode('cyberpunk')}
            className={`rounded-xl p-3 text-sm ${mode === 'cyberpunk' ? 'ring-2 ring-accent' : ''}`}
            style={{
              background: mode === 'cyberpunk' ? 'rgb(5 8 18)' : 'rgb(var(--muted) / 0.1)',
              color: mode === 'cyberpunk' ? 'rgb(0 255 255)' : 'rgb(var(--muted))',
              border: `1px solid ${mode === 'cyberpunk' ? 'rgb(0 255 255 / 0.4)' : 'rgb(var(--muted) / 0.2)'}`,
            }}
          >
            <div className="font-bold" style={{ fontFamily: 'var(--font-display)' }}>CYBERPUNK</div>
            <div className="mt-1 text-xs opacity-70">HUD scifi, scanlines, glow</div>
          </button>
          <button
            onClick={() => saveMode('vigilancia')}
            className={`rounded-xl p-3 text-sm ${mode === 'vigilancia' ? 'ring-2 ring-accent' : ''}`}
            style={{
              background: mode === 'vigilancia' ? 'rgb(12 14 18)' : 'rgb(var(--muted) / 0.1)',
              color: mode === 'vigilancia' ? 'rgb(60 180 255)' : 'rgb(var(--muted))',
              border: `1px solid ${mode === 'vigilancia' ? 'rgb(60 180 255 / 0.4)' : 'rgb(var(--muted) / 0.2)'}`,
            }}
          >
            <div className="font-bold" style={{ fontFamily: 'var(--font-display)' }}>VIGILANCIA</div>
            <div className="mt-1 text-xs opacity-70">Centro de control, datos</div>
          </button>
        </div>
      </div>

      {/* Accent color */}
      <div>
        <div className="mb-1 text-sm" style={{ color: 'rgb(var(--muted))' }}>Color de acento</div>
        <input type="color" value={accent} onChange={(e) => changeAccent(e.target.value)} className="h-9 w-20 cursor-pointer" />
      </div>

      {/* Grid cols */}
      <div>
        <div className="mb-1 text-sm" style={{ color: 'rgb(var(--muted))' }}>Columnas del grid</div>
        <select value={cols} onChange={async (e) => { setCols(e.target.value); await api.setSetting('grid_cols', e.target.value); }} className="rounded px-3 py-1.5 text-sm" style={{ background: 'rgb(var(--muted) / 0.1)' }}>
          <option value="1">1</option>
          <option value="2">2</option>
          <option value="3">3</option>
          <option value="4">4</option>
        </select>
      </div>

      {/* go2rtc base */}
      <div>
        <div className="mb-1 text-sm" style={{ color: 'rgb(var(--muted))' }}>Base de go2rtc (WebRTC/MJPEG)</div>
        <div className="flex gap-1">
          <input value={g2r} onChange={(e) => setG2r(e.target.value)} placeholder="http://192.168.x.x:1984" className="flex-1 rounded px-2 py-1.5 text-sm" style={{ background: 'rgb(var(--muted) / 0.1)' }} />
          <button onClick={saveG2r} className="rounded px-3 py-1.5 text-sm font-semibold" style={{ background: 'rgb(var(--accent))', color: 'black' }}>Guardar</button>
        </div>
      </div>

      {/* Motion detection */}
      <div className="rounded-xl p-3" style={{ background: 'rgb(var(--panel))' }}>
        <div className="mb-2 text-sm font-semibold">Detección de movimiento</div>
        <div className="grid grid-cols-2 gap-2 text-xs" style={{ color: 'rgb(var(--muted))' }}>
          <label className="flex flex-col gap-1">
            Umbral (diff media, 0-255)
            <input value={motion.threshold} onChange={(e) => setMotion((m) => ({ ...m, threshold: e.target.value }))} onBlur={() => api.setSetting('motion_threshold', motion.threshold)} className="rounded px-2 py-1 text-sm" style={{ background: 'rgb(var(--muted) / 0.1)' }} />
          </label>
          <label className="flex flex-col gap-1">
            Intervalo (s)
            <input value={motion.interval} onChange={(e) => setMotion((m) => ({ ...m, interval: e.target.value }))} onBlur={() => api.setSetting('motion_interval', motion.interval)} className="rounded px-2 py-1 text-sm" style={{ background: 'rgb(var(--muted) / 0.1)' }} />
          </label>
          <label className="flex flex-col gap-1">
            Cooldown entre eventos (s)
            <input value={motion.cooldown} onChange={(e) => setMotion((m) => ({ ...m, cooldown: e.target.value }))} onBlur={() => api.setSetting('motion_cooldown', motion.cooldown)} className="rounded px-2 py-1 text-sm" style={{ background: 'rgb(var(--muted) / 0.1)' }} />
          </label>
          <label className="flex flex-col gap-1">
            Notify URL (ntfy/Telegram, opcional)
            <input value={motion.notify} onChange={(e) => setMotion((m) => ({ ...m, notify: e.target.value }))} onBlur={() => api.setSetting('notify_url', motion.notify)} placeholder="https://ntfy.sh/mitopic" className="rounded px-2 py-1 text-sm" style={{ background: 'rgb(var(--muted) / 0.1)' }} />
          </label>
        </div>
        <p className="mt-2 text-[11px]" style={{ color: 'rgb(var(--muted))' }}>Los cambios se aplican al desenfocar cada campo.</p>
      </div>
    </div>
  );
}
