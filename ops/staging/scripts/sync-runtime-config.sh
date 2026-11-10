#!/usr/bin/env bash
# Copy only images and OCR settings from .env.generated, keeping VM DB credentials.
set -euo pipefail
source "$(dirname "$0")/lib.sh"
REPO_ROOT="$(cd "$(dirname "$0")/../../.." && pwd)"
if [ ! -f "${LOCAL_ENV}" ]; then
  echo "ERROR: falta ${LOCAL_ENV}; ejecuta deploy-stack.sh primero." >&2
  exit 1
fi
# Validate the remote directory before interpolating it into SSH commands.
[[ "${COMPOSE_DIR}" =~ ^/[A-Za-z0-9_./-]+$ ]] || { echo "COMPOSE_DIR no válida" >&2; exit 1; }
export_options=(--ocr-only)
if [ "${1:-}" = "--include-images" ]; then
  export_options=()
elif [ "$#" -ne 0 ]; then
  echo "Uso: $0 [--include-images]" >&2
  exit 1
fi
PAYLOAD="$(mktemp)"
trap 'rm -f -- "${PAYLOAD}"' EXIT
python3 "${REPO_ROOT}/ops/deploy/runtime_env.py" export --source "${LOCAL_ENV}" --output "${PAYLOAD}" "${export_options[@]}"
ssh_vm "mkdir -p '${COMPOSE_DIR}/ops/deploy' '${COMPOSE_DIR}/.deploy' && chmod 700 '${COMPOSE_DIR}/.deploy'"
rsync -a "${REPO_ROOT}/ops/deploy/runtime_env.py" "${REPO_ROOT}/ops/deploy/check_ocr.py" "${VM_USER}@${VM_HOST}:${COMPOSE_DIR}/ops/deploy/"
# Secrets go through the encrypted connection's stdin, never shell substitutions.
cat "${PAYLOAD}" | ssh_vm "set -eu; umask 077; cd '${COMPOSE_DIR}'; trap 'rm -f .deploy/runtime-env.json' EXIT; cat > .deploy/runtime-env.json; python3 ops/deploy/runtime_env.py apply --target .env --input .deploy/runtime-env.json"
