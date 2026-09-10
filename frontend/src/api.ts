import type { Camera, CameraInput, CamStatus, Health } from './types';

const BASE = import.meta.env.VITE_API_BASE ?? '';

async function j<T>(res: Response): Promise<T> {
  if (!res.ok) throw new Error(`${res.status} ${await res.text()}`);
  return res.json() as Promise<T>;
}

export interface NetworkInfo {
  ssid: string;
  signal: number;
  gateway: string;
  host_ip: string;
  routers: string[];
}

export const api = {
  health: () => fetch(`${BASE}/api/health`).then((r) => j<Health>(r)),
  network: () => fetch(`${BASE}/api/network`).then((r) => j<NetworkInfo>(r)),
  status: () => fetch(`${BASE}/api/status`).then((r) => j<{ go2rtc: { ok: boolean; streams: string[] }; cameras: CamStatus[] }>(r)),
  listCameras: () => fetch(`${BASE}/api/cameras`).then((r) => j<Camera[]>(r)),
  createCamera: (c: CameraInput) =>
    fetch(`${BASE}/api/cameras`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(c) }).then((r) => j<{ id: number }>(r)),
  updateCamera: (id: number, c: Partial<CameraInput>) =>
    fetch(`${BASE}/api/cameras/${id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(c) }).then((r) => j<{ id: number }>(r)),
  deleteCamera: (id: number) => fetch(`${BASE}/api/cameras/${id}`, { method: 'DELETE' }).then((r) => j<{ deleted: number }>(r)),
  reorderCameras: (order: number[]) =>
    fetch(`${BASE}/api/cameras/reorder`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ order }) }).then((r) => j<{ ok: boolean }>(r)),
  ptz: (id: number, act: string, speed = 40, durationMs = 300) =>
    fetch(`${BASE}/api/cameras/${id}/ptz`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ act, speed, duration_ms: durationMs }),
    }).then((r) => j<{ status: number; response: string }>(r)),
  preset: (id: number, act: 'set' | 'goto' | 'clear', number: number) =>
    fetch(`${BASE}/api/cameras/${id}/preset`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ act, number }),
    }).then((r) => j<{ status: number; response: string }>(r)),
  getSettings: () => fetch(`${BASE}/api/settings`).then((r) => j<Record<string, string>>(r)),
  setSetting: (key: string, value: string) =>
    fetch(`${BASE}/api/settings/${key}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ value }) }).then((r) => j<{ key: string; value: string }>(r)),
  events: (limit = 100) => fetch(`${BASE}/api/events?limit=${limit}`).then((r) => j<Array<Record<string, unknown>>>(r)),
  clearEvents: () => fetch(`${BASE}/api/events`, { method: 'DELETE' }).then((r) => j<{ deleted: boolean }>(r)),
  twitchStatus: () => fetch(`${BASE}/api/twitch/status`).then((r) => j<Record<string, unknown>>(r)),
  twitchStart: (cameraIds: number[], useSub: boolean) =>
    fetch(`${BASE}/api/twitch/start`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ camera_ids: cameraIds, use_sub: useSub }) }).then((r) => j<Record<string, unknown>>(r)),
  twitchStop: () => fetch(`${BASE}/api/twitch/stop`, { method: 'POST' }).then((r) => j<Record<string, unknown>>(r)),
  twitchConfig: () => fetch(`${BASE}/api/twitch/config`).then((r) => j<Record<string, unknown>>(r)),
  twitchConfigSave: (cfg: Record<string, unknown>) =>
    fetch(`${BASE}/api/twitch/config`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(cfg) }).then((r) => j<Record<string, unknown>>(r)),
  twitchAudioDevices: () => fetch(`${BASE}/api/twitch/audio-devices`).then((r) => j<{ devices: Array<{ name: string; description: string; state: string }> }>(r)),
};

export const snapshotUrl = (id: number) => `${BASE}/api/cameras/${id}/snapshot`;

export const cameraAudioUrl = (id: number) => `${BASE}/api/cameras/${id}/audio`;

// Base de go2rtc accesible desde el navegador (para WebRTC/MJPEG).
export function go2rtcBase(): string {
  const saved = localStorage.getItem('g2rBase');
  if (saved) return saved.replace(/\/$/, '');
  const host = window.location.hostname || '127.0.0.1';
  return `http://${host}:1984`;
}

export const mjpegUrl = (stream: string) =>
  `${go2rtcBase()}/api/stream.mjpeg?src=${encodeURIComponent(`${stream}mjpeg`)}`;
