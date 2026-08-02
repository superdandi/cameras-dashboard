#!/usr/bin/env bash
# status.sh — comprueba estado de go2rtc y de las cámaras (Fase 2, "API de estados").
# Uso: scripts/recon/status.sh   (o)   status.sh cam01
set -u
API="${GO2RTC_API:-http://127.0.0.1:1984}"
TMO="${TMO:-6}"
STREAMS="cam01 cam01sd cam02 cam02sd cam03 cam03sd cam04 cam04sd"

up() { curl -s -m 2 -o /dev/null -w "%{http_code}" "$1" 2>/dev/null; }

echo "== go2rtc =="
api_up=$(up "$API/api/streams")
echo "  API  $API -> HTTP $api_up"
if (echo > /dev/tcp/127.0.0.1/8554) 2>/dev/null; then
  echo "  RTSP 8554 -> abierto"
else
  echo "  RTSP 8554 -> cerrado"
fi

echo "== cámaras (frame grab, $TMO s) =="
all=()
[ $# -gt 0 ] && all=("$@")
if [ ${#all[@]} -eq 0 ]; then
  for s in $STREAMS; do
    f=$(curl -s -m "$TMO" -o /tmp/status_$$.jpg -w "%{http_code}" "$API/api/frame.jpeg?src=$s&width=320" 2>/dev/null)
    if [ "$f" = "200" ] && file -b /tmp/status_$$.jpg | grep -q JPEG; then
      echo "  ✓ $s  UP (frame OK)"
    else
      echo "  ✗ $s  DOWN"
    fi
    rm -f /tmp/status_$$.jpg
  done
else
  for s in "$@"; do
    f=$(curl -s -m "$TMO" -o /tmp/status_$$.jpg -w "%{http_code}" "$API/api/frame.jpeg?src=$s&width=320" 2>/dev/null)
    if [ "$f" = "200" ] && file -b /tmp/status_$$.jpg | grep -q JPEG; then
      echo "  ✓ $s  UP (frame OK)"
    else
      echo "  ✗ $s  DOWN"
    fi
    rm -f /tmp/status_$$.jpg
  done
fi
