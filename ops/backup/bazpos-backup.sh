#!/usr/bin/env bash
#
# bazpos-backup.sh — Backup cifrado de BazPOS (restic -> Backblaze B2).
#
# Respalda:
#   - Dump lógico de MariaDB (mariadb-dump --single-transaction, sin bloquear)
#   - Volumen de media (imágenes subidas, tar desde el contenedor app)
#   - Configuración y secretos (.env, certs/, compose*.yaml)
#
# Uso (como root, normalmente vía cron):
#   sudo bazpos-backup.sh            # backup diario
#   sudo bazpos-backup.sh check      # verificación de integridad del repo
#   sudo bazpos-backup.sh snapshots  # listar snapshots
#   sudo bazpos-backup.sh prune      # retención + purge inmediato
#   sudo bazpos-backup.sh restore <snapshot|latest> <dir-destino>
#   sudo bazpos-backup.sh init       # crear el repo restic (solo una vez)
#
# Secretos en /etc/restic/bazpos.env (chmod 600). Ver ops/backup/restore.md.
# Cron: 17 3 * * * /usr/local/sbin/bazpos-backup.sh backup >> /var/log/bazpos-backup.log 2>&1

set -euo pipefail

# ---------------------------------------------------------------------------
# Configuración (ajustable por variables de entorno)
# ---------------------------------------------------------------------------
COMPOSE_DIR="${BAZPOS_COMPOSE_DIR:-/opt/bazpos}"
DB_CONTAINER="${BAZPOS_DB_CONTAINER:-bazpos_db}"
APP_CONTAINER="${BAZPOS_APP_CONTAINER:-bazpos_app}"
MEDIA_VOLUME="${BAZPOS_MEDIA_VOLUME:-bazpos_media_files}"
RESTIC_ENV_FILE="${RESTIC_ENV_FILE:-/etc/restic/bazpos.env}"
STAGING_BASE="${STAGING_BASE:-/var/backups/bazpos}"

RESTIC_BIN="${RESTIC_BIN:-restic}"
DOW="$(date +%u)"                       # 1=lunes ... 7=domingo
NOW="$(date +%Y%m%d-%H%M%S)"
STAGING=""

# ---------------------------------------------------------------------------
# Carga de secretos (whitelist; nunca se hace source del archivo)
# ---------------------------------------------------------------------------
load_secrets() {
    if [ ! -r "${RESTIC_ENV_FILE}" ]; then
        echo "[ERROR] No existe/legible ${RESTIC_ENV_FILE} (debe ser root y chmod 600)" >&2
        exit 1
    fi
    for var in RESTIC_REPOSITORY RESTIC_PASSWORD B2_ACCOUNT_ID B2_ACCOUNT_KEY; do
        val="$(grep -E "^${var}=" "${RESTIC_ENV_FILE}" | head -n 1 | cut -d= -f2- || true)"
        if [ -z "${val}" ]; then
            echo "[ERROR] Falta ${var} en ${RESTIC_ENV_FILE}" >&2
            exit 1
        fi
        export "${var}=${val}"
    done
}

log() { echo "[bazpos-backup ${NOW}] $*"; }

# ---------------------------------------------------------------------------
# Etapa 1: preparar staging (dump DB, media, config)
# ---------------------------------------------------------------------------
stage() {
    local staging
    mkdir -p "${STAGING_BASE}"
    STAGING="$(mktemp -d "${STAGING_BASE}/staging.XXXXXX")"
    staging="${STAGING}"

    log "Creando dump de MariaDB ($$...) desde ${DB_CONTAINER}"
    docker exec "${DB_CONTAINER}" sh -c \
        'exec mariadb-dump --single-transaction --quick --routines --triggers -u"$DB_USER" -p"$DB_PASSWORD" "$DB_NAME"' \
        | gzip > "${staging}/bazpos_db.sql.gz"
    log "Dump OK: $(du -h "${staging}/bazpos_db.sql.gz" | cut -f1)"

    log "Empaquetando media desde ${APP_CONTAINER}"
    docker exec "${APP_CONTAINER}" sh -c 'exec tar czf - -C /app/media .' > "${staging}/media.tar.gz"
    log "Media OK: $(du -h "${staging}/media.tar.gz" | cut -f1)"

    log "Guardando configuracion y secretos"
    mkdir -p "${staging}/config"
    if [ -f "${COMPOSE_DIR}/.env" ]; then
        cp -a "${COMPOSE_DIR}/.env" "${staging}/config/env"
    fi
    if [ -d "${COMPOSE_DIR}/certs" ]; then
        cp -a "${COMPOSE_DIR}/certs" "${staging}/config/certs"
    fi
    for f in compose.yaml compose.prod.yaml; do
        [ -f "${COMPOSE_DIR}/${f}" ] && cp -a "${COMPOSE_DIR}/${f}" "${staging}/config/${f}"
    done
    log "Config OK"
}

# ---------------------------------------------------------------------------
# Etapa 2: subir a restic
# ---------------------------------------------------------------------------
backup() {
    log "Subiendo a ${RESTIC_REPOSITORY}"
    "${RESTIC_BIN}" backup "${STAGING}" --tag "${NOW}"
    log "Backup subido"
}

forget() {
    log "Retención (sin prune): 7 diarios / 4 semanales / 6 mensuales"
    "${RESTIC_BIN}" forget --keep-daily 7 --keep-weekly 4 --keep-monthly 6
}

forget_prune_check() {
    log "Retención con prune + verificación de integridad"
    "${RESTIC_BIN}" forget --keep-daily 7 --keep-weekly 4 --keep-monthly 6 --prune
    "${RESTIC_BIN}" check --read-data-subset=5%
}

check() { "${RESTIC_BIN}" check --read-data-subset=5%; }
snapshots() { "${RESTIC_BIN}" snapshots; }
init() { "${RESTIC_BIN}" init; }

restore() {
    local spec="${1:?snapshot (id, 'latest' o 'host:latest')}"
    local target="${2:?directorio destino}"
    mkdir -p "${target}"
    log "Restaurando ${spec} en ${target}"
    "${RESTIC_BIN}" restore "${spec}" --target "${target}"
    log "Contenido restaurado:"
    find "${target}" \( -name 'bazpos_db.sql.gz' -o -name 'media.tar.gz' -o -name 'env' -o -name 'compose*.yaml' \) -print 2>/dev/null || true
}

# ---------------------------------------------------------------------------
# Flujo del job diario
# ---------------------------------------------------------------------------
run_daily() {
    stage
    backup
    if [ "${DOW}" = "7" ]; then
        forget_prune_check
    else
        forget
    fi
}

cleanup() {
    if [ -n "${STAGING}" ] && [ -d "${STAGING}" ]; then
        rm -rf "${STAGING}"
    fi
}
trap cleanup EXIT

main() {
    load_secrets
    case "${1:-backup}" in
        backup)   run_daily ;;
        check)    check ;;
        snapshots) snapshots ;;
        prune)    forget_prune_check ;;
        init)     init ;;
        restore)  restore "${2}" "${3}" ;;
        *)
            echo "Uso: $0 [backup|check|snapshots|prune|restore <snapshot> <dir>|init]" >&2
            exit 2
            ;;
    esac
    log "OK ➜ operación '${1:-backup}' completada"
}

main "$@"