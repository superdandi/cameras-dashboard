import { useEffect, useState } from 'react';

const LINES = [
  '> SENTINEL OPS v2.1',
  '> Initializing telemetry bus.............. OK',
  '> Connecting to go2rtc:1984............... OK',
  '> Loading camera inventory................ OK',
  '> WebRTC peer channels................... READY',
  '> Monitoring active streams............... ONLINE',
  '> System ready.',
];

export default function OpsBoot({ onDone }: { onDone: () => void }) {
  const [visible, setVisible] = useState(0);
  const [fading, setFading] = useState(false);
  const [done, setDone] = useState(false);

  const finish = () => {
    if (done) return;
    setDone(true);
    setVisible(LINES.length);
    setFading(true);
  };

  useEffect(() => {
    if (done || visible >= LINES.length) return;
    const t = setTimeout(() => setVisible((v) => v + 1), 120 + Math.random() * 80);
    return () => clearTimeout(t);
  }, [visible, done]);

  useEffect(() => {
    if (fading) {
      const t = setTimeout(onDone, 500);
      return () => clearTimeout(t);
    }
  }, [fading, onDone]);

  useEffect(() => {
    if (visible >= LINES.length && !fading && !done) {
      const t = setTimeout(() => setFading(true), 300);
      return () => clearTimeout(t);
    }
  }, [visible, fading, done]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape' || e.key === 'Enter' || e.key === ' ') finish(); };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  return (
    <div className={`ops-boot ${fading ? 'ops-boot-fade' : ''}`} onClick={finish}>
      <div className="ops-boot-box">
        {LINES.slice(0, visible).map((line, i) => (
          <div key={i} className="ops-boot-line">
            <span className={i === LINES.length - 1 ? 'ops-boot-ok' : ''}>{line}</span>
          </div>
        ))}
        {visible < LINES.length && !done && <span className="ops-console-blink">▊</span>}
      </div>
    </div>
  );
}
