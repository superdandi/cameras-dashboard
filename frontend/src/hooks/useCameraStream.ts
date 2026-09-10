import { useEffect, useRef, useState } from 'react';
import type { Camera } from '../types';
import { go2rtcBase, mjpegUrl } from '../api';

export type StreamMode = 'webrtc' | 'mjpeg' | 'off';

export interface StreamStats {
  fps: number;
  rtt: number;
  jitter: number;
  packetLoss: number;
  bitrate: number;
  width: number;
  height: number;
  fpsIn: number;
  fpsDecoded: number;
  framesDropped: number;
  packetsTotal: number;
  packetsLostTotal: number;
  codec: string;
}

const EMPTY_STATS: StreamStats = {
  fps: 0, rtt: 0, jitter: 0, packetLoss: 0, bitrate: 0, width: 0, height: 0,
  fpsIn: 0, fpsDecoded: 0, framesDropped: 0, packetsTotal: 0, packetsLostTotal: 0, codec: '?',
};

export function useCameraStream(
  camera: Camera | undefined,
  enabled: boolean,
  preferMain = false,
) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [mode, setMode] = useState<StreamMode>('off');
  const [error, setError] = useState<string>('');
  const [stats, setStats] = useState<StreamStats>(EMPTY_STATS);

  const prevBytesRef = useRef(0);
  const prevTimeRef = useRef(0);
  const prevFramesRef = useRef({ recv: 0, dec: 0, drop: 0 });

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
    let statsInterval: ReturnType<typeof setInterval> | null = null;
    setMode('off');
    setError('');
    setStats(EMPTY_STATS);
    prevBytesRef.current = 0;
    prevTimeRef.current = 0;
    prevFramesRef.current = { recv: 0, dec: 0, drop: 0 };

    async function start() {
      try {
        console.log(`[stream] starting WebRTC for ${camera.name} stream=${stream}`);
        pc = new RTCPeerConnection({ iceServers: [] });
        pc.addTransceiver('video', { direction: 'recvonly' });
        pc.addTransceiver('audio', { direction: 'recvonly' });
        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);
        const url = `${go2rtcBase()}/api/webrtc?src=${encodeURIComponent(stream!)}`;
        console.log(`[stream] POST ${url}`);
        const res = await fetch(
          url,
          { method: 'POST', headers: { 'Content-Type': 'text/plain' }, body: offer.sdp },
        );
        if (!res.ok) throw new Error(`webrtc ${res.status}`);
        const answer = await res.text();
        pc.oniceconnectionstatechange = () => {
          console.log(`[stream] ICE state: ${pc?.iceConnectionState}`);
        };
        pc.onicecandidate = (ev) => {
          if (ev.candidate) {
            console.log(`[stream] ICE candidate: ${ev.candidate.candidate.substring(0, 80)}`);
          }
        };
        pc.ontrack = (ev) => {
          if (cancelled) { console.log(`[stream] ontrack FIRED but cancelled for ${camera.name}`); return; }
          console.log(`[stream] ontrack FIRED for ${camera.name}, tracks=${ev.streams[0]?.getTracks().length}`);
          const el = videoRef.current;
          console.log(`[stream] videoRef.current = ${el ? 'VALID' : 'NULL'}`);
          if (el) {
            el.srcObject = ev.streams[0];
            el.play().catch(() => {});
          }
          setMode('webrtc');
          statsInterval = setInterval(async () => {
            if (!pc || cancelled) return;
            try {
              const report = await pc.getStats();
              let video: any = null;
              let cp: any = null;
              let codecName = '?';
              report.forEach((entry: any) => {
                if (entry.type === 'inbound-rtp' && entry.kind === 'video') video = entry;
                if (entry.type === 'candidate-pair' && entry.state === 'succeeded') cp = entry;
                if (entry.type === 'codec' && entry.mimeType?.startsWith('video/')) {
                  codecName = entry.mimeType.replace('video/', '').toUpperCase();
                }
              });
              if (video && !cancelled) {
                const now = Date.now();
                const bytesNow = video.bytesReceived ?? 0;
                const dt = prevTimeRef.current > 0 ? (now - prevTimeRef.current) / 1000 : 0;
                const bitrate = prevBytesRef.current > 0 && dt > 0
                  ? Math.round(((bytesNow - prevBytesRef.current) * 8) / dt / 1000)
                  : 0;

                const framesNow = video.framesReceived ?? 0;
                const decNow = video.framesDecoded ?? 0;
                const dropNow = video.framesDropped ?? 0;
                const fpsIn = dt > 0 ? Math.round((framesNow - prevFramesRef.current.recv) / dt) : 0;
                const fpsDec = dt > 0 ? Math.round((decNow - prevFramesRef.current.dec) / dt) : 0;

                prevBytesRef.current = bytesNow;
                prevTimeRef.current = now;
                prevFramesRef.current = { recv: framesNow, dec: decNow, drop: dropNow };

                const totalPackets = (video.packetsReceived ?? 0) + (video.packetsLost ?? 0);
                const totalLost = video.packetsLost ?? 0;

                setStats({
                  fps: video.framesPerSecond ?? 0,
                  rtt: cp?.currentRoundTripTime != null ? Math.round(cp.currentRoundTripTime * 1000) : 0,
                  jitter: Math.round((video.jitter ?? 0) * 1000),
                  packetLoss: totalPackets > 0
                    ? Math.round((totalLost / totalPackets) * 10000) / 100
                    : 0,
                  bitrate,
                  width: video.frameWidth ?? 0,
                  height: video.frameHeight ?? 0,
                  fpsIn,
                  fpsDecoded: fpsDec,
                  framesDropped: dropNow,
                  packetsTotal: totalPackets,
                  packetsLostTotal: totalLost,
                  codec: codecName,
                });
              }
            } catch { /* noop */ }
          }, 1000);
        };
        await pc.setRemoteDescription({ type: 'answer', sdp: answer });
        console.log(`[stream] SDP exchange OK for ${camera.name}, waiting for ontrack...`);
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
      if (statsInterval) clearInterval(statsInterval);
      try { pc?.close(); } catch { /* noop */ }
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [camera?.id, enabled, stream]);

  return { videoRef, mode, error, stats, mjpegSrc: stream ? mjpegUrl(stream) : '' };
}
