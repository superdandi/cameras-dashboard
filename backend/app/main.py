"""API FastAPI del dashboard de cámaras.

Sirve el frontend estático (frontend/dist) y la API /api/*.
"""
from __future__ import annotations

import asyncio
import logging
import re
import subprocess
from pathlib import Path

from fastapi import FastAPI, HTTPException, Depends, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import Response, FileResponse, StreamingResponse
from pydantic import BaseModel, Field

from . import cameras, crypto
from .config import ADMIN_TOKEN, ROOT_DIR
from .db import get_db, init_db
from .motion import motion_loop
from .stream_monitor import stream_monitor_loop
from . import twitch as twitch_mgr
from . import camera_audio

FRONTEND_DIST = ROOT_DIR / "frontend" / "dist"

app = FastAPI(title="Cameras Dashboard API", version="0.3.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # LAN; endurecer con reverse proxy / token
    allow_methods=["*"],
    allow_headers=["*"],
)


# --------------------------------------------------------------------------- auth opcional

def require_token(request: Request) -> None:
    if not ADMIN_TOKEN:
        return
    auth = request.headers.get("Authorization", "")
    if auth != f"Bearer {ADMIN_TOKEN}":
        raise HTTPException(401, "Token inválido")


# --------------------------------------------------------------------------- schemas

class CameraIn(BaseModel):
    name: str
    location: str = ""
    ip: str
    mac: str = ""
    model: str = ""
    sn: str = ""
    username: str = "admin"
    password: str = ""
    main_stream: str = ""
    sub_stream: str = ""
    snapshot: str = ""
    has_ptz: bool = True
    enabled: bool = True
    notes: str = ""


class CameraPatch(BaseModel):
    name: str | None = None
    location: str | None = None
    ip: str | None = None
    mac: str | None = None
    model: str | None = None
    sn: str | None = None
    username: str | None = None
    password: str | None = None
    main_stream: str | None = None
    sub_stream: str | None = None
    snapshot: str | None = None
    has_ptz: bool | None = None
    enabled: bool | None = None
    notes: str | None = None


class PtzCmd(BaseModel):
    act: str
    speed: int = 40
    duration_ms: int = 0


class PresetCmd(BaseModel):
    act: str          # set | goto | clear
    number: int
    status: int | None = None


# --------------------------------------------------------------------------- health / status

@app.get("/api/health")
def health(_: None = Depends(require_token)):
    g2 = cameras.check_go2rtc()
    return {"status": "ok", "go2rtc": g2}


@app.get("/api/status")
def status(_: None = Depends(require_token)):
    g2 = cameras.check_go2rtc()
    health = cameras.stream_health_map()
    out = []
    with get_db() as db:
        rows = db.execute(
            "SELECT id, name, ip, main_stream, sub_stream, enabled FROM cameras ORDER BY display_order, id"
        ).fetchall()
        states = {}
        for r in db.execute("SELECT camera_id, live_since, last_cut_at FROM camera_stream_state").fetchall():
            states[r["camera_id"]] = {"live_since": r["live_since"], "last_cut_at": r["last_cut_at"]}
    for r in rows:
        stream = r["sub_stream"] or r["main_stream"]
        st = health.get(stream) or {"ok": False, "status": 0, "bytes": 0}
        if stream and not st["ok"]:
            st = cameras.check_stream(stream)
        cam_state = states.get(r["id"], {"live_since": 0, "last_cut_at": 0})
        out.append({
            "id": r["id"], "name": r["name"], "ip": r["ip"],
            "enabled": bool(r["enabled"]), "stream": stream, **st,
            "live_since": cam_state["live_since"], "last_cut_at": cam_state["last_cut_at"],
        })
    return {"go2rtc": g2, "cameras": out}


# --------------------------------------------------------------------------- network identity

def _run(cmd: list[str]) -> str:
    try:
        r = subprocess.run(cmd, capture_output=True, text=True, timeout=3)
        return r.stdout.strip()
    except Exception:
        return ""


