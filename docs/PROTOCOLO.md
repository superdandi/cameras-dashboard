# Protocolo — Notas técnicas

> Notas vivas sobre protocolos, URLs y puertos de la plataforma EseeCloud/dvr163.
> Base teórica de la investigación; se confirma con datos reales en Fase 1.

## Puertos típicos de la plataforma

| Puerto | Protocolo | Uso |
|--------|-----------|-----|
| 80 | HTTP | Web server de cámara, `livestream`, snapshots |
| 554 | RTSP | Streaming (solo si habilitado) |
| 34567 | TCP propietario | Protocolo bubble / P2P |
| 8899 | ONVIF (típico XMEye) | Solo en modelos compatibles |
| 3702 | UDP | ONVIF WS-Discovery |
| 5000 | TCP/UDP | ONVIF (V380-style) |
| 3777 | TCP | *(<HOSTNAME>)* Vocal Nexus — no es de cámara |

## URLs de acceso local

### Streams (video)
```
eseecloud://user:pass@IP:80/livestream/11     # HD main
eseecloud://user:pass@IP:80/livestream/12     # SD sub
bubble://user:pass@IP:80/bubble/live?ch=0&stream=0
bubble://user:pass@IP:34567/bubble/live?ch=0&stream=0
```

### Snapshots
```
http://IP/snapshot?r=<random>&auth=YWRtaW46
```
`YWRtaW46` = base64(`admin:`).

### RTSP (si habilitado)
```
rtsp://admin@IP:80/ch0_0.264
```
> En estas cámaras NO hay RTSP ni ONVIF (verificado en Fase 1).

## Control PTZ (HiChip CGI) — CONFIRMADO
```
GET /cgi-bin/hi3510/ptzctrl.cgi?-step=0&-act=<cmd>&-speed=<0-63>&-chn=1
GET /cgi-bin/hi3510/preset.cgi?-act=set&-status=1&-number=<n>&-chn=1
GET /cgi-bin/hi3510/preset.cgi?-act=goto&-number=<n>&-chn=1
```
- Auth básica requerida; params con prefijo `-`; `chn` 1-based.
- `act` válidos: `up down left right` + diagonales, `zoomin/out`, `focusin/out`,
  `auto`, `stop`, `SET_PRESET|GOTO_PRESET|CLEAR_PRESET`.
- Ver detalles y verificación en `REVERSE-ENGINEERING.md`. CLI: `scripts/recon/ptz.sh`.

## Autenticación
- HTTP propietario: **Basic Auth**. Header `Authorization: Basic <base64(user:pass)>`.
- Usuario por defecto: `admin`. Password: la configurada en la app (o vacía).
- go2rtc acepta las credenciales embebidas en la URL.

## Notas de validación Fase 1 (resultado)
- [x] Confirmar puertos abiertos reales por cámara → 80 (HTTP); 10000 (binario bubble, no HTTP)
- [x] Confirmar codecs (H264 vs H265) de cada stream → H.264 (HD 1280x720, SD 640x360)
- [x] Confirmar endpoints de snapshot → `/snapshot` y `/snapshot.jpg` (JPEG)
- [x] Detectar ONVIF/RTSP habilitados → NO (ni ONVIF ni RTSP expuestos)
- [x] Control PTZ → `/cgi-bin/hi3510/ptzctrl.cgi` (+ presets)

## Salidas go2rtc (<HOSTNAME>, puerto 1984/8554/8555)

| Salida | URL |
|--------|-----|
| Streams list | `http://<SERVER_IP>:1984/api/streams` |
| Frame (snapshot) | `http://<SERVER_IP>:1984/api/frame.jpeg?src=cam01&width=640` |
| MJPEG | `http://<SERVER_IP>:1984/api/stream.mjpeg?src=cam01sd&width=320` |
| HLS | `http://<SERVER_IP>:1984/api/stream.m3u8?src=cam01` |
| MSE/MP4 | `http://<SERVER_IP>:1984/api/stream.mp4?src=cam01` |
| RTSP out | `rtsp://<SERVER_IP>:8554/cam01` |
| WebRTC (WISH) | `POST http://<SERVER_IP>:1984/api/webrtc?src=cam01` |
