# Referencia — Firmware fuente de las cámaras (HiChip)

Fuente: repo público `Lynch234ok/lynch-git` (app_rebulid/src), firmware de la
plataforma HiChip sobre la que corren nuestras cámaras ATSG/EseeCloud.

URL raíz: `https://github.com/Lynch234ok/lynch-git/tree/master/app_rebulid/src`

| Archivo | Contenido relevante |
|---------|---------------------|
| `hichip_http_cgi.c` | Registro de CGIs HTTP (`ptzctrl.cgi`, `preset.cgi`, `livestream`, `mdattr.cgi`, ...) |
| `ptz.c` | `PTZ_Cmd_str2int` — valores válidos de `act` |
| `ptz_pelcod.c` | Framing Pelco-D por UART y tabla `cmd_speed` |
| `bubble_def.h` | Cabeceras del protocolo bubble: PackHead, `MSGT_PTZ`, media types |
| `cgi_bin.h` | CGIs adicionales del build (debug/factory) |

Notas:
- `ptzctrl.cgi` exige parámetros con prefijo `-` (p.ej. `?-step=0&-act=up&-speed=40&-chn=1`).
- `preset.cgi` usa `-act=set|goto`, `-status=1|0`, `-number=`, `-chn=`.
- Los ficheros se guardan como referencia de ingeniería inversa (Fase 4). Su
  licencia no está verificada; no se redistribuyen en builds de la solución.
