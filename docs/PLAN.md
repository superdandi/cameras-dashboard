# Plan de Implementación

> Plan detallado por fase. El estado global se refleja en `README.md` (tabla de fases).

---

## Fase 0 — Documentación ✅
- [x] Investigación completa (`docs/INVESTIGACION.md`)
- [x] Setup del repo (git, estructura)
- [x] Este plan, inventario, arquitectura, protocolo, runbook

## Fase 1 — Reconocimiento de red ✅
**Objetivo**: descubrir y caracterizar todas las cámaras, validar protocolos y
eliminar todos los riesgos de las fases siguientes.

**Tareas:**
- [x] Escanear la LAN `<LAN>` (ping sweep + TCP scan de puertos típicos).
- [x] Identificar dispositivos cámara → 4 ATSG: `.90 .91 .92 .93`, puerto 80 (HTTP) + 10000 (binario).
- [x] Probar endpoint HTTP `livestream/11` y `/12` en cada cámara (auth básica) → OK.
- [x] Probar protocolo `bubble` (puertos 80 y 34567) → OK por HTTP `/bubble/live` (80).
- [x] Probar snapshot `/snapshot?auth=YWRtaW46` → OK (JPEG).
- [x] Detectar ONVIF (3702 discovery / device mgr) y RTSP (554) → **NO soportados**.
- [x] Registrar firmware/SDK/MAC/SN de cada cámara → MACs reales (tabla ARP). Firmware/SDK no expuestos.
- [x] Rellenar `docs/INVENTARIO.md` y `docs/PROTOCOLO.md` con datos reales.
- [x] Definir credenciales y probar acceso con go2rtc en modo manual.
- [x] **Hallazgo extra**: PTZ por CGI HTTP HiChip `/cgi-bin/hi3510/ptzctrl.cgi` confirmado
      en vivo (mueve físicamente). Presets vía `preset.cgi` (aproximan posición).
      Fuente del firmware archivada en `reference/firmware/`.

**Entregables**: inventario completo, ficha por cámara, protocolo validado, scripts de recon en `scripts/recon/`.

**Herramientas**: scripts stdlib Python (`scan_network.py`, `probe_camera.py`, `ptz_probe.py`, `fullport.py`), `curl`, `ffprobe`, go2rtc.

## Fase 2 — Base media (go2rtc) ✅
**Objetivo**: tener el video de todas las cámaras accesible localmente de forma
estable y con snapshots.

**Tareas:**
- [x] Descargar/instalar go2rtc v1.9.14 (binario en `~/.local/bin/go2rtc`).
- [x] Configurar `config/go2rtc.yaml` con streams `eseecloud://` por cámara (main HD + sub SD).
- [x] Validar visualización vía WebUI de go2rtc (port 1984) y RTSP local (8554).
- [x] Activar snapshots y frames MJPEG (frame.jpeg, stream.mjpeg, HLS, RTSP out).
- [ ] Hardening: API solo en localhost, reverse proxy o auth → **pendiente Fase 3**
      (por ahora API en :1984 accesible en LAN; el dashboard servirá vía backend FastAPI).
- [x] systemd unit de usuario para arranque automático.

**Entregables**: `config/go2rtc.yaml` + unit systemd (`~/.config/systemd/user/go2rtc.service`) +
validación de las 8 corrientes (4 HD + 4 SD) + `scripts/status.sh` (health de streams).

> **Verificado**: las 8 streams producen frame (H.264 320x180 de prueba); RTSP out
> entrega 1280x720; HLS y MJPEG disponibles. go2rtc v1.9.14 eseecloud:// funciona
> con auth básica vacía (`admin:@`).

## Fase 3 — Dashboard web ✅
**Objetivo**: dashboard 100% personalizable con skins.

**Tareas:**
- [x] Backend FastAPI: CRUD de inventario (credenciales cifradas con Fernet), health checks, estados.
- [x] Base de datos SQLite (`backend/data/cameras.db`, tablas `cameras`, `settings`, `events`).
- [x] Frontend React+TS+Tailwind: grid en vivo (WebRTC WISH con fallback MJPEG), vista detalle.
- [x] Sistema de **skins** (5 skins: noche/día/verde/violeta/mono + color de acento, persistidos en settings).
- [x] Responsive móvil básico.
- [x] Servir frontend + API tras un solo puerto (FastAPI sirve `frontend/dist` en `:8000`).
- [x] Endpoints PTZ/presets/snapshot proxy (adelanto de Fase 4).
- [x] Auth opcional vía Bearer token (`CAM_ADMIN_TOKEN`).

