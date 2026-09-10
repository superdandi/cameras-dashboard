# SENTINEL — Roadmap de Features y Mejoras

> **Objetivo**: lista exhaustiva de features existentes, mejoras sugeridas y plan de implementación por fases.
> **Versión**: v1.0 · **Fecha**: 2026-08-05.
> **Referencias**: `SENTINEL-V2.md` (checklist v2), `UI-MODOS.md` (diseño visual), `CYBERBOOT.md` (boot 3D).

---

## 1. Estado actual del dashboard

### 1.1 Features implementadas (ambos modos)

| Feature | Estado | Notas |
|---------|--------|-------|
| Boot sequence (vigilancia) | ✅ | ASCII terminal, skip, fade-out |
| Boot sequence (cyberpunk) | ✅ | 3D particles WebGPU/WebGL2, audio procedural, scramble text |
| Camera streaming (WebRTC) | ✅ | go2rtc → WebRTC → browser, fallback MJPEG/snapshot |
| Camera streaming (MJPEG) | ✅ | Fallback cuando WebRTC falla |
| Camera streaming (snapshot) | ✅ | Fallback último recurso |
| Stream stats (WebRTC) | ✅ | FPS, RTT, jitter, packet loss, bitrate, codec, resolution |
| Health scoring (0-100) | ✅ | Algoritmo ponderado con 4 grados (ok/warn/degraded/critical) |
| Downtime tracking | ✅ | Persistido en localStorage, sobrevive recargas |
| Drag & drop reordering | ✅ | @dnd-kit, persiste en backend |
| Go2rtc telemetry | ✅ | Codec, bitrate, resolution, protocol, consumers |
| Event system | ✅ | Polling de eventos, console log, hourly chart |
| PTZ controls | ✅ | 9-direcciones, zoom, presets (goto + save), speed slider |
| Twitch integration | ✅ | Streaming a Twitch compartido |
| Settings panel | ✅ | Configuración general |
| Inventory CRUD | ✅ | Agregar/editar/eliminar cámaras |
| Network info | ✅ | SSID, gateway, signal strength |
| Stream session tracking | ✅ | live_since, last_cut_at, uptime |
| Layout switcher | ✅ | 1/2×2/3×3 columnas |
| Status bar (vigilancia) | ✅ | Clock, aggregates, network, go2rtc status |
| Side panel (vigilancia) | ✅ | Camera list, health detail, hourly chart, topology, live feed |

### 1.2 Features por modo

#### VIGILANCIA — Lo que más funciona

1. **La barra de telemetría en vivo** — ver streams activos, bitrate agregado y FPS promedio en tiempo real es extremadamente útil para un operador.
2. **El sistema de salud (health scoring)** — el algoritmo de 0-100 con 4 grados es sólido. Los sparklines de bitrate en cada tile dan una visión inmediata del estado.
3. **Drag & Drop para reordenar** — permite al operador priorizar las cámaras más importantes visualmente.
4. **El side panel de telemetría** — la topología de go2rtc, el chart de 24h y el feed de eventos en vivo son funcionalmente completos.

#### VIGILANCIA — Lo que más necesita mejoría

1. **Sin audio** — en un contexto de vigilancia real, un operador necesita alertas sonoras (motion, offline, alarm).
2. **Sin mapa de cámara/location** — las ubicaciones son solo texto. Un mini-map o floor plan sería mucho más útil.
3. **Sin grabación/clips** — no hay forma de ver grabaciones pasadas ni recortar clips del stream.
4. **El boot es aburrido** — solo texto secuencial, se siente incompleto comparado con el boot cyberpunk.
5. **Sin notificaciones/push** — no hay sistema de alertas persistentes (pop-up, sonido, vibración).

#### CYBERPUNK — Lo que más funciona

1. **La matrix de esferas 3D** — visualmente impresionante. La distribución Fibonacci con bloom y las luces cyan/magenta definen una estética única.
2. **El video mosaic 3D** — el ensamblaje cinematográfico de 200 cubos con video texture es el feature más memorable del dashboard.
3. **El boot con audio procedural** — el hum ambiental, los clicks de typing y el whoosh al final son excelentes. Cero archivos de audio, todo generado en código.
4. **La text scramble effect** — el efecto de decodificación de texto en el boot HUD es muy cyberpunk.
5. **Mouse parallax en el mosaico** — el sutil movimiento de la cámara siguiendo el mouse da una sensación de inmersión.

