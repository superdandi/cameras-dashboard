# Reverse Engineering — Notas

> Bitácora de ingeniería inversa del protocolo propietario (PTZ, audio, eventos).

## ✅ Hallazgo confirmado — Control PTZ por HTTP CGI (HiChip)

**Fecha**: 2026-08-01 · Probado en las 4 cámaras (`.90`–`.93`).

Las cámaras ATSG corren firmware **HiChip** que expone un CGI de control PTZ:

```
GET http://IP/cgi-bin/hi3510/ptzctrl.cgi?-step=0&-act=<cmd>&-speed=<0-63>&-chn=1
```

- **Auth**: Basic (la misma de nginx, `admin:`). Sin auth → `401`.
- **Respuesta**: `200 [Success] ptz ok` (si el CGI responde, el comando se acepta).
- **Parámetros**: formato `-clave=valor` (obligatorio; sin `-` devuelve `400`).
- **`-step`**: ignorado por el handler. **`-chn`**: 1-based → se resta 1.
- **`-speed`**: 0-63; la cámara lo escala `n*5/63` y el driver Pelco-D lo mapea a
  niveles de velocidad (0x10/0x1a/0x24/0x30/0x3c).

### Valores válidos de `act` (de `PTZ_Cmd_str2int`)
```
down | up | left | right | left up | right up | left down | right down |
auto | apertureout | aperturein | zoomin | zoomout | focusout | focusin |
stop | brush | light | POWER_ON | POWER_OFF |
GOTO_PRESET | SET_PRESET | CLEAR_PRESET
```

### Presets (endpoint `preset.cgi`)
```
GET http://IP/cgi-bin/hi3510/preset.cgi?-act=set&-status=1&-number=<n>&-chn=1
GET http://IP/cgi-bin/hi3510/preset.cgi?-act=goto&-number=<n>&-chn=1
GET http://IP/cgi-bin/hi3510/preset.cgi?-act=set&-status=0&-number=<n>&-chn=1
```
- `act=set` + `status=1` guarda; `status=0` borra; `act=goto` mueve.
- Resultado de la prueba: el `goto` aproxima la posición pero **no es exacto**
  (SSIM 0.55–0.67 tras volver vs. 0.97 de par de control estático). Repetibilidad
  limitada del motor, esperable en PTZ WiFi económicos.

### Verificación física (SSIM entre snapshots)
| Prueba | SSIM All | Veredicto |
|--------|----------|-----------|
| Control sin mover (2 snaps a 1s) | 0.971 | línea base estática |
| Pan `right` 2s | 0.595 | **movimiento real** |
| Pan `right` 2s (segunda) | 0.514 | movimiento real |
| Tras `goto` preset | 0.55–0.67 | vuelve parcial (no exacto) |

### Solo `ptzctrl.cgi` y `preset.cgi` están expuestos
Los demás CGIs del firmware (`serverinfo.cgi`, `devtype.cgi`, `mdattr.cgi`,
`ptzup.cgi`, `ptzcomattr.cgi`, …) **no** están enrutados en este build (404).
`/bubble/live`, `/livestream/{11,12}`, `/snapshot{, .jpg}` sí.

## Control por protocolo bubble (alternativa, no necesaria)

El protocolo bubble define mensajes de control (`bubble_def.h`):
- `PackHead`: `0xaa` + `uiLength` (red seq) + `cPackType` + `uiTicket` + datos.
- `PackType`: `PT_MSGPACK`, `PT_MEDIAPACK`, `PT_HEARTBEATPACK`, `PT_OPENCHL` (4), `PT_OPENSTREAM` (0x0A).
- `MsgType`: `MSGT_USERVRF` (login), `MSGT_CHLREQ`, **`MSGT_PTZ`**, variantes `_B`.
- `MediaType`: `MT_AUDIO`, `MT_IDR`, `MT_PSLICE`.

Con el CGI HTTP no hace falta implementar bubble para PTZ. Bubble queda como vía
alternativa (y para audio/talk en Fase 4).

## Conocimiento previo (comunidad)

### Protocolo "bubble"
- Nombre: **bubble** (protocolo P2P de la plataforma EseeCloud/dvr163).
- go2rtc lo implementa en `internal/bubble` (MIT): https://github.com/AlexxIT/go2rtc/tree/master/internal/bubble
- Transporte: TCP (puerto 34567 o 80 según modelo); en nuestras cámaras se sirve
  por HTTP en `/bubble/live?ch=0&stream=0` (`Content-Type: video/bubble`, cabecera
  XML `<bubble version="1.0"...>` + binario).

### Endpoint HTTP `livestream`
- `http://IP:80/livestream/11` (HD) y `/12` (SD) — stream por HTTP con auth básica.
  go2rtc lo implementa en `internal/eseecloud`.

## Fuentes de firmware
- **Repo del firmware**: `https://github.com/Lynch234ok/lynch-git`
  (carpeta `app_rebulid/src`). Copias locales en `reference/firmware/`.
- Piezas clave: `hichip_http_cgi.c` (registro CGI), `ptz.c` (act list), `ptz_pelcod.c` (Pelco-D), `bubble_def.h`.

## Pendiente Fase 4
- [x] **PTZ** — implementado en dashboard (joystick + presets) vía CGI HTTP.
- [ ] **Audio bidireccional (talk)** — BLOQUEADO para implementar ahora:
  - El firmware usa el **SDK propietario N1** para 2-way talk
    (`NK_N1Device_TwoWayTalk`, callbacks `onCalled`/`onRecv`/`onHungUp` en
    `n1_device_2waytalk.c`). Es una sesión de voz iniciada por la plataforma
    (cloud), no un endpoint HTTP simple.
  - `bubble_SendAudio` (bubble.c) envía el **mic** de la cámara hacia el servidor
    (`MT_AUDIO`, codecs g711a/aac) — es el camino mic→server, no speaker.
  - CGIs de audio expuestos: solo `audioinvolume.cgi` (volumen de mic).
  - go2rtc **no soporta** two-way audio para fuentes `bubble`/`eseecloud`.
  - **Posible alcance futuro**: RE del protocolo N1/bubble de talk (sesión TCP,
    comandos `MSGT_*`) + cliente propio; o hablar por el altavoz de la cámara
    mediante captura del comando equivalente en la app (tcpdump).
- [ ] Eventos de movimiento: CGIs `mdattr.cgi`/`mdalarm.cgi` no expuestos → Fase 5
      usa detección server-side (diff de frames) en lugar del detector de la cámara.
- [ ] Verificar velocidad de PTZ en `speed` 0-63 y diagonales (probad: diagonal
      `left up` responde `[Success] ptz ok`; repetibilidad limitada del motor).
