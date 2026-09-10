import { useEffect, useRef, useState } from 'react';
import type { Camera } from '../types';
import { go2rtcBase } from '../api';

export interface Go2rtcProducer {
  codec: string;
  resolution: string;
  sourceBitrate: number;
  protocol: string;
  sourceIp: string;
  bytesRecv: number;
  hasProducer: boolean;
}

const EMPTY: Go2rtcProducer = {
  codec: '?', resolution: '?', sourceBitrate: 0, protocol: '?', sourceIp: '?', bytesRecv: 0, hasProducer: false,
};

function parseSdp(sdp: string): { codec: string; resolution: string } {
  const codecMatch = sdp.match(/([A-Z0-9]+)\/\d+\/(\d+)\/(\d+)/i);
  return {
    codec: codecMatch ? codecMatch[1].toUpperCase() : '?',
    resolution: codecMatch ? `${codecMatch[2]}x${codecMatch[3]}` : '?',
  };
}

function parseSourceUrl(url: string): string {
  try {
    const u = new URL(url.startsWith('//') ? `http:${url}` : url);
    return u.hostname || url;
  } catch {
    const m = url.match(/@(\d+\.\d+\.\d+\.\d+)/);
    return m ? m[1] : '?';
  }
}

export function useGo2rtcStreams(cameras: Camera[]) {
  const [streams, setStreams] = useState<Map<number, Go2rtcProducer>>(new Map());
  const prevRef = useRef<Map<string, number>>(new Map());

  useEffect(() => {
    if (cameras.length === 0) return;

    const streamMap = new Map<string, number>();
    cameras.forEach((c) => {
      if (c.sub_stream) streamMap.set(c.sub_stream, c.id);
      if (c.main_stream && c.main_stream !== c.sub_stream) streamMap.set(c.main_stream, c.id);
      streamMap.set(`cam${String(c.id).padStart(2, '0')}`, c.id);
      streamMap.set(`cam${String(c.id).padStart(2, '0')}sd`, c.id);
    });

    let cancelled = false;
    const fetchStreams = async () => {
      try {
        const res = await fetch(`${go2rtcBase()}/api/streams`);
        if (!res.ok) return;
        const data = await res.json();
        if (cancelled) return;
        const next = new Map<number, Go2rtcProducer>();
        const now = Date.now();

        for (const [name, producer]: [string, any] of Object.entries(data)) {
          const camId = streamMap.get(name);
          if (camId == null) continue;
          if (next.has(camId)) continue;

          const p = producer as any;
          const producers = p.producers ?? [];
          const first = producers[0];
          const receiver = first?.receivers?.[0];
          const sdp = first?.sdp ?? '';
          const parsed = parseSdp(sdp);

          const bytesRecv = (first?.bytes_recv ?? receiver?.bytes ?? 0) as number;
          const prevBytes = prevRef.current.get(name) ?? 0;
          const dt = 5;
          const bitrate = prevBytes > 0 ? Math.round(((bytesRecv - prevBytes) * 8) / dt / 1000) : 0;
          prevRef.current.set(name, bytesRecv);

          next.set(camId, {
            codec: receiver?.codec?.codec_name?.toUpperCase() ?? parsed.codec,
            resolution: parsed.resolution !== '?' ? parsed.resolution : (first?.medias?.find((m: string) => m.startsWith('video'))?.match(/\d+\/\d+/) ? null : '?') ?? '?',
            sourceBitrate: bitrate,
            protocol: first?.protocol ?? first?.format_name ?? '?',
            sourceIp: first?.url ? parseSourceUrl(first.url) : '?',
            bytesRecv,
            hasProducer: true,
          });
        }

        for (const [name] of prevRef.current) {
          const camId = streamMap.get(name);
          if (camId != null && !next.has(camId)) {
            next.set(camId, { ...EMPTY, hasProducer: false, codec: '?', resolution: '?' });
          }
        }

        setStreams(next);
        prevRef.current = new Map(
          [...next.entries()].map(([id, v]) => {
            const cam = cameras.find((c) => c.id === id);
            const streamName = cam?.sub_stream ?? cam?.main_stream ?? '';
            return [streamName, v.bytesRecv];
          }),
        );
      } catch { /* noop */ }
    };

    fetchStreams();
    const t = setInterval(fetchStreams, 5000);
    return () => { cancelled = true; clearInterval(t); };
  }, [cameras.map((c) => c.id).join(',')]);

  return streams;
}