#### CYBERPUNK — Lo que más necesita mejoría

1. **Sin telemetría en vivo** — no hay forma de ver FPS, RTT, bitrate en la vista cyberpunk. Un operador necesita esta info aunque sea minimalista.
2. **Sin health indicators** — no hay indicador de salud de las cámaras en la matrix de esferas. Si una cámara cae, no hay forma visual de saberlo rápido.
3. **El event detail es muy básico** — solo muestra snapshot, no video. Debería ser un mini-player con el clip del evento.
4. **Sin status bar** — no hay reloj, no hay métricas agregadas. En vigilancia 24/7 el reloj es esencial.
5. **El side panel no existe** — no hay forma de ver la topología de go2rtc o el feed de eventos en la vista cyberpunk.

---

## 2. Features favoritas y que necesitan mejoría

### 2.1 Análisis por modo

#### VIGILANCIA — Features que más funcionan (ranking)

| Rank | Feature | Por qué funciona | Cómo mejorar |
|------|---------|------------------|--------------|
| 1 | **Status bar en vivo** | Ver streams activos, bitrate agregado y FPS promedio en tiempo real es extremadamente útil para un operador. Da una vista general instantánea. | Agregar métricas de health agregado (promedio de salud del sistema). |
| 2 | **Health scoring (0-100)** | El algoritmo ponderado con 4 grados es sólido. Los sparklines de bitrate en cada tile dan una visión inmediata del estado sin necesidad de abrir detail. | Agregar tendencia (subiendo/bajando/estable) con icono de flecha. |
| 3 | **Drag & Drop reordering** | Permite al operador priorizar las cámaras más importantes visualmente. Persiste entre sesiones. | Agregar favoritos o grupos (ej: "Entradas", "Estacionamiento"). |
| 4 | **Side panel de telemetría** | La topología de go2rtc, el chart de 24h y el feed de eventos en vivo son funcionalmente completos. | Agregar filtro de eventos por tipo y cámara. |

#### VIGILANCIA — Features que más necesitan mejoría (ranking)

| Rank | Feature | Problema actual | Solución propuesta |
|------|---------|-----------------|-------------------|
| 1 | **Sin audio** | En vigilancia real, un operador necesita alertas sonoras. Sin audio, las alertas visuales son fácilmente ignoradas. | Web Audio API procedural: beep para motion, tono grave para offline, alarma para alarm. Volumen configurable. |
| 2 | **Sin mapa/location** | Las ubicaciones son solo texto ("Entrada principal"). No hay contexto espacial. Un operador no sabe dónde está la cámara en relación a otras. | Floor plan SVG interactivo con posiciones predefinidas. Click en cámara del mapa → selecciona tile. |
| 3 | **Sin grabación/clips** | No hay forma de ver grabaciones pasadas ni recortar clips del stream. Para un sistema de vigilancia real, esto es esencial. | ffmpeg recorder en backend, clips en SQLite, API REST, timeline con thumbnails. |
| 4 | **Boot aburrido** | Solo texto secuencial. Se siente incompleto comparado con el boot cyberpunk. | Agregar partículas sutiles, scanline overlay, o efecto de terminal mejorado. |
| 5 | **Sin notificaciones/push** | No hay sistema de alertas persistentes. Si el usuario no está mirando el dashboard, se pierde la alerta. | WebSocket push para alertas críticas. Pop-up + sonido + vibración (mobile). |

#### CYBERPUNK — Features que más funcionan (ranking)

| Rank | Feature | Por qué funciona | Cómo mejorar |
|------|---------|------------------|--------------|
| 1 | **Video mosaic 3D** | El ensamblaje cinematográfico de 200 cubos con video texture es el feature más memorable. Ningún otro dashboard tiene algo así. | Agregar efecto de glitch sutil durante el ensamblaje. |
| 2 | **Matrix de esferas 3D** | La distribución Fibonacci con bloom y luces cyan/magenta define una estética única. Las esferas flotantes son hipnóticas. | Agregar animación de entrada (las esferas aparecen desde el centro). |
| 3 | **Boot con audio procedural** | El hum ambiental, los clicks de typing y el whoosh al final son excelentes. Cero archivos de audio, todo generado. | Agregar más variation en los sonidos (diferentes tonos por línea). |
| 4 | **Text scramble effect** | El efecto de decodificación de texto en el boot HUD es muy cyberpunk. Se siente como una película de ciencia ficción. | Agregar scramble effect en otros textos del dashboard. |
| 5 | **Mouse parallax** | El sutil movimiento de la cámara siguiendo el mouse da sensación de inmersión. | Agregar parallax también en la matrix de esferas. |

