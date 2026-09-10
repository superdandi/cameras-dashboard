import { useEffect, useState } from 'react';
import { useAggregates } from './telemetryStore';
import { useNetwork } from '../../hooks/useNetwork';

interface Props {
  camCount: number;
  eventCount: number;
  go2rtcOk: boolean | null;
  go2rtcStreams: string[];
}

export default function OpsStatusBar({ camCount, eventCount, go2rtcOk, go2rtcStreams }: Props) {
  const agg = useAggregates(camCount);
  const net = useNetwork();
  const [clock, setClock] = useState(() => new Date().toLocaleTimeString('en-GB', { hour12: false }));

  useEffect(() => {
    const t = setInterval(() => setClock(new Date().toLocaleTimeString('en-GB', { hour12: false })), 1000);
    return () => clearInterval(t);
  }, []);

  return (
    <div className="ops-status-bar">
      <div className="ops-status-bar-header">
        <span className="ops-status-bar-title">SENTINEL OPS</span>
        <span className="ops-status-bar-sep">//</span>
        <span className="ops-status-bar-sub">GRID</span>
        {net && net.ssid && (
          <>
            <span className="ops-status-bar-sep">//</span>
            <span className="ops-status-bar-sub">NET {net.ssid}</span>
          </>
        )}
        {net && net.gateway && (
          <>
            <span className="ops-status-bar-sep">//</span>
            <span className="ops-status-bar-sub">GW {net.gateway}</span>
          </>
        )}
        <span className="ops-console-blink">▮</span>
      </div>
      <div className="ops-status-bar-stats">
        <span className="ops-agg-label">STREAMS</span>
        <span className="ops-agg-value">{agg.activeCount}/{camCount}</span>
        <span className="ops-agg-sep">│</span>
        <span className="ops-agg-label">BITRATE</span>
        <span className="ops-agg-value">{agg.totalBitrate > 1000 ? `${(agg.totalBitrate / 1000).toFixed(1)} Mbps` : `${agg.totalBitrate} kbps`}</span>
        <span className="ops-agg-sep">│</span>
        <span className="ops-agg-label">AVG FPS</span>
        <span className="ops-agg-value">{agg.avgFps}</span>
        <span className="ops-agg-sep">│</span>
        <span className="ops-agg-label">EVENTS</span>
        <span className="ops-agg-value">{eventCount}</span>
        <span className="ops-agg-sep">│</span>
        <span className="ops-agg-label">G2R</span>
        <span className={`ops-agg-value ${go2rtcOk ? 'stat-ok' : 'stat-danger'}`}>
          {go2rtcOk === null ? '...' : go2rtcOk ? 'OK' : 'DOWN'}
        </span>
        <span className="ops-agg-sep">│</span>
        <span className="ops-agg-label">STREAMS</span>
        <span className="ops-agg-value">{go2rtcStreams.length}</span>
        <span className="ops-agg-sep">│</span>
        <span className="ops-agg-clock">{clock}</span>
      </div>
    </div>
  );
}
