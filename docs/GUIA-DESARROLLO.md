# Guía de Desarrollo — Cameras Dashboard (<HOSTNAME>)

> Documento de referencia para continuar el proyecto: stack completo con versiones,
> mapa de puertos y red, referencia de API y settings, bitácora de bugfixes,
> trampas conocidas (gotchas) y hoja de ruta pendiente.
>
> **Última actualización**: 2026-08-01 · **Estado**: fases 0-7 completas (7/7) ·
> **versión marcada: v1.0.0** (2026-08-01).

---

## 1. Resumen de 60 segundos

```
<HOSTNAME> (<SERVER_IP>, CachyOS/Arch)
├── go2rtc (media gateway)   :1984/8554/8555   →  video de las 4 cámaras
├── Backend FastAPI          :8000             →  API + sirve frontend/dist
├── Frontend React SPA       (build estático)  →  servido por FastAPI en /8000
├── Detector de movimiento   (task asyncio)    →  eventos en SQLite
└── Gestor Twitch            (spawn ffmpeg)    →  rtmp://live.twitch.tv

Cámaras ATSG (eseecloud): <CAM_IP> - .93 (HD /livestream/11 · SD /livestream/12)
```

- URL del dashboard: `http://<SERVER_IP>:8000`
- WebUI de go2rtc (LAN): `http://<SERVER_IP>:1984`
- Servicios: `systemctl --user status go2rtc cameras-backend`

---

## 2. Stack completo (versiones verificadas)

| Componente | Versión | Dónde | Rol |
|-----------|---------|-------|-----|
| OS | CachyOS (Arch) | <HOSTNAME>, hostname de red | - |
| Python | 3.14.6 | venv `backend/.venv` | backend |
| FastAPI | 0.141.1 | venv | API REST |
| Uvicorn | 0.52.0 | venv | ASGI server (:8000) |
| Pydantic | 2.13.4 | venv | schemas |
| cryptography | 50.0.0 | venv | cifrado Fernet |
| Pillow | 12.3.0 | venv | frames del detector |
| go2rtc | 1.9.14 (b5948cf) | `~/.local/bin/go2rtc` | media gateway |
| ffmpeg | n8.1.2 | sistema (pacman) | re-stream Twitch |
| Node.js | 26.4.0 | sistema | build del frontend |
| SQLite | 3.53.3 | sistema (stdlib) | persistencia |
| React / ReactDOM | 18.3.1 | `frontend/` | SPA |
| Vite | 5.4.11 | `frontend/` | bundler |
| TypeScript | 5.6.3 | `frontend/` | tipos |
| Tailwind | 3.4.17 | `frontend/` | estilos |

> ⚠️ Python del sistema usa PEP 668 (no `pip` global). Toda instalación se hace en
> `backend/.venv` (activar: `source backend/.venv/bin/activate`).
> `pip freeze` del venv: ver `backend/requirements.txt` (fastapi==0.141.1,
> uvicorn[standard]==0.52.0, cryptography>=42, pillow>=10).

---

## 3. Mapa de puertos en uso

### 3.1 <HOSTNAME> (<SERVER_IP>)
| Puerto | Proceso | Protocolo | Notas |
|--------|---------|-----------|-------|
| 8000 | uvicorn (backend) | HTTP | Dashboard + API `/api/*`. **Único puerto que se abre en el navegador.** |
| 1984 | go2rtc | HTTP + WebRTC/WHEP | API (`/api/...`), WebUI, frame.jpeg, MJPEG, HLS, webrtc. Accesible en LAN (el navegador lo necesita para WebRTC). |
| 8554 | go2rtc | RTSP (TCP) | Salida RTSP `rtsp://<HOSTNAME>:8554/<stream>` para ffmpeg/Frigate/VLC. Ligado a `:8554` (0.0.0.0). |
| 8555 | go2rtc | WebRTC (TCP/UDP) | Media de WebRTC (WISH). |
| 5173 | vite (dev) | HTTP | Solo en desarrollo (`npm run dev`). Proxy `/api` → 127.0.0.1:8000. |
| 3777 | Vocal Nexus | HTTP | Servidor de notificaciones de voz (ver nota MCP abajo). No es del dashboard. |