#### CYBERPUNK — Features que más necesitan mejoría (ranking)

| Rank | Feature | Problema actual | Solución propuesta |
|------|---------|-----------------|-------------------|
| 1 | **Sin telemetría en vivo** | No hay forma de ver FPS, RTT, bitrate en la vista cyberpunk. Un operador necesita esta info aunque sea minimalista. | Overlay sutil en hovered sphere: FPS/RTT/Bitrate en texto flotante holográfico. |
| 2 | **Sin health indicators** | No hay indicador de salud de las cámaras en la matrix de esferas. Si una cámara cae, no hay forma visual de saberlo rápido. | Esferas pulsan con color (verde/rojo/amarillo) según salud. Glow intensity varía con health score. |
| 3 | **Event detail básico** | Solo muestra snapshot, no video. Debería ser un mini-player con el clip del evento. | Mini-player de 3s antes/después del evento. Controls de play/pause. |
| 4 | **Sin status bar** | No hay reloj, no hay métricas agregadas. En vigilancia 24/7 el reloj es esencial. | Barra superior con reloj (estilo digital glitch), métricas agregadas, GPU info. |
| 5 | **Sin side panel** | No hay forma de ver la topología de go2rtc o el feed de eventos en la vista cyberpunk. | Panel colapsable con topología go2rtc y feed de eventos (estilo terminal cyberpunk). |

### 2.2 Feature favorita del Sentinel

**El video mosaic 3D del modo cyberpunk.** Es el feature más único y memorable. Ningún otro dashboard de cámaras tiene algo así. El ensamblaje cinematográfico con video texture es genuinamente impresionante y define la identidad del proyecto.

Por qué es la favorita:
- **Originalidad**: no hay nada igual en el mercado de dashboards de cámaras
- **Impacto visual**: 200 cubos con video texture, bloom, mouse parallax
- **Experiencia de usuario**: el ensamblaje de 4s crea anticipación y satisfacción
- **Identidad**: define el modo cyberpunk como algo único, no solo "oscuro con glow"

### 2.3 Feature que más necesita mejoría

**El sistema de grabación/clips** — actualmente no existe. Para un dashboard de vigilancia real, poder ver grabaciones pasadas es esencial. Sin esto, el dashboard es solo un viewer en vivo.

Por qué es la más necesaria:
- **Funcionalidad crítica**: sin grabación, el dashboard no es un sistema de vigilancia completo
- **Uso real**: los operadores necesitan revisar incidentes pasados
- **Competencia**: todos los sistemas de cámaras tienen grabación
- **Valor agregado**: transforma el dashboard de "viewer" a "sistema"

---

## 3. Features sugeridas por modo

### 3.1 VIGILANCIA — Features nuevas

| # | Feature | Descripción | Complejidad | Impacto |
|---|---------|-------------|-------------|---------|
| V1 | **Audio alerts** | Beep/tono para motion detect, camera offline, alarm. Configurable volumen y enable/disable. Web Audio API procedural (sin archivos). | Media | 🔴 Crítico |
| V2 | **Floor plan / Map** | Mapa interactivo con posiciones de cámaras. Click en cámara del mapa → selecciona tile. SVG editable con posiciones predefinidas. | Alta | 🟠 Alto |
| V3 | **Recording panel** | ffmpeg recorder en backend, clips guardados en SQLite, API REST para listar/descargar. Timeline con thumbnails para seek. | Muy Alta | 🟠 Alto |
| V4 | **Boot mejorado** | Agregar particle effects minimalistas o scanline overlay al boot de vigilancia. Transición más cinematográfica. | Baja | 🟡 Medio |
| V5 | **Motion heatmap** | Overlay semi-transparente en tiles que muestra zonas de movimiento acumulado. Diferencia de frames en canvas. | Alta | 🟡 Medio |
| V6 | **Multi-select** | Seleccionar 2-4 cámaras para vista split-screen en detail view. Layout grid dinámico. | Media | 🟡 Medio |
| V7 | **Search/filter** | Barra de búsqueda para filtrar cámaras por nombre, ubicación, o estado. Filtros rápidos: online/offline/PTZ. | Baja | 🟢 Bajo |
| V8 | **Quick actions** | Botones de acción rápida por cámara: screenshot, clip 30s, toggle stream. Acceso directo desde tile. | Media | 🟢 Bajo |

