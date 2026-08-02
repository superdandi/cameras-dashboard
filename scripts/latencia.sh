#!/usr/bin/env bash
# Mide el "refresco" real de los streams (proxy de latencia) para comparar
# configuraciones. Ver docs/PLAN-LATENCIA.md.
# Uso: ./scripts/latencia.sh [segundos]   (por defecto 5)
set -u
G2R="http://127.0.0.1:1984"
W=${1:-5}

echo "== calentando ingesta (frame grab de las 4 cámaras) =="
for s in cam01 cam01sd cam02 cam02sd cam03 cam03sd cam04 cam04sd; do
  curl -s -m 4 "$G2R/api/frame.jpeg?src=$s" -o /dev/null
done
sleep 2

echo "== fps de ingesta (go2rtc) por fuente (${W}s) =="
python3 - "$G2R" "$W" <<'EOF'
import json, sys, time, urllib.request
base, w = sys.argv[1], int(sys.argv[2])
def snap():
    d=json.load(urllib.request.urlopen(base+"/api/streams", timeout=5))
    out={}
    for k in d:
        recs=[]
        for pr in (d[k].get('producers') or []):
            recs += pr.get('receivers') or []
        if recs:
            out[k]=(sum(r.get('bytes',0) for r in recs), sum(r.get('packets',0) for r in recs))
    return out
a=snap(); time.sleep(w); b=snap()
for k in sorted(b):
    if k in a and b[k][1]-a[k][1]>0:
        db,dp=b[k][0]-a[k][0], b[k][1]-a[k][1]
        print(f"  {k:10s} {dp/w:5.1f} fps  {db/w/1024:6.1f} KB/s")
EOF

echo "== fps del transcode MJPEG (fallback), ventana ${W}s =="
T=$((W+6))   # +6s de cold start del ffmpeg
timeout "$T" curl -s "$G2R/api/stream.mjpeg?src=cam01sdmjpeg" -o /tmp/lat_mj.bin
python3 - "$W" "$T" <<'EOF'
import sys
data=open("/tmp/lat_mj.bin","rb").read()
n=data.count(b"--frame")
w=int(sys.argv[1]); t=int(sys.argv[2])
# descuento ~2s de arranque del transcode
print(f"  {n} frames en {t}s (aprox {n/(t-2):.0f} fps efectivos, {len(data)/1024:.0f} KB)")
EOF
rm -f /tmp/lat_mj.bin