> 1984 está en 0.0.0.0 → expuesto a la LAN. Para endurecer: `listen: "127.0.0.1:1984"`
> en `config/go2rtc.yaml` y configurar el WebRTC base en Settings del dashboard
> (localStorage `g2rBase`) o exponer solo vía Tailscale.
>
> 🔥 **Firewall**: ufw activo con `INPUT DROP`. Desde la LAN (`<LAN>`) están
> abiertos `8000`, `1984`, `8554` y `8555`. Ver `docs/REVIEW.md` H9 (bug real que dejaba
> el dashboard inaccesible desde otros equipos).
>
> ⚠️ **Red**: la NIC ethernet onboard (`enp4s0`, Yukon Optima 88E8059) está **muerta**
> (fallo hardware PHY). <HOSTNAME> funciona **solo por WiFi** 2.4GHz (`wlan0`, SSID `<SSID>`).
> La latencia/ingesta depende de la calidad de la señal WiFi. Ver gotcha 16 y
> `/home/<USER>/DOCUMENTACION_RED.md` §8B.

### 3.2 Cámaras ATSG (cada una: .90 .91 .92 .93)
| Puerto | Protocolo | Uso |
|--------|-----------|-----|
| 80 | HTTP | nginx embebido: `/livestream/{11,12}`, `/snapshot{, .jpg}`, `/bubble/live`, `/cgi-bin/hi3510/*` |
| 10000 | TCP binario | Protocolo bubble/P2P nativo (no HTTP). No usado por la solución. |
| 554/8899/3702/5000 | RTSP/ONVIF | **Cerrados**: estas cámaras NO exponen RTSP ni ONVIF. |

### 3.3 Otros hosts vistos en la LAN (scan Fase 1)
| Host | Puertos abiertos | Identificado como |
|------|------------------|-------------------|
| <ROUTER_IP> | 80, 8000 | Router master / gateway (reserva DHCP aquí) |
| <HOST_IP> | 80 | Host con web server (sin cámara) — histórico Vocal Nexus MCP roto |
| <HOST_IP> | 5000 | Dispositivo con 5000 abierto (sin cámara) |
| <CAM_IP>-93 | 80 (+10000) | Las 4 cámaras ATSG |
| <SERVER_IP> | 3777 | <HOSTNAME> (este servidor) |

---

## 4. Mapa de red — las 4 cámaras

| Cámara | IP | MAC (ARP) | ID DB | Streams go2rtc | Modelo | PTZ |
|--------|----|-----------|-------|----------------|--------|-----|
| CAM-01 | <CAM_IP> | `<MAC>` | 1 | `cam01` / `cam01sd` (+`cam01mjpeg`/`cam01sdmjpeg`) | ATSG Outdoor PTZ (HiChip) | ✅ |
| CAM-02 | <CAM_IP> | `<MAC>` | 2 | `cam02` / `cam02sd` (+`cam02mjpeg`/`cam02sdmjpeg`) | idem | ✅ |
| CAM-03 | <CAM_IP> | `<MAC>` | 3 | `cam03` / `cam03sd` (+`cam03mjpeg`/`cam03sdmjpeg`) | idem | ✅ |
| CAM-04 | <CAM_IP> | `<MAC>` | 4 | `cam04` / `cam04sd` (+`cam04mjpeg`/`cam04sdmjpeg`) | idem | ✅ |

- Streams: `eseecloud://admin:@<IP>:80/livestream/11` (HD H.264 1280x720) y `/12` (SD 640x360).
- Los streams `cam0N[sd]mjpeg` son **transcodificados a MJPEG por ffmpeg**
  (`#video=mjpeg#width=640#fps=10`) y los usa el fallback del frontend (ver gotcha 1).
  ⚠️ **Añadir también a una cámara nueva**.
