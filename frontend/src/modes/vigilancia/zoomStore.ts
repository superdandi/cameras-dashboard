import { useSyncExternalStore } from 'react';

export const ZOOM_MIN = 1;
export const ZOOM_MAX = 5;

const zooms = new Map<number, number>();
let version = 0;
const listeners = new Set<() => void>();

function notify() {
  version++;
  listeners.forEach((l) => l());
}

function clamp(z: number): number {
  return Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, z));
}

export function getZoom(id: number): number {
  return zooms.get(id) ?? ZOOM_MIN;
}

export function setZoom(id: number, z: number) {
  const clamped = clamp(z);
  if (getZoom(id) === clamped) return;
  zooms.set(id, clamped);
  notify();
}

export function zoomIn(id: number, step = 0.25) {
  setZoom(id, getZoom(id) + step);
}

export function zoomOut(id: number, step = 0.25) {
  setZoom(id, getZoom(id) - step);
}

export function resetZoom(id: number) {
  setZoom(id, ZOOM_MIN);
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

export function useCameraZoom(id: number) {
  useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  return getZoom(id);
}