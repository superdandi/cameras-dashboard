"""Operaciones sobre cámaras: CRUD, estado, snapshot, PTZ."""
from __future__ import annotations

import base64
import json
import urllib.request
import urllib.error

from . import crypto
from .config import GO2RTC_API


# --------------------------------------------------------------------------- util HTTP

def _basic_header(user: str, pwd: str) -> dict:
    token = base64.b64encode(f"{user}:{pwd}".encode()).decode()
    return {"Authorization": f"Basic {token}"}


def _http_get(url: str, headers: dict | None = None, timeout: float = 6) -> tuple[int, bytes, dict]:
    req = urllib.request.Request(url, headers=headers or {})
    try:
        with urllib.request.urlopen(req, timeout=timeout) as r:
            return r.status, r.read(), dict(r.headers)
    except urllib.error.HTTPError as e:
        return e.code, b"", dict(e.headers)
    except Exception as e:  # noqa: BLE001
        return 0, str(e).encode(), {}


# --------------------------------------------------------------------------- helpers

def _url_auth(username: str, password: str) -> str:
    """user:pass para URLs go2rtc (eseecloud://user:pass@host/...)."""
    return f"{username}:{password}@"


def go2rtc_url(stream: str) -> str:
    return f"{GO2RTC_API}/api/frame.jpeg?src={stream}&width=640"


def camera_snapshot(ip: str, username: str, password: str, path: str = "/snapshot.jpg", timeout: float = 6):
    st, body, _ = _http_get(
        f"http://{ip}{path}", _basic_header(username, password), timeout=timeout
    )
    if st == 200 and body[:2] == b"\xff\xd8":
        return st, body
    # reintento con /snapshot
    if st != 200 or body[:2] != b"\xff\xd8":
        st, body, _ = _http_get(
            f"http://{ip}/snapshot", _basic_header(username, password), timeout=timeout
        )
    return st, body


def ptz_command(ip: str, username: str, password: str, act: str, speed: int = 40, chn: int = 1):
    url = f"http://{ip}/cgi-bin/hi3510/ptzctrl.cgi?-step=0&-act={act}&-speed={speed}&-chn={chn}"
    st, body, _ = _http_get(url, _basic_header(username, password), timeout=5)
    return st, body.decode(errors="replace").strip()


def preset_command(ip: str, username: str, password: str, act: str, number: int, status: int | None = None):
    url = f"http://{ip}/cgi-bin/hi3510/preset.cgi?-act={act}&-number={number}&-chn=1"
    if status is not None:
        url += f"&-status={status}"
    st, body, _ = _http_get(url, _basic_header(username, password), timeout=5)
    return st, body.decode(errors="replace").strip()


def check_go2rtc() -> dict:
    st, body, _ = _http_get(f"{GO2RTC_API}/api/streams", timeout=3)
    if st == 200:
        try:
            streams = json.loads(body)
            return {"ok": True, "streams": list(streams.keys())}
        except Exception:  # noqa: BLE001
            return {"ok": True, "streams": []}
    return {"ok": False, "streams": []}


def check_stream(stream: str, width: int = 320) -> dict:
    st, body, _ = _http_get(f"{GO2RTC_API}/api/frame.jpeg?src={stream}&width={width}", timeout=8)
    ok = st == 200 and body[:2] == b"\xff\xd8"
    return {"stream": stream, "ok": ok, "status": st, "bytes": len(body)}


# --------------------------------------------------------------------------- serialización

def row_to_dict(row, include_secrets: bool = False) -> dict:
    d = dict(row)
    if not include_secrets:
        d.pop("username", None)
        d.pop("password", None)
    return d