- Auth básica: usuario `admin`, password configurada en la app (vacía por defecto → `admin:`).
- Todas usan DHCP → **recomendar reserva DHCP/IP fija en el router** (<ROUTER_IP>) para que no cambie la IP.
- Credenciales reales viven **cifradas** en `backend/data/cameras.db` (tabla `cameras`, columnas `username`/`password`, cifrado Fernet). No se documentan en texto plano.
- `name`/`location` siguen con nombres genéricos ("por nombrar") en la DB — renombrarlas desde **Inventario**.

---

## 5. Referencia de la API (`http://<SERVER_IP>:8000/api/...`)

> Auth opcional: si se define `CAM_ADMIN_TOKEN` en el unit, todas las rutas exigen
> `Authorization: Bearer <token>`.
>
> **Stream key de Twitch**: preferente `TWITCH_STREAM_KEY` en `backend/.env` (gitignored,
> plantilla en `backend/.env.example`). El backend carga el `.env` en `config.py` y
> `twitch.py::get_key()` usa entorno → DB. Solo `key_set` se expone por la API.

| Método | Ruta | Body (JSON) | Descripción |
|--------|------|-------------|-------------|
| GET | `/api/health` | - | Estado: `{"status":"ok","go2rtc":{ok,streams[]}}` |
| GET | `/api/status` | - | Por cámara: `{go2rtc, cameras:[{id,name,ip,enabled,stream,ok,status,bytes}]}` |
| GET | `/api/cameras` | - | Inventario completo (sin credenciales) |
| GET | `/api/cameras/{id}` | - | Una cámara |
| POST | `/api/cameras` | `CameraIn` | Crear cámara (usuario/password se cifran) |
| PUT | `/api/cameras/{id}` | `CameraPatch` | Actualizar campos (envío parcial) |
| DELETE | `/api/cameras/{id}` | - | Borrar |
| GET | `/api/cameras/{id}/snapshot` | - | Proxy JPEG `image/jpeg` (snapshot de la cámara real) |
| POST | `/api/cameras/{id}/ptz` | `{act,speed=40,duration_ms=0}` | Comando PTZ; `duration_ms>0` → mueve y hace `stop` |
| POST | `/api/cameras/{id}/preset` | `{act:set|goto|clear,number,status?}` | Presets |
| GET | `/api/events?limit=50&camera_id=` | - | Timeline de eventos (JOIN con nombre de cámara) |
| DELETE | `/api/events` | - | Vaciar eventos |
| GET | `/api/twitch/status` | - | `{running,pid,cameras,use_sub,started_at}` |
| POST | `/api/twitch/start` | `{camera_ids:[],use_sub=true}` | Arrancar ffmpeg → Twitch |
| POST | `/api/twitch/stop` | - | Detener (kill grupo SIGTERM→SIGKILL) |
| GET | `/api/twitch/config` | - | `{key_set,url,audio,bitrate,width,height}` (nunca la key) |
| PUT | `/api/twitch/config` | `{key?,url?,audio?,bitrate?,width?,height?}` | Guardar config; la key se cifra. **Preferido: key vía `backend/.env`** (ver nota abajo) |
| GET | `/api/settings` | - | Todas las settings como mapa `{key:value}` |
| PUT | `/api/settings/{key}` | `{value}` | Upsert de una setting |

Ejemplos:
```bash
# Estado de todo
curl http://127.0.0.1:8000/api/status | python3 -m json.tool

# PTZ: mover CAM-01 arriba a velocidad 50 durante 600 ms
curl -X POST http://127.0.0.1:8000/api/cameras/1/ptz \
     -H "Content-Type: application/json" \
     -d '{"act":"up","speed":50,"duration_ms":600}'

# Guardar preset 3 en CAM-02
curl -X POST http://127.0.0.1:8000/api/cameras/2/preset \
     -H "Content-Type: application/json" -d '{"act":"set","number":3}'
```

---

## 6. Claves de settings (tabla `settings` de SQLite)

