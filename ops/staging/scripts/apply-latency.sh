#!/usr/bin/env bash
# apply-latency.sh — Inyecta NETEM_DELAY (100ms por dirección ≈ 200ms RTT) entre
# el navegador (host) y el stack (VM), simulando Chile → VPS NYC.
#
# Todo el retardo se aplica DENTRO de la VM (kernel Ubuntu con sch_netem + ifb):
#   - egress en ${VM_IFACE}         → retrasa VM→host (respuestas)
#   - ingress vía ifb0 (mirred)     → retrasa host→VM (requests)
# El tráfico app↔DB interno (docker bridge) queda sin latencia (fiel a prod).
set -euo pipefail
source "$(dirname "$0")/lib.sh"

if ! vm_is_running; then
  echo "La VM ${VM_DOMAIN} no está corriendo." >&2
  exit 1
fi

ssh_vm "
set -e
sudo modprobe sch_netem 2>/dev/null || true
sudo modprobe ifb 2>/dev/null || true
if ! ip link show ifb0 >/dev/null 2>&1; then
  sudo ip link add ifb0 type ifb
fi
sudo ip link set ifb0 up

# VM → host (egress)
if tc qdisc show dev ${VM_IFACE} | grep -q 'qdisc netem'; then
  sudo tc qdisc change dev ${VM_IFACE} root netem delay ${NETEM_DELAY}
else
  sudo tc qdisc add dev ${VM_IFACE} root netem delay ${NETEM_DELAY}
fi

# host → VM (ingress vía ifb0)
if ! tc qdisc show dev ${VM_IFACE} | grep -q 'qdisc ingress'; then
  sudo tc qdisc add dev ${VM_IFACE} handle ffff: ingress
fi
if ! tc filter show dev ${VM_IFACE} parent ffff: 2>/dev/null | grep -q ifb0; then
  sudo tc filter add dev ${VM_IFACE} parent ffff: protocol ip u32 match u32 0 0 action mirred egress redirect dev ifb0
fi
if tc qdisc show dev ifb0 | grep -q 'qdisc netem'; then
  sudo tc qdisc change dev ifb0 root netem delay ${NETEM_DELAY}
else
  sudo tc qdisc add dev ifb0 root netem delay ${NETEM_DELAY}
fi

echo 'qdiscs activos:'
tc qdisc show dev ${VM_IFACE}
tc qdisc show dev ifb0
"

echo "==> [latency] Latencia aplicada: ${NETEM_DELAY} por dirección (≈2×${NETEM_DELAY} por request)."
echo "    Comprobar: curl -sk -o /dev/null -w 'ttfb=%{time_starttransfer}s\\n' https://${VM_HOST}/api/store-name/"