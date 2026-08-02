# Arquitectura

## Visión general

```
                    ┌─────────────────────────────────────────────────────────────┐
                    │                    RED LOCAL <LAN>                 │
                    │                                                             │
   ┌──────────┐     │   ┌─────────────┐   HTTP propietario / bubble    ┌───────┐  │
   │ Internet │◀────┼──▶│ Nube EseeCloud│◀── (P2P, notificaciones) ───▶│ Cámaras│  │
   │ (cloud)  │     │   └─────────────┘                                │ ATSG  │  │
   └──────────┘     │                                                 └───┬───┘  │
   (se mantiene     │                                      eseecloud:// · bubble:// │
    solo para       │                                      http://IP:80/livestream │
    notificaciones) │                                                     │       │
                    │                                          ┌──────────▼──────┐ │
                    │                                          │     go2rtc      │ │  media gateway
                    │                                          │   (Docker/unit) │ │  (puertos 1984/8554/8555)
                    │                                          └────────┬────────┘ │
                    │                            WebRTC · HLS · MJPEG · RTSP      │
                    │                                     │            │          │
                    └─────────────────────────────────────┼────────────┼──────────┘
                                                          │            │
                         ┌───────────────────────────────┼────────────┼────────────┐
                         │                    <HOSTNAME> (este servidor)                │
                         │                                                         │
                         │   ┌───────────────┐   ┌───────────────────────────┐     │
                         │   │  Backend       │   │  ffmpeg jobs (Fase 6)    │     │
                         │   │  FastAPI       │   │  grid + audio → Twitch   │     │
                         │   │  · inventario  │   └───────────────────────────┘     │
                         │   │  · health      │                                     │
                         │   │  · PTZ         │   ┌───────────────────────────┐     │
                         │   │  · movimiento  │   │  Frontend React SPA       │     │
                         │   │  · skins       │   │  · grid WebRTC            │     │
                         │   │  · SQLite      │   │  · skins (CSS vars)       │     │
                         │   └──────┬────────┘   │  · responsive móvil       │     │
                         │          │ HTTP/WS    └───────────────────────────┘     │
                         └──────────┼──────────────────────────────────────────────┘
                                    │
                             Browser (PC / móvil en LAN)
```

## Componentes y decisión de diseño

### 1. go2rtc — media gateway
- **Por qué**: soporta nativamente `eseecloud://` (v1.9.10+) y `bubble://`
  (v1.6.1+), los dos protocolos que nuestras cámaras entienden. Convierte el
  stream a WebRTC (latencia mínima en navegador), MSE, HLS (móvil), MJPEG
  (thumbnails) y RTSP (para ffmpeg → Twitch). Evita reinventar el código del
  protocolo propietario.
- **No hace** PTZ ni detección — eso va en el backend.
- **Despliegue actual (Fase 2, <HOSTNAME>)**:
  - Binario: `~/.local/bin/go2rtc` v1.9.14 (Linux amd64).
  - Config: `config/go2rtc.yaml` (repo).
  - Servicio: `systemd --user` → `~/.config/systemd/user/go2rtc.service`.
  - Puertos: **1984** API/WebUI/WebRTC · **8554** RTSP out · **8555** WebRTC TCP/UDP.
  - Streams: `cam0N` (main HD `/livestream/11`) y `cam0Nsd` (sub SD `/livestream/12`),
    ingreso `eseecloud://admin:@<CAM_IP>:80/...` (auth básica, pass vacía).
  - Health: `scripts/status.sh` (go2rtc UP/DOWN + frame grab por stream).

### Endpoints de salida go2rtc (verificados Fase 2)
| Salida | URL | Uso |
|--------|-----|-----|
| Snapshot/thumb | `http://<HOSTNAME>:1984/api/frame.jpeg?src=<stream>&width=W` | thumbnails, skins |
| MJPEG | `http://<HOSTNAME>:1984/api/stream.mjpeg?src=<stream>` | previsualización |
| HLS | `http://<HOSTNAME>:1984/api/stream.m3u8?src=<stream>` | móvil/iOS |
| MSE/MP4 | `http://<HOSTNAME>:1984/api/stream.mp4?src=<stream>` | navegadores (media) |
| RTSP out | `rtsp://<HOSTNAME>:8554/<stream>` | ffmpeg → Twitch, VLC, Frigate |
| WebRTC | API `POST /api/webrtc?src=<stream>` (WISH) | grid en vivo (Fase 3) |

### 2. Backend FastAPI
- **Por qué**: Python tiene SQLite nativo, WebSocket fácil, y control de procesos
  (ffmpeg) sencillo. CRUD de inventario con credenciales cifradas (Fernet/cryptography).
