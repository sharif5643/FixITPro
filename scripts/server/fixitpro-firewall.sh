#!/bin/sh
# FixITPro server firewall — keep Coolify's dashboard (8000), its realtime (6001-6002) and the
# proxy dashboard (8080) off the internet (PHP2Shell, CVE-2026-109618/9, 2026-10). Only 22, 80
# and 443 stay public; shops use 80/443, deploys use ssh. Coolify stays reachable over an ssh
# tunnel:  ssh -L 8000:localhost:8000 -L 6001:localhost:6001 root@<server>
#
#   fixitpro-firewall.sh        apply (idempotent; run at boot by fixitpro-firewall.service)
#   fixitpro-firewall.sh off    remove the rules again
#   fixitpro-firewall.sh status show them
set -eu
PORTS="8000 8080 6001 6002"
IF=${FIXITPRO_IF:-$(ip route get 1.1.1.1 | awk '{for (i = 1; i <= NF; i++) if ($i == "dev") { print $(i + 1); exit }}')}
[ -n "$IF" ] || { echo "no internet interface found" >&2; exit 1; }

apply() {   # $1 = iptables or ip6tables
  t=$1
  command -v "$t" >/dev/null 2>&1 || return 0
  $t -N FIXITPRO-BLOCK 2>/dev/null || $t -F FIXITPRO-BLOCK
  for p in $PORTS; do
    # The port the client asked for, before Docker rewrites it to the container's port
    $t -A FIXITPRO-BLOCK -p tcp -m conntrack --ctorigdstport "$p" --ctdir ORIGINAL -j DROP
  done
  # Host listeners (INPUT) and published container ports (DOCKER-USER, ahead of Docker's rules)
  $t -C INPUT -i "$IF" -j FIXITPRO-BLOCK 2>/dev/null || $t -I INPUT -i "$IF" -j FIXITPRO-BLOCK
  if $t -L DOCKER-USER -n >/dev/null 2>&1; then
    $t -C DOCKER-USER -i "$IF" -j FIXITPRO-BLOCK 2>/dev/null || $t -I DOCKER-USER -i "$IF" -j FIXITPRO-BLOCK
  fi
}

remove() {
  t=$1
  command -v "$t" >/dev/null 2>&1 || return 0
  while $t -D INPUT -i "$IF" -j FIXITPRO-BLOCK 2>/dev/null; do :; done
  while $t -D DOCKER-USER -i "$IF" -j FIXITPRO-BLOCK 2>/dev/null; do :; done
  $t -F FIXITPRO-BLOCK 2>/dev/null || true
  $t -X FIXITPRO-BLOCK 2>/dev/null || true
}

case "${1:-apply}" in
  apply)  apply iptables; apply ip6tables; echo "blocked from $IF: $PORTS" ;;
  off)    remove iptables; remove ip6tables; echo "rules removed" ;;
  status) for t in iptables ip6tables; do command -v $t >/dev/null 2>&1 && { echo "== $t"; $t -S FIXITPRO-BLOCK 2>/dev/null; $t -S INPUT | grep FIXITPRO || true; $t -S DOCKER-USER 2>/dev/null | grep FIXITPRO || true; }; done ;;
  *) echo "usage: $0 [apply|off|status]" >&2; exit 2 ;;
esac
