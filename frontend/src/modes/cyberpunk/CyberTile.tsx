import type { Camera } from '../../types';
import { useCameraStream } from '../../hooks/useCameraStream';
import { useCameraAudio } from '../../hooks/useCameraAudio';
import { snapshotUrl } from '../../api';

interface Props {
  camera: Camera;
  active: boolean;
  preferMain?: boolean;
  onSelect: (c: Camera) => void;
}

export default function CyberTile({ camera, active, preferMain, onSelect }: Props) {
  const { videoRef, mode, mjpegSrc } = useCameraStream(camera, active && camera.enabled, preferMain);
  const audio = useCameraAudio(camera);

  return (
    <button
      className="cyber-tile group cursor-pointer text-left focus:outline-none focus:ring-2 focus:ring-accent"
      style={{ aspectRatio: '16/9' }}
      onClick={() => onSelect(camera)}
      title={`${camera.name} — ${camera.location}`}
    >
      {/* Video/Image */}
      <video ref={videoRef} muted autoPlay playsInline style={{ display: mode === 'webrtc' ? '' : 'none' }} />
      {mode === 'mjpeg' && <img src={mjpegSrc} alt={camera.name} />}
      {mode === 'off' && <img src={snapshotUrl(camera.id)} alt={camera.name} className="opacity-90" />}

      {/* Audio toggle */}
      <button
        className="cyber-audio-btn"
        onClick={(e) => { e.stopPropagation(); audio.toggle(); }}
        title={audio.enabled ? 'Desactivar audio' : 'Activar audio'}
      >
        {audio.enabled ? '🔊' : '🔇'}
      </button>

      {/* HUD corners */}
      <div className="cyber-hud-corners" />

      {/* Scanlines overlay */}
      <div className="cyber-scanlines" />

      {/* REC indicator */}
      {mode === 'webrtc' && (
        <div className="cyber-rec-indicator">
          <span className="cyber-rec-dot" />
          REC
        </div>
      )}

      {/* CAM ID overlay */}
      <div className="cyber-cam-id">{camera.name}</div>

      {/* Bottom info */}
      <div className="cyber-tile-info">
        <span className="cyber-tile-name">{camera.name}</span>
        <span className="cyber-tile-status">
          {mode === 'webrtc' ? 'LIVE' : mode === 'mjpeg' ? 'MJPEG' : 'SNAP'}
        </span>
      </div>
    </button>
  );
}
