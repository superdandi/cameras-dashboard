import { useCallback, useEffect, useSyncExternalStore } from 'react';
import type { Camera } from '../types';
import { cameraAudioUrl } from '../api';

const STORAGE_KEY = 'camAudio';

interface CamAudio {
  enabled: boolean;
  player: HTMLAudioElement | null;
}

const audioById = new Map<number, CamAudio>();
let version = 0;
const listeners = new Set<() => void>();

function notify() {
  version++;
  listeners.forEach((l) => l());
}

function getEnabled(id: number): boolean {
  const cam = audioById.get(id);
  if (cam) return cam.enabled;
  try {
    return localStorage.getItem(`${STORAGE_KEY}:${id}`) === '1';
  } catch {
    return false;
  }
}

function persist(id: number, on: boolean) {
  try {
    localStorage.setItem(`${STORAGE_KEY}:${id}`, on ? '1' : '0');
  } catch {
    // ignore
  }
}

function ensure(id: number): CamAudio {
  let cam = audioById.get(id);
  if (!cam) {
    cam = { enabled: getEnabled(id), player: null };
    audioById.set(id, cam);
  }
  return cam;
}

function startAudio(id: number) {
  const cam = ensure(id);
  if (cam.player) return;
  const el = new Audio();
  el.src = cameraAudioUrl(id);
  el.loop = true;
  el.preload = 'auto';
  // play() requires user gesture; the toggle click IS the gesture
  el.muted = false;
  el.play().catch(() => {});
  cam.player = el;
}

function stopAudio(id: number) {
  const cam = audioById.get(id);
  if (cam?.player) {
    cam.player.pause();
    cam.player.src = '';
    cam.player = null;
  }
}

export function setCameraAudio(id: number, on: boolean) {
  const cam = ensure(id);
  if (cam.enabled === on) return;
  cam.enabled = on;
  persist(id, on);
  if (on) startAudio(id);
  else stopAudio(id);
  notify();
}

export function toggleCameraAudio(id: number) {
  setCameraAudio(id, !getEnabled(id));
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

export function useCameraAudio(camera: Camera) {
  useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  const id = camera.id;
  const enabled = getEnabled(id);

  // Reasume el audio compartido si quedó habilitado (idempotente: por cámara
  // solo existe un <audio>, compartido entre tile/detalle/solo).
  useEffect(() => {
    if (enabled) startAudio(id);
    // No detener al desmontar: el estado lo gobierna el toggle central.
  }, [id, enabled]);

  return {
    enabled,
    toggle: useCallback(() => toggleCameraAudio(id), [id]),
  };
}