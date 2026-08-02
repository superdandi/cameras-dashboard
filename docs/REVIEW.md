# Informe de Revisión — Cameras Dashboard (<HOSTNAME>)

> Revisión integral ejecutada el **2026-08-01** (comandos de solo lectura + pruebas
> controladas). Estado al momento de la revisión: fases 0-7 completas, git limpio.

---

## 1. Resumen ejecutivo

| Área | Resultado |
|------|-----------|
| Servicios (go2rtc, backend) | ✅ Activos y saludables |
| Video (8 streams, RTSP, HLS) | ✅ Funcionando |
| API backend | ✅ 4 cámaras, sin credenciales expuestas |
| PTZ | ✅ Endpoint responde `[Success] ptz ok` |
| Detección de movimiento | ✅ Activa (98 eventos registrados) |
| PWA / frontend | ✅ Servido correctamente (manifest/sw/iconos 200) |
| Backup | ✅ Generado y rotando |
| **Twitch** | 🔴 **Arranque de stream ROTO** → **arreglado en esta revisión** |
| **Fallback MJPEG del frontend** | 🔴 **No funciona** → **arreglado (transcode ffmpeg)** |
| **Stream key real de Twitch** | 🔴 No configurada → **`backend/.env` + test en vivo OK** |
| **Acceso desde otros equipos (LAN)** | 🔴 **Timeout — ufw bloqueaba 8000/1984** → **arreglado (ufw allow desde LAN)** |
| **WebRTC desde otros equipos** | 🔴 **CORS bloqueaba el signaling** → **arreglado (`api.origin: "*"` en go2rtc)** |

**Veredicto**: el sistema está sano y operativo. Se encontraron y **corrigieron 2 bugs
reales** en el gestor Twitch, **1 deficiencia de diseño** en el fallback MJPEG del frontend,
**1 bloqueo de red** (ufw) y **1 bug de integración** (CORS del signaling WebRTC de go2rtc)
que impedían usar el dashboard desde otros equipos. Además se configuró la **stream key
real** de Twitch vía `backend/.env` con **prueba en vivo satisfactoria**. No se requirió
tocar el hardware.

---

## 2. Resultados por área

### 2.1 Servicios y sistema
| Check | Resultado |
|-------|-----------|
| `go2rtc.service` | active (pid 59277) |
| `cameras-backend.service` | active (pid 82087) |
| Puertos escuchando | `:8000` uvicorn · `:1984`/`:8554`/`:8555` go2rtc · `:3777` Vocal Nexus |
| Git | limpio, 8 commits (Fase 0 → docs) |
| Disco | 12G libres de 31G (61%) |

### 2.2 Media (go2rtc)
| Check | Resultado |
|-------|-----------|
| 8 streams configurados | ✅ `cam01..cam04` + `cam01sd..cam04sd` |
| Frame grab (las 8) | ✅ 200, JPEG válido (9-13 KB) |
| RTSP out `:8554/cam01` | ✅ H.264 1280x720@10 |
| HLS `stream.m3u8` | ✅ playlist + variante |
| WebRTC `POST /api/webrtc` | ✅ endpoint responde (500 con SDP inválido = handler presente) |
| **MJPEG `stream.mjpeg`** | 🔴 **200 pero 0 bytes** (ver hallazgo H3) |

### 2.3 API backend
| Check | Resultado |
|-------|-----------|
| `/api/health` | ✅ `{ok, 8 streams}` |
| `/api/status` | ✅ 4 cámaras, las 4 `ok:true` |
| `/api/cameras` | ✅ No expone username/password (cifradas) |
| `/api/cameras/{id}/snapshot` | ✅ JPEG 640x360 proxy |
| `/api/cameras/{id}/ptz` (`stop`) | ✅ `[Success] ptz ok` |
| `/api/settings` | ✅ skin/accent/grid/twitch |
| `/api/events` | ✅ 98 eventos (diffs 10-58) |
| `/api/twitch/*` | ✅ endpoints responden (ver hallazgos) |

