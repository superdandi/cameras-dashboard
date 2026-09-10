import { useEffect, useRef, useState } from 'react';
import type { Camera } from '../../types';
import type { CamStatus } from '../../types';
import { useCameraStream } from '../../hooks/useCameraStream';
import { useCameraAudio } from '../../hooks/useCameraAudio';
import { useCameraTelemetry, pushTelemetry, pushBytes } from './telemetryStore';
import { useNow, formatDurationSince } from '../../hooks/useSessionTime';
import { useCameraZoom } from './zoomStore';
import { snapshotUrl } from '../../api';
import Sparkline from '../../components/Sparkline';

interface Props {
  camera: Camera;
  status?: CamStatus;
  active: boolean;
  preferMain?: boolean;
  onSelect: (c: Camera) => void;
  downtimeLabel?: string;
  liveSince?: number;
  lastCutAt?: number;
  dragHandle?: React.ReactNode;
  selected?: boolean;
}

function statColor(value: number, okMax: number, warnMax: number): string {
  if (value <= okMax) return 'stat-ok';
  if (value <= warnMax) return 'stat-warn';
  return 'stat-danger';
}

export default function OpsTile({ camera, status, active, preferMain, onSelect, downtimeLabel, liveSince, lastCutAt, dragHandle, selected }: Props) {
  const { videoRef, mode, mjpegSrc, stats } = useCameraStream(camera, active && camera.enabled, preferMain);
  const audio = useCameraAudio(camera);
  const tel = useCameraTelemetry(camera.id);
  const zoom = useCameraZoom(camera.id);
  const now = useNow(1000);
  const [bitrateHist, setBitrateHist] = useState<number[]>([]);
  const prevBytesRef = useRef(status?.bytes ?? 0);

  useEffect(() => {
    if (mode !== 'webrtc' || stats.bitrate <= 0) return;
    setBitrateHist((h) => [...h.slice(-59), stats.bitrate]);
  }, [mode, stats.bitrate]);

  useEffect(() => {
    if (mode !== 'webrtc' && status) {
      const delta = status.bytes - prevBytesRef.current;
      prevBytesRef.current = status.bytes;
      if (delta > 0) {
        const br = Math.round((delta * 8) / 15);
        setBitrateHist((h) => [...h.slice(-59), br]);
        pushBytes(camera.id, camera.name, status.bytes, br);
      }
    }
  }, [status?.bytes, mode, status, camera.id, camera.name]);

  useEffect(() => {
    if (mode === 'webrtc' && stats.bitrate > 0) {
      pushTelemetry(camera.id, camera.name, stats);
    }
  }, [mode, stats, camera.id, camera.name]);

  const statusColor = !status ? 'bg-muted' : status.ok ? 'bg-ok' : 'bg-danger';
  const isDown = status && !status.ok;
  const isOffline = mode === 'off' && !isDown;

  const healthSegments = (grade: string) => {
    switch (grade) {
      case 'ok': return 4;
      case 'warn': return 3;
      case 'degraded': return 2;
      default: return 1;
    }
  };

  return (
    <button
      className={`ops-tile group cursor-pointer text-left focus:outline-none focus:ring-2 focus:ring-accent${selected ? ' ops-tile-selected' : ''}`}
      style={{ aspectRatio: '16/9' }}
      onClick={() => onSelect(camera)}
      title={`${camera.name} — ${camera.location}`}
    >
      {dragHandle}

      {/* Audio toggle */}
      <button
        className="ops-audio-btn"
        data-cam-audio={camera.id}
        onClick={(e) => { e.stopPropagation(); audio.toggle(); }}
        title={audio.enabled ? 'Desactivar audio' : 'Activar audio'}
      >
        {audio.enabled ? '🔊' : '🔇'}
      </button>

      <video ref={videoRef} muted autoPlay playsInline style={{ display: mode === 'webrtc' ? '' : 'none', transform: `scale(${zoom})`, transformOrigin: 'center' }} />
      {mode === 'mjpeg' && <img src={mjpegSrc} alt={camera.name} style={{ transform: `scale(${zoom})`, transformOrigin: 'center' }} />}
      {mode === 'off' && <img src={snapshotUrl(camera.id)} alt={camera.name} className="opacity-90" style={{ transform: `scale(${zoom})`, transformOrigin: 'center' }} />}

      {isDown && downtimeLabel && (
        <div className="ops-tile-offline-overlay">
          <span className="ops-tile-offline-icon">⚠</span>
          <span className="ops-tile-offline-text">CAÍDO · {downtimeLabel}</span>
        </div>
      )}

      {isOffline && (
        <div className="ops-tile-offline-overlay ops-offline-no-signal">
          <span className="ops-tile-offline-text">SIN SEÑAL</span>
        </div>
      )}

      <div className="ops-tile-footer">
        <div className="ops-tile-status-row">
          <span className={`ops-status-dot ${statusColor}`} />
          <span className="ops-tile-name">{camera.name}</span>
          {mode === 'webrtc' && (
            <span className="ops-tile-live">● LIVE</span>
          )}
          <span className="ops-tile-mode">
            {mode === 'webrtc' ? 'WEBRTC' : mode === 'mjpeg' ? 'MJPEG' : 'OFF'}
          </span>
          {zoom > 1.05 && <span className="ops-chip ops-chip-zoom">×{zoom.toFixed(1)}</span>}
        </div>

        <div className="ops-tile-data-row">
          {liveSince ? (
            <span className="ops-chip ops-chip-live">● {formatDurationSince(liveSince)}</span>
          ) : null}
          {mode === 'webrtc' ? (
            <>
              <span className="ops-chip ops-chip-codec">{stats.codec}</span>
              <span className={`ops-tile-stat ${statColor(stats.fps, 20, 10)}`}>{stats.fps}f</span>
              <span className={`ops-tile-stat ${statColor(stats.rtt, 100, 300)}`}>{stats.rtt}ms</span>
              <span className={`ops-tile-stat ${statColor(stats.packetLoss, 0.5, 2)}`}>{stats.packetLoss}%</span>
            </>
          ) : (
            <>
              <span className="ops-tile-stat">{camera.ip}</span>
              {status && (
                <span className={`ops-tile-stat ${status.ok ? 'stat-ok' : 'stat-danger'}`}>
                  HTTP {status.status}
                </span>
              )}
            </>
          )}

          {tel && tel.sourceBitrate > 0 && (
            <span className="ops-chip ops-chip-bitrate">
              {tel.sourceBitrate > 1000 ? `${(tel.sourceBitrate / 1000).toFixed(1)}M` : `${tel.sourceBitrate}k`}
            </span>
          )}

          <div className="ops-tile-health">
            {[1, 2, 3, 4].map((i) => (
              <span
                key={i}
                className={`ops-health-seg ${i <= healthSegments(tel?.healthGrade ?? 'critical') ? `ops-health-${tel?.healthGrade ?? 'critical'}` : ''}`}
              />
            ))}
          </div>

          <div className="ops-tile-spark">
            <Sparkline data={bitrateHist} width={70} height={14} />
          </div>
        </div>
      </div>
    </button>
  );
}
