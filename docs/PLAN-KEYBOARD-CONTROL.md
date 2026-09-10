# Plan: Keyboard Control for Live Camera Grid (Vigilancia Mode)

## Summary
Add full keyboard control in **OpsGrid** (vigilancia mode live view):
- `1–4` — select camera by index (with visual ring highlight)
- `↑↓←→` — move selected camera's PTZ
- `Enter` — open detail view of selected camera
- `Escape` — return from detail to grid / clear selection
- `S` — toggle audio on/off for selected camera
- Keyboard continues working inside the detail view

## Scope
- Night vision (`N`) and motion tracking (`M`) are **deferred** — these CGIs are not
  exposed on these cameras (verified: `infrared.cgi`, `mdattr.cgi`, `mdalarm.cgi`
  all return 404 across .90–.93). Only `ptzctrl.cgi` and `preset.cgi` are reachable.

## Files to modify
1. `frontend/src/modes/vigilancia/OpsGrid.tsx` — keyboard listener, selectedId state
2. `frontend/src/modes/vigilancia/OpsTile.tsx` — selected prop + CSS class
3. `frontend/src/index.css` — .ops-tile-selected ring style
4. `frontend/src/App.tsx` — coordinate Escape between detail modal + selectedId

## Steps

### Step 1: OpsTile — add `selected` prop
- Add `selected: boolean` to `Props`.
- When `selected`, apply `ops-tile-selected` class on the tile button.

### Step 2: CSS — .ops-tile-selected
- Add `.ops-tile-selected` with `ring-2 ring-accent` + slight transform.

### Step 3: OpsGrid — keyboard listener + selectedId
- New local state: `selectedId: number | null`.
- `useEffect` with `keydown`/`keyup` on `window`:
  - `1..4` → `selectedId = cameras[index-1].id`
  - Arrow keys → `api.ptz(selectedId, dir, 40, 250)` on keydown (ignore repeat)
    + `api.ptz(selectedId, 'stop')` on keyup
  - `Enter` → `onSelect(camera)` (opens OpsDetail modal)
  - `Escape` → `setSelectedId(null)` if no detail, or clear
  - `s` → `audio.toggle()` for selected camera
- Pass `selected={c.id === selectedId}` to `SortableTile`/`OpsTile`.

### Step 4: App.tsx — Escape coordination
- Pass `onEscape` callback to grid, or coordinate via the same selected state.
- When `selected` (detail modal) is open, `Escape` closes it.
- When detail is closed, `Escape` clears `selectedId`.

### Step 5: OpsDetail — keyboard from global listener
- The existing global listener (step 3) handles arrows/S while detail is open
  since `selectedId` persists. OpsDetail adds its own `Escape` → `onClose()`.

### Step 6: Build & verify
- `npm run build` — no new TS errors.
- Systemd restart not needed (frontend-only changes served as static).

## Verification
- Select camera 1 with `1` key → ring appears on tile.
- Arrow keys move the camera physically.
- `Enter` opens detail, `Escape` closes it.
- `S` toggles audio (hear audio on/off).
