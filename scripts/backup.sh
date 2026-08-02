#!/usr/bin/env bash
# Backup de datos del dashboard de cámaras (<HOSTNAME>).
# Uso: scripts/backup.sh [destino]   (default: ~/backups/cameras)
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
DEST="${1:-$HOME/backups/cameras}"
STAMP="$(date +%Y%m%d-%H%M%S)"
OUT="$DEST/$STAMP"
mkdir -p "$OUT"

# SQLite: copia consistente (evita corromper la DB si hay escrituras activas)
sqlite3 "$ROOT/backend/data/cameras.db" ".backup '$OUT/cameras.db'"

# Clave de cifrado y configs
cp "$ROOT/backend/data/secret.key" "$OUT/secret.key" 2>/dev/null || true
cp "$ROOT/config/go2rtc.yaml" "$OUT/go2rtc.yaml" 2>/dev/null || true
cp "$ROOT/config/systemd/cameras-backend.service" "$OUT/cameras-backend.service" 2>/dev/null || true

chmod 600 "$OUT/secret.key" 2>/dev/null || true
# rotar: conservar últimos 10 backups
ls -1dt "$DEST"/*/ 2>/dev/null | tail -n +11 | xargs -r rm -rf

echo "Backup: $OUT"
du -sh "$OUT" | cut -f1
