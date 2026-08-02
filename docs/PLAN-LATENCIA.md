# Plan de Optimización de Latencia (LATPLAN-1)

> Fecha: 2026-08-01 · Estado: **en implementación** · Documento vivo: se actualiza
> al final con las métricas "después".

## 1. Objetivo

Reducir el lag percibido del dashboard frente a la app oficial EseeCloud ("la app se ve
más actualizada que nuestro dashboard").

## 2. Diagnóstico / baseline (medido 2026-08-01 ~04:00)

**Por qué la app va más "fresca":**
- La app conecta **directo a la cámara (P2P/protocolo bubble)** con buffer mínimo
  (`docs/INVESTIGACION.md` §5.3).
- El dashboard añade cadena: cámara → **go2rtc** (`eseecloud://`, HTTP:80) → **WebRTC**
  (buffer jitter ~0.3-0.8 s) o **MJPEG fallback** (transcode ffmpeg H.264→MJPEG).

**Métricas medidas (baseline):**

| Métrica | Valor | Nota |
|---------|-------|------|
| Ingesta main `cam01` (HD 1280x720) | **~10 fps**, ~8 KB/s | La cámara no da más fps en main |
| Ingesta sub `cam01sd..cam04sd` (SD 640x360) | **~10-14 fps**, 1-4 KB/s | Misma tasa ~ que main |
| Transcode MJPEG fallback (config `fps=10`) | **~8 fps efectivos** | ffmpeg entrega menos que el config |
| Transporte actual del grid | **WebRTC** (sub-stream) | Tras fix CORS (H10) ya no cae a MJPEG |

**Conclusión del baseline:** el lag no se debe a los fps de la cámara (main y sub van a
~10 fps). Se debe a la **cadena go2rtc→WebRTC** (buffer jitter) y, cuando falla, al
**transcode MJPEG** (~8 fps + decodificación multipart → 1-3 s). Además el grid usa el
**sub-stream SD**, mientras la app muestra HD → peor percepción.

## 3. Cambios a implementar

1. **MJPEG fallback 10 → 15 fps** (`config/go2rtc.yaml`, 8 streams `*mjpeg`).
   - El fallback es el modo más lento; a más fps, más refresco. Coste CPU solo cuando
     hay consumidor del fallback (WebRTC no lo usa).
2. **Toggle HD/SD en el grid del frontend**:
   - Nuevo estado `hd` en `App.tsx` (persistido en `localStorage`), botón en el header.
   - `useCameraStream(camera, enabled, preferMain)` elige `main_stream` (HD) si `preferMain`.
   - `CameraTile` y `DetailView` reciben `preferMain`.
   - Defecto: **SD** (ahorro de WiFi/CPU). HD = mismo stream 1280x720 que la app.
3. **Script de medición `scripts/latencia.sh`**:
   - Reporta fps de ingesta (main y sub) y fps del transcode MJPEG (cuenta `--frame`).
   - Sirve para comparar antes/después y operar.
4. **Garantizar WebRTC primario** (ya hecho con `api.origin` en go2rtc, hallazgo H10).

## 4. Riesgos / costes

| Cambio | Coste |
|--------|-------|
| fps 15 en transcode | +CPU cuando se usa el fallback (host pequeño, load ~4.8) |
| HD en grid | +ancho de banda y CPU por tile; por eso es un toggle (defecto SD) |
| Ingesta HD siempre activa | go2rtc solo ingesta HD cuando hay consumidor → sin coste fijo |

## 5. Métrica objetivo (después)

- Transcode MJPEG efectivo: **~8 → ~12-13 fps**.
- Toggle HD disponible y funcional (paridad de stream con la app).

## 6. Verificación

- `scripts/latencia.sh` antes/después.
- Desde otro equipo: activar HD en el grid y confirmar WebRTC en HD.

---

## Resultado post-implementación (2026-08-01)

**Implementado y verificado:**
- ✅ `config/go2rtc.yaml`: transcode MJPEG **fps 10 → 15** (8 streams), config cargada tras restart.
- ✅ **Toggle HD/SD en el grid** (`App.tsx` estado `hd` + botón `HD` en el header, persistido en
  `localStorage` `camHd`). `useCameraStream(camera, enabled, preferMain)` elige `main_stream`
  cuando HD; `CameraTile` y `DetailView` reciben `preferMain`. Defecto: SD.
- ✅ `scripts/latencia.sh` (fps de ingesta + fps del transcode, con calentamiento).
- ✅ SW cache bumped a `cameras-v3`; frontend rebuild (`index-BWj9qGO4.js`).

**Métricas después:**

| Métrica | Antes | Después |
|---------|-------|---------|
| Config transcode MJPEG | fps=10 | **fps=15** |
| Transcode efectivo (sin contienda) | ~8 fps | **~12 fps** |
| Ingesta main/sub (cámara) | ~10 fps | ~10 fps (tope de la cámara) |
| Grid HD (stream 1280x720) | no | **sí (toggle)** |

**Hallazgo importante (responde a la pregunta original):**
Las cámaras ATSG limitan las **sesiones de video simultáneas**. Durante el test, al
consumir varias fuentes a la vez (frame.grabs + transcodes de las 4 cámaras), el fps del
transcode bajaba a ~5. La cámara sub-stream entrega ~10 fps como tope. **Cerrar la app
EseeCloud sí libera una sesión de la cámara** → el dashboard puede recibir un feed más
estable (impacto pequeño pero medible). La mayor parte del lag sigue siendo la cadena
go2rtc→WebRTC (buffer jitter) y el fallback MJPEG; WebRTC es siempre preferible (ya
garantizado con CORS, H10).

---

## Investigación posterior: cómo atacar la cadena go2rtc→WebRTC (2026-08-01)

Investigación específica sobre la cadena `go2rtc → WebRTC`: WebRTC es ya el formato
de menor latencia que ofrece go2rtc (la config WebRTC solo toca conectividad, no
latencia), y los levers reales están en el **GOP de la cámara** y el **jitter de red
(cable)**, no en cambiar de formato ni en knobs de config. Ver
**`docs/WEBRTC-LATENCIA.md`** (análisis completo + cuadro de formas de atacarla por
impacto).