### 2.4 Datos
| Check | Resultado |
|-------|-----------|
| `PRAGMA integrity_check` | ✅ `ok` |
| Filas | cameras=4 · settings=6 · events=98 |
| `secret.key` | ✅ permisos 0600 |
| Backup `scripts/backup.sh` | ✅ `~/backups/cameras/20260801-024024` (rotación OK) |

### 2.5 Frontend / PWA
| Check | Resultado |
|-------|-----------|
| `GET /` | ✅ 200, sirve `index-D6_DpuiC.js` + CSS |
| `manifest.webmanifest` | ✅ `application/manifest+json` |
| `sw.js` | ✅ 200 |
| `icon-192/512.png` | ✅ 200 |
| Vite dev | ✅ no corriendo (prod usa build) |

---

## 3. Hallazgos

### P1 — H1: El grid de Twitch con UNA cámara rompe ffmpeg ✅ CORREGIDO
- **Síntoma**: `POST /api/twitch/start {"camera_ids":[1]}` → `running:false, last_code:222`.
  Log: `[Parsed_xstack] Value 1.000000 for parameter 'inputs' out of range [2 - 2.14748e+09]`.
- **Causa**: `filter_complex xstack` exige **≥2 entradas**; con 1 cámara el comando moría.
- **Fix aplicado** (`backend/app/twitch.py`): para `n==1` se omite `xstack` y se mapea
  `[v0]` directamente. **Verificado**: 1 y 2 cámaras llegan a la etapa de codificación
  (solo falla el RTMP con la key fake, comportamiento esperado).

### P1 — H2: Código desplegado desactualizado (deploy pendiente) ✅ RESUELTO
- **Síntoma**: el log seguía mostrando `-bufsize 1500kk` (bug ya corregido en el repo),
  porque el servicio uvicorn corría el código viejo.
- **Causa**: el fix de `-bufsize` se commitó pero el servicio **no se reinició**.
- **Acción**: `systemctl --user restart cameras-backend` → verificado con código nuevo.
- ⚠️ Lección: tras cambiar código del backend hay que reiniciar el servicio (no es hot-reload).

### P2 — H3: Fallback MJPEG del frontend no funciona ✅ CORREGIDO
- **Síntoma**: `GET /api/stream.mjpeg?src=cam0X` → `200` con `Content-Length: 0` (0 bytes).
  Log go2rtc: `codecs not matched: video:H264 => video:JPEG, video:RAW`.
- **Causa**: go2rtc **no transcodifica** a MJPEG: la fuente debe **contener codec MJPEG**
  (doc oficial: "your source MUST contain the MJPEG codec"). Nuestras cámaras son H.264.
- **Impacto**: `useCameraStream.ts` usa `stream.mjpeg` como fallback cuando WebRTC falla →
  imagen rota. En LAN normal no se nota (WebRTC funciona).
- **Fix aplicado**: en `config/go2rtc.yaml` se añadieron 8 streams transcodificados
  (`cam0N[sd]mjpeg: ffmpeg:cam0N[sd]#video=mjpeg#width=640#fps=10`) y el frontend
  (`api.ts::mjpegUrl`) apunta a `?src=<stream>mjpeg`. **Verificado**: `stream.mjpeg`
  devuelve `multipart/x-mixed-replace` con 1.2 MB; el fallback ya funciona.
  ⚠️ Si se añade una cámara nueva, hay que crear también su stream `*mjpeg`.

### P2 — H4: Arranque en frío del RTSP de Twitch (intermitente) ✅ MITIGADO
- **Síntoma** (en logs previos): `Could not find codec parameters for stream 0 (Video: h264, none): unspecified size` + `Error opening input file rtsp://.../cam02sd`.
- **Causa**: con `-fflags nobuffer` (analyzeduration 0) ffmpeg no espera los parámetros
  H.264 (SPS/PPS) cuando la fuente RTSP de go2rtc arranca en frío.
- **Mitigación aplicada**: `-analyzeduration 1000000 -probesize 1000000` por entrada.
  No se reprodujo tras el fix.

