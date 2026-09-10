"""Gestor de re-stream a Twitch (Fase 6).

Toma N streams de go2rtc (RTSP local), compone un grid con xstack y lo
retransmite a rtmp://live.twitch.tv con ffmpeg. Audio configurable: archivo
local (loop), cámara (vía eseecloud HTTP demuxer), o dispositivo de captura
(PipeWire/ALSA).
"""
from __future__ import annotations

import json
import logging
import math
import os
import shlex
import signal
import subprocess
import sys
import tempfile
import threading
import time
from pathlib import Path

from . import crypto, db
from .config import ROOT_DIR

log = logging.getLogger("twitch")

GO2RTC_RTSP = "127.0.0.1:8554"
GO2RTC_API = os.environ.get("GO2RTC_API", "http://127.0.0.1:1984")
TWITCH_INGEST_DEFAULT = "rtmp://live.twitch.tv/app"
SCRIPTS_DIR = ROOT_DIR / "scripts"
ESEELOUD_AUDIO_SCRIPT = SCRIPTS_DIR / "eseecloud_audio.py"

LOCK = threading.Lock()
_proc: subprocess.Popen | None = None
_audio_proc: subprocess.Popen | None = None
_audio_fifo: str | None = None
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


def _set_setting(key: str, value: str) -> None:
    with db.get_db() as conn:
        conn.execute(
            "INSERT INTO settings (key, value) VALUES (?,?) "
            "ON CONFLICT(key) DO UPDATE SET value=excluded.value",
            (key, value),
        )


def get_key() -> str:
    return os.environ.get("TWITCH_STREAM_KEY") or crypto.decrypt(_setting("twitch_key_enc"))


def get_config() -> dict:
    return {
        "key_set": bool(get_key()),
        "url": _setting("twitch_url", TWITCH_INGEST_DEFAULT),
        "audio": _setting("twitch_audio", ""),
        "audio_source": _setting("twitch_audio_source", "none"),
        "audio_camera_id": int(_setting("twitch_audio_camera_id", "0")),
        "audio_device": _setting("twitch_audio_device", "default"),
        "audio_gain": _setting("twitch_audio_gain", "0"),
        "bitrate": _setting("twitch_bitrate", "2500k"),
        "width": int(_setting("twitch_width", "1280")),
        "height": int(_setting("twitch_height", "720")),
    }


def save_config(**kwargs) -> None:
    if "key" in kwargs and kwargs["key"] and kwargs["key"].strip():
        _enc_setting("twitch_key_enc", kwargs["key"].strip())
    for field in ("url", "audio", "audio_source", "audio_camera_id",
                  "audio_device", "audio_gain", "bitrate", "width", "height"):
        if field in kwargs and kwargs[field] is not None:
            _set_setting(f"twitch_{field}", str(kwargs[field]).strip())


# --------------------------------------------------------------------------- audio devices

def list_audio_devices() -> list[dict]:
    try:
        r = subprocess.run(
            ["pactl", "-f", "json", "list", "sources"],
            capture_output=True, text=True, timeout=5,
        )
        sources = json.loads(r.stdout) if r.stdout.strip().startswith("[") else []
        devices = []
        for s in sources:
            name = s.get("name", "")
            props = s.get("properties", {})
            media_class = props.get("media.class", "")
            # Solo fuentes de entrada (micrófonos), no monitores de salida
            if "Source" not in media_class and "Monitor" not in name:
                continue
            # Nombre legible
            pretty = (props.get("node.description", "")
                      or props.get("device.description", "")
                      or s.get("description", ""))
            if pretty in ("(null)", ""):
                pretty = name
            # Sufijo descriptivo
            if "monitor" in name.lower():
                label = f"{pretty} (monitor de salida)"
            else:
                label = f"{pretty} (micrófono)"
            state = s.get("state", "")
            devices.append({"name": name, "description": label, "state": state})
        return devices
    except Exception:
        pass
    # Fallback: parse short format
    try:
        r = subprocess.run(
            ["pactl", "list", "short", "sources"],
            capture_output=True, text=True, timeout=5,
        )
        devices = []
        for line in r.stdout.strip().splitlines():
            parts = line.split(None, 4)
            if len(parts) >= 5:
                devices.append({"name": parts[1], "description": parts[4], "state": "unknown"})
        return devices
    except Exception:
        return []


# --------------------------------------------------------------------------- camera IP lookup