### 3.2 CYBERPUNK — Features nuevas

| # | Feature | Descripción | Complejidad | Impacto |
|---|---------|-------------|-------------|---------|
| C1 | **Minimal telemetry HUD** | Overlay sutil en la matrix de esferas: FPS/RTT/Bitrate del hovered sphere. Texto flotante estilo holográfico. | Baja | 🟠 Alto |
| C2 | **Health pulse animation** | Esferas pulsan con color (verde/rojo/amarillo) según salud de la cámara. Glow intensity varía con health score. | Baja | 🟠 Alto |
| C3 | **Status bar cyberpunk** | Barra superior con reloj (estilo digital glitch), métricas agregadas, GPU info. Estilo HUD futurista. | Media | 🟡 Medio |
| C4 | **Event video clips** | CyberEventDetail muestra clip de video (3s antes/después del evento) en vez de snapshot. Mini-player con controls. | Alta | 🟡 Medio |
| C5 | **Side panel minimal** | Panel colapsable con topología go2rtc y feed de eventos (estilo terminal cyberpunk). Glitch effects. | Media | 🟡 Medio |
| C6 | **Scene transitions** | Transición animada entre sphere matrix y video mosaic (partículas, glitch, o dissolve). | Media | 🟢 Bajo |
| C7 | **Audio alerts cyberpunk** | Sonidos procedural para motion/alarm (distintos al boot, más urgentes). Estilo sci-fi. | Media | 🟢 Bajo |
| C8 | **Sphere interactions** | Doble-click en esfera para zoom in/out. Right-click para menú contextual (PTZ, clip, snapshot). | Baja | 🟢 Bajo |

### 3.3 AMBOS MODOS — Features compartidas

| # | Feature | Descripción | Complejidad | Impacto |
|---|---------|-------------|-------------|---------|
| A1 | **Recording backend** | `ffmpeg` recorder en Python, clips table en SQLite, API REST para listar/descargar clips. | Muy Alta | 🔴 Crítico |
| A2 | **Motion detection** | Diferencia de frames en go2rtc o backend, eventos de motion con timestamp y zona. | Alta | 🔴 Crítico |
| A3 | **Notification system** | WebSocket push para alertas críticas (offline, alarm). Pop-up + sonido + vibración (mobile). | Alta | 🟠 Alto |
| A4 | **Export events** | Exportar log de eventos a CSV/JSON con filtros de fecha y cámara. | Baja | 🟡 Medio |
| A5 | **Multi-camera view** | Vista split-screen 2×2 o 3×3 con streams en vivo. Modo picture-in-picture. | Alta | 🟡 Medio |
| A6 | **Scheduled recordings** | Grabación programada por horario y cámara. Cron-like en backend. | Alta | 🟡 Medio |
| A7 | **Mobile responsive** | Layout optimizado para tablets y móviles. Touch gestures para PTZ. | Alta | 🟡 Medio |
| A8 | **Dark/light theme** | Toggle entre tema oscuro (actual) y claro. Variables CSS ya soportan. | Baja | 🟢 Bajo |

---

## 4. Plan de implementación por fases

### Fase 1 — Quick Wins (1-2 días cada uno)

> Features de alto impacto y baja complejidad que mejoran inmediatamente la experiencia.

| # | Feature | Modo | Dependencias | Estimación |
|---|---------|------|--------------|------------|
| C1 | **Minimal telemetry HUD** | Cyberpunk | Ninguna | 1 día |
| C2 | **Health pulse animation** | Cyberpunk | Ninguna | 0.5 días |
| V7 | **Search/filter** | Vigilancia | Ninguna | 1 día |
| A4 | **Export events** | Ambos | Ninguna | 0.5 días |
| V4 | **Boot mejorado** | Vigilancia | Ninguna | 1 día |

**Resultado esperado**: Cyberpunk muestra telemetría en vivo y health de cámaras. Vigilancia tiene búsqueda. Eventos exportables.

### Fase 2 — Audio y Notificaciones (3-5 días)

> Features que transforman el dashboard de "viewer" a "sistema de vigilancia".