def _parse_ssid() -> str:
    out = _run(["nmcli", "-t", "-f", "NAME,TYPE,DEVICE,STATE", "connection", "show", "--active"])
    for line in out.splitlines():
        parts = line.split(":")
        if len(parts) >= 2 and "802-11-wireless" in parts[1]:
            return parts[0]
    out2 = _run(["nmcli", "-t", "-f", "ACTIVE,SSID", "dev", "wifi"])
    for line in out2.splitlines():
        if line.startswith("sí:") or line.startswith("yes:"):
            return line.split(":", 1)[1]
    return ""


def _parse_signal() -> int:
    out = _run(["nmcli", "-t", "-f", "ACTIVE,SIGNAL", "dev", "wifi"])
    for line in out.splitlines():
        if line.startswith("sí:") or line.startswith("yes:"):
            try:
                return int(line.split(":")[1])
            except (IndexError, ValueError):
                pass
    return 0


def _parse_gateway() -> str:
    out = _run(["ip", "route", "show", "default"])
    m = re.search(r"via (\d+\.\d+\.\d+\.\d+)", out)
    return m.group(1) if m else ""


def _parse_host_ip() -> str:
    out = _run(["ip", "-4", "-o", "addr", "show"])
    for line in out.splitlines():
        if "wlan0" in line or "eth0" in line or "enp4s0" in line:
            m = re.search(r"inet (\d+\.\d+\.\d+\.\d+)/", line)
            if m:
                return m.group(1)
    m = re.search(r"inet (\d+\.\d+\.\d+\.\d+)/", out)
    return m.group(1) if m else ""


@app.get("/api/network")
def network_info(_: None = Depends(require_token)):
    gw = _parse_gateway()
    return {
        "ssid": _parse_ssid(),
        "signal": _parse_signal(),
        "gateway": gw,
        "host_ip": _parse_host_ip(),
        "routers": [gw] if gw else [],
    }


# --------------------------------------------------------------------------- cameras CRUD

@app.get("/api/cameras")
def list_cameras(_: None = Depends(require_token)):
    with get_db() as db:
        rows = db.execute("SELECT * FROM cameras ORDER BY display_order, id").fetchall()
    return [cameras.row_to_dict(r) for r in rows]


class ReorderIn(BaseModel):
    order: list[int]


@app.patch("/api/cameras/reorder")
def reorder_cameras(body: ReorderIn, _: None = Depends(require_token)):
    with get_db() as db:
        for i, cid in enumerate(body.order):
            db.execute(
                "UPDATE cameras SET display_order=?, updated_at=datetime('now') WHERE id=?",
                (i, cid),
            )
    return {"ok": True}


@app.get("/api/cameras/{cid}")
def get_camera(cid: int, _: None = Depends(require_token)):
    with get_db() as db:
        row = db.execute("SELECT * FROM cameras WHERE id=?", (cid,)).fetchone()
    if not row:
        raise HTTPException(404, "Cámara no encontrada")
    return cameras.row_to_dict(row)


@app.post("/api/cameras")
def create_camera(body: CameraIn, _: None = Depends(require_token)):
    with get_db() as db:
        cur = db.execute(
            """INSERT INTO cameras
               (name, location, ip, mac, model, sn, username, password,
                main_stream, sub_stream, snapshot, has_ptz, enabled, notes)
               VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)""",
            (body.name, body.location, body.ip, body.mac, body.model, body.sn,
             crypto.encrypt(body.username), crypto.encrypt(body.password),
             body.main_stream, body.sub_stream, body.snapshot,
             int(body.has_ptz), int(body.enabled), body.notes),
        )
        cid = cur.lastrowid
    return {"id": cid}


@app.put("/api/cameras/{cid}")
def update_camera(cid: int, body: CameraPatch, _: None = Depends(require_token)):
    fields, vals = [], []
    for k, v in body.model_dump(exclude_unset=True).items():
        if k in ("username", "password"):
            v = crypto.encrypt(v)
        fields.append(f"{k}=?")
        vals.append(v)
    if not fields:
        raise HTTPException(400, "Sin campos")
    vals.append(cid)
    with get_db() as db:
        cur = db.execute(
            f"UPDATE cameras SET {', '.join(fields)}, updated_at=datetime('now') WHERE id=?",
            vals,
        )
        if cur.rowcount == 0:
            raise HTTPException(404, "Cámara no encontrada")
    return {"id": cid}


