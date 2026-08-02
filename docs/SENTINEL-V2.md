# SENTINEL V2 — Rediseño: dos modos con identidad propia

> **Alcance completo + checklist de implementación**.
> Referencias: `docs/UI-MODOS.md` (diseño visual por modo) · `docs/GUIA-DESARROLLO.md` §9 (hoja de ruta).
> **Versión**: v2.0.0 · **Estado**: pendiente (plan aprobado 2026-08-02).

---

## 1. Arquitectura por modos (fundación)

- [ ] `frontend/src/modes/types.ts` — type `Mode = 'cyberpunk' | 'vigilancia'` + `ModeContext` (React Context)
- [ ] `frontend/src/modes/registry.ts` — `MODES` registry: `{ id, label, tagline, components: { Header, Grid, Tile, Detail, Events, Inventory, Twitch, Settings } }`
- [ ] `frontend/src/modes/cyberpunk/index.tsx` — exporta todos los componentes cyberpunk
- [ ] `frontend/src/modes/vigilancia/index.tsx` — exporta todos los componentes vigilancia
- [ ] `frontend/src/App.tsx` renderiza `MODES[mode].*` (sin componentes fijos en App)
- [ ] Setting `mode` (nueva en DB) — al cargar: si falta `mode` pero `skin` existe → default `cyberpunk`
- [ ] `applyMode(mode)` reemplaza `applySkin()`; `<html>` usa `data-mode` en vez de `data-skin`
- [ ] Switcher rápido de modo en el header (visible en ambos modos)

## 2. Modo Cyberpunk (HUD scifi cinematográfico)

### Header
- [ ] Wordmark **SENTINEL** en Orbitron con glow cian (`text-shadow`)
- [ ] Línea inferior animada tipo retícula (CSS border + animation)
- [ ] Reloj UTC/sistema en Share Tech Mono
- [ ] Contador `4 CAMS ONLINE // <HOSTNAME>` en mono
- [ ] Botón switcher `◉ OPS` para pasar a Vigilancia

### Tiles de cámara
- [ ] Retícula HUD en esquinas (CSS `clip-path` / `border-image` / pseudo-elementos con esquinas)
- [ ] Scanlines sutiles sobre el video (`repeating-linear-gradient`, `mix-blend-mode: multiply`)
- [ ] Overlay inferior: `CAM-XX · IP` en Share Tech Mono
- [ ] Indicador **REC** parpadeante cuando `mode === 'webrtc'`
- [ ] Post-procesado video vía `--video-filter` (contrast/saturate/hue-rotate/brightness) — GPU cliente, cero carga al server
- [ ] Glow en hover (`box-shadow` con `rgb(var(--accent)`)
- [ ] Fondo de grid sutil (líneas de cuadrícula CSS)

### Grid
- [ ] Layout cinematográfico oscuro, fondo `--bg` profundo
- [ ] Numeración de cámara (`CAM-01`, `CAM-02`...) en badge
- [ ] Grid sutil de fondo de tipo malla de seguridad

### Detail (fullscreen)
- [ ] Crosshair/retícula animada en el centro del video
- [ ] Indicadores HUD: CAM ID, IP, estado
- [ ] Panel PTZ con estética de panel de control
- [ ] Video con post-procesado `--video-filter`

### Events
- [ ] Estilo terminal de logs: fondo oscuro, tipografía mono
- [ ] Timestamp coloreado por tipo (motion = cian, etc.)
- [ ] Cursor parpadeante al final del log
- [ ] Scanlines sutiles

### Inventory / Twitch / Settings
- [ ] Estética terminal/HUD (mono, glitch hover en botones, paneles con esquinas tipo HUD)

## 3. Modo Vigilancia (centro de control con datos)

### Header
- [ ] SENTINEL en bold sans/mono (sin glow)
- [ ] Franja de salud por cámara: `[●CAM-01] [●CAM-02] [●CAM-03] [●CAM-04]` con color `--ok/--warn/--danger`
- [ ] Reloj de sistema

### Tiles de cámara (datos reales client-side)
- [ ] Tiles compactos con video + pie de datos
- [ ] Datos visibles: `IP · stream · estado · bytes`
- [ ] Indicador color `--ok` (verde) / `--warn` (ámbar) / `--danger` (rojo) según `ok` de status
- [ ] Cuando WebRTC activo: mostrar también fps, resolución, latencia (RTT), jitter, packetsLost del `getStats`
- [ ] Cuando MJPEG/off: solo datos de `/api/status`

### Grid
- [ ] Layout compacto tipo centro de control
- [ ] Posible panel lateral/strip de resumen de todas las cámaras

### Detail (fullscreen)
- [ ] Layout limpio, PTZ panel sobrio
- [ ] Telemetría en vivo: fps / latencia / paquetes perdidos / resolución
- [ ] Sin post-procesado de video

