import type { Camera } from '../types';
import { useCameraStream } from '../hooks/useCameraStream';
import { snapshotUrl } from '../api';

interface Props {
  camera: Camera;
  active: boolean;
  preferMain?: boolean;
  onSelect: (c: Camera) => void;
}

export default function CameraTile({ camera, active, preferMain, onSelect }: Props) {
  const { videoRef, mode, mjpegSrc } = useCameraStream(
    camera,
    active && camera.enabled,
    preferMain,
  );

  return (
    <button
      className="tile group cursor-pointer text-left focus:outline-none focus:ring-2 focus:ring-accent"
      style={{ aspectRatio: '16/9' }}
      onClick={() => onSelect(camera)}
      title={`${camera.name} — ${camera.location}`}
    >
      {mode === 'webrtc' && <video ref={videoRef} muted autoPlay playsInline />}
      {mode === 'mjpeg' && <img src={mjpegSrc} alt={camera.name} />}
      {mode === 'off' && (
        <img src={snapshotUrl(camera.id)} alt={camera.name} className="opacity-90" />
      )}
      <div className="absolute bottom-0 left-0 right-0 flex items-center justify-between bg-gradient-to-t from-black/70 to-transparent px-2 pb-1 pt-4 text-xs text-white">
        <span className="font-semibold">{camera.name}</span>
        <span className="rounded bg-black/40 px-1.5 py-0.5 text-[10px] uppercase tracking-wide">
          {mode === 'webrtc' ? 'en vivo' : mode === 'mjpeg' ? 'mjpeg' : 'foto'}
        </span>
      </div>
    </button>
  );
}
