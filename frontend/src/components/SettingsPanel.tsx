import { useEffect, useState } from 'react';
import type { Skin } from '../types';
import { api } from '../api';

export const SKINS: Skin[] = [
  { id: 'cyberpunk', label: 'Cyberpunk', vars: { bg: '5 8 18', panel: '10 14 30', fg: '200 230 255', muted: '100 130 160', accent: '0 255 255', ok: '0 255 120', warn: '255 200 0', danger: '255 40 60', glow: '1', videoFilter: 'contrast(1.15) saturate(1.3) hue-rotate(180deg) brightness(0.95)' } },
  { id: 'vigilancia', label: 'Vigilancia', vars: { bg: '12 14 18', panel: '20 24 32', fg: '210 220 230', muted: '100 110 130', accent: '60 180 255', ok: '40 200 100', warn: '240 180 30', danger: '220 50 50', glow: '0', videoFilter: 'none' } },
  { id: 'noche', label: 'Noche', vars: { bg: '11 18 32', panel: '21 30 48', fg: '226 232 240', muted: '148 163 184', accent: '34 211 238', ok: '52 211 153', warn: '251 191 36', danger: '239 68 68', glow: '0', videoFilter: 'none' } },
  { id: 'dia', label: 'Día', vars: { bg: '241 245 249', panel: '255 255 255', fg: '15 23 42', muted: '100 116 139', accent: '14 116 144', ok: '16 185 129', warn: '245 158 11', danger: '220 38 38', glow: '0', videoFilter: 'none' } },
  { id: 'verde', label: 'Verde', vars: { bg: '7 20 18', panel: '15 35 30', fg: '220 240 232', muted: '140 170 160', accent: '52 211 153', ok: '52 211 153', warn: '251 191 36', danger: '239 68 68', glow: '0', videoFilter: 'none' } },
  { id: 'violeta', label: 'Violeta', vars: { bg: '17 12 32', panel: '28 22 50', fg: '232 226 244', muted: '160 150 190', accent: '167 139 250', ok: '52 211 153', warn: '251 191 36', danger: '239 68 68', glow: '0', videoFilter: 'none' } },
  { id: 'mono', label: 'Mono', vars: { bg: '10 10 12', panel: '22 22 26', fg: '235 235 240', muted: '140 140 150', accent: '220 220 230', ok: '140 220 140', warn: '220 200 100', danger: '220 100 100', glow: '0', videoFilter: 'none' } },
];

export function applySkin(id: string) {
  const skin = SKINS.find((s) => s.id === id) ?? SKINS[0];
  const root = document.documentElement;
  root.setAttribute('data-skin', skin.id);
  Object.entries(skin.vars).forEach(([k, v]) => {
    const cssKey = k === 'videoFilter' ? 'video-filter' : k;
    root.style.setProperty(`--${cssKey}`, v);
  });
}

