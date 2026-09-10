import { useState } from 'react';
import type { Camera, CamStatus } from '../../types';
import { useCameraStream } from '../../hooks/useCameraStream';
import { api, snapshotUrl } from '../../api';

interface Props {
  camera: Camera;
  status?: CamStatus;
  preferMain?: boolean;
  onClose: () => void;
  onExpand: () => void;
}

const DIRS: [string, string][] = [
  ['left up', '↖'], ['up', '↑'], ['right up', '↗'],
  ['left', '←'], ['stop', '●'], ['right', '→'],
  ['left down', '↙'], ['down', '↓'], ['right down', '↘'],
];

export default function CyberSphereDetail({ camera, status, preferMain, onClose, onExpand }: Props) {
  const { videoRef, mode, error, mjpegSrc } = useCameraStream(camera, true, preferMain);
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
    <div className="cyber-sphere-detail">
      {/* Header bar */}
      <div className="cyber-sphere-detail-header">
        <div className="cyber-sphere-detail-title">
          <span className="cyber-sphere-detail-name">{camera.name}</span>
          <span className="cyber-sphere-detail-info">{camera.ip} · {camera.location}</span>
        </div>
        <div className="cyber-sphere-detail-actions">
          <button onClick={onExpand} className="cyber-sphere-detail-btn expand">
            EXPAND
          </button>
          <button onClick={onClose} className="cyber-sphere-detail-btn close">
            ✕
          </button>
        </div>
      </div>

      <div className="cyber-sphere-detail-body">
        {/* Stream preview */}
        <div className="cyber-sphere-detail-stream">
          <video ref={videoRef} muted autoPlay playsInline className="cyber-sphere-detail-video" style={{ display: mode === 'webrtc' ? '' : 'none' }} />
          {mode === 'mjpeg' && (
            <img src={mjpegSrc} alt={camera.name} className="cyber-sphere-detail-video" />
          )}
          {mode === 'off' && (
            <img src={snapshotUrl(camera.id)} alt={camera.name} className="cyber-sphere-detail-video" />
          )}
          <div className="cyber-hud-corners" />
          <div className="cyber-scanlines" />
          <span className="cyber-sphere-detail-mode">{mode.toUpperCase()}</span>
          {error && <span className="cyber-sphere-detail-error">{error}</span>}
          {status && (
            <span className="cyber-sphere-detail-status">
              {status.ok ? '● ONLINE' : '○ OFFLINE'}
            </span>
          )}
        </div>

        {/* PTZ panel */}
        <div className="cyber-sphere-detail-ptz">
          <div className="cyber-sphere-detail-ptz-title">PTZ CONTROL</div>

          <div className="cyber-sphere-detail-ptz-speed">
            SPD: <span className="text-cyan">{speed}</span>
          </div>
          <input
            type="range" min={5} max={63} value={speed}
            onChange={(e) => setSpeed(Number(e.target.value))}
            className="cyber-sphere-detail-ptz-slider"
          />

          <div className="cyber-sphere-detail-ptz-grid">
            {DIRS.map(([act, sym]) => (
              <button
                key={act}
                onClick={() => send(act)}
                className="cyber-sphere-detail-ptz-btn"
                disabled={busy || !camera.has_ptz}
                title={act}
              >
                {sym}
              </button>
            ))}
          </div>

          <div className="cyber-sphere-detail-ptz-zoom">
            <button onClick={() => send('zoomin')} className="cyber-sphere-detail-ptz-btn zoom" disabled={busy || !camera.has_ptz}>
              + ZOOM
            </button>
            <button onClick={() => send('zoomout')} className="cyber-sphere-detail-ptz-btn zoom" disabled={busy || !camera.has_ptz}>
              − ZOOM
            </button>
          </div>

          <div className="cyber-sphere-detail-ptz-presets">
            <div className="cyber-sphere-detail-ptz-presets-label">PRESETS</div>
            <div className="cyber-sphere-detail-ptz-presets-row">
              {[1, 2, 3].map((n) => (
                <button key={n} onClick={() => preset('goto', n)} className="cyber-sphere-detail-ptz-btn preset">
                  P{n}
                </button>
              ))}
            </div>
            <div className="cyber-sphere-detail-ptz-presets-row">
              {[1, 2, 3].map((n) => (
                <button key={`s${n}`} onClick={() => preset('set', n)} className="cyber-sphere-detail-ptz-btn preset save">
                  SAVE {n}
                </button>
              ))}
            </div>
          </div>

          {msg && <div className="cyber-sphere-detail-ptz-msg">{msg}</div>}
        </div>
      </div>
    </div>
  );
}
