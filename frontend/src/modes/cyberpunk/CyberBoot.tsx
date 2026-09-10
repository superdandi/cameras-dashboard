import { useCallback, useEffect, useRef, useState } from 'react';
import { initAudio, resumeAudio, cleanupAudio } from '../../audio/AudioEngine';
import { playClick, startHum, playWhoosh, playChime } from '../../audio/sounds';

const SCRAMBLE_CHARS = '!@#$%^&*0123456789ABCDEF';
const DECODE_DURATION = 400;

const LINES = [
  { text: '> SENTINEL CYP v2.4', ok: null },
  { text: '> WebGL2 renderer.................... ', ok: 'OK' },
  { text: '> GPU: ', ok: null, gpu: true },
  { text: '> Allocando 2048 particle nodes...... ', ok: 'OK' },
  { text: '> Linking nearest-neighbor mesh...... ', ok: 'OK' },
  { text: '> Compiling bloom postprocess........ ', ok: 'OK' },
  { text: '> Calibrando uplink de cámaras....... ', ok: 'READY' },
  { text: '> Constelación online.', ok: null },
];

interface CyberBootProps {
  onDone: () => void;
}

export default function CyberBoot({ onDone }: CyberBootProps) {
  const [visible, setVisible] = useState(0);
  const [fading, setFading] = useState(false);
  const [gpuName, setGpuName] = useState('...');
  const [sceneReady, setSceneReady] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const sceneRef = useRef<{ dispose: () => void } | null>(null);
  const lineAppearTimes = useRef<number[]>([]);
  const [scrambleTick, setScrambleTick] = useState(0);

  // Detect GPU adapter (WebGPU) or renderer (WebGL2 fallback)
  useEffect(() => {
    const gpu = (navigator as any).gpu;
    gpu?.requestAdapter?.().then((adapter: any) => {
      if (adapter) setGpuName(adapter.name || 'WebGPU');
      else setGpuName('WebGPU (sin info)');
    }).catch(() => {
      // Fallback: detect WebGL renderer
      try {
        const canvas = document.createElement('canvas');
        const gl = canvas.getContext('webgl2') || canvas.getContext('webgl');
        const debugInfo = gl?.getExtension('WEBGL_debug_renderer_info');
        const renderer = debugInfo ? gl.getParameter(debugInfo.UNMASKED_RENDERER_WEBGL) : 'WebGL';
        setGpuName(String(renderer).substring(0, 40));
      } catch {
        setGpuName('WebGL');
      }
    });
  }, []);

  // Initialize 3D scene + audio
  useEffect(() => {
    if (!containerRef.current) return;
    let disposed = false;
    let stopHum: (() => void) | null = null;

    // Init audio engine
    initAudio();
    resumeAudio();
    stopHum = startHum();

    import('./cyberBootScene').then((mod) => {
      if (disposed || !containerRef.current) return;
      // Always call initCyberScene — it delegates to WebGPU or WebGL2 internally
      mod.initCyberScene(containerRef.current).then((scene) => {
        if (disposed) { scene.dispose(); return; }
        sceneRef.current = scene;
        setSceneReady(true);
      }).catch((err) => {
        console.error('[CyberBoot] Scene init failed:', err);
        setSceneReady(true);
      });
    }).catch((err) => {
      console.error('[CyberBoot] Dynamic import failed:', err);
      setSceneReady(true);
    });

    return () => {
      disposed = true;
      stopHum?.();
      sceneRef.current?.dispose();
      sceneRef.current = null;
      cleanupAudio();
    };
  }, []);

  // Line reveal timing
  useEffect(() => {
    if (visible >= LINES.length) return;
    const delay = visible === 0 ? 1600 : 400;
    const t = setTimeout(() => setVisible((v) => v + 1), delay);
    return () => clearTimeout(t);
  }, [visible, sceneReady]);

  // Play click when new line appears
  useEffect(() => {
    if (visible > 0) playClick();
  }, [visible]);

  // Track when each line first appears (for scramble timing)
  useEffect(() => {
    if (visible > 0 && lineAppearTimes.current.length < visible) {
      const now = performance.now();
      while (lineAppearTimes.current.length < visible) {
        lineAppearTimes.current.push(now);
      }
    }
  }, [visible]);

  // Scramble animation timer — runs while lines are decoding
  useEffect(() => {
    if (visible === 0) return;
    const interval = setInterval(() => setScrambleTick(t => t + 1), 30);
    return () => clearInterval(interval);
  }, [visible]);

  // Scramble text decode function
  const getScrambledText = useCallback((text: string, lineIndex: number) => {
    const appearTime = lineAppearTimes.current[lineIndex];
    if (!appearTime) return text;

    const elapsed = performance.now() - appearTime;
    const progress = Math.min(elapsed / DECODE_DURATION, 1);
    const charsToDecode = Math.floor(progress * text.length);

    return text.split('').map((char, i) => {
      if (i < charsToDecode) return char;
      if (char === ' ') return ' ';
      return SCRAMBLE_CHARS[Math.floor(Math.random() * SCRAMBLE_CHARS.length)];
    }).join('');
  }, [scrambleTick]);

  // Auto-fade after last line
  useEffect(() => {
    if (visible >= LINES.length && !fading) {
      const t = setTimeout(() => setFading(true), 1600);
      return () => clearTimeout(t);
    }
  }, [visible, fading]);

  // onDone after fade + whoosh at bloom burst
  useEffect(() => {
    if (fading) {
      // Whoosh 1.5s after fade starts (bloom burst at t=7.5s)
      const whooshTimer = setTimeout(playWhoosh, 1500);
      // Chime + done at 2s after fade starts (t=8s)
      const doneTimer = setTimeout(() => {
        playChime();
        onDone();
      }, 2000);
      return () => {
        clearTimeout(whooshTimer);
        clearTimeout(doneTimer);
      };
    }
  }, [fading, onDone]);

  return (
    <div className="cyber-boot">
      <div ref={containerRef} className="cyber-boot-canvas" />
      <div className={`cyber-boot-hud ${fading ? 'cyber-boot-fade' : ''}`}>
        <div className="cyber-boot-lines">
          {LINES.slice(0, visible).map((line, i) => (
            <div key={i} className="cyber-boot-line">
              <span className={line.ok ? 'cyber-boot-ok' : i === LINES.length - 1 ? 'cyber-boot-ready' : ''}>
                {line.gpu
                  ? `${getScrambledText(line.text, i)}${gpuName}`
                  : getScrambledText(line.text, i)
                }
                {line.ok && visible > i && <span className="cyber-boot-ok">{getScrambledText(line.ok, i)}</span>}
              </span>
            </div>
          ))}
          {visible < LINES.length && <span className="ops-console-blink">▊</span>}
        </div>
      </div>
      <div className={`cyber-boot-gpu ${fading ? 'cyber-boot-fade' : ''}`}>
        {gpuName}
      </div>
    </div>
  );
}