| Clave | Valor típico | Uso |
|-------|--------------|-----|
| `skin` | `noche` | Skin activa (noche/dia/verde/violeta/mono) |
| `accent` | `#22d3ee` | Color de acento |
| `grid_cols` | `2` | Columnas del grid (1/2/4) |
| `motion_threshold` | `9` | Umbral de diff media (0-255) para disparar evento |
| `motion_interval` | `2` | Segundos entre muestras por cámara (mín 1) |
| `motion_cooldown` | `10` | Segundos mínimos entre eventos de la misma cámara |
| `notify_url` | `https://ntfy.sh/mitopic` | Webhook/ntfy para alertas (vacío = sin notificar) |
| `twitch_key_enc` | (cifrado) | Stream key de Twitch (Fernet) — **queda en segundo plano**: `TWITCH_STREAM_KEY` en `backend/.env` tiene prioridad |
| `twitch_url` | `rtmp://live.twitch.tv/app` | Ingest URL |
| `twitch_audio` | `/ruta/musica.mp3` | Archivo de audio en loop (vacío = sin audio) |
| `twitch_bitrate` | `2500k` | Bitrate de salida del grid |
| `twitch_width` / `twitch_height` | `1280` / `720` | Resolución del grid |

---

## 7. Bitácora de bugfixes y decisiones (para devs)

| Fecha | Área | Bug / decisión | Solución |
|-------|------|----------------|----------|
| 2026-08-01 | motion | Detector con RTSP ffmpeg tardaba ~12 s por frame | Reescrito a `curl` + go2rtc `frame.jpeg` (width=160) + Pillow → ~0.6 s |
| 2026-08-01 | motion | `sum(abs(a-b) ...)` con frames de distinta longitud | Se descarta el frame si `len(old)!=len(frame)` (p. ej. cambio de resolución) |
| 2026-08-01 | twitch | Bindings SQL con `f-string` directo | Corregido a placeholders `?` en `_build_cmd` |
| 2026-08-01 | twitch | `-bufsize 2500kk` (concatenaba `+ "k"`) → ffmpeg `Invalid argument` al iniciar stream real | `-bufsize` = bitrate tal cual (verificado: encode OK). **Bug visto al auditar la doc** |
| 2026-08-01 | twitch | Grid de **1 cámara**: `xstack` requiere ≥2 inputs → ffmpeg moría (exit 222) | Para `n==1` se omite `xstack` y se mapea `[v0]`. Verificado 1 y 2 cámaras |
| 2026-08-01 | twitch | Arranque en frío: `could not find codec parameters (h264, none): unspecified size` al abrir RTSP de go2rtc | `-analyzeduration 1000000 -probesize 1000000` por entrada RTSP |
| 2026-08-01 | deploy | Servicio backend con código viejo tras un fix (el fix de bufsize "no funcionaba" pero no se reinició) | **Siempre reiniciar el servicio tras editar el backend** (`systemctl --user restart cameras-backend`) |
| 2026-08-01 | backend | Clave Fernet/DB en `app/data/` (frágil si se mueve) | Movidos a `backend/data/` (`cameras.db`, `secret.key` con chmod 600); `config.py` usa `BASE_DIR.parent.parent` |
| 2026-08-01 | pip | PEP 668 (no pip global) | Venv propio en `backend/.venv`; requirements versionados |
| 2026-08-01 | systemd | Sin `linger` → servicios de usuario solo arrancan con sesión de <USER> | Documentado; opción: `loginctl enable-linger <USER>` (requiere privilegios) |
| 2026-08-01 | sw.js | Cache name fijo `cameras-v1` | ⚠️ **Bump de `CACHE` en cada deploy del frontend** (si no, el SW sirve assets viejos). Se subió a `cameras-v2` |
| 2026-08-01 | go2rtc/frontend | **Fallback MJPEG roto** (go2rtc no transcodifica H.264→MJPEG) | +8 streams `cam0N[sd]mjpeg: ffmpeg:.../video=mjpeg#width=640#fps=10` en `config/go2rtc.yaml`; `mjpegUrl` apunta a `<stream>mjpeg`. Verificado: 1.2 MB multipart (ver `docs/REVIEW.md` H3) |
| 2026-08-01 | backend/env | Stream key de Twitch en texto en la DB / sin key real | **`backend/.env` gitignored** con `TWITCH_STREAM_KEY=live_...`; `config.py` lo carga al arrancar y `twitch.py::get_key()` le da prioridad. Plantilla en `backend/.env.example`. **Test en vivo con key real OK** (12 s, stop limpio) |
| 2026-08-01 | red/firewall | **Acceso desde otros equipos de la LAN: "conexión ha caducado"** pese a que el dashboard respondía en <HOSTNAME> | **ufw activo con `INPUT DROP`** solo permitía 22/3777 → bloqueaba 8000/1984/8554/8555. Fix: `ufw allow from <LAN> to any port {8000,1984,8554,8555}` (tcp+udp). **Trampa**: el `curl` a la propia IP LAN pasa por `lo` (siempre permitido) → no detecta el bloqueo externo |
| 2026-08-01 | go2rtc/frontend | **WebRTC bloqueado por CORS** desde otros equipos (consola: "Cabecera CORS 'Access-Control-Allow-Origin' no presente" en `:1984/api/webrtc`) | go2rtc soporta CORS vía **`api.origin: "*"`** (único valor soportado). Añadido en `config/go2rtc.yaml` + restart. El fallback MJPEG seguía funcionando (las `<img>` no pasan por CORS); el signaling WebRTC era el único bloqueado |

