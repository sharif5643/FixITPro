#!/bin/sh
# Bring the site back when no backend/frontend container is running (outage of 2026-10-08:
# Coolify redeployed by itself during our deploy and every app container ended up stopped).
# Runs on the server: ssh root@server 'sh -s' < scripts/deploy/recover-app.sh
#
# Starts the newest stopped backend and frontend as they are (no rebuild, no data change) and
# points Traefik's file at their coolify-network addresses; the old file is kept as .bak-<time>.
# Does nothing when both are already running.
set -e
APP=z9m1c1i9nr6kbyo4qn0vuv1b
T=/data/coolify/proxy/dynamic/fixitpro.yaml

running() { docker ps --format '{{.Names}}' | grep "^$1-$APP" | head -1; }
if [ -n "$(running backend)" ] && [ -n "$(running frontend)" ]; then
  echo "backend and frontend are running — nothing to recover"
  exit 0
fi

B=$(docker ps -a --format '{{.Names}}' | grep "^backend-$APP" | head -1)
F=$(docker ps -a --format '{{.Names}}' | grep "^frontend-$APP" | head -1)
[ -n "$B" ] && [ -n "$F" ] || { echo "no app containers to start"; exit 1; }
echo "starting $B and $F"
docker start "$B" "$F"
sleep 25

ip() { docker inspect "$1" --format '{{(index .NetworkSettings.Networks "coolify").IPAddress}}'; }
BIP=$(ip "$B"); FIP=$(ip "$F")
echo "backend=$BIP frontend=$FIP"
if [ -f "$T" ]; then
  cp -p "$T" "$T.bak-$(date +%Y%m%d%H%M%S)"
  OLD_B=$(grep 'url:' "$T" | head -1 | grep -oE '[0-9]+\.[0-9]+\.[0-9]+\.[0-9]+')
  OLD_F=$(grep 'url:' "$T" | tail -1 | grep -oE '[0-9]+\.[0-9]+\.[0-9]+\.[0-9]+')
  if [ -n "$BIP" ] && [ -n "$OLD_B" ]; then sed -i "s|$OLD_B|$BIP|g" "$T"; fi
  if [ -n "$FIP" ] && [ -n "$OLD_F" ]; then sed -i "s|$OLD_F|$FIP|g" "$T"; fi
  grep 'url:' "$T"
fi
docker ps --format '{{.Names}}\t{{.Status}}' | grep "$APP"
