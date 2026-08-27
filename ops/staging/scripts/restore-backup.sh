#!/usr/bin/env bash
# restore-backup.sh — Restaura los datos de PRODUCCIÓN (dump + media) en el staging.
# Origen: último snapshot restic (B2). Requiere ~/.config/restic/bazpos.env y el
# .env generado por deploy-stack.sh (para credenciales de MariaDB).
set -euo pipefail
source "$(dirname "$0")/lib.sh"

# 1) Cargar secretos de restic (whitelist, nunca se hace source del archivo)
[ -r "${RESTIC_ENV}" ] || { echo "Falta ${RESTIC_ENV} (debe ser chmod 600)"; exit 1; }
for var in RESTIC_REPOSITORY RESTIC_PASSWORD B2_ACCOUNT_ID B2_ACCOUNT_KEY; do
  val="$(grep -E "^${var}=" "${RESTIC_ENV}" | head -n1 | cut -d= -f2- || true)"
  [ -n "${val}" ] || { echo "Falta ${var} en ${RESTIC_ENV}"; exit 1; }
  export "${var}=${val}"
done

# 2) Restaurar el snapshot más reciente
echo "==> [restore] Snapshots recientes:"
restic snapshots | tail -6
echo "==> [restore] Limpiando ${RESTORE_DIR} (evita que dumps de restores anteriores se mezclen)..."
rm -rf "${RESTORE_DIR}"
mkdir -p "${RESTORE_DIR}"
restic restore latest --target "${RESTORE_DIR}"

# Seleccionar el dump/media MÁS RECIENTE por mtime: tras limpiar el directorio
# queda solo el del snapshot 'latest', pero esto evita regresiones si se restauran
# varios snapshots en el mismo directorio.
DUMP="$(find "${RESTORE_DIR}" -name bazpos_db.sql.gz -printf '%T@ %p\n' | sort -rn | head -n1 | cut -d' ' -f2-)"
MEDIA="$(find "${RESTORE_DIR}" -name media.tar.gz -printf '%T@ %p\n' | sort -rn | head -n1 | cut -d' ' -f2-)"
[ -n "${DUMP}" ] && [ -n "${MEDIA}" ] || { echo "No se encontraron bazpos_db.sql.gz / media.tar.gz"; exit 1; }
echo "    Dump:  $(du -h "${DUMP}" | cut -f1)  ${DUMP}"
echo "    Media: $(du -h "${MEDIA}" | cut -f1)  ${MEDIA}"

# 3) Pre-flight: verificar que quepa en el disco de 25GB de la VM
FREE_KB="$(ssh_vm 'df -Pk / | tail -1 | tr -s " " | cut -d" " -f4')"
DUMP_UNCOMP_KB=$(( $(gunzip -l "${DUMP}" | tail -1 | tr -s " " | cut -d" " -f2) / 1024 ))
MEDIA_KB="$(du -k "${MEDIA}" | cut -f1)"
NEED_KB=$(( DUMP_UNCOMP_KB + MEDIA_KB * 2 ))
echo "==> [restore] Espacio libre en VM: $(( FREE_KB / 1024 )) MB | estimado necesario: $(( NEED_KB / 1024 )) MB"
if [ "${NEED_KB}" -gt "${FREE_KB}" ]; then
  echo "ERROR: los datos de producción no caben en la VM (25GB)." >&2
  exit 1
fi

# 4) Detener app para importar con la BD quieta
echo "==> [restore] Deteniendo app..."
ssh_vm "cd ${COMPOSE_DIR} && docker compose -f compose.prod.yaml stop app"

# 5) Recrear bazpos_db vacío (evita que tablas obsoletas de un restore anterior
#    sobrevivan y rompan las migraciones al arrancar el stack).
echo "==> [restore] Recreando bazpos_db (drop + create)..."
ssh_vm "docker exec bazpos_db sh -c 'exec mariadb -uroot -p\"\$MYSQL_ROOT_PASSWORD\" -e \"DROP DATABASE IF EXISTS bazpos_db; CREATE DATABASE bazpos_db CHARACTER SET utf8mb4 COLLATE utf8mb4_uca1400_ai_ci;\"'"

# 6) Importar dump en bazpos_db (como root del contenedor para respetar DEFINER de triggers/rutinas)
echo "==> [restore] Importando dump en bazpos_db (puede tardar minutos)..."
gunzip -c "${DUMP}" \
  | ssh_vm "docker exec -i bazpos_db sh -c 'exec mariadb -uroot -p\"\$MYSQL_ROOT_PASSWORD\" bazpos_db'"

# 7) Importar media en el volumen (streaming directo, sin doble copia en host)
echo "==> [restore] Importando media en bazpos_media_files..."
ssh_vm "docker run --rm -v bazpos_media_files:/media -i alpine sh -c 'mkdir -p /tmp/m && tar xzf - -C /tmp/m && cp -a /tmp/m/. /media/ && rm -rf /tmp/m'" < "${MEDIA}"

# 8) Reiniciar stack completo
echo "==> [restore] Reiniciando stack..."
ssh_vm "cd ${COMPOSE_DIR} && docker compose -f compose.prod.yaml up -d"
stack_wait_healthy

echo "==> [restore] Tamaño de la BD importada:"
printf 'SELECT ROUND(SUM(data_length+index_length)/1024/1024,1) AS size_mb FROM information_schema.tables WHERE table_schema="bazpos_db";\n' \
  | ssh_vm "docker exec -i bazpos_db sh -c 'mariadb -uroot -p\$MYSQL_ROOT_PASSWORD -N bazpos_db'"
echo "==> [restore] Tablas:"
printf 'SHOW TABLES;\n' \
  | ssh_vm "docker exec -i bazpos_db sh -c 'mariadb -uroot -p\$MYSQL_ROOT_PASSWORD -N bazpos_db'" | tr '\n' ' '
echo
echo "==> [restore] Listo."