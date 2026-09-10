# Legacy — Sistema de skins v1.0.0

Este directorio contiene el sistema de skins original del proyecto **SENTINEL v1.0.0**.

## Contenido

- `skins.ts` — Array de 5 skins (noche/dia/verde/violeta/mono) + función `applySkin()`
- `skins.css` — Bloques CSS `[data-skin='...']` de cada skin

## Contexto

En SENTINEL v2.0.0, el sistema de skins fue reemplazado por un sistema de **modos** con componentes propios por modo (cyberpunk / vigilancia). Los modos definen tanto la estética como la estructura de la interfaz, mientras que las skins solo definían colores.

## Uso

Este código **no se importa** en el código activo de v2. Se conserva como referencia histórica del proyecto para quien parta de la tag `v1.0.0` (commit `01f60fc`).

## Tag

La versión v1.0.0 completa está disponible en git: `git checkout v1.0.0`
