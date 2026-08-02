# Inventario de Cámaras

> Se completa en la **Fase 1** (reconocimiento de red). Las credenciales reales
> se guardan **cifradas** en la base de datos de la solución, NO en este archivo.
> Aquí solo se documentan identificadores y datos de red.

## Resumen

| Cámara | IP | MAC | Modelo | ONVIF | RTSP | Stream OK | PTZ | Estado |
|--------|----|-----|--------|-------|------|-----------|-----|--------|
| CAM-01 | <CAM_IP> | <MAC> | ATSG Outdoor PTZ (HiChip) | no | no | sí (HD+SD) | ✅ | Activa |
| CAM-02 | <CAM_IP> | <MAC> | ATSG Outdoor PTZ (HiChip) | no | no | sí (HD+SD) | ✅ | Activa |
| CAM-03 | <CAM_IP> | <MAC> | ATSG Outdoor PTZ (HiChip) | no | no | sí (HD+SD) | ✅ | Activa |
| CAM-04 | <CAM_IP> | <MAC> | ATSG Outdoor PTZ (HiChip) | no | no | sí (HD+SD) | ✅ | Activa |

> MACs tomadas de la tabla ARP de <HOSTNAME>. Modelo/firmware/SN pendientes de lectura
> (los CGIs informativos `serverinfo.cgi`/`devtype.cgi` no están expuestos en este
> build). Datos reales se cargarán vía app/dashboard.

## Detalle por cámara

### CAM-01 — *por nombrar* — IP `<CAM_IP>`
- **MAC**: `<MAC>` · **Modelo**: ATSG Security Camera Outdoor (PTZ WiFi)
- **Stream HD (main)**: `eseecloud://admin:@<CAM_IP>:80/livestream/11` (H.264 1280x720@25)
- **Stream SD (sub)**: `eseecloud://admin:@<CAM_IP>:80/livestream/12` (H.264 640x360@25)
- **Bubble**: `bubble://admin:@<CAM_IP>:80/bubble/live?ch=0&stream=0`
- **Snapshot**: `http://<CAM_IP>/snapshot` y `/snapshot.jpg` (auth básica `admin:`)
- **ONVIF**: no · **RTSP**: no · **Puerto extra**: 10000 (binario, no HTTP)
- **PTZ**: ✅ `/cgi-bin/hi3510/ptzctrl.cgi` · **Presets**: parcial (repetibilidad limitada)
- **Audio bidireccional**: pendiente Fase 4

### CAM-02 — *por nombrar* — IP `<CAM_IP>`
- **MAC**: `<MAC>` · Igual que CAM-01 (URLs con IP `.91`).

### CAM-03 — *por nombrar* — IP `<CAM_IP>`
- **MAC**: `<MAC>` · Igual que CAM-01 (URLs con IP `.92`).

### CAM-04 — *por nombrar* — IP `<CAM_IP>`
- **MAC**: `<MAC>` · Igual que CAM-01 (URLs con IP `.93`).

> NOTA operativa: durante el test de PTZ (2026-08-01) CAM-01 quedó en un ángulo
> ligeramente distinto al original (pan right 2s). Reapuntar si es necesario.

## Mapa de red (LAN <LAN>, scan Fase 1)

| Host | Puertos | Qué es |
|------|---------|--------|
| <ROUTER_IP> | 80, 8000 | Router / gateway (aquí hacer las reservas DHCP) |
| <HOST_IP> | 80 | Host con web server (sin cámara; histórico MCP Vocal Nexus roto) |
| <HOST_IP> | 5000 | Dispositivo con 5000 abierto (sin cámara) |
| <CAM_IP> · .91 · .92 · .93 | 80 (+10000 binario) | **Las 4 cámaras ATSG** |
| <SERVER_IP> | 3777 (y 8000/1984/8554/8555 en uso) | <HOSTNAME> — este servidor |

Mapa de puertos del servidor (detalle): `docs/GUIA-DESARROLLO.md#3-mapa-de-puertos-en-uso`.

## Campos del inventario (definición)

| Campo | Descripción |
|-------|-------------|
| `id` | Identificador único (CAM-01…) |
| `name` | Nombre amigable (ej. "Entrada principal") |
| `location` | Ubicación física |
| `ip` | IP fija/DHCP |
| `mac` | Dirección MAC |
| `model` | Modelo real |
| `sn` | Número de serie |
| `firmware` | Versión de firmware |
| `sdk` | Versión SDK |
| `onvif` | bool + puerto |
| `rtsp` | bool + URL |
| `ptz` | bool |
| `two_way_audio` | bool |
| `main_stream_url` | URL eseecloud/bubble main |
| `sub_stream_url` | URL sub |
| `snapshot_url` | URL snapshot |
| `enabled` | Activa/desactiva en dashboard |
| `notes` | Notas libres |
