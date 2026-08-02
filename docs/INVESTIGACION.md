# Investigación — Cámaras ATSG / EseeCloud (plataforma dvr163)

> Documento de hallazgos técnicos verificados durante la investigación (2026-08-01).
> Se actualiza con los resultados de la Fase 1 (reconocimiento real en la red).

---

## 1. Identidad de las cámaras

| Dato | Valor |
|------|-------|
| Marca | **ATSG Security Camera Outdoor** (WiFi, PTZ, IP66) |
| App oficial | **EseeCloud** (IP Pro, VR Cam) |
| Paquete Android | `com.juanvision.eseecloud30` |
| Fabricante real | **Guangdong Juan Intelligent Technology** (Juang Intelligence) |
| Plataforma | **EseeCloud / DVR163** (`eseecloud.com`, `dvr163.com`) |
| Rebrands de la misma plataforma | Hiseeu, Manomay, Amorvue, OOSSXX, Yeskamo, VR Cam, IP Pro |

> 📌 **Conclusión clave**: las cámaras ATSG no son un protocolo propio aislado;
> usan la plataforma industrial EseeCloud/dvr163, ampliamente documentada por la
> comunidad (Home Assistant, go2rtc, iSpy/AgentDVR, camapp365, ipcamtalk).

---

## 2. Protocolos de acceso al video

### 2.1 Estado oficial de soporte

| Protocolo | ¿Soporte por defecto? | Notas |
|-----------|----------------------|-------|
| **HTTP propietario (`livestream`)** | ✅ Sí | Endpoint de video directo por HTTP con auth básica |
| **Protocolo "bubble"** | ✅ Sí (la mayoría) | Protocolo P2P propietario, soportado nativamente por go2rtc |
| **RTSP** | ❌ No por defecto | Varía por modelo; algunos NVR tienen toggle "servidor RTSP" |
| **ONVIF** | ❌ No por defecto | "Varía por modelo"; se habilita en app si el modelo lo soporta |
| **P2P cloud (app)** | ✅ Sí | Para acceso remoto y notificaciones push |

> **Fuente**: Techage (mismo fabricante) declara *"Eseecloud camera do not support
> rtsp"*. La comunidad confirma que RTSP/ONVIF **no** vienen activados y dependen
> del firmware/modelo.

### 2.2 Endpoint HTTP propietario (PROBADO por la comunidad — la vía principal)

Confirmado en el issue **go2rtc #1690** (cámaras EseeCloud):

```
# HD (main)
http://<IP>:80/livestream/11
# SD (sub)
http://<IP>:80/livestream/12

# Con auth básica (curl/ffplay)
curl -H "Authorization: Basic YWRtaW46" "http://<IP>/livestream/12"
ffplay -headers "Authorization: Basic YWRtaW46" -i "http://<IP>/livestream/11"
```

- `YWRtaW46` = base64 de `admin:` (usuario `admin`, contraseña vacía o la configurada).
- Codec del stream probado: **HEVC/H.265** (`hevc`, `3840x2160`, 25 fps).
- **Soporte nativo en go2rtc (v1.9.10+)**: `eseecloud://user:pass@IP:80/livestream/12`.

### 2.3 Protocolo "bubble" (vía alternativa)

Soportado por go2rtc desde **v1.6.1**. Usado por NVR y algunas standalone.

```
# Formato general
bubble://username:password@IP:34567/bubble/live?ch=0&stream=0

# Probado en cámara standalone (Manomay / EseeCloud) — puerto 80
bubble://admin@<HOST_IP>:80/bubble/live?ch=0&stream=0   # main
bubble://admin@<HOST_IP>:80/bubble/live?ch=0&stream=1   # sub

# Probado en NVR (Yeskamo) — puerto 80
bubble://admin:pass@<ROUTER_IP>48:80/bubble/live?ch=1&stream=0
```

- `ch` = canal (0-indexado), `stream` = 0 main / 1 sub.
- Parámetros opcionales omitibles (user/pass/port/ch/stream si son default).
- ⚠️ Algunos usuarios reportan `404 Not Found` con bubble en ciertos NVR — en ese
  caso probar el endpoint HTTP `livestream` (2.2).

### 2.4 RTSP (cuando está habilitado)

En sistemas NVR con "servidor RTSP" activado en el software eSeeCloud/CMS local:

```
rtsp://admin@<NVR-IP>:80/ch0_0.264          # cámara 0 main
rtsp://admin@<NVR-IP>:80/ch0_1.264          # cámara 0 sub
```

### 2.5 Snapshots

Probados por la comunidad:

```
# EseeCloud (issue #1690)
http://<IP>/snapshot?r=0.9730670290365486&auth=YWRtaW46
http://<IP>/snapshot?auth=YWRtaW46

# Otros endpoints vistos en la plataforma (iSpy, modelos Esee)
/cgi-bin/snapshot.cgi?chn=0&u=<USER>&p=<PASS>
/tmpfs/auto.jpg
/snapshot.jpg?user=<USER>&pwd=<PASS>
```

---

## 3. Capacidades requeridas vs. vía de implementación

