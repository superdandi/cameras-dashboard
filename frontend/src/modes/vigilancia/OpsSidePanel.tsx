import { useMemo, useState } from 'react';
import type { Camera, CamStatus } from '../../types';
import { useEvents } from '../../hooks/useEvents';
import { useTelemetry } from './telemetryStore';
import Sparkline from '../../components/Sparkline';
import Gauge from '../../components/Gauge';
import HourlyChart from '../../components/HourlyChart';

interface Props {
  cameras: Camera[];
  status: Record<number, CamStatus>;
}

const healthBarClass = (grade: string) => {
  switch (grade) {
    case 'ok': return 'ops-health-ok';
    case 'warn': return 'ops-health-warn';
    case 'degraded': return 'ops-health-degraded';
    default: return 'ops-health-critical';
  }
};

export default function OpsSidePanel({ cameras, status }: Props) {
  const telemetry = useTelemetry();
  const { events } = useEvents(500);
  const [selectedCam, setSelectedCam] = useState<number | null>(null);

  const lastEvents = useMemo(() => {
    const map = new Map<number, { ts: string; type: string }>();
    events.forEach((e) => {
      const camId = e.camera_id;
      if (!map.has(camId) || e.ts > map.get(camId)!.ts) {
        map.set(camId, { ts: e.ts, type: e.type });
      }
    });
    return map;
  }, [events]);

  const selectedTelemetry = useMemo(
    () => telemetry.find((t) => t.id === selectedCam) ?? telemetry[0],
    [telemetry, selectedCam],
  );

  const sorted = useMemo(() => {
    return [...cameras].sort((a, b) => {
      const sa = status[a.id];
      const sb = status[b.id];
      if (sa && !sb) return -1;
      if (!sa && sb) return 1;
      if (sa && sb) return (sb.bytes ?? 0) - (sa.bytes ?? 0);
      return 0;
    });
  }, [cameras, status]);

  return (
    <div className="ops-side-panel">
      <div className="ops-side-header">TELEMETRY</div>

      <div className="ops-side-cams">
        {sorted.map((cam) => {
          const st = status[cam.id];
          const tel = telemetry.find((t) => t.id === cam.id);
          const le = lastEvents.get(cam.id);
          const isActive = selectedTelemetry?.id === cam.id;
          return (
            <button
              key={cam.id}
              className={`ops-side-cam ${isActive ? 'active' : ''}`}
              onClick={() => setSelectedCam(cam.id)}
            >
              <span className={`ops-status-dot ${st?.ok ? 'bg-ok' : 'bg-danger'}`} />
              <span className="ops-side-cam-name">{cam.name}</span>
              <div className={`ops-health-bar-mini ${healthBarClass(tel?.healthGrade ?? 'critical')}`} />
              <span className="ops-side-cam-stat">
                {tel?.sourceCodec ?? '?'}
              </span>
              <span className="ops-side-cam-stat">
                {tel?.sourceBitrate > 0
                  ? tel.sourceBitrate > 1000
                    ? `${(tel.sourceBitrate / 1000).toFixed(1)}M`
                    : `${tel.sourceBitrate}k`
                  : '—'}
              </span>
              {le && (
                <span className="ops-side-cam-event" title={`${le.type} ${le.ts}`}>
                  {le.ts.split(' ')[1]?.slice(0, 5) ?? le.ts}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {selectedTelemetry && (
        <div className="ops-side-gauge">
          <div className="ops-side-section-title">SALUD — {selectedTelemetry.name}</div>
          <div className="ops-side-health-bar">
            <div className="ops-health-bar-track">
              <div className={`ops-health-bar-fill ${healthBarClass(selectedTelemetry.healthGrade)}`} style={{ width: `${selectedTelemetry.health}%` }} />
            </div>
            <span className={`ops-health-label ${healthBarClass(selectedTelemetry.healthGrade)}`}>
              {selectedTelemetry.health} {selectedTelemetry.healthGrade.toUpperCase()}
            </span>
          </div>
          {selectedTelemetry.last && (
            <div className="ops-side-detail-grid">
              <div className="ops-side-detail-item">
                <span className="ops-side-detail-label">CODEC</span>
                <span className="ops-side-detail-value">{selectedTelemetry.last.codec}</span>
              </div>
              <div className="ops-side-detail-item">
                <span className="ops-side-detail-label">FPS</span>
                <span className="ops-side-detail-value">{selectedTelemetry.last.fpsIn}</span>
              </div>
              <div className="ops-side-detail-item">
                <span className="ops-side-detail-label">RTT</span>
                <span className="ops-side-detail-value">{selectedTelemetry.last.rtt}ms</span>
              </div>
              <div className="ops-side-detail-item">
                <span className="ops-side-detail-label">JITTER</span>
                <span className="ops-side-detail-value">{selectedTelemetry.last.jitter}ms</span>
              </div>
              <div className="ops-side-detail-item">
                <span className="ops-side-detail-label">PKT LOSS</span>
                <span className="ops-side-detail-value">{selectedTelemetry.last.packetLoss}%</span>
              </div>
              <div className="ops-side-detail-item">
                <span className="ops-side-detail-label">CAM BITRATE</span>
                <span className="ops-side-detail-value">
                  {selectedTelemetry.sourceBitrate > 0
                    ? selectedTelemetry.sourceBitrate > 1000
                      ? `${(selectedTelemetry.sourceBitrate / 1000).toFixed(1)} Mbps`
                      : `${selectedTelemetry.sourceBitrate} kbps`
                    : '—'}
                </span>
              </div>
            </div>
          )}
        </div>
      )}

      <div className="ops-side-section">
        <div className="ops-side-section-title">EVENTS / 24H</div>
        <HourlyChart events={events} />
      </div>

      <div className="ops-side-section">
        <div className="ops-side-section-title">GO2RTC</div>
        <div className="ops-side-topo">
          <div className="ops-side-topo-node">go2rtc:1984</div>
          <div className="ops-side-topo-lines">
            {telemetry.filter((t) => t.hasProducer).map((t) => (
              <div key={t.id} className="ops-side-topo-line">
                <span className={`ops-health-seg-sm ${healthBarClass(t.healthGrade)}`} />
                <span>{t.name}</span>
                <span className="ops-side-topo-codec">{t.sourceCodec}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="ops-side-section">
        <div className="ops-side-section-title">LIVE</div>
        <div className="ops-side-feed">
          {events.slice(0, 8).map((e) => (
            <div key={e.id} className="ops-side-feed-line">
              <span className="ops-console-tag tag-motion">{e.type.toUpperCase()}</span>
              <span className="ops-side-feed-name">{(e.camera_name ?? `CAM-${e.camera_id}`).toUpperCase()}</span>
              <span className="ops-side-feed-payload">{e.payload}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
