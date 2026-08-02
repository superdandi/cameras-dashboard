import { useEffect, useRef, useState } from 'react';
import type { Camera } from '../types';
import { go2rtcBase, mjpegUrl } from '../api';

export type StreamMode = 'webrtc' | 'mjpeg' | 'off';

/**
 * Reproduce el stream de una cámara: WebRTC (WISH contra go2rtc) con
 * fallback a MJPEG. Devuelve refs/estado para un <video> o <img>.
 * `preferMain=true` usa el stream principal (HD) en lugar del sub-stream (SD).
 */
export function useCameraStream(
  camera: Camera | undefined,
  enabled: boolean,
  preferMain = false,
) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [mode, setMode] = useState<StreamMode>('off');
  const [error, setError] = useState<string>('');

  const stream = preferMain
    ? camera?.main_stream
    : camera?.sub_stream && camera.sub_stream !== camera.main_stream
      ? camera.sub_stream
      : camera?.main_stream;

  useEffect(() => {
    if (!enabled || !camera || !stream) {
      setMode('off');
      return;
    }
    let pc: RTCPeerConnection | null = null;
    let cancelled = false;
    setMode('off');
    setError('');

    async function start() {
      try {
        pc = new RTCPeerConnection({ iceServers: [] });
        pc.addTransceiver('video', { direction: 'recvonly' });
        pc.addTransceiver('audio', { direction: 'recvonly' });
        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);
        const res = await fetch(
          `${go2rtcBase()}/api/webrtc?src=${encodeURIComponent(stream!)}`,
          { method: 'POST', headers: { 'Content-Type': 'text/plain' }, body: offer.sdp },
        );
        if (!res.ok) throw new Error(`webrtc ${res.status}`);
        const answer = await res.text();
        await pc.setRemoteDescription({ type: 'answer', sdp: answer });
        pc.ontrack = (ev) => {
          if (cancelled) return;
          const el = videoRef.current;
          if (el) {
            el.srcObject = ev.streams[0];
            el.play().catch(() => {});
          }
          setMode('webrtc');
        };
      } catch (e) {
        if (cancelled) return;
        console.warn('WebRTC fallback -> MJPEG', e);
        setError(String((e as Error).message));
        setMode('mjpeg');
      }
    }
    start();

    return () => {
      cancelled = true;
      try { pc?.close(); } catch { /* noop */ }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [camera?.id, enabled]);

  return { videoRef, mode, error, mjpegSrc: stream ? mjpegUrl(stream) : '' };
}
