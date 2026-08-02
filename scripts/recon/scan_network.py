#!/usr/bin/env python3
"""
scan_network.py — Reconocimiento de red para cámaras ATSG / EseeCloud (dvr163).

Descubre hosts en la LAN y detecta cámaras EseeCloud/plataformas similares:
  - TCP connect scan de puertos típicos (80, 443, 554, 8000, 8899, 34567, 5000)
  - Probes HTTP de plataforma EseeCloud (snapshot, livestream, tmpfs/auto.jpg)
  - Descubrimiento ONVIF (WS-Discovery, UDP 3702)

Uso:
  python3 scan_network.py                      # escanea <LAN> (por defecto)
  python3 scan_network.py <LAN>       # red explícita
  python3 scan_network.py --ports 80,554,34567 # puertos custom

Requiere: solo Python 3 stdlib. No requiere root (TCP connect + UDP).
"""
import argparse
import base64
import concurrent.futures as cf
import ipaddress
import json
import socket
import struct
import sys
import time

CAMD_PORTS = [80, 443, 554, 8000, 8080, 8899, 34567, 5000, 3777, 8554]
TIMEOUT = 0.6
ONVIF_GROUP = "239.255.255.250"
ONVIF_PORT = 3702

# auth candidates probadas contra el web server (usuario de la app es 'admin')
AUTH_CANDIDATES = [
    ("admin", ""),
    ("admin", "admin"),
    ("admin", "123456"),
    ("admin", "12345"),
]

# paths propios de la plataforma EseeCloud/dvr163 y clones XMEye/icsee
ESEE_PROBES = [
    "/tmpfs/auto.jpg",
    "/snapshot.jpg",
    "/snapshot",
    "/livestream/12",
    "/livestream/11",
    "/cgi-bin/snapshot.cgi?chn=0&u=admin&p=",
    "/onvif/device_service",
    "/cgi-bin/magicbox.cgi?action=get_systeminfo",
]


def b64(user, pwd):
    return base64.b64encode(f"{user}:{pwd}".encode()).decode()


def tcp_scan(ip, ports):
    """Devuelve lista de puertos abiertos (TCP connect)."""
    open_ports = []
    for port in ports:
        try:
            with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
                s.settimeout(TIMEOUT)
                if s.connect_ex((ip, port)) == 0:
                    open_ports.append(port)
        except OSError:
            pass
    return open_ports


def http_probe(ip, port, path, auth_header=None, read_bytes=0):
    """GET simple; devuelve (status, content_type, header_server, body) o None."""
    try:
        with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
            s.settimeout(2.0)
            s.connect((ip, port))
            req = f"GET {path} HTTP/1.1\r\nHost: {ip}:{port}\r\nConnection: close\r\n"
            if auth_header:
                req += f"Authorization: {auth_header}\r\n"
            req += "\r\n"
            s.sendall(req.encode())
            data = s.recv(4096)
            if not data:
                return None
            head, _, body = data.partition(b"\r\n\r\n")
            lines = head.decode("latin1", "replace").split("\r\n")
            status = lines[0] if lines else "?"
            ct = ""
            for ln in lines:
                if ln.lower().startswith("content-type:"):
                    ct = ln.split(":", 1)[1].strip()
                    break
            body_len = len(body)
            # leer un poco más si el endpoint es video (status 200 y no html)
            if read_bytes and body_len < read_bytes:
                try:
                    extra = s.recv(read_bytes - body_len)
                    body += extra
                except OSError:
                    pass
            return status, ct, body
    except OSError:
        return None


def classify_camera(ip, ports):
    """Intenta identificar si el host es cámara EseeCloud / ONVIF."""
    result = {"ip": ip, "ports": ports, "esee": False, "onvif": False, "hits": []}

    if 80 in ports or 8080 in ports:
        port = 80 if 80 in ports else 8080
        for user, pwd in AUTH_CANDIDATES:
            auth = f"Basic {b64(user, pwd)}"
            for path in ESEE_PROBES:
                r = http_probe(ip, port, path, auth_header=auth, read_bytes=64)
                if r is None:
                    continue
                status, ct, body = r
                # livestream devuelve datos de video (status 200 + no html)
                is_video = ("video" in ct.lower() or "octet-stream" in ct.lower()
                            or ("200" in status and b"<" not in body[:4]))
                if "200" in status and ("image" in ct.lower() or "jpeg" in ct.lower()):
                    result["hits"].append({"path": path, "status": status, "ct": ct, "tipo": "snapshot"})
                if is_video:
                    result["hits"].append({"path": path, "status": status, "ct": ct, "tipo": "video"})
                if path == "/onvif/device_service" and "200" in status:
                    result["onvif"] = True
            # si ya detectamos snapshot o video de plataforma, marcamos esee
            if any(h["tipo"] in ("snapshot", "video") for h in result["hits"]):
                result["esee"] = True
                break

    # ONVIF puede estar en 8899/5000/8000 sin responder en 80
    for p in ports:
        if p in (8899, 5000, 8000):
            r = http_probe(ip, p, "/onvif/device_service", read_bytes=0)
            if r and "200" in r[0]:
                result["onvif"] = True

    return result


