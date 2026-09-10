# Plan — Vista "Mapa / Floor Plan"

> Feature propuesta para SENTINEL: un plano del recinto donde se posicionan las cámaras
> sobre una imagen del piso, con estado de salud en vivo y acceso directo al detalle.
> Referencias: `CHANGELOG.md` (versiones), `UI-MODOS.md` (modos), `SENTINEL-V2.md` (checklist).

---

## 1. Decisiones de diseño (confirmadas)

| Aspecto | Decisión |
|---------|----------|
| Ubicación en UI | **Vista fullscreen nueva** — botón "Mapa" en el header, junto a En vivo/Inventario |
| Definición del plano | **Imagen subida + drag de cámaras** — subes un plano del piso como fondo y arrastras cada cámara a su posición |
| Indicador de salud | Sí — el marcador cambia de color según `healthGrade` (ok/warn/degraded/critical) en vivo |
| Alerta visual en eventos | Sí — pulso/blink en la cámara que registra un evento reciente |
| Clic → abrir detalle | Sí — reutiliza el modal de detalle del modo activo |
| Snapshot en hover | **No** (descartado por ahora; se puede añadir después) |

## 2. Backend

### 2.1 Imagen del plano

- Archivo almacenado en `backend/data/map.<ext>` (`DATA_DIR` ya existe, gitignored).
- Nuevos endpoints (todos tras `require_token`, consistente con `/api/*`):
  - `POST /api/map/image` — subir imagen (multipart, valida `.png`/`.jpg`, sin
    directorios en el nombre de archivo).
  - `GET /api/map/image` — devolver el plano actual (`FileResponse`).
  - `DELETE /api/map/image` — eliminar el plano.

### 2.2 Posición de cada cámara

- Migración segura en `db.py:_migrate()` (mismo patrón que `display_order`):
  añadir columnas `map_x REAL DEFAULT NULL` y `map_y REAL DEFAULT NULL` a `cameras`
  (porcentaje 0–100 relativo al lienzo).
- Exponer en `CameraIn`/`CameraPatch` (opcionales) → viaja gratis por
  `SELECT *`/`row_to_dict` en `GET /api/cameras`.
- No se toca el resto del modelo.

## 3. Frontend

### 3.1 App.tsx

- Ampliar `View`: `'grid' | 'inventory' | 'settings' | 'events' | 'twitch' | 'map'`.
- Botón **Mapa** en el nav del header.

### 3.2 registry.ts

- Añadir `Map` a `ModeComponents` y registrar `MapView` en ambos modos
  (igual que Inventory/Twitch/Settings: componente compartido, estética por CSS
  `data-mode`).

### 3.3 Nuevo `frontend/src/components/MapView.tsx` — pantalla completa

- **Fondo**: si hay plano → `<img>` contenedor; si no → placeholder de cuadrícula
  con mensaje "Sube un plano".
- **Marcadores**: uno por cámara habilitada, posicionados con `left/top` en %
  (`camera.map_x/map_y`; default centrado si no existen).
- **Salud en vivo**: borde/glow del marcador por `healthGrade` del `telemetryStore`.
- **Alerta de eventos**: `useEvents` → si hay evento reciente de esa cámara, clase
  `pulse` (animación CSS).
- **Clic → detalle**: `onSelect(camera)` (mismo flujo que `handleSelect` de `App`).
- **Tooltip hover**: nombre + estado.

### 3.4 Edición (toggle "Editar plano")

- **Subir imagen**: `<input type="file">` → `POST /api/map/image`.
- **Posicionar cámaras**: pointer events nativos sobre el contenedor — arrastras el
  marcador, se calcula `(x%, y%)` con `getBoundingClientRect()` y al soltar se
  persiste vía `api.updateCamera(id, { map_x, map_y })`. Sin dependencias nuevas.
- **Quitar plano**: botón → `DELETE /api/map/image`.
- (Opcional) Downscale de la imagen en el cliente con `canvas.toBlob('image/jpeg', 0.85)`
  limitado a ~2048px antes de subir.

## 4. Sin dependencias nuevas

- Drag: pointer events nativos (no @dnd-kit, ya que es posicionamiento libre sobre lienzo).
- No se acopla a audio/cámara.

## 5. Verificación

- `npm run build` en `frontend/` — sin errores TS.
- Reiniciar backend (`systemctl --user restart cameras-backend.service`) para subir
  los endpoints nuevos.
- Hard refresh del navegador (service worker).
- Prueba manual:
  1. Subir un plano → aparece de fondo.
  2. Arrastrar las 4 cámaras → sus posiciones persisten tras recargar.
  3. Estados de salud se ven por color; un evento nuevo produce pulso.
  4. Clic en una cámara → abre el detalle del modo activo.

## 6. Docs a actualizar tras implementar

- `docs/CHANGELOG.md` (sección v2.1).
- `docs/UI-MODOS.md` (nueva vista).
- `docs/ROADMAP.md` (feature marcada como implementada).