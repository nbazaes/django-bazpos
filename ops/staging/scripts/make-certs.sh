#!/usr/bin/env bash
# make-certs.sh — Genera certificados TLS autofirmados para nginx del staging.
# Escribe en <repo-root>/certs/ (gitignored), que es lo que monta compose.prod.yaml.
set -euo pipefail
source "$(dirname "$0")/lib.sh"

REPO_ROOT="$(cd "$(dirname "$0")/../../.." && pwd)"
CERT_DIR="${REPO_ROOT}/certs"
mkdir -p "${CERT_DIR}"

echo "==> [certs] Generando origin.pem / origin.key (SAN=IP:${VM_HOST})..."
openssl req -x509 -newkey rsa:2048 -nodes \
  -keyout "${CERT_DIR}/origin.key" \
  -out "${CERT_DIR}/origin.pem" \
  -days 825 \
  -subj "/CN=bazpos-staging" \
  -addext "subjectAltName=IP:${VM_HOST},DNS:bazpos-staging"
chmod 600 "${CERT_DIR}/origin.key"

echo "==> [certs] Listos:"
ls -l "${CERT_DIR}"/origin.*