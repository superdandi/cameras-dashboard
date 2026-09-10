import { useCallback, useEffect, useRef, useState } from 'react';
import type { Camera, CamStatus } from '../../types';
import { useCameraStream } from '../../hooks/useCameraStream';
import { useCameraAudio, toggleCameraAudio } from '../../hooks/useCameraAudio';
import { api } from '../../api';
import { initVideoScene, type VideoScene } from './cyberVideoScene';

interface Props {
  camera: Camera;
  status?: CamStatus;
  preferMain?: boolean;
  onClose: () => void;
  visible?: boolean;
}

const DIRS: [string, string][] = [
  ['left up', '↖'], ['up', '↑'], ['right up', '↗'],
  ['left', '←'], ['stop', '●'], ['right', '→'],
  ['left down', '↙'], ['down', '↓'], ['right down', '↘'],
];

export default function CyberVideoDetail({ camera, status, preferMain, onClose, visible = true }: Props) {
  const { videoRef, mode, error } = useCameraStream(camera, true, preferMain);
  const audio = useCameraAudio(camera);
  const canvasRef = useRef<HTMLDivElement>(null);
  const sceneRef = useRef<VideoScene | null>(null);
  const sceneCreatedRef = useRef(false);
  const activeKeyRef = useRef<string | null>(null);
  const ptzTimerRef = useRef<number | null>(null);
  const [speed, setSpeed] = useState(40);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  const [videoReady, setVideoReady] = useState(false);
  const [panelOpen, setPanelOpen] = useState(true);

  // Track when video element is available
  const videoCallbackRef = useCallback((node: HTMLVideoElement | null) => {
    (videoRef as React.MutableRefObject<HTMLVideoElement | null>).current = node;
    if (node) {
      setVideoReady(true);
    }
  }, [videoRef]);

  // Wait for actual WebRTC stream to be playing before creating scene
  const streamReady = videoReady && mode === 'webrtc';

  // Create 3D scene — only when stream is active
  useEffect(() => {
    if (!canvasRef.current || sceneCreatedRef.current || !streamReady) return;

    const video = videoRef.current;
    if (!video) return;

    sceneCreatedRef.current = true;
    const scene = initVideoScene(canvasRef.current, video);
    sceneRef.current = scene;

    // If already visible, start assembly immediately
    if (visible) {
      scene.startAssembly();
    }

    return () => {
      sceneRef.current?.dispose();
      sceneRef.current = null;
      sceneCreatedRef.current = false;
    };
  }, [streamReady]);

  // Start assembly when canvas becomes visible (if scene already exists)
  useEffect(() => {
    if (visible && sceneRef.current) {
      sceneRef.current.startAssembly();
    }
  }, [visible]);

  const stopPtzHold = useCallback(() => {
    if (ptzTimerRef.current !== null) {
      clearInterval(ptzTimerRef.current);
      ptzTimerRef.current = null;
    }
    if (camera.has_ptz) {
      api.ptz(camera.id, 'stop', speed, 0).catch(() => {});
    }
  }, [camera, speed]);

  const startPtzHold = useCallback((act: string) => {
    if (!camera.has_ptz) return;
    stopPtzHold();
    api.ptz(camera.id, act, speed, 0).catch(() => {});
    ptzTimerRef.current = window.setInterval(() => {
      api.ptz(camera.id, act, speed, 0).catch(() => {});
    }, 300);
  }, [camera, speed, stopPtzHold]);

  // Keyboard handling: Enter opens solo via App, Escape closes here, T toggles
  // the PTZ panel, arrows move the camera (hold), S toggles audio.
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        sceneRef.current?.dispose();
        sceneRef.current = null;
        onClose();
        return;
      }
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;

      if (e.key === 't' || e.key === 'T') {
        setPanelOpen((p) => !p);
        return;
      }
      if (e.key === 's' || e.key === 'S') {
        toggleCameraAudio(camera.id);
        return;
      }
      const ptzMap: Record<string, string> = {
        ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right',
      };
      const act = ptzMap[e.code];
      if (act && camera.has_ptz && !e.repeat) {
        e.preventDefault();
        activeKeyRef.current = e.code;
        startPtzHold(act);
      }
    };

    const keyup = (e: KeyboardEvent) => {
      if (e.code === activeKeyRef.current) {
        activeKeyRef.current = null;
        stopPtzHold();
      }
    };

    window.addEventListener('keydown', handler);
    window.addEventListener('keyup', keyup);
    return () => {
      window.removeEventListener('keydown', handler);
      window.removeEventListener('keyup', keyup);
      if (ptzTimerRef.current !== null) {
        clearInterval(ptzTimerRef.current);
        ptzTimerRef.current = null;
      }
      if (camera.has_ptz) {
        api.ptz(camera.id, 'stop', speed, 0).catch(() => {});
      }
    };
  }, [camera, onClose, speed, startPtzHold, stopPtzHold]);

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

  return (
    <div className={`cyber-video-detail ${visible ? 'cyber-video-detail--visible' : 'cyber-video-detail--hidden'}`}>
      {/* Hidden video element for stream */}
      <video
        ref={videoCallbackRef}
        muted
        autoPlay
        playsInline
        style={{ display: 'none' }}
      />

      {/* 3D canvas container */}
      <div ref={canvasRef} className="cyber-video-detail-canvas" />

      {/* HUD overlay */}
      <div className="cyber-video-detail-hud">
        <div className="cyber-video-detail-hud-left">
          <span className="cyber-video-detail-name">{camera.name}</span>
          <span className="cyber-video-detail-ip">{camera.ip} · {camera.location}</span>
        </div>
        <div className="cyber-video-detail-hud-right">
          <button
            className="cyber-audio-btn"
            onClick={(e) => { e.stopPropagation(); audio.toggle(); }}
            title={audio.enabled ? 'Desactivar audio' : 'Activar audio'}
          >
            {audio.enabled ? '🔊' : '🔇'}
          </button>
          <span className={`cyber-video-detail-status ${status?.ok ? 'online' : 'offline'}`}>
            {status?.ok ? '● ONLINE' : '○ OFFLINE'}
          </span>
          {error && <span className="cyber-video-detail-error">{error}</span>}
          <span className="cyber-video-detail-mode">{mode.toUpperCase()}</span>
        </div>
      </div>

      {/* Escape hint */}
      <div className="cyber-video-detail-escape">
        ESC PARA CERRAR
      </div>

      {/* PTZ overlay */}
      {camera.has_ptz && !panelOpen && (
        <button
          onClick={() => setPanelOpen(true)}
          className="cyber-video-detail-panel-toggle"
          title="Mostrar controles (T)"
        >
          ◱ PTZ [T]
        </button>
      )}

      {/* PTZ overlay */}
      {camera.has_ptz && (
        <div className="cyber-video-detail-ptz" style={{ display: panelOpen ? '' : 'none' }}>
          <div className="cyber-video-detail-ptz-grid">
            {DIRS.map(([act, sym]) => (
              <button
                key={act}
                onClick={() => send(act)}
                className="cyber-video-detail-ptz-btn"
                disabled={busy}
                title={act}
              >
                {sym}
              </button>
            ))}
          </div>

          <div className="cyber-video-detail-ptz-zoom">
            <button onClick={() => send('zoomin')} className="cyber-video-detail-ptz-btn zoom" disabled={busy}>
              +Z
            </button>
            <button onClick={() => send('zoomout')} className="cyber-video-detail-ptz-btn zoom" disabled={busy}>
              −Z
            </button>
          </div>

          <div className="cyber-video-detail-ptz-presets">
            {[1, 2, 3].map((n) => (
              <button key={n} onClick={() => preset('goto', n)} className="cyber-video-detail-ptz-btn preset" disabled={busy}>
                P{n}
              </button>
            ))}
          </div>

          <div className="cyber-video-detail-ptz-speed">
            <input
              type="range" min={5} max={63} value={speed}
              onChange={(e) => setSpeed(Number(e.target.value))}
              className="cyber-video-detail-ptz-slider"
            />
            <span className="cyber-video-detail-ptz-speed-label">{speed}</span>
          </div>

          {msg && <div className="cyber-video-detail-ptz-msg">{msg}</div>}
        </div>
      )}
    </div>
  );
}
