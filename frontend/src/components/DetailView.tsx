import { useState } from 'react';
import type { Camera } from '../types';
import { useCameraStream } from '../hooks/useCameraStream';
import { api, snapshotUrl } from '../api';

interface Props {
  camera: Camera;
  preferMain?: boolean;
  onClose: () => void;
}

const DIRS: [string, string][] = [
  ['left up', '↖'], ['up', '↑'], ['right up', '↗'],
  ['left', '←'], ['stop', '●'], ['right', '→'],
  ['left down', '↙'], ['down', '↓'], ['right down', '↘'],
];

export default function DetailView({ camera, preferMain, onClose }: Props) {
  const { videoRef, mode, error } = useCameraStream(camera, true, preferMain);
  const [speed, setSpeed] = useState(40);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');

  const send = async (act: string) => {
    if (busy) return;
    setBusy(true);
    setMsg('');
    try {
      const r = await api.ptz(camera.id, act, speed, act === 'stop' ? 0 : 250);
      setMsg(r.response);
    } catch (e) {
      setMsg(String((e as Error).message));
    } finally {
      setBusy(false);
    }
  };

  const preset = async (act: 'set' | 'goto' | 'clear', n: number) => {
    setBusy(true);
    try {
      const r = await api.preset(camera.id, act, n);
      setMsg(`preset ${n} ${act}: ${r.response}`);
    } catch (e) {
      setMsg(String((e as Error).message));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/70 p-2 backdrop-blur-sm sm:p-6">
      <div className="w-full max-w-5xl overflow-hidden rounded-2xl bg-panel shadow-2xl">
        <div className="flex items-center justify-between border-b border-muted/20 px-4 py-2">
          <div>
            <h2 className="text-lg font-bold text-fg">{camera.name}</h2>
            <p className="text-xs text-muted">{camera.ip} · {camera.location} · {camera.model}</p>
          </div>
          <button onClick={onClose} className="rounded-lg bg-muted/10 px-3 py-1.5 text-sm hover:bg-muted/20">
            ✕ Cerrar
          </button>
        </div>

        <div className="grid gap-4 p-4 lg:grid-cols-[1fr_auto]">
          <div className="relative aspect-video overflow-hidden rounded-xl bg-black">
            {mode === 'webrtc' && <video ref={videoRef} muted autoPlay playsInline className="h-full w-full object-contain" />}
            {mode !== 'webrtc' && (
              <img src={snapshotUrl(camera.id)} alt={camera.name} className="h-full w-full object-contain" />
            )}
            <span className="absolute left-2 top-2 rounded bg-black/60 px-2 py-0.5 text-[10px] uppercase tracking-wider text-emerald-300">
              {mode}
            </span>
            {error && <span className="absolute bottom-2 left-2 text-xs text-amber-300">{error}</span>}
          </div>

          <div className="flex flex-col gap-3">
            <div className="text-xs text-muted">Velocidad: <b className="text-fg">{speed}</b></div>
            <input
              type="range" min={5} max={63} value={speed}
              onChange={(e) => setSpeed(Number(e.target.value))}
              className="w-40 accent-accent"
            />
            <div className="grid grid-cols-3 gap-1">
              {DIRS.map(([act, sym]) => (
                <button
                  key={act}
                  onClick={() => send(act)}
                  className="rounded-lg bg-muted/10 py-2 text-xl hover:bg-accent hover:text-black disabled:opacity-40"
                  disabled={busy || !camera.has_ptz}
                  title={act}
                >
                  {sym}
                </button>
              ))}
            </div>
            <div className="grid grid-cols-2 gap-1">
              <button onClick={() => send('zoomin')} className="rounded-lg bg-muted/10 py-2 text-sm hover:bg-accent hover:text-black" disabled={busy || !camera.has_ptz}>+ Zoom</button>
              <button onClick={() => send('zoomout')} className="rounded-lg bg-muted/10 py-2 text-sm hover:bg-accent hover:text-black" disabled={busy || !camera.has_ptz}>− Zoom</button>
            </div>
            <div className="rounded-lg bg-muted/10 p-2 text-xs">
              <div className="mb-1 font-semibold text-muted">Presets</div>
              <div className="flex flex-wrap gap-1">
                {[1, 2, 3].map((n) => (
                  <button key={n} onClick={() => preset('goto', n)} className="rounded bg-muted/10 px-2 py-1 hover:bg-accent hover:text-black">P{n}</button>
                ))}
              </div>
              <div className="mt-1 flex gap-1">
                <button onClick={() => preset('set', 1)} className="rounded bg-muted/10 px-2 py-1 hover:bg-accent hover:text-black">Guardar 1</button>
                <button onClick={() => preset('set', 2)} className="rounded bg-muted/10 px-2 py-1 hover:bg-accent hover:text-black">Guardar 2</button>
                <button onClick={() => preset('set', 3)} className="rounded bg-muted/10 px-2 py-1 hover:bg-accent hover:text-black">Guardar 3</button>
              </div>
            </div>
            {msg && <div className="rounded bg-muted/10 px-2 py-1 text-[11px] text-muted">{msg}</div>}
          </div>
        </div>
      </div>
    </div>
  );
}