**Entregables**: dashboard navegable en `http://<SERVER_IP>:8000` con grid de cámaras,
inventario editable (CRUD) y cambio de skin en vivo.

> **Notas de implementación**: venv Python en `backend/.venv` (sin pip global, PEP 668).
> Seeded 4 cámaras por API. WebRTC requiere que el navegador alcance go2rtc (`:1984`,
> configurable en Settings). Servicio systemd: `cameras-backend.service` (usuario).

## Fase 4 — PTZ + audio 🔶 (PTZ ✅, audio pendiente)
**Objetivo**: mover cámaras y hablar por ellas desde el dashboard.

**Tareas:**
- [x] Determinar vía → **CGI HTTP HiChip** (`ptzctrl.cgi`), probada en vivo en Fase 1
      (ONVIF no soportado; protocolo bubble tiene `MSGT_PTZ` como alternativa).
- [x] Implementar endpoint REST de PTZ (dirección, velocidad, presets) en backend.
- [x] Joystick PTZ en el dashboard (flechas, diagonales, zoom, velocidad, presets).
- [ ] **Audio bidireccional (talk)** — bloqueado: usa el SDK propietario N1 (sesión de
      voz iniciada por la plataforma). Ver `REVERSE-ENGINEERING.md` (alcance futuro:
      RE del protocolo N1/bubble de talk o captura tcpdump de la app).
- [x] Documentar hallazgos en `docs/REVERSE-ENGINEERING.md`.

## Fase 5 — Detección de movimiento ✅
**Objetivo**: timeline de eventos y alertas.

**Tareas:**
- [x] Detector server-side (`backend/app/motion.py`): frame gris 96x54 vía go2rtc
      `frame.jpeg` + Pillow cada `motion_interval`s, diferencia media de píxeles
      vs. umbral `motion_threshold`, cooldown anti-saturación.
- [x] Timeline de eventos en el dashboard (vista "Eventos", poll 5s).
- [x] Alertas opcionales vía webhook/ntfy (`notify_url` en settings).
- [x] Persistencia de eventos en SQLite (tabla `events`).
- [x] Ajustes de sensibilidad desde el dashboard (umbral, intervalo, cooldown, notify).

> Verificado en vivo: pan PTZ de CAM-02 registró eventos con diff 27/18/55 (> umbral 9).

## Fase 6 — Re-stream Twitch ✅
**Objetivo**: retransmitir cámaras al canal de Twitch.

**Tareas:**
- [x] Gestor de stream (backend `app/twitch.py`): spawn/kill ffmpeg hacia `rtmp://live.twitch.tv/app/KEY`.
- [x] Composición de grid N cámaras con `filter_complex` + `xstack` (layout automático cols/rows).
- [x] Audio opcional (archivo local en loop, `twitch_audio`) para cumplir requisitos de Twitch.
- [x] Key de stream cifrada en settings (Fernet) + config (url, bitrate, resolución).
- [x] Control on/off + status + preview desde el dashboard (vista "Twitch").
- [x] Revisar proyecto existente `~/Proyectos/super-ffmpeg-stream` (patrón RTMP/audio reutilizado).

**Verificado**: arranque/detención del proceso ffmpeg con grid 2 cámaras (sub-stream),
gestión de PID y cleanup. Falta test con key real de Twitch (requiere el stream key del usuario).

> Seguridad: la key aparece en la línea de comandos de ffmpeg (visible en `ps`) — limitado
> a usuarios locales de <HOSTNAME>. Guardada cifrada en la DB. NOTA: el bitrate por defecto de
> las cámaras es ~1500k en SD; ajustar `twitch_bitrate` a la calidad deseada.

## Fase 7 — Móvil / remoto ✅
**Objetivo**: acceso cómodo desde el celular y refinamiento.

**Tareas:**
- [x] **PWA instalable**: `manifest.webmanifest`, service worker (cache shell + offline),
      iconos 192/512 (Pillow), meta tags móviles (theme-color, standalone).
- [x] **Backup**: `scripts/backup.sh` (copia SQLite consistente + secret.key + configs, rota 10).
- [x] Performance: sub-stream en grid, main-stream en detalle (ya implementado Fase 3/5).
- [ ] **Acceso remoto (Tailscale)**: no instalado en <HOSTNAME> (requiere sudo). Pasos en
      `docs/RUNBOOK.md#acceso-remoto-tailscale`.
- [ ] **Notificaciones push** (opcional): ntfy al móvil vía `notify_url` (ya soportado).
- [x] Documentación final de operación.

**Verificado**: PWA servida desde `:8000` (manifest/sw/iconos 200, instalable),
backup generado y rotación OK. Tailscale pendiente de instalar (elevación).
