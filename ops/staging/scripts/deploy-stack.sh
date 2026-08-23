#!/usr/bin/env bash
# deploy-stack.sh — Despliega en la VM el stack con las MISMAS imágenes de producción (GHCR).
#
# Requiere: GHCR_TOKEN en el entorno (PAT de GitHub con scope read:packages).
set -euo pipefail
source "$(dirname "$0")/lib.sh"

REPO_ROOT="$(cd "$(dirname "$0")/../../.." && pwd)"

# 1) Resolver el SHA de main → imágenes exactas que CI subió a GHCR
echo "==> [deploy] Resolviendo SHA de main en ${GITHUB_REPO}..."
SHA="$(gh api "repos/${GITHUB_REPO}/commits/main" --jq .sha)"
APP_IMAGE="${GHCR_REPO}:app-${SHA}"
NGINX_IMAGE="${GHCR_REPO}:nginx-${SHA}"
echo "    app   = ${APP_IMAGE}"
echo "    nginx = ${NGINX_IMAGE}"

# 2) Generar .env del staging (secretos nuevos, nunca se versionan)
echo "==> [deploy] Generando ${LOCAL_ENV}..."
DB_PASS="$(openssl rand -hex 16)"
ROOT_PASS="$(openssl rand -hex 16)"
ADMIN_PASS="$(openssl rand -hex 16)"
SECRET="$(openssl rand -base64 50 | tr -d '\n')"
cat > "${LOCAL_ENV}" <<EOF
DJANGO_SECRET_KEY=${SECRET}
DJANGO_DEBUG=False
DJANGO_ALLOWED_HOSTS=${VM_HOST},localhost,127.0.0.1
CORS_ALLOWED_ORIGINS=
CSRF_TRUSTED_ORIGINS=
DB_NAME=bazpos_db
DB_USER=bazpos
DB_PASSWORD=${DB_PASS}
DB_HOST=db
DB_PORT=3306
STORE_NAME=EUROCAS
VITE_STORE_NAME=EUROCAS
ADMIN_USER=admin
ADMIN_EMAIL=admin@staging.local
ADMIN_PASS=${ADMIN_PASS}
MYSQL_ROOT_PASSWORD=${ROOT_PASS}
MYSQL_DATABASE=bazpos_db
MYSQL_USER=bazpos
MYSQL_PASSWORD=${DB_PASS}
APP_IMAGE=${APP_IMAGE}
NGINX_IMAGE=${NGINX_IMAGE}
EOF
chmod 600 "${LOCAL_ENV}"

# 3) Certificados autofirmados si no existen
if [ ! -f "${REPO_ROOT}/certs/origin.pem" ]; then
  echo "==> [deploy] Generando certificados TLS..."
  "$(dirname "$0")/make-certs.sh"
fi

# 4) Sincronizar compose/.env/certs a la VM
echo "==> [deploy] Sincronizando stack a ${VM_HOST}:${COMPOSE_DIR}"
ssh_vm "mkdir -p ${COMPOSE_DIR}/certs"
rsync -a "${REPO_ROOT}/compose.prod.yaml" "${VM_USER}@${VM_HOST}:${COMPOSE_DIR}/compose.prod.yaml"
rsync -a "${LOCAL_ENV}" "${VM_USER}@${VM_HOST}:${COMPOSE_DIR}/.env"
rsync -a "${REPO_ROOT}/certs/" "${VM_USER}@${VM_HOST}:${COMPOSE_DIR}/certs/"

# 5) Login a GHCR (token por stdin, nunca por línea de comandos)
echo "==> [deploy] Login a GHCR..."
echo "${GHCR_TOKEN:?Exporta GHCR_TOKEN (PAT con read:packages)}" \
  | ssh_vm "docker login ghcr.io -u ${GHCR_USER} --password-stdin"

# 6) Levantar el stack con las imágenes de producción
echo "==> [deploy] Levantando stack (pull + up, puede tardar)..."
ssh_vm "cd ${COMPOSE_DIR} && APP_IMAGE=${APP_IMAGE} NGINX_IMAGE=${NGINX_IMAGE} docker compose -f compose.prod.yaml up -d"
echo "==> [deploy] Esperando a que el stack quede healthy (hasta 10 min)..."
stack_wait_healthy

echo "==> [deploy] Stack levantado:"
ssh_vm "docker ps --format 'table {{.Names}}\t{{.Status}}'"