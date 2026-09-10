# SENTINEL — Changelog de Versiones

> Historial de versiones del dashboard. Última versión analizada: **v2.0.0 (estado actual)**.
> Referencias: `README.md` (fases + hitos) · `SENTINEL-V2.md` (checklist de alcance) ·
> `ROADMAP.md` (features a futuro) · `GUIA-DESARROLLO.md` (referencia técnica).

---

## v2.0.0 — Estado actual implementado (2026-09-09)

> Documenta la implementación en su estado actual. Todo lo listado está funcional y
> desplegado en `frontend/dist` (servido por uvicorn :8000, SW cache `cameras-v19`).

### Arquitectura de modos (fundación v2)

- [x] `frontend/src/modes/types.ts` — `Mode = 'cyberpunk' | 'vigilancia'` + `ModeContext`.
- [x] `frontend/src/modes/registry.ts` — registry `MODES` con componentes por modo.
- [x] `frontend/src/App.tsx` — renderiza `MODES[mode].*`, switcher en header, setting `mode`
      en DB (compat con `skin` vieja → default `cyberpunk`).
- [x] Skins v1.0.0 movidas a `frontend/src/legacy/` (aisladas, tree-shaking).

### Modo Vigilancia — centro de control con datos

- [x] `OpsTile`: overlay OFFLINE/blink, chips CODEC/FPS/RTT/bitrate, barra de salud
      segmentada, sparkline, **zoom digital** (`transform: scale`, chip `×N`).
- [x] `OpsDetail`: paneles SALUD DEL STREAM / TÉCNICO / RED / SESIÓN DE STREAM,
      joystick PTZ + presets + velocidad, **zoom digital** (`− Zoom / + Zoom / 1×`).
- [x] `OpsGrid`: selección por teclado (`1-4`), ET `Enter` → detalle, `S` → audio,
      `T` → sidebar, flechas → PTZ con hold continuo (300 ms), `+/-` → zoom digital
      con hold (90 ms), `0` → reset.
- [x] **Vista "solo cámara"** (`detailSolo`): desde el detalle, `Enter` o clic en el
      video → solo el video fullscreen sin info; en solo: flechas/PTZ, `S`/audio,
      zoom `+/-`, `Escape` vuelve al detalle (segundo `Escape` cierra al grid).
- [x] Audio por cámara refactorizado a **store compartido** (`useCameraAudio.ts`:
      `setCameraAudio`/`toggleCameraAudio`/`useCameraAudio`) — un solo `<audio>` por
      cámara compartido entre tile/detalle/solo; persiste en localStorage.

### Modo Cyberpunk — HUD scifi

- [x] **Esferas 3D** (`cyberSphereMatrix.ts`): distribución Fibonacci, bloom, no
      BokehPass, texturas de snapshot con fallback + refresh 5 s, hover/click,
      zoom a esfera, **cámara lateral "sala de monitoreo"** (posición `(7, 5, 9)`,
      FOV 60, luz cyan frontal `(6, 4, 8)`) — profundidad clara en las 4 cámaras.
- [x] **Mosaic 3D** (`cyberVideoScene.ts`): ensamblaje de cubos con textura de video
      WebRTC, HUD, escape para cerrar.
- [x] **Vista mosaico 3D (`CyberVideoDetail`) — atajos de teclado**:
  - `T` → ocultar/mostrar panel PTZ (botón flotante `◱ PTZ [T]` para re-abrir).
  - `↑↓←→` → PTZ con hold continuo (300 ms, misma mecánica que vigilancia).
  - `S` → toggle audio (store compartido).
  - `Escape` → cerrar (escena + close).
- [x] Boot sequence con partículas WebGL2/WebGPU + audio procedural (`.cyber-video-detail-*`).

### Rendimiento / backend

- [x] **Fix carga lenta de cámaras**: `/api/status` dejó de hacer `frame.jpeg`
      secuencial por cámara (6–13 s c/u → grid bloqueado 30 s+, sobresaturación de
      consumidores `keyframe`). Ahora deriva el estado de `stream_health_map()`
      (una llamada a `/api/streams`, producers activos + `bytes_recv`) → **43 ms**;
      `frame.jpeg` queda solo como fallback si el producer no está activo.
- [x] Leak de ffmpeg (go2rtc) diagnosticado y limpiado; go2rtc relanzado como
      servicio systemd de usuario.
- [x] Diagnóstico de zoom confirmado: **sin zoom óptico** en cámaras ATSG
      (SSIM 0.964/0.950 vs baseline 0.95) — `ptz ok` acepta, lente inmóvil.
      Documentado en `docs/REVERSE-ENGINEERING.md`.

### Nota de despliegue

- Backend sirve `frontend/dist` por request (no requiere restart por rebuild).
- Tras rebuild: hard refresh (Ctrl+Shift+R) por service worker.

---

## v1.0.0 — Herramienta estable (2026-08-01)

- Fases 0-7 completas (README): red, media go2rtc, dashboard, PTZ, detección de
  movimiento, Twitch, PWA/móvil.
- Tag git `v1.0.0`. SW cache `cameras-v4`.
- Ver `README.md` → "Hito v1.0".