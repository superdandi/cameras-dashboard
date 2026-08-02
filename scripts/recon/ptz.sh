#!/usr/bin/env bash
# ptz.sh — control PTZ por HTTP CGI (protocolo HiChip) en cámaras ATSG.
# Uso: ptz.sh <IP> <cmd> [speed] [ms]
#   cmd:  up|down|left|right|left up|right up|left down|right down|
#         zoomin|zoomout|focusin|focusout|auto|stop|SET_PRESET|GOTO_PRESET|CLEAR_PRESET
#   speed: 0-63 (def 40)
#   ms:    duración en ms antes de enviar stop (def 300). 0 = sin stop.
# Ejemplos:
#   ptz.sh <CAM_IP> up
#   ptz.sh <CAM_IP> "left up" 63 800
#   ptz.sh <CAM_IP> GOTO_PRESET 1 0

set -u
IP="${1:?IP requerida}"
CMD="${2:?comando requerido}"
SPEED="${3:-40}"
MS="${4:-300}"
USER="${PTZ_USER:-admin}"
PASS="${PTZ_PASS:-}"

BASE="http://$IP/cgi-bin/hi3510/ptzctrl.cgi"
URL="$BASE?-step=0&-act=$CMD&-speed=$SPEED&-chn=1"

if [ "$MS" -gt 0 ]; then
  curl -s -m 5 -u "$USER:$PASS" "$URL" >/dev/null
  sleep "$(awk "BEGIN{print $MS/1000}")"
  curl -s -m 5 -u "$USER:$PASS" "$BASE?-step=0&-act=stop&-speed=$SPEED&-chn=1" >/dev/null
else
  curl -s -m 5 -u "$USER:$PASS" "$URL"
fi
echo
