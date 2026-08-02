#!/usr/bin/env python3
"""ptz_probe.py — descubre endpoints de control PTZ/audio en cámara EseeCloud."""
import base64, json, sys, urllib.request, urllib.error

IP = sys.argv[1] if len(sys.argv) > 1 else "<CAM_IP>"
AUTH = ("admin", "")
HDR = {"Authorization": "Basic " + base64.b64encode(b"admin:").decode()}

PATHS = [
    # control PTZ REAL confirmado (prefijo HiChip, params con '-')
    "/cgi-bin/hi3510/ptzctrl.cgi?-step=0&-act=stop&-speed=40&-chn=1",
    "/cgi-bin/hi3510/preset.cgi?-act=goto&-number=1&-chn=1",
    # control PTZ (estilos variados)
    "/ptz", "/ptz.cgi", "/cgi-bin/ptz.cgi", "/cgi-bin/ptz",
    "/control/ptz", "/control/ptz.cgi", "/command/ptz",
    "/command/ptzf.cgi", "/cgi-bin/ptzf.cgi", "/cmd/ptz",
    "/api/ptz", "/ptz_control", "/ptzControl", "/ptzcontrol",
    "/setptz", "/set/ptz", "/ptz/control",
    # otros control
    "/command", "/cgi-bin/command.cgi", "/cgi-bin/control.cgi",
    "/control", "/api", "/device", "/set", "/config",
    "/cgi-bin", "/cgi-bin/", "/status", "/info",
    # audio / talk
    "/talk", "/audio", "/api/talk", "/cgi-bin/talk.cgi",
    # alarm / movimiento
    "/alarm", "/api/alarm", "/motion", "/api/motion",
    # system
    "/system", "/api/system", "/systeminfo", "/deviceinfo",
    "/version", "/proc/version", "/html", "/web",
]

def get(path):
    try:
        req = urllib.request.Request(f"http://{IP}{path}", headers=HDR)
        with urllib.request.urlopen(req, timeout=2) as r:
            b = r.read(300)
            return r.status, dict(r.headers).get("Content-Type", "?"), b
    except urllib.error.HTTPError as e:
        return e.code, dict(e.headers).get("Content-Type", "?"), b""
    except Exception:
        return None, "?", b""

print(f"== Endpoint probe {IP} ==")
for p in PATHS:
    st, ct, b = get(p)
    flag = ""
    if st not in (404, None):
        flag = "  <== no-404"
        if b and b[:2].hex() == "ffd8":
            flag += " [JPEG]"
        elif b:
            flag += " :: " + repr(b[:120])
    print(f"  {st}  {ct:<28} {p}{flag}")
