#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/.."

python manage.py migrate
python manage.py collectstatic --noinput

# Dev convenience: use runserver on 0.0.0.0 for quick LAN testing.
# Production: use the systemd service (deploy/bazpos.service) instead.
if [ "${1:-}" = "--dev" ]; then
    echo "Starting dev server on 0.0.0.0:8000 (LAN accessible)"
    exec python manage.py runserver 0.0.0.0:8000
fi

echo "Starting gunicorn on 0.0.0.0:8000"
exec gunicorn bazpos.wsgi:application \
    --bind 0.0.0.0:8000 \
    --workers 4 \
    --access-logfile -
