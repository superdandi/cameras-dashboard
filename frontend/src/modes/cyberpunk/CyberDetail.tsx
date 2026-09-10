import { useState } from 'react';
import type { Camera, CamStatus } from '../../types';
import { useCameraStream } from '../../hooks/useCameraStream';
import { useCameraAudio } from '../../hooks/useCameraAudio';
import { api, snapshotUrl } from '../../api';

interface Props {
  camera: Camera;
  preferMain?: boolean;
  onClose: () => void;
  status?: CamStatus;
  solo?: boolean;
  onSoloChange?: (solo: boolean) => void;
}

const DIRS: [string, string][] = [
  ['left up', '↖'], ['up', '↑'], ['right up', '↗'],
  ['left', '←'], ['stop', '●'], ['right', '→'],
  ['left down', '↙'], ['down', '↓'], ['right down', '↘'],
];

export default function CyberDetail({ camera, preferMain, onClose }: Props) {
  const { videoRef, mode, error, mjpegSrc } = useCameraStream(camera, true, preferMain);
  const audio = useCameraAudio(camera);
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
    <div className="cyber-detail-overlay">
      <div className="cyber-detail-container">
        {/* Header */}
        <div className="cyber-detail-header">
          <div className="cyber-detail-title">
            <h2>{camera.name}</h2>
            <p>{camera.ip} · {camera.location} · {camera.model}</p>
          </div>
          <button onClick={onClose} className="cyber-detail-close">
            ✕ CERRAR
          </button>
        </div>

        <div className="cyber-detail-content">
          {/* Video with HUD */}
          <div className="cyber-detail-video">
            <video ref={videoRef} muted autoPlay playsInline className="h-full w-full object-contain" style={{ display: mode === 'webrtc' ? '' : 'none' }} />
            {mode === 'mjpeg' && <img src={mjpegSrc} alt={camera.name} className="h-full w-full object-contain" />}
            {mode === 'off' && <img src={snapshotUrl(camera.id)} alt={camera.name} className="h-full w-full object-contain" />}
            <button
              className="cyber-audio-btn"
              onClick={(e) => { e.stopPropagation(); audio.toggle(); }}
              title={audio.enabled ? 'Desactivar audio' : 'Activar audio'}
            >
              {audio.enabled ? '🔊' : '🔇'}
            </button>
            <div className="cyber-hud-corners" />
            <div className="cyber-scanlines" />
            <span className="cyber-detail-mode">{mode.toUpperCase()}</span>
            {error && <span className="cyber-detail-error">{error}</span>}
          </div>

          {/* PTZ Controls */}
          <div className="cyber-ptz-panel">
            <div className="cyber-ptz-speed">
              VELOCIDAD: <span className="text-accent">{speed}</span>
            </div>
            <input
              type="range" min={5} max={63} value={speed}
              onChange={(e) => setSpeed(Number(e.target.value))}
              className="cyber-ptz-slider"
            />
            <div className="cyber-ptz-grid">
              {DIRS.map(([act, sym]) => (
                <button
                  key={act}
                  onClick={() => send(act)}
                  className="cyber-ptz-btn"
                  disabled={busy || !camera.has_ptz}
                  title={act}
                >
                  {sym}
                </button>
              ))}
            </div>
            <div className="cyber-ptz-zoom">
              <button onClick={() => send('zoomin')} className="cyber-ptz-btn zoom" disabled={busy || !camera.has_ptz}>+ ZOOM</button>
              <button onClick={() => send('zoomout')} className="cyber-ptz-btn zoom" disabled={busy || !camera.has_ptz}>− ZOOM</button>
            </div>
            <div className="cyber-ptz-presets">
              <div className="cyber-ptz-presets-title">PRESETS</div>
              <div className="cyber-ptz-presets-grid">
                {[1, 2, 3].map((n) => (
                  <button key={n} onClick={() => preset('goto', n)} className="cyber-ptz-btn preset">P{n}</button>
                ))}
              </div>
              <div className="cyber-ptz-presets-grid mt-1">
                <button onClick={() => preset('set', 1)} className="cyber-ptz-btn preset">GUARDAR 1</button>
                <button onClick={() => preset('set', 2)} className="cyber-ptz-btn preset">GUARDAR 2</button>
                <button onClick={() => preset('set', 3)} className="cyber-ptz-btn preset">GUARDAR 3</button>
              </div>
            </div>
            {msg && <div className="cyber-ptz-msg">{msg}</div>}
          </div>
        </div>
      </div>
    </div>
  );
}