def onvif_discover(timeout=3.0):
    """WS-Discovery (ONVIF) — UDP multicast. Devuelve lista de (uuid, xaddr)."""
    found = []
    msg = (
        '<?xml version="1.0" encoding="utf-8"?>'
        '<e:Envelope xmlns:e="http://www.w3.org/2003/05/soap-envelope" '
        'xmlns:w="http://schemas.xmlsoap.org/ws/2004/08/addressing" '
        'xmlns:d="http://schemas.xmlsoap.org/ws/2005/04/discovery" '
        'xmlns:dn="http://www.onvif.org/ver10/network/wsdl">'
        '<e:Header><w:MessageID>uuid:recon-' + str(time.time()) + '</w:MessageID>'
        '<w:To>urn:schemas-xmlsoap-org:ws:2005:04:discovery</w:To>'
        '<w:Action>http://schemas.xmlsoap.org/ws/2005/04/discovery/Probe</w:Action></e:Header>'
        '<e:Body><d:Probe><d:Types>dn:NetworkVideoTransmitter</d:Types></d:Probe></e:Body></e:Envelope>'
    ).encode()
    try:
        s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        s.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
        s.settimeout(timeout)
        s.sendto(msg, (ONVIF_GROUP, ONVIF_PORT))
        while True:
            try:
                data, _ = s.recvfrom(8192)
                txt = data.decode("utf-8", "replace")
                if "http://" in txt:
                    import re
                    m = re.search(r"<wsa:XAddrs>([^<]+)</wsa:XAddrs>", txt) or \
                        re.search(r"<d:XAddrs>([^<]+)</d:XAddrs>", txt)
                    if m:
                        found.append(m.group(1))
            except socket.timeout:
                break
    except OSError:
        pass
    return found


def scan_network(network, ports):
    net = ipaddress.ip_network(network, strict=False)
    hosts = [str(h) for h in net.hosts()]
    print(f"Escaneando {len(hosts)} hosts en {network} (puertos: {ports}) ...", flush=True)
    results = []

    def worker(ip):
        ports_open = tcp_scan(ip, ports)
        if ports_open:
            return classify_camera(ip, ports_open)
        return None

    with cf.ThreadPoolExecutor(max_workers=64) as ex:
        futures = {ex.submit(worker, ip): ip for ip in hosts}
        done = 0
        for fut in cf.as_completed(futures):
            done += 1
            r = fut.result()
            if r:
                results.append(r)
            if done % 50 == 0:
                print(f"  ... {done}/{len(hosts)}", flush=True)

    # ordenar: cámaras primero
    results.sort(key=lambda r: (not r["esee"], not r["onvif"], ipaddress.ip_address(r["ip"])))
    return results


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("network", nargs="?", default="<LAN>")
    ap.add_argument("--ports", default=",".join(str(p) for p in CAMD_PORTS))
    args = ap.parse_args()
    ports = [int(p) for p in args.ports.split(",") if p.strip()]

    results = scan_network(args.network, ports)

    print("\n===== ONVIF WS-Discovery =====")
    onvif = onvif_discover()
    for x in onvif:
        print("  ONVIF:", x)
    if not onvif:
        print("  (nada detectado por multicast)")

    print("\n===== HOSTS CON PUERTOS ABIERTOS =====")
    if not results:
        print("  (ninguno)")
    for r in results:
        badge = "CAMARA" if r["esee"] else ("onvif?" if r["onvif"] else "host")
        print(f"  [{badge:6}] {r['ip']:<16} puertos={r['ports']}")
        for h in r["hits"]:
            print(f"          - {h['path']}  -> {h['status']}  {h['ct']}")

    out = "scan_results.json"
    with open(out, "w") as f:
        json.dump({"network": args.network, "cameras": [
            r for r in results if r["esee"] or r["onvif"]
        ], "hosts": results, "onvif": onvif}, f, indent=2)
    print(f"\nGuardado en {out}")


if __name__ == "__main__":
    main()