- **Despliegue actual (Fase 3)**:
  - Venv: `backend/.venv` (fastapi, uvicorn, cryptography) — no hay pip global (PEP 668).
  - Servicio: `systemd --user` → `cameras-backend.service`, puerto **8000**.
  - DB: `backend/data/cameras.db` (SQLite) · clave Fernet: `backend/data/secret.key` (600).
  - Sirve el SPA (`frontend/dist`) en `/` + API en `/api/*` (un solo puerto).
  - Auth opcional: `CAM_ADMIN_TOKEN` en el unit → Bearer token.
- **Endpoints**: `/api/health` · `/api/status` (frame grab por cámara) ·
  `/api/cameras` CRUD · `/api/cameras/{id}/snapshot` (proxy JPEG de la cámara) ·
  `/api/cameras/{id}/ptz` · `/preset` · `/api/settings/{key}`.
- **Responsabilidades**: inventario, health/estados, PTZ, skins/settings,
  detección de movimiento (Fase 5), gestor Twitch (Fase 6).

### 3. Detector de movimiento (Fase 5)
- `backend/app/motion.py` — tarea asyncio que por cada cámara habilitada:
  1. Trae un frame pequeño de go2rtc (`/api/frame.jpeg?src=<sub>&width=160`).
  2. Decodifica a gris 96x54 con **Pillow**.
  3. Compara con el frame anterior (diferencia media de píxeles).
  4. Si `diff > motion_threshold` (def 9) y pasado el cooldown (def 10 s) →
     inserta evento en SQLite + notifica a `notify_url` (ntfy/Telegram) si está fijado.
- Parámetros configurables por API/settings: `motion_threshold`, `motion_interval`,
  `motion_cooldown`, `notify_url`.
- La detección es server-side (no usa el detector de la cámara: sus CGIs
  `mdattr.cgi`/`mdalarm.cgi` no están expuestos).

### 3. Frontend React + Tailwind
- **Por qué**: skins "completamente personalizables" se resuelven con variables
  CSS (5 skins + acento) persistidas en SQLite vía API. WebRTC WISH contra go2rtc
  (fallback MJPEG). PWA para móvil en Fase 7.
- **Despliegue actual**: Vite + React + TS + Tailwind en `frontend/`.
  - Dev: `npm run dev` (:5173, proxy `/api` → 8000).
  - Prod: `npm run build` → `frontend/dist` servido por FastAPI.
  - WebRTC/MJPEG: el navegador alcanza go2rtc en `:1984` (base configurable en
    Settings → localStorage `g2rBase`).

### 4. ffmpeg — re-stream Twitch (Fase 6)
- `backend/app/twitch.py`: `subprocess.Popen` de ffmpeg con `start_new_session` y
  kill de grupo para stop limpio.
- Grid: `filter_complex` scale+pad por cámara → `xstack` con layout automático
  (cols=ceil(sqrt(n)), rows=ceil(n/cols)).
- Ingest: `rtmp://live.twitch.tv/app/<key>`; key cifrada en settings (`twitch_key_enc`).
- Audio: opcional `-stream_loop -1 -i <file>` + `-c:a aac`.
- Salida: `libx264 veryfast`, `-b:v <twitch_bitrate>`, `-pix_fmt yuv420p`, `-g 60`, `-f flv`.
- Endpoints: `/api/twitch/status|start|stop|config`.

### 5. Base de datos SQLite
- Tablas: `cameras` (credenciales cifradas), `settings` (skins, movimiento, twitch),
  `events` (movimiento/timeline).
- Claves de settings y referencia de API: `docs/GUIA-DESARROLLO.md#5-referencia-de-la-api` y `#6-claves-de-settings`.

## Flujo de datos (video)
```
Cámara ATSG (livestream/bubble)
  → go2rtc (media gateway)
    → WebRTC/WS   → dashboard grid (latencia ~300 ms)
    → HLS/MSE     → móvil / reproductores
    → MJPEG       → thumbnails / skins / detección de movimiento
    → RTSP :8554  → ffmpeg → Twitch RTMP
```

## Seguridad
- API de go2rtc actualmente accesible en LAN (puerto 1984). **Plan Fase 3**: servir
  el dashboard y proxear el API vía backend FastAPI con auth; o restringir 1984 a
  localhost y usar el WebUI solo vía proxy. WebRTC requiere acceso directo del
  navegador a go2rtc (WISH en 1984 + media en 8555).
- Credenciales de cámaras cifradas en DB.
- Dashboard con auth básica al menos; a futuro login.
- Sin puertos abiertos al internet (solo LAN). Acceso remoto vía Tailscale.
