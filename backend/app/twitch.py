"""Gestor de re-stream a Twitch (Fase 6).

Toma N streams de go2rtc (RTSP local), compone un grid con xstack y lo
retransmite a rtmp://live.twitch.tv con ffmpeg. Audio opcional desde un
archivo local (loop). El proceso se controla desde el backend.
"""
from __future__ import annotations

import logging
import math
import os
import signal
import subprocess
import threading
import time
from pathlib import Path

from . import crypto, db
from .config import ROOT_DIR

log = logging.getLogger("twitch")

GO2RTC_RTSP = "127.0.0.1:8554"
TWITCH_INGEST_DEFAULT = "rtmp://live.twitch.tv/app"

LOCK = threading.Lock()
_proc: subprocess.Popen | None = None
_info: dict = {}
_logfile: Path | None = None


# --------------------------------------------------------------------------- settings

def _setting(key: str, default: str = "") -> str:
    with db.get_db() as conn:
        row = conn.execute("SELECT value FROM settings WHERE key=?", (key,)).fetchone()
    return row["value"] if row else default


def _enc_setting(key: str, value: str) -> None:
    with db.get_db() as conn:
        conn.execute(
            "INSERT INTO settings (key, value, updated_at) VALUES (?,?,datetime('now')) "
            "ON CONFLICT(key) DO UPDATE SET value=excluded.value, updated_at=datetime('now')",
            (key, crypto.encrypt(value)),
        )


def get_key() -> str:
    # Prioridad: TWITCH_STREAM_KEY del entorno/.env sobre la key cifrada en la DB.
    return os.environ.get("TWITCH_STREAM_KEY") or crypto.decrypt(_setting("twitch_key_enc"))


def get_config() -> dict:
    return {
        "key_set": bool(get_key()),
        "url": _setting("twitch_url", TWITCH_INGEST_DEFAULT),
        "audio": _setting("twitch_audio", ""),
        "bitrate": _setting("twitch_bitrate", "2500k"),
        "width": int(_setting("twitch_width", "1280")),
        "height": int(_setting("twitch_height", "720")),
    }


def save_config(key: str | None = None, url: str | None = None,
                audio: str | None = None, bitrate: str | None = None,
                width: int | None = None, height: int | None = None) -> None:
    if key is not None and key.strip():
        _enc_setting("twitch_key_enc", key.strip())
    if url is not None:
        with db.get_db() as conn:
            conn.execute("INSERT INTO settings (key,value) VALUES ('twitch_url',?) ON CONFLICT(key) DO UPDATE SET value=excluded.value", (url.strip(),))
    if audio is not None:
        with db.get_db() as conn:
            conn.execute("INSERT INTO settings (key,value) VALUES ('twitch_audio',?) ON CONFLICT(key) DO UPDATE SET value=excluded.value", (audio.strip(),))
    if bitrate is not None:
        with db.get_db() as conn:
            conn.execute("INSERT INTO settings (key,value) VALUES ('twitch_bitrate',?) ON CONFLICT(key) DO UPDATE SET value=excluded.value", (bitrate.strip(),))
    if width is not None:
        with db.get_db() as conn:
            conn.execute("INSERT INTO settings (key,value) VALUES ('twitch_width',?) ON CONFLICT(key) DO UPDATE SET value=excluded.value", (str(width),))
    if height is not None:
        with db.get_db() as conn:
            conn.execute("INSERT INTO settings (key,value) VALUES ('twitch_height',?) ON CONFLICT(key) DO UPDATE SET value=excluded.value", (str(height),))


# --------------------------------------------------------------------------- ffmpeg

