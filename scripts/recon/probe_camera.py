#!/usr/bin/env python3
"""
probe_camera.py — Profundiza en una cámara EseeCloud detectada.

Por cámara:
  - Header de servidor HTTP y páginas básicas
  - Valida snapshots (magic bytes JPEG) y descarga una prueba
  - Identifica codec/resolución del stream (ffprobe)
  - Sondea ONVIF (/onvif/device_service) con SOAP GetDeviceInformation
  - Sondea CGI estilo XMEye (magicbox, systeminfo, PTZ)

Uso:
  python3 probe_camera.py <CAM_IP>
"""
import base64
import json
import socket
import subprocess
import sys
import urllib.request
import urllib.error

AUTH_CANDIDATES = [("admin", ""), ("admin", "admin"), ("admin", "123456"), ("admin", "12345")]

def b64(u, p):
    return base64.b64encode(f"{u}:{p}".encode()).decode()

def http_get(ip, path, auth=None, port=80, timeout=3, max_bytes=200000):
    url = f"http://{ip}:{port}{path}"
    req = urllib.request.Request(url, method="GET")
    if auth:
        req.add_header("Authorization", "Basic " + b64(*auth))
    try:
        with urllib.request.urlopen(req, timeout=timeout) as r:
            head = dict(r.headers)
            body = r.read(max_bytes)
            return r.status, head, body
    except urllib.error.HTTPError as e:
        return e.code, dict(e.headers), b""
    except Exception as e:
        return None, {}, b""

def ffprobe_stream(url, auth=None):
    """Devuelve dict con codecs/resolución o None."""
    cmd = ["ffprobe", "-v", "error", "-print_format", "json", "-show_streams",
           "-show_format", "-i", url]
    if auth:
        hdr = "Authorization: Basic " + b64(*auth)
        cmd = ["ffprobe", "-v", "error", "-headers", hdr,
               "-print_format", "json", "-show_streams", "-show_format", "-i", url]
    try:
        out = subprocess.run(cmd, capture_output=True, timeout=15, text=True)
        if out.returncode != 0:
            return {"error": out.stderr.strip()[:200]}
        return json.loads(out.stdout)
    except Exception as e:
        return {"error": str(e)}

def onvif_get_device_information(ip, port=80):
    """SOAP GetDeviceInformation a /onvif/device_service."""
    body = (
        '<?xml version="1.0" encoding="UTF-8"?>'
        '<s:Envelope xmlns:s="http://www.w3.org/2003/05/soap-envelope">'
        '<s:Body><GetDeviceInformation '
        'xmlns="http://www.onvif.org/ver10/device/wsdl"/></s:Body></s:Envelope>'
    )
    req = urllib.request.Request(f"http://{ip}:{port}/onvif/device_service",
                                 data=body.encode(), method="POST")
    req.add_header("Content-Type", "application/soap+xml; charset=utf-8")
    try:
        with urllib.request.urlopen(req, timeout=3) as r:
            return r.status, r.read(4000).decode("utf-8", "replace")
    except urllib.error.HTTPError as e:
        return e.code, e.read(2000).decode("utf-8", "replace")
    except Exception as e:
        return None, str(e)

def main(ip):
    print(f"===== PROBE CAMERA {ip} =====")
    info = {"ip": ip}

    # 1. Server header + página raíz
    st, head, body = http_get(ip, "/")
    print(f"\n[HTTP /] status={st}")
    if head:
        print(f"  Server: {head.get('Server','?')}")
        print(f"  WWW-Authenticate: {head.get('WWW-Authenticate','-')}")
    if body and len(body) < 2000:
        print(f"  Body: {body[:300]!r}")

    # 2. autenticación que funciona en livestream + snapshot
    good_auth = None
    for cand in AUTH_CANDIDATES:
        st, _, b = http_get(ip, "/snapshot?r=0.5&auth=" + b64(*cand), auth=cand, max_bytes=32)
        if st == 200:
            good_auth = cand
            break
    print(f"\n[Auth OK] user={good_auth[0]!r} pass={good_auth[1]!r}")
    info["auth_ok"] = list(good_auth)

    # 3. snapshot JPEG real
    st, head, body = http_get(ip, "/snapshot?r=0.5&auth=" + b64(*good_auth),
                              auth=good_auth, max_bytes=5000)
    magic = body[:2].hex() if body else ""
    jpeg = magic == "ffd8"
    print(f"[Snapshot] status={st} bytes={len(body)} magic={magic} jpeg={jpeg}")
    if jpeg:
        fn = f"probe_{ip.replace('.','_')}.jpg"
        with open(fn, "wb") as f:
            f.write(body)
        print(f"  guardado: {fn}")
    info["snapshot_jpeg"] = jpeg

    # 4. endpoints extra de plataforma
    for path in ["/tmpfs/auto.jpg", "/snapshot.jpg", "/cgi-bin/snapshot.cgi?chn=0&u=admin&p="]:
        st, _, b = http_get(ip, path, auth=good_auth, max_bytes=16)
        print(f"[{path}] -> {st} (magic={b[:2].hex() if b else ''})")

    # 5. ONVIF device_service
    st, resp = onvif_get_device_information(ip)
    has_onvif = st == 200 and "GetDeviceInformationResponse" in resp
    print(f"\n[ONVIF /onvif/device_service] status={st} onvif={has_onvif}")
    if st == 200:
        print("  " + resp[:400].replace("\n", " "))
    info["onvif"] = has_onvif

    # 6. CGI sistema (XMEye/icsee style)
    for path in ["/cgi-bin/magicbox.cgi?action=get_systeminfo",
                 "/cgi-bin/magicbox.cgi?action=get_serial_no",
                 "/proc/ver", "/version"]:
        st, _, b = http_get(ip, path, auth=good_auth, max_bytes=2000)
        if st == 200 and b:
            print(f"[{path}] -> {st} :: {b[:200]!r}")
            if "firmware" not in info and b and len(b) < 2000:
                info["cgi_systeminfo"] = b[:500].decode("utf-8", "replace")

    # 7. ffprobe streams HD/SD
    for lbl, p in [("HD /livestream/11", "/livestream/11"), ("SD /livestream/12", "/livestream/12")]:
        url = f"http://{ip}:80{p}"
        print(f"\n[ffprobe {lbl}] {url}")
        j = ffprobe_stream(url, auth=good_auth)
        if "error" in j:
            print("  error:", j["error"])
        else:
            for s in j.get("streams", []):
                if s.get("codec_type") == "video":
                    print(f"  video codec={s.get('codec_name')} {s.get('width')}x{s.get('height')} fps~{s.get('avg_frame_rate')}")
                if s.get("codec_type") == "audio":
                    print(f"  audio codec={s.get('codec_name')} {s.get('sample_rate')}Hz ch={s.get('channels')}")
            fmt = j.get("format", {})
            if fmt.get("format_long_name"):
                print(f"  contenedor: {fmt['format_long_name']}")

    # 8. puertos adicionales
    for p in [554, 34567, 8899, 5000]:
        with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
            s.settimeout(1)
            if s.connect_ex((ip, p)) == 0:
                print(f"[puerto {p}] ABIERTO")

    with open(f"probe_{ip.replace('.','_')}.json", "w") as f:
        json.dump(info, f, indent=2)


if __name__ == "__main__":
    if len(sys.argv) < 2:
        print(__doc__)
        sys.exit(1)
    main(sys.argv[1])
