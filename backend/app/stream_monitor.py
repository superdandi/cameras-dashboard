"""Monitor de sesión de stream por cámara.

Observa go2rtc /api/streams cada ~60s, detecta transiciones
(producer con bytes creciendo → en directo; producer ausente o bytes estancados → corte),
y persiste live_since / last_cut_at en SQLite.
"""
from __future__ import annotations

import asyncio
import json
import logging
import time
import urllib.request

from . import db
from .config import GO2RTC_API

log = logging.getLogger("stream_monitor")

POLL_INTERVAL = 60  # segundos
STALL_THRESHOLD = 2  # observaciones consecutivas sin crecimiento antes de declarar corte


def _fetch_streams() -> dict:
    try:
        req = urllib.request.Request(f"{GO2RTC_API}/api/streams")
        with urllib.request.urlopen(req, timeout=5) as resp:
            return json.loads(resp.read())
    except Exception as e:
        log.debug("fetch streams: %s", e)
        return {}


def _load_camera_streams() -> list[dict]:
    with db.get_db() as conn:
        rows = conn.execute(
            "SELECT id, sub_stream, main_stream FROM cameras WHERE enabled=1"
        ).fetchall()
    return [dict(r) for r in rows]


def _get_prev_state(cam_id: int) -> dict:
    with db.get_db() as conn:
        row = conn.execute(
            "SELECT * FROM camera_stream_state WHERE camera_id=?", (cam_id,)
        ).fetchone()
    if row:
        return dict(row)
    return {
        "camera_id": cam_id, "live_since": 0, "last_cut_at": 0,
        "prev_bytes": 0, "stall": 0, "was_streaming": 0,
    }


def _save_state(cam_id: int, state: dict) -> None:
    with db.get_db() as conn:
        conn.execute(
            """INSERT INTO camera_stream_state
               (camera_id, live_since, last_cut_at, prev_bytes, stall, was_streaming, updated_at)
               VALUES (?, ?, ?, ?, ?, ?, datetime('now'))
               ON CONFLICT(camera_id) DO UPDATE SET
                 live_since=excluded.live_since,
                 last_cut_at=excluded.last_cut_at,
                 prev_bytes=excluded.prev_bytes,
                 stall=excluded.stall,
                 was_streaming=excluded.was_streaming,
                 updated_at=excluded.updated_at""",
            (cam_id, state["live_since"], state["last_cut_at"],
             state["prev_bytes"], state["stall"], state["was_streaming"]),
        )


def _find_stream_name(cam: dict, streams: dict) -> str | None:
    candidates = [cam["main_stream"], cam["sub_stream"]]
    cam_tag = f"cam{cam['id']:02d}"
    candidates.extend([cam_tag, f"{cam_tag}sd"])
    for name in candidates:
        if name and name in streams:
            return name
    return None


def _is_streaming(stream_data: dict, prev_bytes: int) -> tuple[bool, int]:
    producers = stream_data.get("producers") or []
    if not producers:
        return False, 0
    first = producers[0]
    receivers = first.get("receivers") or []
    receiver = receivers[0] if receivers else {}
    bytes_now = first.get("bytes_recv", 0) or receiver.get("bytes", 0) or 0

    if prev_bytes == 0 and bytes_now > 0:
        return True, bytes_now
    if prev_bytes > 0 and bytes_now > prev_bytes:
        return True, bytes_now
    if prev_bytes > 0 and bytes_now == prev_bytes:
        return False, bytes_now
    if prev_bytes == 0 and bytes_now == 0:
        return False, 0

    return True, bytes_now


async def stream_monitor_loop() -> None:
    while True:
        try:
            streams_data = _fetch_streams()
            if streams_data:
                cams = _load_camera_streams()
                now = int(time.time() * 1000)

                for cam in cams:
                    name = _find_stream_name(cam, streams_data)
                    prev = _get_prev_state(cam["id"])

                    if name is None:
                        streaming = False
                        bytes_now = 0
                    else:
                        streaming, bytes_now = _is_streaming(streams_data.get(name, {}), prev["prev_bytes"])

                    state = dict(prev)

                    if streaming:
                        state["stall"] = 0
                        state["prev_bytes"] = bytes_now
                        if not prev["was_streaming"]:
                            if prev["live_since"] == 0:
                                state["live_since"] = now
                            state["was_streaming"] = 1
                    else:
                        state["stall"] = prev["stall"] + 1
                        state["prev_bytes"] = bytes_now
                        if prev["was_streaming"] and state["stall"] >= STALL_THRESHOLD:
                            state["last_cut_at"] = now
                            state["was_streaming"] = 0

                    _save_state(cam["id"], state)
        except Exception as e:
            log.exception("stream monitor: %s", e)

        await asyncio.sleep(POLL_INTERVAL)