@app.delete("/api/cameras/{cid}")
def delete_camera(cid: int, _: None = Depends(require_token)):
    with get_db() as db:
        cur = db.execute("DELETE FROM cameras WHERE id=?", (cid,))
        if cur.rowcount == 0:
            raise HTTPException(404, "Cámara no encontrada")
    return {"deleted": cid}


# --------------------------------------------------------------------------- snapshot / PTZ

def _load_camera(cid: int):
    with get_db() as db:
        row = db.execute("SELECT * FROM cameras WHERE id=?", (cid,)).fetchone()
    if not row:
        raise HTTPException(404, "Cámara no encontrada")
    return row


@app.get("/api/cameras/{cid}/snapshot")
def camera_snapshot(cid: int, _: None = Depends(require_token)):
    row = _load_camera(cid)
    user = crypto.decrypt(row["username"]) or "admin"
    pwd = crypto.decrypt(row["password"])
    st, body = cameras.camera_snapshot(row["ip"], user, pwd)
    if st != 200 or body[:2] != b"\xff\xd8":
        raise HTTPException(502, f"Snapshot fallido ({st})")
    return Response(content=body, media_type="image/jpeg",
                    headers={"Cache-Control": "no-store"})


# --------------------------------------------------------------------------- camera audio (streaming)

@app.get("/api/cameras/{cid}/audio")
def camera_audio_stream(cid: int):
    """Stream live MP3 audio from camera (chunked, for <audio> elements)."""
    with get_db() as conn:
        row = conn.execute("SELECT ip FROM cameras WHERE id=?", (cid,)).fetchone()
    if not row:
        raise HTTPException(404, "Cámara no encontrada")
    ip = row["ip"]

    def generate():
        yield from camera_audio.manager.get_audio_iter(cid, ip)

    return StreamingResponse(
        generate(),
        media_type="audio/mpeg",
        headers={"Cache-Control": "no-cache, no-store", "X-Accel-Buffering": "no"},
    )


@app.post("/api/cameras/{cid}/ptz")
def camera_ptz(cid: int, body: PtzCmd, _: None = Depends(require_token)):
    row = _load_camera(cid)
    if not row["has_ptz"]:
        raise HTTPException(400, "Cámara sin PTZ")
    user = crypto.decrypt(row["username"]) or "admin"
    pwd = crypto.decrypt(row["password"])
    st, resp = cameras.ptz_command(row["ip"], user, pwd, body.act, body.speed)
    if body.duration_ms > 0:
        import time
        time.sleep(body.duration_ms / 1000)
        cameras.ptz_command(row["ip"], user, pwd, "stop", body.speed)
    return {"status": st, "response": resp}


@app.post("/api/cameras/{cid}/preset")
def camera_preset(cid: int, body: PresetCmd, _: None = Depends(require_token)):
    row = _load_camera(cid)
    user = crypto.decrypt(row["username"]) or "admin"
    pwd = crypto.decrypt(row["password"])
    st, resp = cameras.preset_command(row["ip"], user, pwd, body.act, body.number, body.status)
    return {"status": st, "response": resp}


# --------------------------------------------------------------------------- events (Fase 5)

@app.get("/api/events")
def list_events(limit: int = 50, camera_id: int | None = None, _: None = Depends(require_token)):
    with get_db() as db:
        if camera_id:
            rows = db.execute(
                """SELECT e.id, e.camera_id, c.name AS camera_name, e.ts, e.type, e.payload
                   FROM events e LEFT JOIN cameras c ON c.id=e.camera_id
                   WHERE e.camera_id=? ORDER BY e.id DESC LIMIT ?""",
                (camera_id, limit),
            ).fetchall()
        else:
            rows = db.execute(
                """SELECT e.id, e.camera_id, c.name AS camera_name, e.ts, e.type, e.payload
                   FROM events e LEFT JOIN cameras c ON c.id=e.camera_id
                   ORDER BY e.id DESC LIMIT ?""",
                (limit,),
            ).fetchall()
    return [dict(r) for r in rows]


@app.delete("/api/events")
def clear_events(_: None = Depends(require_token)):
    with get_db() as db:
        db.execute("DELETE FROM events")
    return {"deleted": True}


# --------------------------------------------------------------------------- twitch (Fase 6)

class TwitchStart(BaseModel):
    camera_ids: list[int]
    use_sub: bool = True


