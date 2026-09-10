import { useSyncExternalStore } from 'react';

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

export interface CamTelemetry {
  id: number;
  name: string;
  bitrateHistory: number[];
  last: StreamStats | null;
  bytes: number;
  lastUpdate: number;
  // go2rtc source data
  sourceCodec: string;
  sourceResolution: string;
  sourceBitrate: number;
  sourceProtocol: string;
  sourceIp: string;
  sourceBytesRecv: number;
  hasProducer: boolean;
  consumers: number;
  // status
  ok: boolean;
  // health
  health: number;
  healthGrade: 'ok' | 'warn' | 'degraded' | 'critical';
}

export type HealthGrade = CamTelemetry['healthGrade'];

const EMPTY_STATS: StreamStats = {
  fps: 0, rtt: 0, jitter: 0, packetLoss: 0, bitrate: 0, width: 0, height: 0,
  fpsIn: 0, fpsDecoded: 0, framesDropped: 0, packetsTotal: 0, packetsLostTotal: 0, codec: '?',
};

const MAX_HISTORY = 120;
const cameras = new Map<number, CamTelemetry>();
let version = 0;
const listeners = new Set<() => void>();

function notify() {
  version++;
  listeners.forEach((l) => l());
}

function computeHealth(s: StreamStats | null, hasProducer: boolean, ok: boolean): { health: number; grade: HealthGrade } {
  if (!s || !hasProducer || !ok) return { health: 0, grade: 'critical' };
  let score = 100;
  // fps: penalize if below 15
  if (s.fps < 5) score -= 40;
  else if (s.fps < 15) score -= 20;
  else if (s.fps < 20) score -= 5;
  // packet loss: 0% → full, >5% → 0
  if (s.packetLoss > 5) score -= 40;
  else if (s.packetLoss > 2) score -= 25;
  else if (s.packetLoss > 0.5) score -= 10;
  // jitter: <10 → ok, >50 → heavy penalty
  if (s.jitter > 50) score -= 30;
  else if (s.jitter > 20) score -= 15;
  else if (s.jitter > 10) score -= 5;
  // rtt
  if (s.rtt > 300) score -= 20;
  else if (s.rtt > 150) score -= 10;
  else if (s.rtt > 100) score -= 3;
  // frames dropped ratio
  if (s.framesDropped > 0 && s.fpsIn > 0) {
    const dropRatio = s.framesDropped / s.fpsIn;
    if (dropRatio > 0.1) score -= 20;
    else if (dropRatio > 0.05) score -= 10;
  }
  const h = Math.max(0, Math.min(100, score));
  const grade: HealthGrade = h >= 80 ? 'ok' : h >= 50 ? 'warn' : h >= 25 ? 'degraded' : 'critical';
  return { health: h, grade };
}

function getOrCreate(id: number, name: string): CamTelemetry {
  let cam = cameras.get(id);
  if (!cam) {
    cam = {
      id, name, bitrateHistory: [], last: EMPTY_STATS, bytes: 0, lastUpdate: 0,
      sourceCodec: '?', sourceResolution: '?', sourceBitrate: 0, sourceProtocol: '?', sourceIp: '?',
      sourceBytesRecv: 0, hasProducer: false, consumers: 0, ok: false, health: 0, healthGrade: 'critical',
    };
    cameras.set(id, cam);
  }
  return cam;
}

export function pushTelemetry(id: number, name: string, s: StreamStats) {
  const cam = getOrCreate(id, name);
  cam.last = s;
  cam.lastUpdate = Date.now();
  if (s.bitrate > 0) {
    cam.bitrateHistory = [...cam.bitrateHistory.slice(-(MAX_HISTORY - 1)), s.bitrate];
  }
  const { health, grade } = computeHealth(s, cam.hasProducer, cam.ok);
  cam.health = health;
  cam.healthGrade = grade;
  notify();
}

export function pushBytes(id: number, name: string, bytes: number, bitrate: number) {
  const cam = getOrCreate(id, name);
  cam.bytes = bytes;
  cam.lastUpdate = Date.now();
  if (bitrate > 0) {
    cam.bitrateHistory = [...cam.bitrateHistory.slice(-(MAX_HISTORY - 1)), bitrate];
  }
  notify();
}

export function pushGo2rtc(id: number, name: string, data: {
  codec: string; resolution: string; sourceBitrate: number;
  protocol: string; sourceIp: string; bytesRecv: number; hasProducer: boolean; consumers: number;
}) {
  const cam = getOrCreate(id, name);
  cam.sourceCodec = data.codec;
  cam.sourceResolution = data.resolution;
  cam.sourceBitrate = data.sourceBitrate;
  cam.sourceProtocol = data.protocol;
  cam.sourceIp = data.sourceIp;
  cam.sourceBytesRecv = data.bytesRecv;
  cam.hasProducer = data.hasProducer;
  cam.consumers = data.consumers;
  const { health, grade } = computeHealth(cam.last, cam.hasProducer, cam.ok);
  cam.health = health;
  cam.healthGrade = grade;
  notify();
}

export function pushStatus(id: number, name: string, ok: boolean) {
  const cam = getOrCreate(id, name);
  cam.ok = ok;
  const { health, grade } = computeHealth(cam.last, cam.hasProducer, cam.ok);
  cam.health = health;
  cam.healthGrade = grade;
  notify();
}

export function pushLastEvent(id: number, name: string, event: { ts: string; type: string } | null) {
  const cam = getOrCreate(id, name);
  (cam as any).lastEvent = event;
  notify();
}

export function getCameraTelemetry(id: number): CamTelemetry | undefined {
  return cameras.get(id);
}

export function getAllTelemetry(): CamTelemetry[] {
  return [...cameras.values()];
}

export function getAggregates(camCount: number) {
  let totalBitrate = 0;
  let totalFps = 0;
  let totalRtt = 0;
  let activeCount = 0;
  cameras.forEach((cam) => {
    if (cam.last && cam.last.fps > 0) {
      activeCount++;
      totalBitrate += cam.last.bitrate;
      totalFps += cam.last.fps;
      totalRtt += cam.last.rtt;
    }
  });
  return {
    activeCount,
    totalCount: camCount,
    totalBitrate,
    avgFps: activeCount > 0 ? Math.round(totalFps / activeCount) : 0,
    avgRtt: activeCount > 0 ? Math.round(totalRtt / activeCount) : 0,
  };
}

function subscribe(cb: () => void) {
  listeners.add(cb);
  return () => { listeners.delete(cb); };
}

function getSnapshot() {
  return version;
}

function getServerSnapshot() {
  return 0;
}

export function useTelemetry() {
  useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  return getAllTelemetry();
}

export function useCameraTelemetry(id: number) {
  useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  return cameras.get(id);
}

export function useAggregates(camCount: number) {
  useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  return getAggregates(camCount);
}
