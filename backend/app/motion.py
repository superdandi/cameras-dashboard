"""Detección de movimiento server-side (Fase 5).

Cada cámara habilitada: se toma un frame pequeño (gris 96x54) desde go2rtc
(RTSP local) con ffmpeg, se compara con el anterior (diferencia media de
píxeles) y, si supera el umbral, se registra un evento. Con cooldown para
evitar saturación. Notificación opcional a ntfy/Telegram (notify_url).
"""
from __future__ import annotations

import asyncio
import io
import logging
import urllib.request
import urllib.parse

from PIL import Image

from . import db
from .config import GO2RTC_API

log = logging.getLogger("motion")

W, H = 96, 54


def _setting(key: str, default: str) -> str:
    with db.get_db() as conn:
        row = conn.execute("SELECT value FROM settings WHERE key=?", (key,)).fetchone()
    return row["value"] if row else default


def _threshold() -> float:
    try:
        return float(_setting("motion_threshold", "9"))
    except ValueError:
        return 9.0


def _interval() -> float:
    try:
        return max(1.0, float(_setting("motion_interval", "2")))
    except ValueError:
        return 2.0


def _cooldown() -> float:
    try:
        return float(_setting("motion_cooldown", "10"))
    except ValueError:
        return 10.0


async def _grab_gray(stream: str) -> bytes | None:
    """Frame pequeño en gris (96x54) desde go2rtc frame.jpeg + Pillow."""
    try:
        proc = await asyncio.create_subprocess_exec(
            "curl", "-s", "-m", "6", "-o", "-",
            f"{GO2RTC_API}/api/frame.jpeg?src={stream}&width=160",
            stdout=asyncio.subprocess.PIPE, stderr=asyncio.subprocess.DEVNULL,
        )
        out, _ = await asyncio.wait_for(proc.communicate(), timeout=8)
    except Exception as e:  # noqa: BLE001
        log.debug("grab %s: %s", stream, e)
        return None
    if not out:
        return None
    try:
        img = Image.open(io.BytesIO(out)).convert("L").resize((W, H))
        return img.tobytes()
    except Exception as e:  # noqa: BLE001
        log.debug("decode %s: %s", stream, e)
        return None


def _record(camera_id: int, ctype: str, payload: str) -> None:
    with db.get_db() as conn:
        conn.execute(
            "INSERT INTO events (camera_id, type, payload) VALUES (?,?,?)",
            (camera_id, ctype, payload),
        )


def _notify(camera_name: str, payload: str) -> None:
    url = _setting("notify_url", "")
    if not url:
        return
    text = f"{camera_name}: {payload}"
    try:
        req = urllib.request.Request(
            url, data=urllib.parse.urlencode({"message": text}).encode(),
            headers={"Content-Type": "application/x-www-form-urlencoded"},
            method="POST",
        )
        urllib.request.urlopen(req, timeout=4)
    except Exception as e:  # noqa: BLE001
        log.debug("notify: %s", e)


async def _check_camera(c: dict, prev: dict, last_event: dict) -> None:
    stream = c["sub_stream"] or c["main_stream"]
    frame = await _grab_gray(stream)
    if frame is None:
        prev.pop(c["id"], None)
        return
    old = prev.get(c["id"])
    if old is not None and len(old) == len(frame):
        diff = sum(abs(a - b) for a, b in zip(old, frame)) / len(frame)
        if diff > _threshold():
            now = asyncio.get_running_loop().time()
            if now - last_event.get(c["id"], 0) >= _cooldown():
                last_event[c["id"]] = now
                payload = f"movimiento detectado (diff={diff:.1f})"
                _record(c["id"], "motion", payload)
                log.info("CAM %s: %s", c["name"], payload)
                _notify(c["name"], payload)
    prev[c["id"]] = frame


async def motion_loop() -> None:
    prev: dict[int, bytes] = {}
    last_event: dict[int, float] = {}
    while True:
        try:
            with db.get_db() as conn:
                cams = conn.execute(
                    "SELECT id, name, enabled, main_stream, sub_stream FROM cameras WHERE enabled=1"
                ).fetchall()
            if cams:
                await asyncio.gather(
                    *(_check_camera(dict(c), prev, last_event) for c in cams)
                )
        except Exception as e:  # noqa: BLE001
            log.exception("motion loop: %s", e)
        await asyncio.sleep(_interval())
