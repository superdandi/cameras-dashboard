"""Configuración central del backend."""
from __future__ import annotations

import os
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent.parent  # backend/
ROOT_DIR = BASE_DIR.parent                           # cameras-dashboard/
DATA_DIR = BASE_DIR / "data"
DATA_DIR.mkdir(parents=True, exist_ok=True)


def _load_dotenv(path: Path) -> None:
    """Carga un .env simple (clave=valor, #comentario) sin sobrescribir lo ya definido."""
    if not path.exists():
        return
    for line in path.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, _, value = line.partition("=")
        key = key.strip()
        value = value.strip().strip('"').strip("'")
        if key:
            os.environ.setdefault(key, value)


_load_dotenv(BASE_DIR / ".env")

DB_PATH = DATA_DIR / "cameras.db"
SECRET_KEY_PATH = DATA_DIR / "secret.key"

GO2RTC_API = os.environ.get("GO2RTC_API", "http://127.0.0.1:1984")

# Puerto del backend
PORT = int(os.environ.get("CAM_BACKEND_PORT", "8000"))

# Si se define CAM_ADMIN_PASSWORD, el API exige ese Bearer token en /api/*.
ADMIN_TOKEN = os.environ.get("CAM_ADMIN_TOKEN", "")

# Stream key de Twitch (preferente sobre la guardada cifrada en la DB).
# Documento: backend/.env  →  TWITCH_STREAM_KEY=live_xxxxx
TWITCH_STREAM_KEY = os.environ.get("TWITCH_STREAM_KEY", "")
