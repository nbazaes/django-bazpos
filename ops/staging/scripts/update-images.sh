#!/usr/bin/env bash
# update-images.sh — Despliega en la VM la última imagen construida por CI para la rama staging.
#
# Flujo: git push origin staging → CI construye y sube :app-<sha>/:nginx-<sha> → este script
# valida que CI terminó OK, actualiza APP_IMAGE/NGINX_IMAGE en el .env de la VM y hace
# docker compose pull + up -d (los datos y la latencia se conservan).
#
# Uso:
#   ops/staging/scripts/update-images.sh              # última SHA de origin/staging
#   ops/staging/scripts/update-images.sh <sha|ref>    # SHA o ref específica
#   FORCE=1 ops/staging/scripts/update-images.sh      # saltar la validación de CI
set -euo pipefail
source "$(dirname "$0")/lib.sh"

ssh_vm 'true' || { echo "No se pudo conectar a ${VM_HOST} (¿VM encendida? usa start.sh)." >&2; exit 1; }

# 1) Resolver el SHA objetivo
resolve_sha() { gh api "repos/${GITHUB_REPO}/commits/${1}" --jq .sha; }
if [ -n "${1:-}" ]; then
  SHA="$(resolve_sha "${1#origin/}")"
else
  SHA="$(resolve_sha staging)"
fi
echo "==> [update] SHA objetivo: ${SHA}"
APP_IMAGE="${GHCR_REPO}:app-${SHA}"
NGINX_IMAGE="${GHCR_REPO}:nginx-${SHA}"

# 2) Validar que CI construyó las imágenes (evita "pull antes de que termine el build")
if [ "${FORCE:-0}" != "1" ]; then
  echo "==> [update] Verificando que CI terminó OK para ${SHA}..."
  ci="in_progress"
  for _ in $(seq 1 40); do
    ci="$(gh api "repos/${GITHUB_REPO}/actions/runs?head_sha=${SHA}&event=push&per_page=20" \
          --jq '[.workflow_runs[] | select(.name == "CI")][0] | (.conclusion // "in_progress")')"
    case "${ci}" in
      success)  echo "    CI OK"; break ;;
      in_progress) echo "    CI en curso... (reintentando cada 15s)"; sleep 15 ;;
      *)
        echo "ERROR: CI terminó con estado '${ci}' — las imágenes no están listas." >&2
        echo "       Si confías en el build, usa: FORCE=1 $(basename "$0")" >&2
        exit 1
        ;;
    esac
  done
  [ "${ci}" = "success" ] || { echo "ERROR: timeout esperando a CI (≥10 min)." >&2; exit 1; }
else
  echo "==> [update] FORCE=1: saltando validación de CI."
fi

# 3) Actualizar APP_IMAGE/NGINX_IMAGE en el .env local y en la VM
echo "==> [update] Actualizando imágenes en .env..."
if [ -f "${LOCAL_ENV}" ]; then
  sed -i "s#^APP_IMAGE=.*#APP_IMAGE=${APP_IMAGE}#; s#^NGINX_IMAGE=.*#NGINX_IMAGE=${NGINX_IMAGE}#" "${LOCAL_ENV}"
  grep -q '^APP_IMAGE=' "${LOCAL_ENV}"   || echo "APP_IMAGE=${APP_IMAGE}"   >> "${LOCAL_ENV}"
  grep -q '^NGINX_IMAGE=' "${LOCAL_ENV}" || echo "NGINX_IMAGE=${NGINX_IMAGE}" >> "${LOCAL_ENV}"
fi
ssh_vm "
cd ${COMPOSE_DIR}
grep -q '^APP_IMAGE=' .env   || echo 'APP_IMAGE=${APP_IMAGE}'   >> .env
grep -q '^NGINX_IMAGE=' .env || echo 'NGINX_IMAGE=${NGINX_IMAGE}' >> .env
sed -i 's#^APP_IMAGE=.*#APP_IMAGE=${APP_IMAGE}#; s#^NGINX_IMAGE=.*#NGINX_IMAGE=${NGINX_IMAGE}#' .env
"
ssh_vm "cd ${COMPOSE_DIR} && grep -E '^(APP_IMAGE|NGINX_IMAGE)=' .env" | sed 's/^/    /'

# 4) Pull + up (los datos y la latencia netem se conservan)
echo "==> [update] docker compose pull + up -d (puede tardar)..."
ssh_vm "cd ${COMPOSE_DIR} && docker compose -f compose.prod.yaml pull"
ssh_vm "cd ${COMPOSE_DIR} && docker compose -f compose.prod.yaml up -d"
stack_wait_healthy

# 5) Garantizar latencia activa (idempotente; netem vive en interfaces de la VM,
#    puede perderse por eventos transitorios de red)
"$(dirname "$0")/apply-latency.sh"

echo ""
echo "==> [update] Deploy completado:"
ssh_vm "docker ps --format 'table {{.Names}}\t{{.Image}}\t{{.Status}}'"
echo "    URL: https://${VM_HOST}/"
echo "    Comprobar: ops/staging/scripts/verify.sh"