export default function SettingsPanel() {
  const [skin, setSkin] = useState('noche');
  const [accent, setAccent] = useState('#22d3ee');
  const [cols, setCols] = useState('2');
  const [g2r, setG2r] = useState('');
  const [brand, setBrand] = useState('SENTINEL');
  const [motion, setMotion] = useState({ threshold: '9', interval: '2', cooldown: '10', notify: '' });

  useEffect(() => {
    api.getSettings().then((s) => {
      if (s.skin) { setSkin(s.skin); applySkin(s.skin); }
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

  const pickSkin = async (id: string) => {
    setSkin(id);
    applySkin(id);
    await api.setSetting('skin', id);
  };

  const changeAccent = async (v: string) => {
    setAccent(v);
    const r = v.replace('#', '');
    const rgb = [parseInt(r.slice(0, 2), 16), parseInt(r.slice(2, 4), 16), parseInt(r.slice(4, 6), 16)].join(' ');
    document.documentElement.style.setProperty('--accent', rgb);
    await api.setSetting('accent', v);
  };

  const saveG2r = () => {
    if (g2r.trim()) localStorage.setItem('g2rBase', g2r.trim());
    else localStorage.removeItem('g2rBase');
    window.location.reload();
  };

  const saveBrand = async () => {
    const val = brand.trim() || 'SENTINEL';
    setBrand(val);
    document.title = `${val} // Dashboard`;
    await api.setSetting('brand', val);
  };

  return (
    <div className="flex flex-col gap-4">
      <h2 className="text-lg font-bold text-fg">Personalizar</h2>

      <div>
        <div className="mb-1 text-sm text-muted">Nombre del sistema</div>
        <input value={brand} onChange={(e) => setBrand(e.target.value)} onBlur={saveBrand} placeholder="SENTINEL" className="w-full rounded bg-muted/10 px-2 py-1.5 text-sm" />
      </div>

      <div>
        <div className="mb-2 text-sm text-muted">Skin</div>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {SKINS.map((s) => (
            <button
              key={s.id}
              onClick={() => pickSkin(s.id)}
              className={`rounded-xl p-2 text-sm ${skin === s.id ? 'ring-2 ring-accent' : 'bg-muted/10 hover:bg-muted/20'}`}
              style={{ background: `rgb(${s.vars.panel})`, color: `rgb(${s.vars.fg})`, border: `1px solid rgb(${s.vars.muted})` }}
            >
              {s.label}
            </button>
          ))}
        </div>
      </div>

      <div>
        <div className="mb-1 text-sm text-muted">Color de acento</div>
        <input type="color" value={accent} onChange={(e) => changeAccent(e.target.value)} className="h-9 w-20 cursor-pointer" />
      </div>

      <div>
        <div className="mb-1 text-sm text-muted">Columnas del grid</div>
        <select value={cols} onChange={async (e) => { setCols(e.target.value); await api.setSetting('grid_cols', e.target.value); }} className="rounded bg-muted/10 px-3 py-1.5 text-sm">
          <option value="1">1</option>
          <option value="2">2</option>
          <option value="4">4</option>
        </select>
      </div>

      <div>
        <div className="mb-1 text-sm text-muted">Base de go2rtc (WebRTC/MJPEG)</div>
        <div className="flex gap-1">
          <input value={g2r} onChange={(e) => setG2r(e.target.value)} placeholder="http://<SERVER_IP>:1984" className="flex-1 rounded bg-muted/10 px-2 py-1.5 text-sm" />
          <button onClick={saveG2r} className="rounded bg-accent px-3 py-1.5 text-sm font-semibold text-black">Guardar</button>
        </div>
      </div>

      <div className="rounded-xl bg-panel p-3">
        <div className="mb-2 text-sm font-semibold text-fg">Detección de movimiento</div>
        <div className="grid grid-cols-2 gap-2 text-xs text-muted">
          <label className="flex flex-col gap-1">
            Umbral (diff media, 0-255)
            <input value={motion.threshold} onChange={(e) => setMotion((m) => ({ ...m, threshold: e.target.value }))} onBlur={() => api.setSetting('motion_threshold', motion.threshold)} className="rounded bg-muted/10 px-2 py-1 text-sm text-fg" />
          </label>
          <label className="flex flex-col gap-1">
            Intervalo (s)
            <input value={motion.interval} onChange={(e) => setMotion((m) => ({ ...m, interval: e.target.value }))} onBlur={() => api.setSetting('motion_interval', motion.interval)} className="rounded bg-muted/10 px-2 py-1 text-sm text-fg" />
          </label>
          <label className="flex flex-col gap-1">
            Cooldown entre eventos (s)
            <input value={motion.cooldown} onChange={(e) => setMotion((m) => ({ ...m, cooldown: e.target.value }))} onBlur={() => api.setSetting('motion_cooldown', motion.cooldown)} className="rounded bg-muted/10 px-2 py-1 text-sm text-fg" />
          </label>
          <label className="flex flex-col gap-1">
            Notify URL (ntfy/Telegram, opcional)
            <input value={motion.notify} onChange={(e) => setMotion((m) => ({ ...m, notify: e.target.value }))} onBlur={() => api.setSetting('notify_url', motion.notify)} placeholder="https://ntfy.sh/mitopic" className="rounded bg-muted/10 px-2 py-1 text-sm text-fg" />
          </label>
        </div>
        <p className="mt-2 text-[11px] text-muted">Los cambios se aplican al desenfocar cada campo.</p>
      </div>
    </div>
  );
}