def _build_cmd(camera_ids: list[int], use_sub: bool, cfg: dict) -> list[str]:
    placeholders = ",".join("?" * len(camera_ids))
    with db.get_db() as conn:
        rows = conn.execute(
            f"SELECT id, main_stream, sub_stream FROM cameras WHERE id IN ({placeholders})",
            tuple(camera_ids),
        ).fetchall()
    streams = [r["sub_stream" if use_sub else "main_stream"] or r["main_stream"] for r in rows]

    n = len(streams)
    W, H = cfg["width"], cfg["height"]
    cols = max(1, math.ceil(math.sqrt(n)))
    rows_n = max(1, math.ceil(n / cols))
    tw, th = W // cols, H // rows_n
    tw -= tw % 2
    th -= th % 2

    cmd = ["ffmpeg", "-hide_banner", "-loglevel", "warning", "-nostdin"]
    for s in streams:
        # analyzeduration/probesize explícitos: evita "could not find codec
        # parameters" cuando la fuente RTSP (go2rtc) arranca en frío.
        cmd += ["-rtsp_transport", "tcp", "-fflags", "nobuffer",
                "-analyzeduration", "1000000", "-probesize", "1000000",
                "-i", f"rtsp://{GO2RTC_RTSP}/{s}"]

    fc = []
    for i in range(n):
        fc.append(f"[{i}:v]scale={tw}:{th}:force_original_aspect_ratio=decrease,pad={tw}:{th}:(ow-iw)/2:(oh-ih)/2[v{i}]")
    if n > 1:
        layout = []
        for i in range(n):
            c, r = i % cols, i // cols
            layout.append(f"{c * tw}_{r * th}")
        fc.append(f"{''.join(f'[v{i}]' for i in range(n))}xstack=inputs={n}:layout={'|'.join(layout)}[v]")
        vfilter = "[v]"
    else:
        vfilter = "[v0]"
    cmd += ["-filter_complex", ";".join(fc), "-map", vfilter]

    # audio opcional
    audio = cfg["audio"]
    if audio and Path(audio).exists():
        cmd += ["-stream_loop", "-1", "-i", audio]
        cmd += ["-map", f"{n}:a"]

    cmd += [
        "-c:v", "libx264", "-preset", "veryfast",
        "-b:v", cfg["bitrate"], "-maxrate", cfg["bitrate"],
        "-bufsize", cfg["bitrate"],
        "-pix_fmt", "yuv420p", "-g", "60",
    ]
    if audio and Path(audio).exists():
        cmd += ["-c:a", "aac", "-b:a", "96k", "-ar", "44100"]
    key = get_key()
    cmd += ["-f", "flv", f"{cfg['url']}/{key}"]
    return cmd


# --------------------------------------------------------------------------- control

def start(camera_ids: list[int], use_sub: bool = True) -> dict:
    global _proc, _info, _logfile
    with LOCK:
        if _proc and _proc.poll() is None:
            return {"error": "Ya hay un stream en curso"}
        key = get_key()
        if not key:
            return {"error": "No hay clave de Twitch configurada"}
        cfg = get_config()
        cmd = _build_cmd(camera_ids, use_sub, cfg)
        _logfile = Path(ROOT_DIR / "backend" / "data" / "twitch.log")
        f = open(_logfile, "ab")
        _proc = subprocess.Popen(cmd, stdout=f, stderr=subprocess.STDOUT,
                                 start_new_session=True)
        _info = {
            "cameras": camera_ids, "use_sub": use_sub, "cmd": " ".join(cmd[:1]) + " …",
            "started_at": time.strftime("%Y-%m-%d %H:%M:%S"), "pid": _proc.pid,
        }
        log.info("Twitch stream iniciado pid=%s cameras=%s", _proc.pid, camera_ids)
        return {"started": True, **_info}


def stop() -> dict:
    global _proc
    with LOCK:
        if not _proc:
            return {"error": "No hay stream en curso"}
        try:
            os.killpg(_proc.pid, signal.SIGTERM)
        except ProcessLookupError:
            pass
        try:
            _proc.wait(timeout=5)
        except subprocess.TimeoutExpired:
            try:
                os.killpg(_proc.pid, signal.SIGKILL)
            except ProcessLookupError:
                pass
        _proc = None
        log.info("Twitch stream detenido")
        return {"stopped": True}


def status() -> dict:
    global _proc, _info
    with LOCK:
        if _proc and _proc.poll() is None:
            return {"running": True, **_info}
        if _proc and _proc.poll() is not None:
            code = _proc.returncode
            _proc = None
            return {"running": False, "last_code": code, **_info}
        return {"running": False}
