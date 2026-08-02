# Runbook — Operación diaria

> Comandos y procedimientos para operar la solución en <HOSTNAME>.

## Estado

| Servicio | Comando para ver estado |
|----------|------------------------|
| go2rtc | `systemctl --user status go2rtc` o `scripts/status.sh` |
| Cámaras | `scripts/status.sh` (frame grab por stream) |
| Backend | `systemctl --user status cameras-backend` |
| Dashboard | Abrir `http://<SERVER_IP>:8000` en el navegador |
| ffmpeg (Twitch) | `systemctl --user status twitch-stream` (o vía dashboard, Fase 6) |

> go2rtc y el backend son **servicios de usuario** (sin root). Arrancan cuando
> <USER> inicia sesión (sin `linger`). Units versionados en `config/systemd/`.

## Arranque

```bash
systemctl --user start go2rtc
systemctl --user start cameras-backend

# Comprobar
scripts/status.sh
curl http://127.0.0.1:8000/api/health
```

## Detener

```bash
systemctl --user stop cameras-backend
systemctl --user stop go2rtc
```

## Reiniciar

```bash
systemctl --user restart go2rtc
systemctl --user restart cameras-backend
```

## Acceso desde la LAN (firewall ufw)

<HOSTNAME> corre **ufw activo** con política `INPUT DROP`. Para poder abrir el dashboard desde
otros equipos de la red, ufw debe permitir los puertos del dashboard desde tu subred:

```bash
# Ver reglas actuales (¿causa "conexión ha caducado" desde otros equipos?)
sudo ufw status numbered

# Abrir los puertos del dashboard para la LAN (requiere sudo):
sudo ufw allow from <LAN> to any port 8000   # dashboard + API
sudo ufw allow from <LAN> to any port 1984   # go2rtc (WebRTC/WHEP/MJPEG)
sudo ufw allow from <LAN> to any port 8554   # RTSP out
sudo ufw allow from <LAN> proto tcp to any port 8555  # WebRTC media
sudo ufw allow from <LAN> proto udp to any port 8555  # WebRTC media
```

> ⚠️ **Trampa de diagnóstico** (bug H9, ver `docs/REVIEW.md`): `curl http://<SERVER_IP>:8000`
> **desde <HOSTNAME>** no detecta el bloqueo — el tráfico hacia la propia IP se entrega por `lo`
> (permitido). La prueba real es abrir `http://<SERVER_IP>:8000` **desde otro equipo**.
> Si "caduca", es firewall (revisa `ufw status`) antes que el router.

## Rebuild del frontend

```bash
cd frontend && npm install && npm run build
# FastAPI sirve frontend/dist automáticamente (sin reiniciar backend)
```

## Ver logs

```bash
journalctl --user -u go2rtc -f
journalctl --user -u cameras-backend -f
```

## Pruebas rápidas (verificadas Fase 2)

```bash
# go2rtc responde (lista streams configurados)
curl http://127.0.0.1:1984/api/streams

# Snapshot/thumbnail de una cámara vía go2rtc
curl -o snap.jpg "http://127.0.0.1:1984/api/frame.jpeg?src=cam01&width=640"

# Ver un stream en VLC/ffplay (RTSP local provisto por go2rtc)
ffplay -rtsp_transport tcp rtsp://127.0.0.1:8554/cam01

# HLS (móvil/iOS)
curl "http://127.0.0.1:1984/api/stream.m3u8?src=cam01"

# MJPEG (preview / fallback del dashboard)
# ⚠️ usar los streams TRANSCODIFICADOS cam0N[sd]mjpeg (go2rtc no convierte H.264 solo)
curl "http://127.0.0.1:1984/api/stream.mjpeg?src=cam01sdmjpeg"
curl "http://127.0.0.1:1984/api/frame.jpeg?src=cam01sdmjpeg&width=320"

# Health general
scripts/status.sh
```

## PTZ desde consola (hallazgo Fase 1)

```bash
scripts/recon/ptz.sh <CAM_IP> up 40 600      # mover arriba 600 ms
scripts/recon/ptz.sh <CAM_IP> right 63 1000  # pan derecho rápido
scripts/recon/ptz.sh <CAM_IP> stop           # detener
```

## Twitch (Fase 6)

```bash
# Estado del stream
curl http://127.0.0.1:8000/api/twitch/status

# Configurar la key de Twitch — FORMA PREFERENTE (backend/.env, gitignored):
#   1. Copiar plantilla:   cp backend/.env.example backend/.env
#   2. Editar TWITCH_STREAM_KEY=live_...
#   3. Reiniciar:          systemctl --user restart cameras-backend
#   4. Verificar:          curl http://127.0.0.1:8000/api/twitch/config  → "key_set":true
# (Alternativa: PUT /api/twitch/config {"key":"..."} → se cifra en la DB, queda en 2º plano)

# Iniciar con las cámaras 1 y 2 (sub-stream)
curl -X POST http://127.0.0.1:8000/api/twitch/start \
     -H "Content-Type: application/json" -d '{"camera_ids":[1,2],"use_sub":true}'

# Detener
curl -X POST http://127.0.0.1:8000/api/twitch/stop

# Log de ffmpeg
tail -f backend/data/twitch.log
```

