import { useEffect, useRef } from 'react';
import { useEvents } from '../../hooks/useEvents';

const TYPE_CLAS: Record<string, string> = {
  motion: 'tag-motion',
  alarm: 'tag-alarm',
  online: 'tag-online',
  offline: 'tag-offline',
};

export default function OpsConsole() {
  const { events, clear } = useEvents();
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [events.length]);

  return (
    <div className="ops-console">
      <div className="ops-console-header">
        <span className="ops-console-title">SENTINEL OPS // EVENT LOG</span>
        <span className="ops-console-blink">▊</span>
        <button onClick={clear} className="ops-console-clear">LIMPIAR</button>
      </div>

      <div className="ops-console-log">
        {events.length === 0 && (
          <div className="ops-console-empty">
            <span className="ops-prompt">&gt;</span> Esperando eventos...
            <span className="ops-console-blink">▊</span>
          </div>
        )}
        {events.map((e, i) => (
          <div key={e.id} className="ops-console-line" style={{ animationDelay: `${i * 15}ms` }}>
            <span className="ops-console-ts">[{e.ts}]</span>
            <span className={`ops-console-tag ${TYPE_CLAS[e.type] ?? 'tag-default'}`}>{e.type.toUpperCase()}</span>
            <span className="ops-console-name">{(e.camera_name ?? `CAM-${e.camera_id}`).toUpperCase()}</span>
            <span className="ops-console-sep">::</span>
            <span className="ops-console-payload">{e.payload}</span>
          </div>
        ))}
        <div ref={endRef} />
      </div>
    </div>
  );
}