### P3 — H5: Skin guardada `dark` no existe en la lista de skins
- `settings.skin = "dark"` pero los ids reales son `noche/dia/verde/violeta/mono`.
  `applySkin('dark')` cae al fallback `noche` (funciona, pero es inconsistente). Bajo impacto.

### P3 — H6: Limpieza de key fake de Twitch ✅ RESUELTO
- La key de prueba `fakekey_review` (y antes `fakekey123`) quedaba persistida en settings.
  **Eliminada** al final de la revisión; `/api/twitch/config` → `key_set:false`.

### P3 — H7: Crecimiento sin límite
- `events` (98 filas) y `twitch.log` (14 KB) crecen sin pruning/rotación. Recomendado:
  `DELETE FROM events WHERE ts < datetime('now','-30 days')` + timer de rotación.

### P3 — H8: Stream key real de Twitch configurada ✅ RESUELTO
- Antes: key fake de prueba y posteriormente sin key (`key_set:false`).
- Ahora: la key se define en `backend/.env` (`TWITCH_STREAM_KEY=live_...`, gitignored)
  y el backend la lee al arrancar (preferente sobre la DB). `/api/twitch/config` → `key_set:true`.
- **Verificado en vivo**: stream real de 1 cámara en Twitch (12 s) → `running:true`,
  sin errores en el log, stop limpio. La cadena completa funciona de extremo a extremo.

### P1 — H9: ufw bloqueaba el acceso desde otros equipos de la LAN ✅ CORREGIDO
- **Síntoma**: desde <HOSTNAME> el dashboard va (`http://127.0.0.1:8000` y `http://<SERVER_IP>:8000`),
  pero desde cualquier otro equipo de la red → **"la conexión ha caducado"** (timeout).
- **Causa**: el firewall **ufw está activo** (`Status: active`) con política **`INPUT DROP`** y
  solo permitía `22` (SSH) y `3777` (Vocal Nexus). Los puertos `8000/1984/8554/8555` se
  **descartaban en silencio** (DROP) para cualquier origen externo. El self-test local pasaba
  por una trampa: el tráfico hacia la propia IP se entrega por **`lo`** (regla `iifname lo accept`),
  que sí está permitido → parecía que todo iba bien sin ser cierto.
  (Diagnóstico: `iptables -S`/`nft list ruleset` → `-P INPUT DROP` + cadena `ufw-user-input`
  sin reglas para los puertos del dashboard).
- **Fix aplicado** (ufw, persistente):
  ```
  ufw allow from <LAN> to any port 8000   # dashboard + API
  ufw allow from <LAN> to any port 1984   # go2rtc (WebRTC/WHEP/MJPEG)
  ufw allow from <LAN> to any port 8554   # RTSP out
  ufw allow from <LAN> to any port 8555   # WebRTC media (tcp+udp)
  ```
  Restringido a la LAN: **no** se abre nada hacia el exterior.
- **Verificado**: reglas presentes en el ruleset vivo y en `ufw status numbered`.
  ⚠️ Nota de verificación: en <HOSTNAME> no se puede simular un cliente externo hacia la propia IP
  (el kernel entrega en `lo`); la prueba definitiva es abrir el navegador desde otro equipo.
- **Lección**: si el dashboard responde en local pero "caduca" desde otros equipos, **revisar
  ufw/firewall antes de culpar al router**; y no fiarse del test `curl` a la propia IP LAN.

### P2 — H10: WebRTC del dashboard bloqueado por CORS desde otros equipos ✅ CORREGIDO
- **Síntoma** (consola del navegador al abrir `http://<SERVER_IP>:8000` desde otro equipo):
  ```
  Solicitud de origen cruzado bloqueada: ... http://<SERVER_IP>:1984/api/webrtc?src=cam0Xsd
  (Razón: Cabecera CORS 'Access-Control-Allow-Origin' no presente). Código de estado: 200.
  WebRTC fallback -> MJPEG TypeError: NetworkError when attempting to fetch resource.
  ```
