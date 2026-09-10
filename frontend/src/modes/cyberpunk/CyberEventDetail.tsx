import type { Camera } from '../../types';
import { snapshotUrl } from '../../api';

interface Props {
  camera: Camera;
  event: { type: string; ts: string; payload: string } | null;
  onClose: () => void;
}

export default function CyberEventDetail({ camera, event, onClose }: Props) {
  return (
    <div className="cyber-sphere-detail">
      <div className="cyber-sphere-detail-header">
        <div className="cyber-sphere-detail-title">
          <span className="cyber-sphere-detail-name">{camera.name}</span>
          <span className="cyber-sphere-detail-info">{camera.ip} · {camera.location}</span>
        </div>
        <div className="cyber-sphere-detail-actions">
          <button onClick={onClose} className="cyber-sphere-detail-btn close">CERRAR</button>
        </div>
      </div>
      <div className="cyber-sphere-detail-body">
        <div className="cyber-sphere-detail-stream">
          <img src={snapshotUrl(camera.id)} alt={camera.name} className="cyber-sphere-detail-video" />
          <div className="cyber-hud-corners" />
          <div className="cyber-scanlines" />
          <span className="cyber-sphere-detail-mode">SNAPSHOT</span>
          <span className="cyber-sphere-detail-status">● ONLINE</span>
        </div>
        <div className="cyber-sphere-detail-ptz">
          <div className="cyber-sphere-detail-ptz-title">ÚLTIMO EVENTO</div>
          {event ? (
            <>
              <div className="cyber-event-field">
                <span className="cyber-event-label">TIPO</span>
                <span className="cyber-event-value">{event.type.toUpperCase()}</span>
              </div>
              <div className="cyber-event-field">
                <span className="cyber-event-label">HORA</span>
                <span className="cyber-event-value">{event.ts}</span>
              </div>
              <div className="cyber-event-field">
                <span className="cyber-event-label">DETALLE</span>
                <span className="cyber-event-value">{event.payload}</span>
              </div>
            </>
          ) : (
            <div className="cyber-event-field">
              <span className="cyber-event-value" style={{ color: 'rgb(var(--muted) / 0.5)' }}>Sin eventos registrados</span>
            </div>
          )}
          <div className="cyber-event-field" style={{ marginTop: 'auto' }}>
            <span className="cyber-event-label">MODELO</span>
            <span className="cyber-event-value">{camera.model}</span>
          </div>
          <div className="cyber-event-field">
            <span className="cyber-event-label">MAC</span>
            <span className="cyber-event-value">{camera.mac}</span>
          </div>
        </div>
      </div>
    </div>
  );
}
