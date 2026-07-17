#!/usr/bin/env bash
set -euo pipefail

echo "--- Esperando base de datos... ---"
python - <<'PY'
import os
import pymysql
import time

host = os.environ.get("DB_HOST", "db")
user = os.environ.get("DB_USER", "bazpos")
password = os.environ.get("DB_PASSWORD", "")
database = os.environ.get("DB_NAME", "bazpos_db")
port = int(os.environ.get("DB_PORT", "3306"))

for attempt in range(1, 31):
    try:
        conn = pymysql.connect(
            host=host,
            user=user,
            password=password,
            database=database,
            port=port,
            connect_timeout=5,
        )
        conn.close()
        print("Base de datos lista")
        break
    except Exception as exc:
        print(f"Esperando base de datos... ({attempt}/30): {exc}")
        time.sleep(2)
else:
    raise SystemExit("La base de datos no respondio a tiempo")
PY

echo "--- Ejecutando migraciones... ---"
python manage.py migrate --noinput

echo "--- Configurando grupos y permisos... ---"
python manage.py setup_groups

echo "--- Creando superusuario (si no existe)... ---"
python manage.py create_admin

echo "--- Recolectando archivos estaticos... ---"
python manage.py collectstatic --no-input --clear

echo "--- Iniciando aplicacion... ---"
exec "$@"
