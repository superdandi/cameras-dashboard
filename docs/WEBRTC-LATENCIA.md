# Investigación: cadena go2rtc → WebRTC y latencia

> Fecha: 2026-08-01 · Objetivo: entender dónde está el lag de la cadena
> `go2rtc → WebRTC` y qué se puede hacer (cuadro de levers por impacto).
> Fuentes: README oficial de go2rtc y `internal/webrtc/README.md`
> (tag 1.9.14, la versión instalada).

---

## 1. Hallazgo clave

La tabla **"Codecs madness"** del README oficial de go2rtc es concluyente sobre la
latencia de cada formato de salida:

| Tecnología | Latencia relativa |
|------------|-------------------|
| **WebRTC** | **best** (la mejor) |
| **MSE (fMP4)** | medium |
| HTTP progressive | bad |
| **HLS** | bad ("the worst technology for live streaming") |

> **WebRTC ya es el transporte de menor latencia que go2rtc puede servir.**
> No existe en go2rtc un formato de salida más rápido que WebRTC; migrar a
> MSE/HLS/HTTP *empeoraría* la latencia.

Además, el README de WebRTC (`internal/webrtc/README.md`) deja claro que su sección
de configuración solo toca **conectividad** (puertos, candidates, STUN/TURN, filtros
de red), **no la latencia**. No hay un knob mágico de go2rtc para reducir el lag:
en una LAN, la cadena ya es casi mínima salvo GOP de la cámara y jitter de red.

---

## 2. Dónde está realmente el lag en `go2rtc → WebRTC`

1. **GOP / intervalo de keyframe de la cámara (dominante)**.
   WebRTC no puede decodificar hasta recibir un keyframe (I-frame). Con GOP largo
   (~2 s), cada conexión tarda hasta ese valor en mostrar el primer frame, y tras una
   pérdida de paquetes hay que esperar al siguiente keyframe para recuperarse.
   Es el factor que explica el "lag" de arranque de los tiles.
2. **Jitter buffer del navegador**.
   Chrome añade ~200 ms fijos de buffer para suavizar variaciones de llegada.
   No es configurable desde go2rtc ni desde el frontend.
3. **Jitter de red (WiFi)**.
   La variación en el tiempo de llegada de paquetes infla el jitter buffer → más
   latencia. Tanto <HOSTNAME> (ingesta) como el visor en WiFi penalizan.

Causas que **no** son el problema (descartadas en diagnóstico previo, ver
`docs/PLAN-LATENCIA.md`): los fps de la cámara (main y sub van a ~10 fps) ni la
resolución.

---

## 3. Formas de atacar la cadena (por impacto)

| # | Lever | Dónde se aplica | Efecto / nota |
|---|-------|-----------------|---------------|
| 1 | **Reducir GOP de la cámara** a ~1 s | Web UI de la cámara (<CAM_IP>, app EseeCloud) | **Mayor impacto**: baja el time-to-first-frame (TTFB) de cada tile y la recuperación tras pérdida de paquetes |
| 2 | **Cable en vez de WiFi** (<HOSTNAME> y visor) | Infraestructura de red | ❌ **PHY onboard muerto** (Yukon Optima 88E8059, NIC del Sony <MODEL>). Investigación completa en `/home/<USER>/DOCUMENTACION_RED.md` §8B. **Pendiente: adaptador USB-Ethernet (RTL8153, ~$5-10)** como solución. |
| 3 | **Medir lag real end-to-end** | Frontend, `RTCPeerConnection.getStats()` | Separa TTFB de jitter buffer antes de tocar nada; dato objetivo para decidir |
| 4 | Transcode H.264 con GOP corto (`-g 1s`) | go2rtc (`ffmpeg:...#video=h264#...`) | Baja el GOP pero añade latencia de encode + CPU → normalmente neto negativo |
| 5 | Filtrar IPv6 (`filters.networks: [udp4, tcp4]`) | `config/go2rtc.yaml` → `webrtc.filters` | Evita que ICE elija un candidate IPv6 roto en la LAN (ganancia marginal) |