---

## 8. Gotchas / trampas conocidas

1. **Service Worker cachea el SPA**: al reconstruir el frontend y servir, el navegador
   que ya tenía el SW seguirá usando assets antiguos hasta que cambies la versión de
   caché en `frontend/public/sw.js` (`const CACHE = 'cameras-vX'`).
1. **MJPEG no transcodifica**: go2rtc NO convierte a MJPEG automáticamente (la fuente
   debe llevar codec MJPEG; nuestras cámaras son H.264). **Resuelto** con streams
   transcodificados en go2rtc: `cam0N[sd]mjpeg` (`ffmpeg:...#video=mjpeg#width=640#fps=10`)
   y frontend apuntando a ellos. ⚠️ **Al añadir una cámara, crear también su stream `*mjpeg`**
   en `config/go2rtc.yaml` (ver `docs/REVIEW.md` H3).
2. **go2rtc :1984 en LAN**: necesario para WebRTC, pero cualquiera en la red puede
   ver streams por esa vía. Si interesa, restringir y/o usar `g2rBase`.
3. **IP de cámaras por DHCP**: pueden cambiar; configurar reservas en el router.
4. **CAM-01 quedó desapuntada** tras los tests de PTZ (pan right 2s) el 2026-08-01.
   Reapuntar manualmente o con `scripts/recon/ptz.sh <CAM_IP> left 40 2000`.
5. **Presets no exactos**: el motor PTZ de estas cámaras tiene repetibilidad limitada
   (SSIM 0.55-0.67 al volver a un preset). No confiar en presets para precisiones finas.
6. **Audio talk (Fase 4) bloqueado**: SDK N1 propietario, sesión iniciada por la nube.
   No hay CGI HTTP de talk; go2rtc no lo soporta para eseecloud/bubble. Solo
   `audioinvolume.cgi` (volumen mic) expuesto.
7. **`motion_interval` mínimo 1 s** (el loop lee settings desde la DB en cada pasada).
8. **Events crecen sin límite**: no hay pruning; para instalaciones largas añadir un
   job que borre eventos viejos (`DELETE FROM events WHERE ts < datetime('now','-30 days')`).
9. **`twitch.log` crece indefinidamente**: `backend/data/twitch.log` acumula; rotar o
   truncar periódicamente.
10. **Blocking `time.sleep` en PTZ** (`duration_ms>0`): ocupa un worker del threadpool
    de FastAPI mientras dura el movimiento; a efectos prácticos no bloquea el resto.
11. **Vocal Nexus**: el MCP de notificaciones está roto (apunta a IP errónea .85).
    Workaround que funciona: `curl -X POST http://127.0.0.1:3777/api/notify -H 'Content-Type: application/json' -d '{"text":"...","eventType":"mcp","target":null}'`.
