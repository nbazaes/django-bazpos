#!/usr/bin/env bash
# start.sh — Arranca la VM, asegura el stack y reaplica la latencia.
set -euo pipefail
source "$(dirname "$0")/lib.sh"

if ! vm_is_running; then
  echo "==> [start] Iniciando VM ${VM_DOMAIN}..."
  virsh start "${VM_DOMAIN}"
fi

echo "==> [start] Esperando SSH en ${VM_HOST}..."
for _ in $(seq 1 30); do
  ssh_vm 'true' 2>/dev/null && break
  sleep 2
done
ssh_vm 'true'

echo "==> [start] Esperando Docker..."
ssh_vm 'for _ in $(seq 1 30); do docker info >/dev/null 2>&1 && break; sleep 2; done; docker info >/dev/null 2>&1 || { echo "Docker no responde"; exit 1; }'

echo "==> [start] Asegurando stack arriba..."
ssh_vm "cd ${COMPOSE_DIR} && docker compose -f compose.prod.yaml up -d"
stack_wait_healthy

"$(dirname "$0")/apply-latency.sh"

echo ""
echo "==> STAGING LISTO: https://${VM_HOST}/  (aceptar el certificado autofirmado)"
echo "    Login admin: https://${VM_HOST}/admin/"