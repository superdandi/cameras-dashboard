import { useState } from 'react';
import type { Camera, CamStatus } from '../../types';
import { useCameraStream } from '../../hooks/useCameraStream';
import { useCameraAudio } from '../../hooks/useCameraAudio';
import { formatDurationSince, formatDateTime } from '../../hooks/useSessionTime';
import { api, snapshotUrl } from '../../api';
import { useCameraTelemetry } from './telemetryStore';
import { useCameraZoom, zoomIn, zoomOut, resetZoom } from './zoomStore';
import Sparkline from '../../components/Sparkline';

interface Props {
  camera: Camera;
  preferMain?: boolean;
  onClose: () => void;
  downtimeLabel?: string;
  status?: CamStatus;
  solo?: boolean;
  onSoloChange?: (solo: boolean) => void;
}

const DIRS: [string, string][] = [
  ['left up', '↖'], ['up', '↑'], ['right up', '↗'],
  ['left', '←'], ['stop', '●'], ['right', '→'],
  ['left down', '↙'], ['down', '↓'], ['right down', '↘'],
];

export default function OpsDetail({ camera, preferMain, onClose, downtimeLabel, status, solo = false, onSoloChange }: Props) {
  const { videoRef, mode, error, stats, mjpegSrc } = useCameraStream(camera, true, preferMain);
  const audio = useCameraAudio(camera);
  const tel = useCameraTelemetry(camera.id);
  const zoom = useCameraZoom(camera.id);
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

  const liveStats = mode === 'webrtc' ? stats : null;
  const bitrateHistory = tel?.bitrateHistory ?? [];
  const isDown = tel && !tel.ok;

  const healthBar = () => {
    const h = tel?.health ?? 0;
    const g = tel?.healthGrade ?? 'critical';
    const colorClass = `ops-health-${g}`;
    return (
      <div className="ops-health-bar-large">
        <div className="ops-health-bar-track">
          <div className={`ops-health-bar-fill ${colorClass}`} style={{ width: `${h}%` }} />
        </div>
        <span className={`ops-health-label ${colorClass}`}>{h} {g.toUpperCase()}</span>
      </div>
    );
  };

  return (
    <div className={`ops-detail-overlay${solo ? ' ops-solo' : ''}`}>
      <div className="ops-detail-container">
        {!solo && (
          <div className="ops-detail-header">
            <div className="ops-detail-title">
              <h2>{camera.name}</h2>
              <p>{camera.ip} · {camera.location} · {camera.model} · {camera.mac}</p>
            </div>
            <button onClick={onClose} className="ops-detail-close">✕ Cerrar</button>
          </div>
        )}

        <div className={`ops-detail-content${solo ? ' ops-detail-content-solo' : ''}`}>
          {/* Video */}
          <div className="ops-detail-video" onClick={() => onSoloChange?.(!solo)} title={solo ? 'Volver al detalle' : 'Ver solo la cámara'}>
            <video ref={videoRef} muted autoPlay playsInline className="h-full w-full object-contain" style={{ display: mode === 'webrtc' ? '' : 'none', transform: `scale(${zoom})`, transformOrigin: 'center' }} />
            {mode === 'mjpeg' && <img src={mjpegSrc} alt={camera.name} className="h-full w-full object-contain" style={{ transform: `scale(${zoom})`, transformOrigin: 'center' }} />}
            {mode === 'off' && <img src={snapshotUrl(camera.id)} alt={camera.name} className="h-full w-full object-contain" style={{ transform: `scale(${zoom})`, transformOrigin: 'center' }} />}
            <button
              className="ops-audio-btn"
              data-cam-audio={camera.id}
              onClick={(e) => { e.stopPropagation(); audio.toggle(); }}
              title={audio.enabled ? 'Desactivar audio' : 'Activar audio'}
            >
              {audio.enabled ? '🔊' : '🔇'}
            </button>
            <span className="ops-detail-mode">{mode.toUpperCase()}</span>
            {solo && (
              <span className="ops-solo-badge">SOLO · Esc para volver</span>
            )}
            {error && <span className="ops-detail-error">{error}</span>}
            {isDown && downtimeLabel && (
              <div className="ops-detail-offline">CAÍDO · {downtimeLabel}</div>
            )}
          </div>

          {!solo && (
            <>
          {/* Health */}
          <div className="ops-detail-section">
            <div className="ops-detail-section-header">SALUD DEL STREAM</div>
            {healthBar()}
          </div>

          {/* Technical Panel */}
          <div className="ops-detail-section">
            <div className="ops-detail-section-header">TÉCNICO</div>
            <div className="ops-tech-grid">
              <div className="ops-tech-box">
                <div className="ops-tech-label">CODEC</div>
                <div className="ops-tech-value">{liveStats?.codec ?? tel?.sourceCodec ?? '?'}</div>
              </div>
              <div className="ops-tech-box">
                <div className="ops-tech-label">RESOLUCIÓN</div>
                <div className="ops-tech-value">{liveStats?.width ? `${liveStats.width}×${liveStats.height}` : tel?.sourceResolution ?? '?'}</div>
              </div>
              <div className="ops-tech-box">
                <div className="ops-tech-label">FPS RECIBIDOS</div>
                <div className={`ops-tech-value ${liveStats ? (liveStats.fpsIn < 10 ? 'stat-danger' : 'stat-ok') : ''}`}>
                  {liveStats?.fpsIn ?? '—'}
                </div>
              </div>
              <div className="ops-tech-box">
                <div className="ops-tech-label">FPS DECODIFICADOS</div>
                <div className={`ops-tech-value ${liveStats ? (liveStats.fpsDecoded < 10 ? 'stat-danger' : 'stat-ok') : ''}`}>
                  {liveStats?.fpsDecoded ?? '—'}
                </div>
              </div>
              <div className="ops-tech-box">
                <div className="ops-tech-label">FRAMES PERDIDOS</div>
                <div className={`ops-tech-value ${liveStats && liveStats.framesDropped > 0 ? 'stat-warn' : 'stat-ok'}`}>
                  {liveStats?.framesDropped ?? '—'}
                </div>
              </div>
              <div className="ops-tech-box">
                <div className="ops-tech-label">RTT</div>
                <div className={`ops-tech-value ${liveStats ? (liveStats.rtt < 100 ? 'stat-ok' : liveStats.rtt < 300 ? 'stat-warn' : 'stat-danger') : '—'}`}>
                  {liveStats?.rtt ?? '—'} ms
                </div>
              </div>
              <div className="ops-tech-box">
                <div className="ops-tech-label">JITTER</div>
                <div className={`ops-tech-value ${liveStats ? (liveStats.jitter < 10 ? 'stat-ok' : liveStats.jitter < 50 ? 'stat-warn' : 'stat-danger') : '—'}`}>
                  {liveStats?.jitter ?? '—'} ms
                </div>
              </div>
              <div className="ops-tech-box">
                <div className="ops-tech-label">PÉRDIDA PKT</div>
                <div className={`ops-tech-value ${liveStats ? (liveStats.packetLoss < 0.5 ? 'stat-ok' : liveStats.packetLoss < 2 ? 'stat-warn' : 'stat-danger') : '—'}`}>
                  {liveStats?.packetLoss ?? '—'}%
                </div>
              </div>
              <div className="ops-tech-box">
                <div className="ops-tech-label">PKT RECIBIDOS</div>
                <div className="ops-tech-value">{liveStats?.packetsTotal ?? '—'}</div>
              </div>
            </div>
          </div>

          {/* Red */}
          <div className="ops-detail-section">
            <div className="ops-detail-section-header">RED</div>
            <div className="ops-tech-grid">
              <div className="ops-tech-box">
                <div className="ops-tech-label">BITRATE CAM</div>
                <div className="ops-tech-value ops-tech-highlight">
                  {tel && tel.sourceBitrate > 0
                    ? tel.sourceBitrate > 1000
                      ? `${(tel.sourceBitrate / 1000).toFixed(1)} Mbps`
                      : `${tel.sourceBitrate} kbps`
                    : '—'}
                </div>
              </div>
              <div className="ops-tech-box">
                <div className="ops-tech-label">BITRATE WEBRTC</div>
                <div className="ops-tech-value ops-tech-highlight">
                  {liveStats && liveStats.bitrate > 0
                    ? liveStats.bitrate > 1000
                      ? `${(liveStats.bitrate / 1000).toFixed(1)} Mbps`
                      : `${liveStats.bitrate} kbps`
                    : '—'}
                </div>
              </div>
              <div className="ops-tech-box">
                <div className="ops-tech-label">PROTOCOLO</div>
                <div className="ops-tech-value">{tel?.sourceProtocol ?? '—'}</div>
              </div>
              <div className="ops-tech-box">
                <div className="ops-tech-label">IP FUENTE</div>
                <div className="ops-tech-value">{tel?.sourceIp ?? '—'}</div>
              </div>
              <div className="ops-tech-box">
                <div className="ops-tech-label">CONSUMERS</div>
                <div className="ops-tech-value">{tel?.consumers ?? 0}</div>
              </div>
            </div>
            {bitrateHistory.length > 2 && (
              <div className="ops-detail-chart">
                <div className="ops-detail-chart-header">BITRATE HISTORY</div>
                <Sparkline data={bitrateHistory} width={280} height={40} />
              </div>
            )}
          </div>

          {/* Sesión de Stream */}
          <div className="ops-detail-section">
            <div className="ops-detail-section-header">SESIÓN DE STREAM</div>
            <div className="ops-tech-grid">
              <div className="ops-tech-box">
                <div className="ops-tech-label">EN DIRECTO DESDE</div>
                <div className="ops-tech-value ops-tech-highlight">
                  {status?.live_since ? formatDateTime(status.live_since) : '—'}
                </div>
              </div>
              <div className="ops-tech-box">
                <div className="ops-tech-label">TIEMPO EN DIRECTO</div>
                <div className={`ops-tech-value ops-tech-highlight ${status?.live_since ? 'stat-ok' : ''}`}>
                  {status?.live_since ? formatDurationSince(status.live_since) : '—'}
                </div>
              </div>
              <div className="ops-tech-box">
                <div className="ops-tech-label">ÚLTIMO CORTE</div>
                <div className="ops-tech-value">
                  {status?.last_cut_at ? formatDateTime(status.last_cut_at) : 'sin cortes'}
                </div>
              </div>
            </div>
          </div>

          {/* PTZ Controls */}
          <div className="ops-ptz-panel">
            <div className="ops-ptz-speed">
              Velocidad: <span className="text-accent">{speed}</span>
            </div>
            <input
              type="range" min={5} max={63} value={speed}
              onChange={(e) => setSpeed(Number(e.target.value))}
              className="ops-ptz-slider"
            />
            <div className="ops-ptz-grid">
              {DIRS.map(([act, sym]) => (
                <button
                  key={act}
                  onClick={() => send(act)}
                  className="ops-ptz-btn"
                  disabled={busy || !camera.has_ptz}
                  title={act}
                >
                  {sym}
                </button>
              ))}
            </div>
            <div className="ops-ptz-zoom">
              <button onClick={() => zoomOut(camera.id)} className="ops-ptz-btn zoom">− Zoom</button>
              <span className="ops-ptz-zoom-indicator">×{zoom.toFixed(1)}</span>
              <button onClick={() => zoomIn(camera.id)} className="ops-ptz-btn zoom">+ Zoom</button>
              <button onClick={() => resetZoom(camera.id)} className="ops-ptz-btn zoom" disabled={zoom <= 1} title="Restablecer zoom">1×</button>
            </div>
            <div className="ops-ptz-presets">
              <div className="ops-ptz-presets-title">Presets</div>
              <div className="ops-ptz-presets-grid">
                {[1, 2, 3].map((n) => (
                  <button key={n} onClick={() => preset('goto', n)} className="ops-ptz-btn preset">P{n}</button>
                ))}
              </div>
              <div className="ops-ptz-presets-grid mt-1">
                <button onClick={() => preset('set', 1)} className="ops-ptz-btn preset">Guardar 1</button>
                <button onClick={() => preset('set', 2)} className="ops-ptz-btn preset">Guardar 2</button>
                <button onClick={() => preset('set', 3)} className="ops-ptz-btn preset">Guardar 3</button>
              </div>
            </div>
            {msg && <div className="ops-ptz-msg">{msg}</div>}
            </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
