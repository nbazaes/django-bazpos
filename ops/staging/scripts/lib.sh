#!/usr/bin/env bash
# Configuración compartida del entorno de staging local (VM KVM, réplica del VPS de NYC).
# Todas las variables se pueden sobrescribir desde el entorno.

VM_DOMAIN="${VM_DOMAIN:-bazpos-staging-vm}"
VM_HOST="${VM_HOST:-192.168.150.160}"
VM_USER="${VM_USER:-staging}"
COMPOSE_DIR="${COMPOSE_DIR:-/opt/bazpos}"

GHCR_REPO="${GHCR_REPO:-ghcr.io/nbazaes/django-bazpos}"
GHCR_USER="${GHCR_USER:-nbazaes}"
GITHUB_REPO="${GITHUB_REPO:-nbazaes/django-bazpos}"

RESTIC_ENV="${RESTIC_ENV:-$HOME/.config/restic/bazpos.env}"
RESTORE_DIR="${RESTORE_DIR:-$HOME/backups/bazpos-staging}"

# .env generado localmente (gitignored) con los secretos del stack de staging.
LOCAL_ENV="${LOCAL_ENV:-$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)/.env.generated}"

NETEM_DELAY="${NETEM_DELAY:-100ms}"
VM_IFACE="${VM_IFACE:-enp0s2}"

ssh_vm() {
  ssh -o BatchMode=yes -o ConnectTimeout=10 "${VM_USER}@${VM_HOST}" "$@"
}

# virsh domstate traduce el estado según el locale del host; forzar C para
# que sea siempre "running"/"shut off".
vm_is_running() {
  LC_ALL=C virsh domstate "${VM_DOMAIN}" 2>/dev/null | grep -q running
}

# Espera hasta que los 3 contenedores estén listos (la VM de 1 vCPU arranca el
# entrypoint lento: el healthcheck de compose con --wait falla por gracia corta).
# Nota: bazpos_nginx no define healthcheck → se considera listo si está "running".
# El cuerpo corre como script remoto vía ssh, así que usa exit (no return).
stack_wait_healthy() {
  local tries="${1:-60}"  # 60 * 10s = 10 min máx
  ssh_vm "
    for i in \$(seq 1 ${tries}); do
      ok=1
      for c in bazpos_db bazpos_app bazpos_nginx; do
        s=\$(docker inspect -f '{{if .State.Health}}{{.State.Health.Status}}{{else}}running{{end}}' \$c 2>/dev/null || echo n/a)
        case \"\$s\" in healthy|running) ;; *) ok=0 ;; esac
      done
      [ \$ok -eq 1 ] && { echo 'Stack listo'; exit 0; }
      sleep 10
    done
    echo 'Timeout esperando el stack' >&2
    docker ps --format 'table {{.Names}}\t{{.Status}}' >&2
    exit 1
  "
}