| # | Feature | Modo | Dependencias | Estimación |
|---|---------|------|--------------|------------|
| V1 | **Audio alerts** | Vigilancia | Web Audio API | 2 días |
| C7 | **Audio alerts cyberpunk** | Cyberpunk | Web Audio API | 1 día |
| A3 | **Notification system** | Ambos | WebSocket backend | 3 días |

**Resultado esperado**: Alertas sonoras para motion/offline/alarm. Notificaciones push en tiempo real.

### Fase 3 — Grabación y Clips (1-2 semanas)

> Feature más compleja pero más impactante para un sistema de vigilancia real.

| # | Feature | Modo | Dependencias | Estimación |
|---|---------|------|--------------|------------|
| A1 | **Recording backend** | Ambos | ffmpeg, SQLite, API | 5 días |
| V3 | **Recording panel** | Vigilancia | A1 | 3 días |
| C4 | **Event video clips** | Cyberpunk | A1 | 2 días |
| V8 | **Quick actions** | Vigilancia | A1 | 1 día |

**Resultado esperado**: Grabación continua por cámara. Clips de eventos. Timeline con thumbnails. Descarga de grabaciones.

### Fase 4 — Visualización Avanzada (1-2 semanas)

> Features que mejoran la visualización y la interacción.

| # | Feature | Modo | Dependencias | Estimación |
|---|---------|------|--------------|------------|
| V2 | **Floor plan / Map** | Vigilancia | SVG editor | 5 días |
| V5 | **Motion heatmap** | Vigilancia | Canvas processing | 3 días |
| V6 | **Multi-select** | Vigilancia | Layout dinámico | 2 días |
| C6 | **Scene transitions** | Cyberpunk | CSS/JS animations | 2 días |

**Resultado esperado**: Mapa interactivo con cámaras. Heatmap de motion. Multi-view. Transiciones cinematográficas.

### Fase 5 — Polish y Mobile (1-2 semanas)

> Features de pulido y responsive design.

| # | Feature | Modo | Dependencias | Estimación |
|---|---------|------|--------------|------------|
| A5 | **Multi-camera view** | Ambos | Layout dinámico | 3 días |
| A7 | **Mobile responsive** | Ambos | CSS media queries | 5 días |
| A8 | **Dark/light theme** | Ambos | Variables CSS | 1 día |
| C3 | **Status bar cyberpunk** | Cyberpunk | Ninguna | 2 días |
| C5 | **Side panel minimal** | Cyberpunk | Ninguna | 3 días |
| C8 | **Sphere interactions** | Cyberpunk | Raycaster | 1 día |

**Resultado esperado**: Dashboard responsive en tablets/móviles. Theme toggle. Status bar y side panel en cyberpunk.

### Fase 6 — Features Avanzadas (futuro)

> Features complejas que requieren infraestructura adicional.

| # | Feature | Modo | Dependencias | Estimación |
|---|---------|------|--------------|------------|
| A2 | **Motion detection** | Ambos | Backend processing | 5 días |
| A6 | **Scheduled recordings** | Ambos | Cron backend | 3 días |

**Resultado esperado**: Detección de movimiento en backend. Grabación programada.

---

## 5. Priorización por impacto vs esfuerzo

### Alto impacto, bajo esfuerzo (hacer primero)

| Feature | Impacto | Esfuerzo | Razón |
|---------|---------|----------|-------|
| C1: Minimal telemetry HUD | 🔴 Alto | 🟢 Bajo | Transforma la matrix de esferas de "bonita" a "funcional" |
| C2: Health pulse | 🔴 Alto | 🟢 Bajo | Indicador visual inmediato de salud de cámaras |
| V7: Search/filter | 🟠 Alto | 🟢 Bajo | Funcionalidad básica que falta |
| A4: Export events | 🟡 Medio | 🟢 Bajo | Funcionalidad esperada en cualquier dashboard |

### Alto impacto, alto esfuerzo (planificar)

| Feature | Impacto | Esfuerzo | Razón |
|---------|---------|----------|-------|
| A1: Recording backend | 🔴 Crítico | 🔴 Muy Alto | Sin grabación no es un sistema de vigilancia completo |
| V2: Floor plan | 🟠 Alto | 🔴 Alto | Transforma la experiencia de ubicación |
| A3: Notification system | 🟠 Alto | 🔴 Alto | Esencial para vigilancia 24/7 |

