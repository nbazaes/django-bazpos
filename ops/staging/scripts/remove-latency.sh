#!/usr/bin/env bash
# remove-latency.sh — Elimina el netem aplicado por apply-latency.sh (dentro de la VM).
set -euo pipefail
source "$(dirname "$0")/lib.sh"

if vm_is_running; then
  ssh_vm "
    sudo tc qdisc del dev ${VM_IFACE} root 2>/dev/null || true
    sudo tc filter del dev ${VM_IFACE} parent ffff: 2>/dev/null || true
    sudo tc qdisc del dev ${VM_IFACE} parent ffff: 2>/dev/null || true
    sudo tc qdisc del dev ifb0 root 2>/dev/null || true
    sudo ip link del ifb0 2>/dev/null || true
    echo '==> Latencia removida en la VM'
  "
else
  echo "VM no corriendo; nada que remover."
fi