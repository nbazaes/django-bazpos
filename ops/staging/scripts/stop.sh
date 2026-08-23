#!/usr/bin/env bash
# stop.sh — Quita la latencia y apaga la VM (los volúmenes se conservan).
set -euo pipefail
source "$(dirname "$0")/lib.sh"

"$(dirname "$0")/remove-latency.sh" || true

if vm_is_running; then
  echo "==> [stop] Apagando VM ${VM_DOMAIN}..."
  virsh shutdown "${VM_DOMAIN}"
fi
echo "==> [stop] VM apagada."