class TwitchConfig(BaseModel):
    key: str | None = None
    url: str | None = None
    audio: str | None = None
    audio_source: str | None = None
    audio_camera_id: int | None = None
    audio_device: str | None = None
    audio_gain: str | None = None
    bitrate: str | None = None
    width: int | None = None
    height: int | None = None


@app.get("/api/twitch/status")
def twitch_status(_: None = Depends(require_token)):
    return twitch_mgr.status()


@app.post("/api/twitch/start")
def twitch_start(body: TwitchStart, _: None = Depends(require_token)):
    if not body.camera_ids:
        raise HTTPException(400, "Selecciona al menos una cámara")
    res = twitch_mgr.start(body.camera_ids, body.use_sub)
    if "error" in res:
        raise HTTPException(409, res["error"])
    return res


@app.post("/api/twitch/stop")
def twitch_stop(_: None = Depends(require_token)):
    return twitch_mgr.stop()


@app.get("/api/twitch/config")
def twitch_get_config(_: None = Depends(require_token)):
    return twitch_mgr.get_config()


@app.put("/api/twitch/config")
def twitch_set_config(body: TwitchConfig, _: None = Depends(require_token)):
    twitch_mgr.save_config(
        key=body.key, url=body.url, audio=body.audio,
        audio_source=body.audio_source, audio_camera_id=body.audio_camera_id,
        audio_device=body.audio_device, audio_gain=body.audio_gain,
        bitrate=body.bitrate, width=body.width, height=body.height,
    )
    cfg = twitch_mgr.get_config()
    cfg.pop("key_set", None)
    return cfg


@app.get("/api/twitch/audio-devices")
def twitch_audio_devices(_: None = Depends(require_token)):
    return {"devices": twitch_mgr.list_audio_devices()}


# --------------------------------------------------------------------------- settings / skins

class SettingIn(BaseModel):
    value: str = ""


@app.get("/api/settings")
def get_settings(_: None = Depends(require_token)):
    with get_db() as db:
        rows = db.execute("SELECT key, value FROM settings").fetchall()
    return {r["key"]: r["value"] for r in rows}


@app.put("/api/settings/{key}")
def set_setting(key: str, body: SettingIn, _: None = Depends(require_token)):
    with get_db() as db:
        db.execute(
            "INSERT INTO settings (key, value, updated_at) VALUES (?,?,datetime('now')) "
            "ON CONFLICT(key) DO UPDATE SET value=excluded.value, updated_at=datetime('now')",
            (key, body.value),
        )
    return {"key": key, "value": body.value}


# --------------------------------------------------------------------------- frontend estático

@app.get("/")
def index():
    file = FRONTEND_DIST / "index.html"
    if file.exists():
        return FileResponse(file)
    return HTML_PLACEHOLDER


@app.get("/{path:path}")
def spa(path: str):
    f = FRONTEND_DIST / path
    if f.is_file():
        return FileResponse(f)
    if FRONTEND_DIST.joinpath("index.html").exists():
        return FileResponse(FRONTEND_DIST / "index.html")
    raise HTTPException(404, "Frontend no construido (frontend/dist)")


HTML_PLACEHOLDER = Response(
    "<html><body style='font-family:sans-serif;background:#0b1220;color:#e2e8f0;padding:2rem'>"
    "<h1>Cameras Dashboard</h1><p>Backend OK. Construye el frontend: <code>cd frontend "
    "&& npm install && npm run build</code> y reinicia el servicio.</p></body></html>",
    media_type="text/html",
)


# --------------------------------------------------------------------------- arranque

_motion_task: asyncio.Task | None = None
_stream_monitor_task: asyncio.Task | None = None


@app.on_event("startup")
def startup():
    init_db()
    global _motion_task, _stream_monitor_task
    if _motion_task is None:
        _motion_task = asyncio.create_task(motion_loop())
    if _stream_monitor_task is None:
        _stream_monitor_task = asyncio.create_task(stream_monitor_loop())


@app.on_event("shutdown")
def shutdown():
    global _motion_task, _stream_monitor_task
    if _motion_task:
        _motion_task.cancel()
    if _stream_monitor_task:
        _stream_monitor_task.cancel()
    camera_audio.manager.shutdown_all()