def _get_camera_ip(cam_id: int) -> str | None:
    """Get camera IP from DB by ID."""
    with db.get_db() as conn:
        row = conn.execute("SELECT ip FROM cameras WHERE id=?", (cam_id,)).fetchone()
    return row["ip"] if row else None


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

    cmd = ["ffmpeg", "-hide_banner", "-loglevel", "info", "-nostdin"]

    # --- TODOS los inputs primero ---
    for s in streams:
        cmd += ["-rtsp_transport", "tcp", "-fflags", "nobuffer",
                "-analyzeduration", "1000000", "-probesize", "1000000",
                "-i", f"rtsp://{GO2RTC_RTSP}/{s}"]

    # --- AUDIO input (después de todos los video inputs) ---
    audio_idx = 0
    has_audio = False
    audio_source = cfg.get("audio_source", "none")

    if audio_source == "camera":
        cam_id = cfg.get("audio_camera_id", 0)
        cam_ip = _get_camera_ip(cam_id)
        if cam_ip:
            fifo_path = f"/tmp/cam_audio_{cam_id}.aac"
            cmd += ["-f", "aac", "-thread_queue_size", "1024",
                    "-i", fifo_path]
            audio_idx = n
            has_audio = True
            log.info("Audio desde cámara eseecloud: cam_id=%d ip=%s fifo=%s idx=%d",
                     cam_id, cam_ip, fifo_path, audio_idx)
        else:
            log.warning("Cámara id=%d no encontrada en DB", cam_id)

    elif audio_source == "device":
        device = cfg.get("audio_device", "default")
        cmd += ["-thread_queue_size", "512",
                "-f", "pulse", "-i", device]
        audio_idx = n
        has_audio = True
        log.info("Audio desde dispositivo: %s", device)

    elif audio_source == "file":
        audio_path = cfg.get("audio", "")
        if audio_path and Path(audio_path).exists():
            cmd += ["-stream_loop", "-1", "-i", audio_path]
            audio_idx = n
            has_audio = True
            log.info("Audio desde archivo: %s", audio_path)

    # --- FILTER_COMPLEX + MAP (después de TODOS los inputs) ---
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
    cmd += ["-filter_complex", ";".join(fc)]
    cmd += ["-map", vfilter]

    # Audio filters + encoding
    if has_audio:
        gain_db = cfg.get("audio_gain", "0")
        afilters = []
        if gain_db and gain_db != "0":
            afilters.append(f"volume={gain_db}dB")
        # Resample eseecloud audio (8kHz mono) to Twitch requirements (44100Hz stereo)
        if audio_source == "camera":
            afilters.append("aresample=44100")
            afilters.append("pan=stereo|c0=c0|c1=c0")
        if afilters:
            cmd += ["-af", ",".join(afilters)]
        cmd += ["-map", f"{audio_idx}:a",
                "-c:a", "aac", "-b:a", "128k", "-ar", "44100"]

    cmd += [
        "-c:v", "libx264", "-preset", "veryfast",
        "-b:v", cfg["bitrate"], "-maxrate", cfg["bitrate"],
        "-bufsize", cfg["bitrate"],
        "-pix_fmt", "yuv420p", "-g", "60",
    ]
    key = get_key()
    cmd += ["-f", "flv", f"{cfg['url']}/{key}"]
    return cmd


# --------------------------------------------------------------------------- control

def start(camera_ids: list[int], use_sub: bool = True) -> dict:
    global _proc, _audio_proc, _audio_fifo, _info, _logfile
    with LOCK:
        if _proc and _proc.poll() is None:
            return {"error": "Ya hay un stream en curso"}
        key = get_key()
        if not key:
            return {"error": "No hay clave de Twitch configurada"}
        cfg = get_config()

        # --- Start audio demuxer if camera source ---
        audio_source = cfg.get("audio_source", "none")
        if audio_source == "camera":
            cam_id = cfg.get("audio_camera_id", 0)
            cam_ip = _get_camera_ip(cam_id)
            if cam_ip:
                _audio_fifo = f"/tmp/cam_audio_{cam_id}.aac"
                try:
                    if os.path.exists(_audio_fifo):
                        os.unlink(_audio_fifo)
                    os.mkfifo(_audio_fifo)
                except OSError as e:
                    log.error("Error creando FIFO: %s", e)
                    return {"error": f"Error creando FIFO de audio: {e}"}

                demuxer_cmd = [sys.executable, str(ESEELOUD_AUDIO_SCRIPT),
                               cam_ip, "11"]
                log.info("Iniciando demuxer audio: %s", " ".join(demuxer_cmd))
                # Open FIFO with O_RDWR to avoid blocking on open
                # (write end won't block until read end is opened by ffmpeg)
                fifo_fd = os.open(_audio_fifo, os.O_RDWR)
                _audio_proc = subprocess.Popen(
                    demuxer_cmd,
                    stdout=os.fdopen(fifo_fd, "wb"),
                    stderr=subprocess.DEVNULL,
                    start_new_session=True,
                )
            else:
                log.warning("Cámara id=%d no encontrada, audio no disponible", cam_id)

        cmd = _build_cmd(camera_ids, use_sub, cfg)
        _logfile = Path(ROOT_DIR / "backend" / "data" / "twitch.log")
        f = open(_logfile, "ab")
        _proc = subprocess.Popen(cmd, stdout=f, stderr=subprocess.STDOUT,
                                 start_new_session=True)
        _info = {
            "cameras": camera_ids, "use_sub": use_sub,
            "cmd": " ".join(shlex.quote(c) for c in cmd),
            "started_at": time.strftime("%Y-%m-%d %H:%M:%S"), "pid": _proc.pid,
            "audio_source": audio_source,
        }
        log.info("Twitch stream iniciado pid=%s cameras=%s audio=%s",
                 _proc.pid, camera_ids, audio_source)
        log.info("CMD completo: %s", _info["cmd"])
        return {"started": True, **_info}


def stop() -> dict:
    global _proc, _audio_proc, _audio_fifo
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

        # --- Cleanup audio demuxer ---
        if _audio_proc:
            try:
                os.killpg(_audio_proc.pid, signal.SIGTERM)
            except ProcessLookupError:
                pass
            try:
                _audio_proc.wait(timeout=3)
            except subprocess.TimeoutExpired:
                try:
                    os.killpg(_audio_proc.pid, signal.SIGKILL)
                except ProcessLookupError:
                    pass
            _audio_proc = None

        if _audio_fifo:
            try:
                os.unlink(_audio_fifo)
            except OSError:
                pass
            _audio_fifo = None

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