### Bajo impacto, bajo esfuerzo (hacer cuando haya tiempo)

| Feature | Impacto | Esfuerzo | Razón |
|---------|---------|----------|-------|
| A8: Dark/light theme | 🟢 Bajo | 🟢 Bajo | Nice to have |
| C8: Sphere interactions | 🟢 Bajo | 🟢 Bajo | Mejora UX pero no esencial |
| V4: Boot mejorado | 🟡 Medio | 🟢 Bajo | Estético, no funcional |

---

## 6. Métricas de éxito por fase

### Fase 1
- [ ] Cyberpunk muestra FPS/RTT/Bitrate en hovered sphere
- [ ] Esferas pulsan con color según health
- [ ] Vigilancia tiene barra de búsqueda
- [ ] Eventos exportables a CSV

### Fase 2
- [ ] Audio alerts funcionando (motion, offline, alarm)
- [ ] Notificaciones push en tiempo real
- [ ] Sonidos cyberpunk diferenciados del boot

### Fase 3
- [ ] Backend grabando streams 24/7
- [ ] Panel de clips con timeline
- [ ] Event clips de 3s antes/después
- [ ] Quick actions en tiles

### Fase 4
- [ ] Floor plan interactivo con posiciones de cámaras
- [ ] Motion heatmap en tiles
- [ ] Multi-select para split-screen
- [ ] Transiciones animadas en cyberpunk

### Fase 5
- [ ] Responsive en tablets (1024px+)
- [ ] Responsive en móviles (768px+)
- [ ] Theme toggle dark/light
- [ ] Status bar y side panel en cyberpunk

### Fase 6
- [ ] Motion detection en backend
- [ ] Grabación programada por horario

---

## 7. Dependencias técnicas

### Backend (Python/FastAPI)

| Dependencia | Para Feature | Instalación |
|-------------|--------------|-------------|
| `ffmpeg` (binario) | Recording (A1, V3, C4) | `apt install ffmpeg` o `conda install ffmpeg` |
| `websocket-server` | Notifications (A3) | `pip install websocket-server` |
| `Pillow` / `opencv-python` | Motion detection (A2) | `pip install Pillow opencv-python` |

### Frontend (React/TypeScript)

| Dependencia | Para Feature | Instalación |
|-------------|--------------|-------------|
| `howler.js` o Web Audio API | Audio alerts (V1, C7) | Web Audio API nativo (recomendado) |
| `react-dnd` o `@dnd-kit` | Floor plan drag (V2) | Ya instalado `@dnd-kit` |
| `fabric.js` o SVG nativo | Floor plan editor (V2) | Evaluar opciones |
| `framer-motion` | Scene transitions (C6) | `npm install framer-motion` |

### Infraestructura

| Requisito | Para Feature | Notas |
|-----------|--------------|-------|
| Disco adicional | Recording (A1) | ~1GB/hora por cámara (H264) |
| Permisos de escritura | Recording (A1) | Backend necesita escribir a disco |
| Puerto WebSocket | Notifications (A3) | Puerto adicional o upgrade HTTP |

---

## 8. Notas de implementación

### Principios guía

1. **Funcionalidad sobre estética** — priorizar features que hacen el dashboard más útil, no solo más bonito.
2. **Ambos modos comparten lógica** — hooks, stores y utilidades compartidas. UI diferenciada.
3. **Backend mínimo** — agregar features de backend solo cuando es estrictamente necesario (grabación, motion detection).
4. **Progresivo** — cada fase es independiente y usable. No depende de fases anteriores (excepto Fase 3 que depende de A1).
5. **Documentar cada cambio** — actualizar docs antes de merge.

### Orden de ejecución recomendado

```
Fase 1 (Quick Wins) → Fase 2 (Audio) → Fase 3 (Recording) → Fase 4 (Visual) → Fase 5 (Polish) → Fase 6 (Advanced)
```

### Criterios de calidad

- [ ] Cada feature funciona en ambos modos (o está justificado por qué no aplica)
- [ ] Build sin errores (`npm run build`)
- [ ] Sin regresiones en features existentes
- [ ] Documentación actualizada
- [ ] Test manual completo

---

## 9. Changelog de roadmap

| Fecha | Cambio | Autor |
|-------|--------|-------|
| 2026-08-05 | Creación inicial del roadmap con análisis de features | Sentinel AI |