### Events
- [ ] Tabla estructurada: `hora · cámara · tipo · detalle`
- [ ] Colores de estado (ok/warn/danger) en las filas

### Inventory / Twitch / Settings
- [ ] Paneles profesionales de datos
- [ ] Mono en números/telemetría
- [ ] Indicadores de estado ok/warn/danger

## 4. Datos y hooks compartidos

- [ ] Extender `useCameraStream` → devolver `stats` (polling `pc.getStats()` cada 2s):
  - `fps` (framesPerSecond)
  - `resolution` (frameWidth × frameHeight)
  - `rtt` (currentRoundTripTime en ms)
  - `jitter`
  - `packetsLost`
  - `bytesReceived`
- [ ] Fallback: en modo MJPEG/off, `stats = null`, usar datos de `/api/status` (bytes, ok, status)
- [ ] Hook `useEvents()` (data fetching compartido, presentación por modo)
- [ ] Hook `useInventory()` (CRUD compartido, presentación por modo)
- [ ] Hook `useTwitch()` (estado/config compartidos, presentación por modo)
- [ ] **Cero cambios de backend** — ambos modos 100% client-side

## 5. Legado v1 (skins aisladas)

- [ ] Crear `frontend/src/legacy/skins.ts` — mover `SKINS` + `applySkin()` intactos
- [ ] Crear `frontend/src/legacy/skins.css` — mover bloques CSS de las 5 skins originales
- [ ] Crear `frontend/src/legacy/README.md` — documenta: "sistema de skins de SENTINEL v1.0.0 (git tag v1.0.0, commit 01f60fc)"
- [ ] `SettingsPanel.tsx`: eliminar `export const SKINS` y `export function applySkin` (pasan a legacy)
- [ ] App.tsx: importar `applyMode` y `MODES` desde `modes/registry.ts` en vez de `SettingsPanel`
- [ ] No importar legacy en ningún módulo activo (el bundler lo excluye por tree-shaking)

## 6. CSS y estilos

- [ ] `index.css`: bloques `[data-mode='cyberpunk']` y `[data-mode='vigilancia']` con variables extendidas
- [ ] Variables CSS por modo: `--bg, --panel, --fg, --muted, --accent, --ok, --warn, --danger, --glow, --font-display, --font-mono, --video-filter`
- [ ] Fuentes self-hosted: `Orbitron-Variable.woff2` + `ShareTechMono-Regular.woff2` en `public/fonts/`
- [ ] Tipografías: Orbitron (display cyberpunk), Share Tech Mono (datos/mono), system-ui (fallback vigilancia)
- [ ] Efectos cyberpunk (bajo `[data-mode='cyberpunk']`): scanlines, viñeta, glow, bordes HUD, scrollbar glow
- [ ] `tailwind.config.js`: colores `ok/warn/danger` ya extendidos
- [ ] Borrar bloques de skins viejas de `index.css` (mover a `legacy/skins.css`)

## 7. Migración de settings

- [ ] Setting nueva: `mode` (string: `cyberpunk` | `vigilancia`)
- [ ] Al cargar: si `mode` existe → usarlo; si no, pero `skin` existe → default `cyberpunk`; si nada → `cyberpunk`
- [ ] `saveMode()` guarda `mode` en la DB vía `api.setSetting('mode', id)`
- [ ] La setting `skin` se mantiene en la DB (no se borra, por compat legacy)
- [ ] `brand` setting ya implementada en v1 → se conserva

## 8. Documentación

- [ ] `docs/SENTINEL-V2.md` (este archivo): checklist de alcance
- [ ] `docs/UI-MODOS.md` (nuevo): mockups/descripción visual de cada modo, guía de estética
- [ ] `docs/GUIA-DESARROLLO.md` §9: actualizar con resumen de la arquitectura de modos
- [ ] `README.md` v2: actualizar para reflejar sentinEL V2 como la versión actual

## 9. Deploy y verificación

- [ ] `sw.js`: bump cache → `cameras-v6`
- [ ] `npm run build` → verificar que compila sin errores
- [ ] Verificar: cambiar entre modos funciona, datos de vigilancia se cargan, efectos cyberpunk visibles
- [ ] Deploy: reemplazar `frontend/dist/` en el servidor, reiniciar servicio
- [ ] Notificar al usuario via Vocal Nexus cuando el entorno esté listo para revisión

---

## Notas de implementación

- **Orden de ejecución**: 1) arquitectura → 2) cyberpunk → 3) vigilancia → 4) hooks/getStats → 5) legado → 6) CSS → 7) settings → 8) docs → 9) deploy
- **Modo por defecto**: `cyberpunk` (confirmado por usuario)
- **Datos**: 100% client-side, sin cambios de backend, en ambos modos
- **Legacy**: las 5 skins de v1.0.0 se conservan en `legacy/` pero no se importan (el bundler las excluye)

