// ============================================================================
// SENTINEL V1.0.0 — Sistema de skins original
// ============================================================================
// Este archivo contiene el sistema de skins original del proyecto (v1.0.0).
// Fue reemplazado por el sistema de modos en SENTINEL V2.
//
// Para referencia histórica, las 5 skins originales eran:
// - noche (dark blue)
// - dia (light)
// - verde (green terminal)
// - violeta (purple)
// - mono (monochrome)
//
// Este archivo NO se importa en el código activo de V2.
// Se conserva como referencia del proyecto para quien parta de v1.0.0.
// ============================================================================

import type { Skin } from '../types';

export const SKINS: Skin[] = [
  { id: 'noche', label: 'Noche', vars: { bg: '11 18 32', panel: '21 30 48', fg: '226 232 240', muted: '148 163 184', accent: '34 211 238' } },
  { id: 'dia', label: 'Día', vars: { bg: '241 245 249', panel: '255 255 255', fg: '15 23 42', muted: '100 116 139', accent: '14 116 144' } },
  { id: 'verde', label: 'Verde', vars: { bg: '7 20 18', panel: '15 35 30', fg: '220 240 232', muted: '140 170 160', accent: '52 211 153' } },
  { id: 'violeta', label: 'Violeta', vars: { bg: '17 12 32', panel: '28 22 50', fg: '232 226 244', muted: '160 150 190', accent: '167 139 250' } },
  { id: 'mono', label: 'Mono', vars: { bg: '10 10 12', panel: '22 22 26', fg: '235 235 240', muted: '140 140 150', accent: '220 220 230' } },
];

export function applySkin(id: string) {
  const skin = SKINS.find((s) => s.id === id) ?? SKINS[0];
  const root = document.documentElement;
  root.setAttribute('data-skin', skin.id);
  Object.entries(skin.vars).forEach(([k, v]) => root.style.setProperty(`--${k}`, v));
}