12. **PWA offline**: el SW solo cachea el shell; los streams y la API no funcionan
     offline (es esperado — es un panel en vivo).
13. **ufw bloquea la LAN**: el sistema tiene **ufw activo** con `INPUT DROP` (daemon
     `ufw` enabled). Solo están abiertos `22`, `3777` y los puertos del dashboard
     (`8000/1984/8554/8555`) para `<LAN>`. **Síntoma típico**: el dashboard va
     en <HOSTNAME> pero "caduca" desde otro equipo. **Trampa de diagnóstico**: `curl` a la
     propia IP LAN entra por `lo` (permitido) y NO revela el bloqueo; probar siempre
     desde otro equipo o con `ufw status`. Añadir puertos con:
     `sudo ufw allow from <LAN> to any port <puerto>`.
14. **CORS de go2rtc**: el frontend sirve desde `:8000` pero llama al signaling WebRTC de
     go2rtc (`:1984`), otro **origen** (distinto puerto). Sin CORS, el navegador bloquea
     el `fetch` de `/api/webrtc` (consola: "Cabecera CORS 'Access-Control-Allow-Origin' no
     presente") y cae al fallback MJPEG. Se resolvió con **`api.origin: "*"`** en
     `config/go2rtc.yaml` (go2rtc solo soporta `*`). Si algún día el frontend se sirve
     desde otra ruta/host y vuelve a fallar WebRTC, revisar esta opción. Las `<img>` MJPEG
     **no** requieren CORS.
15. **Cámaras ATSG limitan sesiones de video simultáneas**: consumir varios streams a la
     vez (app EseeCloud + dashboard + tests) **baja el fps** que recibe go2rtc (medido:
     transcode ~5 fps bajo contienda vs ~12 sin contienda; la sub-stream toca ~10 fps).
     Si un stream "va lento", liberar sesiones (cerrar la app, parar otros consumidores).
     Ver `docs/PLAN-LATENCIA.md`.
16. **NIC ethernet onboard de <HOSTNAME> muerta**: el chip Marvell Yukon Optima 88E8059
     (Sony <MODEL>) tiene fallo hardware del PHY/transceiver — no detecta
     cable a ninguna velocidad. Todo el tráfico va por WiFi 2.4GHz (`wlan0`, SSID
     `<SSID>`). Si la ingesta/latencia empeora, verificar señal WiFi con
     `iw dev wlan0 link` (buscar `signal` dBm: aceptable < -60, bueno < -40).
     El fix de red es un adaptador USB-Ethernet (RTL8153, ~$5-10). Ver
     `/home/<USER>/DOCUMENTACION_RED.md` §8B (investigación completa con pruebas
     de forcing, modprobe, PCI rescan, BIOS).

---

## 9. Hoja de ruta / ideas pendientes (para quien continúe)

### Fase 1 (actual): Estética / Branding — SENTINEL

Dashboard renombrado a **SENTINEL** (configurable vía setting `brand`). Dos modos de skin
principales:

| Skin | Estética | Post-procesado video | Efectos |
|------|----------|---------------------|---------|
| `cyberpunk` | Futurista/scifi, neón cian, scanlines, viñeta | `contrast(1.15) saturate(1.3) hue-rotate(180deg) brightness(0.95)` | glow, bordes HUD, scanlines, tipografía scifi |
| `vigilancia` | Centro de vigilancia profesional, sobrio | sin filtro | mono stack, badges con ok/warn/danger |
| nocte/dia/verde/violeta/mono | Skins originales (existentes) | sin filtro | (sin cambios) |

- Tipografía scifi self-hosted: **Orbitron** (display) + **Share Tech Mono** (terminal) en `frontend/public/fonts/`.
- Variables CSS ampliadas por skin: `--font-display`, `--font-mono`, `--video-filter`, `--ok`, `--warn`, `--danger`, `--glow`.
- Post-procesado 100% client-side (CSS `filter`): cero carga extra al servidor.
- Switcher rápido cyberpunk ↔ vigilancia en el header (además del selector en Personalizar).
- Setting `brand` (nombre por defecto: SENTINEL) vía `/api/settings`.

**Pendiente operativo**
- [x] **Stream key real de Twitch**: en `backend/.env` (`TWITCH_STREAM_KEY`) con prioridad
      sobre la DB; **validado con stream real en vivo** (1 cámara, 12 s, stop limpio).
      → Al cambiar la key, editar `backend/.env` y reiniciar el backend.
- [x] **Acceso al dashboard desde la LAN**: abiertos `8000/1984/8554/8555` en ufw para
      `<LAN>` (bug H9). Probar desde otro equipo: `http://<SERVER_IP>:8000`.
- [ ] Instalar **Tailscale** (requiere sudo) → `curl -fsSL https://tailscale.com/install.sh | sh` + `sudo tailscale up --hostname cameras-dashboard`.
- [ ] **Reapuntar CAM-01** (ver gotcha 4) y renombrar cámaras (name/location) en Inventario.
- [ ] Reservas DHCP para .90-.93 en el router.

**Mejoras de robustez**
- [ ] `loginctl enable-linger <USER>` para que los servicios arranquen sin sesión.
- [ ] Auth en go2rtc (user/pass en `config/go2rtc.yaml`) + endurecer `:1984`.
- [ ] Pruning de `events` y rotación de `twitch.log` (cron/timer systemd).
- [ ] Vigilar `bufsize`/bitrate del grid según calidad (SD ~1500k, HD ~3500-4500k).

**Alcance futuro (RE)**
- [ ] **Audio bidireccional (talk)**: RE del protocolo N1/bubble (`MSGT_*`, sesión TCP)
      o captura tcpdump de la app móvil para replicar el comando de speaker.
- [ ] CGIs informativos (`serverinfo.cgi`, `devtype.cgi`) no expuestos → identificar
      firmware/SDK por otra vía (consola, sniffing) y completar `INVENTARIO.md`.
- [ ] Detector de movimiento de la cámara (`mdattr.cgi`/`mdalarm.cgi`) si aparecen.
- [ ] API de compartición `openapi.dvr163.com/share/device?method=new_use_qrcode` como
      vía de acceso remoto sin cloud de video.
- [ ] Grabación continua/evento a disco (go2rtc MP4 recorder) + galería en el dashboard.

---

## 10. Índice de documentación

| Documento | Contenido |
|-----------|-----------|
| `README.md` | Estado de fases (checklist) + hitos |
| `docs/INVESTIGACION.md` | Investigación de la plataforma EseeCloud/dvr163 |
| `docs/PLAN.md` | Plan por fases y su estado |
| `docs/ARQUITECTURA.md` | Arquitectura, flujo de datos, decisiones |
| `docs/INVENTARIO.md` | Las 4 cámaras (IP/MAC/streams) |
| `docs/PROTOCOLO.md` | URLs, puertos, auth, PTZ CGI |
| `docs/PLAN-LATENCIA.md` | Plan/resultado de optimización de latencia (LATPLAN-1) |
| `docs/WEBRTC-LATENCIA.md` | Investigación cadena go2rtc→WebRTC + cuadro de levers por impacto |
| `docs/REVERSE-ENGINEERING.md` | Hallazgos PTZ, presets, audio (bloqueado) |
| `docs/RUNBOOK.md` | Operación diaria, troubleshooting, backups |
| `docs/GUIA-DESARROLLO.md` | **Este documento** — referencia técnica completa |

**Scripts**: `scripts/status.sh` (health), `scripts/backup.sh` (backup), `scripts/recon/*` (escaneo/PTZ).
**Referencia firmware**: `reference/firmware/` (hichip_http_cgi.c, ptz.c, ptz_pelcod.c, bubble_def.h).
**Referencia externa**: `/home/<USER>/DOCUMENTACION_RED.md` — auditoría de red, SSH hardening, UFW, sysctl, CIFS, y §8B investigación ethernet (NIC Yukon Optima 88E8059 con fallo PHY).