> Desde el dashboard: pestaña **Twitch** (selección de cámaras, config y on/off).
> El bitrate de salida debe ajustarse a la calidad: SD ~1500k, HD ~3500-4500k.

## Troubleshooting

### Stream negro / no conecta
1. Probar el stream directo de la cámara:
   `curl -u admin: "http://<CAM_IP>/livestream/12" | head -c 100`
2. Verificar que la cámara está en la red y con la IP correcta (ping/ARP).
3. Revisar logs de go2rtc: `journalctl --user -u go2rtc -f`.
4. Probar `bubble://` como alternativa a `eseecloud://` (descomentar en config).
5. `scripts/status.sh <stream>` para aislar qué stream falla.

### Cámara offline
- Revisar ping/ARP. Las cámaras EseeCloud usan DHCP — la IP puede cambiar.
- Configurar reserva DHCP (IP fija) en el router master (<ROUTER_IP>).

### Ingesta lenta / tiles muestran "foto" en vez de directo
1. **Verificar señal WiFi** (la NIC ethernet de <HOSTNAME> está muerta, gotcha 16):
   ```bash
   iw dev wlan0 link | grep -E "SSID|signal|freq"
   ```
   - `signal` dBm: aceptable < -60, bueno < -40, excelente < -30.
2. **Medir frame.jpeg de go2rtc** (debería ser < 1s):
   ```bash
   time curl -s -m 10 -o /dev/null "http://127.0.0.1:1984/api/frame.jpeg?src=cam01sd&width=320"
   ```
3. **Reiniciar go2rtc** si la ingesta no responde (reconecta los producers eseecloud):
   ```bash
   systemctl --user restart go2rtc
   ```
4. **Reducir contienda de sesiones** (gotcha 15): cerrar la app EseeCloud en el
   móvil, parar tests o transcodes, o subir `motion_interval` en Settings.
5. **Fix definitivo**: adaptador USB-Ethernet (RTL8153) → `ip link show enpXs0`
   (verificar state UP + Link detected: yes).

### PTZ no responde
- Comprobar que la cámara acepta `ptzctrl.cgi` (Fase 1: `[Success] ptz ok`).
- Los motores PTZ WiFi baratos tienen repetibilidad limitada (presets aproximados).
- Probado en las 4 cámaras con auth `admin:`.

## Backups

- Automático: `scripts/backup.sh` → `~/backups/cameras/<fecha>/` (DB consistente +
  `secret.key` + configs; rota los 10 últimos).
- Restaurar: parar el backend, copiar `cameras.db` y `secret.key` de vuelta a
  `backend/data/`, arrancar de nuevo.
- Sugerencia: copiar `~/backups` a otra máquina (rsync/borg/timeshift).

## Acceso remoto (Tailscale)

```bash
# 1. Instalar (requiere sudo)
curl -fsSL https://tailscale.com/install.sh | sh

# 2. Autenticar con tu cuenta
sudo tailscale up --hostname cameras-dashboard

# 3. Desde cualquier dispositivo con Tailscale conectado:
#    http://cameras-dashboard:8000
```

> Con Tailscale ya no hace falta exponer puertos al router. go2rtc sigue ligado a
> localhost (el WebRTC del navegador accede a él a través del backend y los streams
> MJPEG); si se quiere WebRTC directo remoto, exponer `:1984` solo por la red
> Tailscale en `config/go2rtc.yaml` (`listen` a la IP tailscale).

## Seguridad de la solución

- API de go2rtc ligada a localhost (NO exponer a la LAN).
- Acceso al dashboard: LAN + auth. Remoto: Tailscale (Fase 7).
- Rotar credenciales de cámaras con la app EseeCloud si se comprometen.

## Mantenimiento preventivo

- **Frontend deploy**: al reconstruir (`npm run build`) y subir una versión nueva,
  **bump de la versión de caché del service worker** en `frontend/public/sw.js`
  (`const CACHE = 'cameras-vX'`) — si no, los navegadores siguen con assets antiguos.
- **Eventos (Fase 5)**: la tabla `events` crece sin límite. Para instalaciones largas:
  ```sql
  DELETE FROM events WHERE ts < datetime('now','-30 days');
  ```
- **`twitch.log`**: crece indefinidamente (`backend/data/twitch.log`); truncar
  periódicamente o añadir un timer de rotación.
- **Servicios sin `linger`**: solo arrancan al iniciar sesión de <USER>. Para arranque al
  boot: `loginctl enable-linger <USER>` (requiere privilegios).
- **Reservas DHCP**: las cámaras usan DHCP — fijar .90-.93 en el router (<ROUTER_IP>)
  para evitar que cambien de IP.
- **Bugfix histórico relevante**: el gestor Twitch usaba `-bufsize <bitrate>k` dando
  `2500kk` (ffmpeg fallaba al iniciar stream real). Corregido; bitácora completa en
  `docs/GUIA-DESARROLLO.md#7-bitácora-de-bugfixes-y-decisiones-para-devs`.
