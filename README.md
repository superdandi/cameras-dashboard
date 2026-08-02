# Cameras Dashboard — Gestión Local de Cámaras ATSG / EseeCloud

Solución ad hoc para gestionar, visualizar y retransmitir cámaras de seguridad
**ATSG** (plataforma **EseeCloud/DVR163**) conectadas a la red local, sin depender
de la nube para el video. Incluye dashboard web 100% personalizable, control PTZ,
detección de movimiento, inventario y re-stream a Twitch.

- **Servidor**: <HOSTNAME> — CachyOS (Arch), IP `<SERVER_IP>`, red `<LAN>`
- **Cámaras**: ATSG Security Camera Outdoor (app EseeCloud, plataforma Juan Intelligent / dvr163)
- **Modo**: video 100% local + cloud EseeCloud mantenido (notificaciones de app siguen activas)

---

## Lista de Fases (Estado de Implementación)

> Este checklist es la fuente de verdad del avance. Cada fase se marca `✅` al completarla.

| # | Fase | Descripción | Estado |
|---|------|-------------|--------|
| 0 | **Documentación** | Investigación completa, plan, inventario y setup del repo | ✅ Hecho |
| 1 | **Reconocimiento de red** | Escanear red, descubrir cámaras, validar protocolos (eseecloud://, bubble://, snapshots, ONVIF/RTSP) y **PTZ (CGI HiChip)** | ✅ Hecho |
| 2 | **Base media (go2rtc)** | Streams locales funcionando + snapshots + API de estados | ✅ Hecho |
| 3 | **Dashboard web** | SPA con grid en vivo (WebRTC), vista detalle, inventario CRUD, skins | ✅ Hecho |
| 4 | **PTZ + audio** | Control de movimiento y audio bidireccional desde el dashboard | 🔶 PTZ ✅ / audio pendiente |
| 5 | **Detección de movimiento** | Timeline de eventos + alertas | ✅ Hecho |
| 6 | **Re-stream Twitch** | Gestor de stream (grid + audio + on/off) hacia twitch.tv | ✅ Hecho |
| 7 | **Móvil / remoto** | PWA instalable + backup + Tailscale (docs) + refinamiento | ✅ Hecho |

---

## Stack

| Componente | Tecnología | Rol |
|-----------|-----------|-----|
| Media gateway | **go2rtc** (v1.9.14) | Ingresa streams `eseecloud://` / `bubble://`, sirve WebRTC/MSE/HLS/MJPEG/RTSP |
| Backend | **Python FastAPI** (venv) | API REST/WebSocket: inventario, health, PTZ, movimiento, gestor Twitch, skins |
| Frontend | **React + TypeScript + Tailwind** | Dashboard custom, skins vía CSS variables, responsive móvil |
| Streaming | **ffmpeg** | Re-stream RTSP → RTMP Twitch, composición de grid, audio |
| Datos | **SQLite** | Inventario de cámaras (credenciales cifradas), eventos, settings |

## Estructura del repo

```
cameras-dashboard/
├── README.md                 # Este archivo + checklist de fases
├── docs/
│   ├── INVESTIGACION.md      # Hallazgos de la investigación (fuentes y hechos)
│   ├── PLAN.md               # Plan de implementación detallado por fase
│   ├── ARQUITECTURA.md       # Arquitectura, diagramas y decisiones
│   ├── INVENTARIO.md         # Inventario de cámaras (4 identificadas)
│   ├── PROTOCOLO.md          # Notas de protocolo (URLs, puertos, credenciales)
│   ├── REVERSE-ENGINEERING.md# Notas de ingeniería inversa (PTZ/audio)
│   ├── GUIA-DESARROLLO.md    # Referencia técnica completa: stack, puertos, API,
│   │                         # settings, bugfixes, gotchas y roadmap para devs
│   ├── REVIEW.md             # Informe de revisión integral + bugs
│   ├── PLAN-LATENCIA.md      # Optimización de latencia (LATPLAN-1)
│   ├── WEBRTC-LATENCIA.md    # Investigación cadena go2rtc→WebRTC
│   ├── RUNBOOK.md            # Operación diaria, arranque, troubleshooting
│   └── SENTINEL-V2.md        # Plan de rediseño V2: dos modos con identidad propia
├── config/
│   └── go2rtc.yaml           # Configuración del media gateway
├── reference/
│   └── firmware/
│       └── README.md         # Referencia a fuentes HiChip (fuentes excluidas, licencia no verificada)
├── scripts/
│   ├── recon/                # Scripts de reconocimiento de red (Fase 1)
│   └── status.sh             # Health de go2rtc + cámaras (Fase 2)
├── backend/                  # API FastAPI + venv + SQLite (Fase 3)
└── frontend/                 # SPA React + Vite + Tailwind (Fase 3)
```

## Cómo navegar

1. **Investigación completa**: `docs/INVESTIGACION.md`
2. **Plan por fases**: `docs/PLAN.md`
3. **Inventario de cámaras**: `docs/INVENTARIO.md` (4 cámaras identificadas)
4. **Estado de avance**: este README (tabla de fases)
5. **Hallazgo PTZ**: `docs/REVERSE-ENGINEERING.md` (control por CGI HiChip confirmado)
6. **CLI de prueba PTZ**: `scripts/recon/ptz.sh <IP> <cmd> [speed] [ms]`
7. **Referencia técnica completa (devs)**: `docs/GUIA-DESARROLLO.md` — stack con
   versiones, mapa de puertos y red, API y settings, bugfixes, gotchas y roadmap.
 8. **Revisión integral**: `docs/REVIEW.md` — informe con verificación por área y
    bugs encontrados/corregidos (Twitch 1 cámara, MJPEG fallback, deploy, ufw/LAN).
 9. **Acceso desde la LAN**: dashboard en `http://<SERVER_IP>:8000` desde cualquier
    equipo de la red (puertos `8000/1984/8554/8555` abiertos en ufw para `<LAN>`).

---

## Hito Fase 1 (2026-08-01)

- Las 4 cámaras (`.90`–`.93`) descubiertas y caracterizadas: HTTP 80, H.264
  HD/SD, snapshots, bubble. **Sin ONVIF ni RTSP**.
- **PTZ confirmado físicamente** vía `GET /cgi-bin/hi3510/ptzctrl.cgi`
  (`up/down/left/right/zoom/focus/presets/...`, auth básica). Presets
  aproximan posición pero no repiten exacto.
- Fuente del firmware (HiChip) localizada y archivada en `reference/firmware/`.
- CLI `scripts/recon/ptz.sh` para mover cámaras desde consola.

## Hito Fase 2 (2026-08-01)

- **go2rtc v1.9.14** instalado (`~/.local/bin/go2rtc`) y corriendo como
  **servicio systemd de usuario** (sin root) en <HOSTNAME>.
- `config/go2rtc.yaml`: 8 streams (4 HD `cam01-04` + 4 SD `cam0Nsd`) con
  ingreso `eseecloud://admin:@<CAM_IP>:80/livestream/{11,12}`.
- **Verificado**: las 8 corrientes producen video; RTSP out `rtsp://<HOSTNAME>:8554/<stream>`
  entrega H.264 1280x720; HLS y MJPEG operativos.
- `scripts/status.sh`: health de go2rtc + frame grab por cámara.
- Próximo: Fase 3 — dashboard web (FastAPI + React).

## Hito Fase 3 (2026-08-01)

- **Backend FastAPI** (`backend/`, venv propio): CRUD de inventario con
  **credenciales cifradas** (Fernet), health/status, snapshot proxy, PTZ y
  presets por API, settings/skins. Puerto **8000**, servicio systemd de usuario.
- **Frontend React+TS+Tailwind** (`frontend/`): grid en vivo por **WebRTC (WISH)**
  con fallback MJPEG, vista detalle con joystick PTZ y presets, inventario CRUD,
  **5 skins** + color de acento persistidos, responsive móvil.
- Todo servido en un solo puerto: `http://<SERVER_IP>:8000`.
- WebRTC va directo al navegador↔go2rtc (`:1984`), configurable en Settings.
- **Avance Fase 4**: joystick PTZ + presets ya funcionales en el dashboard
  (vía `ptzctrl.cgi`/`preset.cgi`). Queda audio bidireccional (talk).
- Próximo: Fase 5 — detección de movimiento + timeline.

## Hito Fases 4-5 (2026-08-01)

- **PTZ en el dashboard** (Fase 4): joystick con flechas/diagonales, zoom,
  velocidad y presets, vía API → `ptzctrl.cgi`/`preset.cgi` (auth cifrada en DB).
- **Audio talk**: investigación completada → **bloqueado/alcance futuro**: el
  firmware usa el SDK propietario N1 (sesión de voz iniciada por la plataforma);
  go2rtc no soporta talk para bubble/eseecloud. Ver `REVERSE-ENGINEERING.md`.
- **Detección de movimiento** (Fase 5): detector server-side (go2rtc frame.jpeg +
  Pillow, diff de frames gris 96x54), eventos en SQLite, vista **Eventos** en el
  dashboard (poll 5s), alertas opcionales vía ntfy/webhook, sensibilidad ajustable
  desde Settings. Verificado en vivo (pan PTZ → eventos diff 18-55).
- Próximo: Fase 6 — re-stream a Twitch.

## Hito Fase 7 (2026-08-01)

- **PWA**: `manifest.webmanifest`, service worker (`/sw.js`, cache shell + offline),
  iconos 192/512 y meta tags móviles → instalable en Android/iOS/desktop.
- **Backup**: `scripts/backup.sh` — copia SQLite consistente (`.backup`), `secret.key`
  y configs, rota los 10 últimos backups. Test: `~/backups/cameras/<fecha>/`.
- **Acceso remoto**: Tailscale documentado en `docs/RUNBOOK.md` (requiere `sudo`,
  pendiente de instalación en <HOSTNAME>).
- **Estado**: todas las fases 0-7 completas.

## Hito Fase 6 (2026-08-01)

- **Gestor de re-stream a Twitch** (`backend/app/twitch.py` + vista "Twitch"):
  - Grid de N cámaras (1/2/4+) con `xstack` automático, desde go2rtc RTSP local.
  - Sub-stream (SD) por defecto para ahorrar WiFi; switch a main-stream.
  - Audio opcional en loop desde archivo local (`twitch_audio`).
  - **Key**: preferente en `backend/.env` (`TWITCH_STREAM_KEY`, gitignored; prioridad
    sobre la DB) + config de ingest/bitrate/resolución.
  - On/off + estado del proceso (pid, cámara) desde el dashboard.
- **Verificado**: arranque/detención de ffmpeg con grid 1 y 2 cámaras, y **test en vivo
  con la stream key real de Twitch** (12 s, sin errores, stop limpio).
- Patrones reutilizados de `~/Proyectos/super-ffmpeg-stream` (RTMP ingest, audio aac).
- Próximo: Fase 7 — móvil/remoto (PWA + Tailscale) + refinamiento.

---

## Hito v1.0 (2026-08-01)

**Primera versión marcada como estable** — la herramienta queda lista y completa antes
de pasar a rediseño de UI y personalización de la transmisión.

- **Tag**: `v1.0.0` · Versión frontend: `1.0.0` (package.json) · SW cache `cameras-v4`.
- **Cobertura funcional**: fases 0-7 completas — dashboard WebRTC, PTZ, detección de
  movimiento, re-stream a Twitch, PWA, inventario, skins.
- **Optimización de latencia LATPLAN-1** aplicada: transcode MJPEG 15fps, toggle HD/SD,
  WebRTC garantizado (CORS H10). Investigación de levers en `docs/WEBRTC-LATENCIA.md`.
- **Bugfixes conocidos cerrados**: ufw/LAN (H9), CORS WebRTC (H10), MJPEG fallback (H3),
  grid Twitch 1 cámara, bufsize ffmpeg. Ver `docs/REVIEW.md`.

**Próximo (post-v1.0)**: rediseño de la UI y personalización de la transmisión.

---

## Seguridad (recomendado)

- Credenciales de cámaras **únicas y fuertes** (cambiadas desde la app EseeCloud).
- Las credenciales se almacenan **cifradas** en la DB de la solución.
- El video queda en tu LAN; no se expone ninguna cámara directamente a internet.
- La nube EseeCloud se mantiene solo para notificaciones de la app.
- A futuro: segmentar cámaras en VLAN aislada.

---

## Nota sobre seguridad y fragilidad del sistema

> **Este proyecto es una solución ad hoc para uso personal.** No está diseñado para
> entornos de producción ni para exponerse a internet. A continuación se describen los
> puntos débiles conocidos y las razones por las que esta herramienta es un **punto de
> partida**, no una solución de seguridad terminada.

### Puntos débiles conocidos

| Área | Vulnerabilidad | Impacto |
|------|---------------|---------|
| **Credenciales de cámaras** | Se almacenan cifradas (Fernet) en SQLite, pero la clave de cifrado (`secret.key`) está en disco en texto plano. Si alguien accede al servidor, puede descifrar todas las credenciales. | Acceso total a las cámaras |
| **go2rtc :1984** | API expuesta en LAN sin autenticación por defecto (`username: ""`, `password: ""`). Cualquier equipo en la red puede acceder a todos los streams de video. | Visualización no autorizada de todos los streams |
| **go2rtc CORS** | Configurado con `origin: "*"` para permitir el dashboard desde otros equipos. Cualquier sitio web en la LAN podría hacer signaling WebRTC y acceder a los streams. | Hijacking de streams vía CORS |
| **Dashboard :8000** | Sin autenticación por defecto (token opcional). Cualquiera en la LAN puede controlar PTZ, ver inventario, modificar settings y acceder a las cámaras. | Control no autorizado de PTZ y acceso a configuración |
| **Stream key de Twitch** | Si se almacena en la DB (cifrada) y un atacante obtiene el `secret.key`, puede retransmitir a tu canal de Twitch. | Uso no autorizado de tu canal |
| **Cámaras ATSG** | Usan credenciales por defecto (`admin:pass` o `admin:`). Si no se cambiaron desde la app, cualquier persona en la red puede acceder directamente a las cámaras vía HTTP/CGI. | Acceso directo a las cámaras sin dashboard |
| **Servidor (Linux)** | Si el servidor está en una red compartida (WiFi, dormitorio, etc.), un atacante con acceso a la red puede escanear y encontrar el dashboard, go2rtc y las cámaras. | Reconocimiento y explotación |
| **WiFi** | Si el servidor usa WiFi (como en nuestro caso, dado que la NIC ethernet está dañada), la señal es capturable por cualquier dispositivo en rango. Los streams de video viajan sin cifrar (H.264 sobre HTTP/WebRTC). | Interceptación de video en vivo |
| **Backup** | `scripts/backup.sh` copia `secret.key` y la DB. Si el backup se almacena en un lugar no seguro, un atacante puede descifrar credenciales y acceder a las cámaras. | Acceso a credenciales desde backup |
| **PWA offline** | El Service Worker cachea el shell, pero los streams y la API no funcionan offline. Un atacante podría inyectar un script malicioso en el cache del SW (requiere acceso al servidor). | Inyección de código en la PWA |

### Medidas de seguridad recomendadas

1. **Cambiar credenciales de cámaras** desde la app EseeCloud a contraseñas únicas y fuertes. Esto es lo más crítico y lo más fácil de hacer.
2. **Activar autenticación en el dashboard**: definir `CAM_ADMIN_TOKEN` en `backend/.env` para que todas las rutas `/api/*` exijan `Authorization: Bearer <token>`.
3. **Restringir go2rtc**: cambiar `api.origin` de `"*"` a la IP del dashboard, o escuchar solo en `127.0.0.1` y usar un proxy inverso.
4. **Segmentar la red**: usar una VLAN o subred dedicada para las cámaras, aislada del resto de dispositivos domésticos.
5. **Cifrar backups**: no almacenar `secret.key` junto con los backups; usar cifrado de disco o nube.
6. **Monitorear acceso**: revisar logs de go2rtc y del dashboard periódicamente para detectar accesos no autorizados.
7. **Actualizar firmware**: las cámaras ATSG usan firmware antiguo con known vulnerabilities. Si es posible, buscar actualizaciones o reemplazar por cámaras con soporte ONVIF/RTSP nativo.
8. **Firewall**: mantener ufw activo y solo abrir puertos necesarios para la LAN (como ya se hizo en nuestro caso).

### Por qué esta solución es un punto de partida

Esta herramienta nació como un proyecto **personal y ad hoc**: la necesidad de gestionar 4 cámaras de seguridad en la LAN sin depender de la nube, con un presupuesto mínimo y usando hardware existente (un laptop viejo como servidor). 

**Lo que aprovechamos:**
- **Protección**: el video queda 100% local, sin depender de servidores externos. Las notificaciones de la app EseeCloud siguen activas como complemento.
- **Personalización**: el dashboard es 100% customizable a nuestras necesidades (PTZ, detección de movimiento, re-stream a Twitch, skins cyberpunk/profesional).
- **Aprendizaje**: el proyecto cubre reconocimiento de red, ingeniería inversa de protocolos (CGI HiChip, bubble), streaming WebRTC, detección de movimiento por computación de visión, y desarrollo full-stack.

**Para quien quiera implementar algo similar:**
- Este repo es un **punto de partida**, no una solución de seguridad terminada. Las vulnerabilidades arriba descritas son reales y deben ser abordadas antes de usar esta herramienta en un entorno que requiera seguridad.
- La arquitectura modular (go2rtc + FastAPI + React) facilita reemplazar componentes: por ejemplo, reemplazar las cámaras ATSG por cámaras con ONVIF/RTSP nativo, o añadir autenticación real.
- La documentación exhaustiva (este README, `docs/`) está diseñada para que alguien más pueda entender, modificar y extender la solución.
- Las vulnerabilidades de las cámaras ATSG (credenciales por defecto, sin ONVIF, firmware antiguo) son compartidas por muchas cámaras de bajo costo. Si estás implementando algo similar, **prioriza cambiar las credenciales de las cámaras** como primer paso.

> **Disclaimer**: esta solución es para uso personal y educativo. El autor no se
> responsabiliza por el uso que se le dé a este código. Úsalo bajo tu propia
> responsabilidad y adaptalo a tus necesidades de seguridad.
