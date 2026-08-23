#!/usr/bin/env bash
# bootstrap-vm.sh — Instala Docker + compose en la VM, crea swapfile y /opt/bazpos.
set -euo pipefail
source "$(dirname "$0")/lib.sh"

echo "==> [bootstrap] Instalando Docker + compose plugin en la VM..."
ssh_vm 'sudo apt-get update -qq && sudo DEBIAN_FRONTEND=noninteractive apt-get install -y -qq docker.io docker-compose-v2'

echo "==> [bootstrap] Agregando usuario staging al grupo docker..."
ssh_vm 'sudo usermod -aG docker staging'

echo "==> [bootstrap] Creando swapfile de 1G (absorber picos del envelope de 1GB)..."
ssh_vm 'if [ ! -f /swapfile ]; then sudo fallocate -l 1G /swapfile && sudo chmod 600 /swapfile && sudo mkswap /swapfile && sudo swapon /swapfile && grep -q "^/swapfile" /etc/fstab || echo "/swapfile none swap sw 0 0" | sudo tee -a /etc/fstab >/dev/null; fi'

echo "==> [bootstrap] Preparando ${COMPOSE_DIR}..."
ssh_vm "sudo mkdir -p ${COMPOSE_DIR} && sudo chown ${VM_USER}:${VM_USER} ${COMPOSE_DIR}"

echo "==> [bootstrap] Verificando Docker (nueva sesión SSH ya tiene el grupo docker):"
ssh_vm 'docker --version && docker compose version'