| Feature | Vía de implementación | Riesgo |
|---------|-----------------------|--------|
| **Video en vivo** | go2rtc `eseecloud://` o `bubble://` → WebRTC/MSE | 🟢 Bajo (probado por comunidad) |
| **Snapshots/thumbnails** | HTTP `/snapshot` o frame desde stream | 🟢 Bajo |
| **Control PTZ** | CGI HTTP HiChip `/cgi-bin/hi3510/ptzctrl.cgi` (confirmado en vivo) | 🟢 Bajo |
| **Audio bidireccional** | go2rtc (RTSP/ONVIF profile T) o protocolo propietario | 🟠 Medio |
| **Detección movimiento** | ONVIF events o detección server-side (snapshots/ffmpeg) | 🟢 Bajo (server-side siempre funciona) |
| **Re-stream Twitch** | go2rtc RTSP → ffmpeg → RTMP twitch.tv | 🟢 Bajo |
| **Dashboard custom + skins** | React SPA + FastAPI + CSS variables | 🟢 Bajo |
| **Móvil** | PWA responsiva en LAN | 🟢 Bajo |

---

## 4. Funcionalidades conocidas de la app (que hay que replicar/mejorar)

Según el manual oficial EseeCloud y la app:

- **PTZ**: flechas 8 direcciones, velocidad, calibración, zoom/focus (según modelo),
  **posiciones preseleccionadas** (presets), crucero panorámico.
- **Detección de movimiento**: sensibilidad ajustable, alertas push, sirena.
- **Grabación**: tarjeta SD (TF) hasta 128 GB, evento (solo movimiento) o continua.
- **Audio bidireccional**: mic + speaker (full-duplex en modelos duales).
- **Modos de imagen**: smart/infrarrojo/color, detección humana AI, tracking.
- **Compartición**: QR para compartir cámara con otros usuarios.

---

## 5. Detalles del ecosistema EseeCloud

### 5.1 Conexión inicial (para referencia)
- Hotspot de configuración: SSID `IPCXXXXXXXXXXXXX`, password `11111111`.
- Solo **WiFi 2.4 GHz** (no soporta 5 GHz).
- Requiere DHCP (IP automática).
- Modos: Remote View (nube), Direct Connection (local), NVR Kit.

### 5.2 API de compartir (observada)
`openapi.dvr163.com/share/device?method=new_use_qrcode&token=...` — endpoint de
compartición por token/QR. Posible superficie para acceso remoto futuro.

### 5.3 Comunicación con cloud
La app y cámaras usan **P2P** hacia servidores de la plataforma en China para
remote view y push. El protocolo "bubble" es la base de esta comunicación.

---

## 6. Fuentes

| Fuente | Contenido |
|--------|-----------|
| go2rtc docs — `eseecloud` source | `eseecloud://user:pass@IP:80/livestream/12` (v1.9.10+) |
| go2rtc docs — `bubble` source | `bubble://user:pass@IP:34567/bubble/live?ch=0&stream=0` |
| go2rtc issue #1690 | Confirmación endpoint HTTP livestream/11 y /12, snapshots, HEVC |
| GitHub abhiramgcos/camera_reverse_engenering | RE de cámara EseeCloud, bubble:// en puerto 80, go2rtc config |
| camapp365 — EseeCloud manual | Manual completo, PTZ, movimiento, SD, sharing |
| Techage blog | "EseeCloud cameras do not support RTSP" |
| iSpy/AgentDVR — Esee camera DB | URLs HTTP/RTSP reportadas por comunidad |
| eseecloud.org / eseecloud.app | Guías oficiales de setup y manuales |
| ipcamtalk (Hiseeu/Scrypted) | Confirmación de que EseeCloud no expone RTSP de serie |
| Home Assistant forum dvr163 | Debate extenso NVR EseeCloud: bubble://, RTSP server toggle |
| GitHub Lynch234ok/lynch-git | **Firmware fuente (HiChip)**: `hichip_http_cgi.c`, `ptz.c`, `bubble_def.h` |

---

## 7. Pendientes de validación (Fase 1 — recon real)

Resultado 2026-08-01 — ver `REVERSE-ENGINEERING.md`, `INVENTARIO.md`, `PROTOCOLO.md`:

- [x] Descubrir IPs de todas las cámaras ATSG en la LAN → `.90 .91 .92 .93` (4)
- [x] Probar `http://<IP>/livestream/11` y `/12` (auth básica) → OK (H.264 HD/SD)
- [x] Probar `bubble://` en puertos 80 y 34567 → OK por HTTP `/bubble/live` (80)
- [x] Probar snapshot `/snapshot?auth=YWRtaW46` → OK (JPEG)
- [x] Escanear puertos → 80 HTTP + 10000 (binario, no HTTP). Sin 554/8899/3702/5000
- [x] Determinar si ONVIF está habilitado → NO. RTSP → NO
- [x] **PTZ** → CGI HiChip confirmado (mueve físicamente, SSIM 0.97→0.51)
- [ ] Identificar firmware/SDK de cada cámara (CGIs informativos no expuestos)
- [ ] Documentar credenciales (admin + password de dispositivo) en inventario cifrado

### 7.1 Hallazgo adicional: firmware fuente disponible
El firmware de estas cámaras (plataforma **HiChip**) está publicado en
`github.com/Lynch234ok/lynch-git` (`app_rebulid/src`). Contiene `hichip_http_cgi.c`
(registro de CGIs), `ptz.c`, `ptz_pelcod.c`, `bubble_def.h`. Copias en
`reference/firmware/`. Esto desbloquea el control por HTTP y orienta audio/talk.