- **Causa**: el frontend (origen `:8000`) hace `fetch()` al **signaling WebRTC** de go2rtc
  (`:1984/api/webrtc`), que es **cross-origin** (distinto puerto). go2rtc no enviaba
  `Access-Control-Allow-Origin` → el navegador bloqueaba la respuesta. El fallback MJPEG
  **sí funcionaba** (las `<img>` no están sujetas a CORS), pero se perdía WebRTC y se
  llenaba la consola de errores.
- **Fix aplicado**: en `config/go2rtc.yaml`, bajo `api:`, se añadió **`origin: "*"`**
  (opción oficial de go2rtc: "allow CORS requests"; solo soporta `*`). Reiniciado go2rtc.
  **Verificado**: `curl -H "Origin: http://<SERVER_IP>:8000" .../api/streams` y el
  endpoint `POST /api/webrtc` devuelven `Access-Control-Allow-Origin: *`.
- **Nota de seguridad**: CORS no expone nada nuevo (la API de go2rtc ya era accesible en la
  LAN); solo permite que un navegador lea las respuestas. ufw sigue limitando `:1984` a
  `<LAN>`. Si se activara auth en go2rtc, el `origin` debe revisarse.

---

## 4. Verificación de la cadena completa (lo que sí funciona)

```
Cámara → go2rtc eseecloud:// (H.264) → frame.jpeg ✅ / RTSP ✅ / HLS ✅ / WebRTC ✅
  → Backend :8000 → API ✅ / snapshot proxy ✅ / PTZ ✅ / movimiento (eventos) ✅
  → Twitch (tras H1+H2) → 1 y 2 cámaras: input RTSP → scale/pad → xstack → libx264
                          → FLV → rtmp://live.twitch.tv  ✅ (solo falla con key fake)
```

---

## 5. Pendientes operativos tras la revisión

| Pendiente | Acción |
|-----------|--------|
| Fallback MJPEG (H3) | ✅ Implementado (streams `*mjpeg` en go2rtc + frontend) |
| Stream key real de Twitch (H8) | ✅ `backend/.env` + test en vivo OK |
| Acceso desde otros equipos (H9) | ✅ ufw: 8000/1984/8554/8555 abiertos desde `<LAN>` |
| WebRTC cross-origin (H10) | ✅ `api.origin: "*"` en `config/go2rtc.yaml` (CORS) |
| Tailscale | Instalar (requiere sudo) para acceso remoto fuera de la LAN |
| CAM-01 desapuntada | Reapuntar: `scripts/recon/ptz.sh <CAM_IP> left 40 2000` |
| Reservas DHCP | Fijar .90-.93 en el router (<ROUTER_IP>) |
| Pruning de events/twitch.log | Añadir limpieza periódica (H7) |
| Skin `dark` → `noche` | Corregir el valor en settings (H5) |

---

## 6. Ficheros modificados en esta revisión

- `backend/app/twitch.py`: fix grid de 1 cámara (xstack) + `-analyzeduration/-probesize`
  para arranque en frío del RTSP + key desde `.env` (preferente sobre DB).
- `backend/app/config.py`: carga de `backend/.env` (`TWITCH_STREAM_KEY`, etc.).
- `backend/.env` + `backend/.env.example`: stream key de Twitch (gitignored) + plantilla.
- `config/go2rtc.yaml`: +8 streams transcodificados `cam0N[sd]mjpeg` (fix MJPEG).
- `frontend/src/api.ts`: `mjpegUrl` apunta a `<stream>mjpeg`; `public/sw.js` cache v2.
- **ufw (firewall del sistema)**: abiertos `8000/1984/8554/8555` solo desde `<LAN>`
  (fix H9 — antes `INPUT DROP` dejaba el dashboard inaccesible desde la LAN).
- `config/go2rtc.yaml`: `api.origin: "*"` (fix H10 — CORS del signaling WebRTC).
- `docs/REVIEW.md`: este informe.
- Servicios reiniciados (go2rtc, backend) para cargar los cambios.

> Las verificaciones que movieron la cámara (PTZ) se limitaron a `stop` (sin impacto).
> El test de Twitch usó la key real del usuario durante ~12 s y se detuvo limpio.