> Nota sobre 2: la NIC onboard de <HOSTNAME> tiene **fallo hardware del PHY/transceiver**
> (no detecta cable a ninguna velocidad). Investigación completa con pruebas de forcing
> 10/100/1000, modprobe sky2, PCI rescan, BIOS — todo documentado en
> `/home/<USER>/DOCUMENTACION_RED.md` §8B. El fix es un adaptador USB-Ethernet barato
> (RTL8153). Pendiente de compra.
>
> Nota sobre 4: transcodificar para acortar el GOP suele ser contraproducente — el
> encode añade ~1-2 frames de latencia y CPU (host pequeño, load ~4.8), y no afecta al
> jitter buffer del navegador.

---

## 4. Detalles de la configuración WebRTC de go2rtc (qué sí/no sirve)

Opciones que **solo afectan conectividad** (no latencia):

- `webrtc.listen` — puerto TCP/UDP de media (por defecto `:8555`).
- `webrtc.candidates` — candidates manuales (IP estática, STUN para IP dinámica).
- `webrtc.ice_servers` — STUN/TURN para NAT/Internet. **En LAN no mejora la latencia**,
  solo la conectividad; no hace falta.
- `webrtc.filters` — lista blanca de candidates (candidates/loopback/networks/
  interfaces/ips/udp_ports). Solo evita candidates inútiles (p. ej. IPv6 roto, redes
  Docker `172.16.0.0/12`, que go2rtc ya excluye por defecto).

Detalles relevantes de WebRTC en go2rtc (README oficial):

- Media va **peer-to-peer** entre el navegador y go2rtc; proxies (Nginx, HA, etc.)
  solo participan en el establecimiento, **no transfieren media**.
- WebRTC usa por defecto **TCP y UDP** en `:8555`. Se puede fijar solo TCP con
  `listen: ":8555/tcp"` o solo UDP con `listen: ""`.
- Para conexión externa estable hace falta abrir `8555` TCP+UDP en el router
  (`stun:8555` en `candidates` para IP dinámica).

---

## 5. Verificaciones hechas durante la investigación

- **MJPEG sobre WebSocket** (`/api/ws?src=cam01sdmjpeg`): la conexión WS se abre pero
  **no se envían frames** en esta versión (1.9.14). El endpoint `/api/ws` está
  reservado al signaling WebRTC; no sirve como alternativa de transporte.
- **MSE/fMP4 por WS** (`/api/ws?src=cam01sd&mp4`): tampoco emite. **MSE es además
  "medium" en latencia** según la tabla oficial → no es candidato para reducir lag.
- **MJPEG por HTTP** (`/api/stream.mjpeg?src=cam01sdmjpeg`): sí emite
  (9 frames en ~12 s con arranque en frío del transcode incluido). Sigue siendo el
  fallback cuando WebRTC no está disponible (ver gotcha 1 y H3).
- Los logs de go2rtc muestran `broken pipe` al desconectarse clientes MJPEG — normal.

**Conclusión práctica**: WebRTC es la mejor vía posible en go2rtc. Las mejoras de
latencia reales están en el **GOP de la cámara** y en el **jitter de red** (cable),
no en cambiar de formato ni en knobs de config de go2rtc.

---

## 6. Referencias

- README go2rtc (tabla "Codecs madness" y "Codecs filters"):
  https://github.com/AlexxIT/go2rtc
- `internal/webrtc/README.md` (configuración WebRTC):
  https://github.com/AlexxIT/go2rtc/tree/master/internal/webrtc
- `docs/PLAN-LATENCIA.md` — LATPLAN-1 (baseline y resultado del toggle HD/SD).
- `docs/GUIA-DESARROLLO.md` §3.1 — puertos (8555 WebRTC) y §8 gotchas.
