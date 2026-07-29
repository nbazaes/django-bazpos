#!/usr/bin/env bash
set -euo pipefail

REGISTRY="${REGISTRY:-ghcr.io}"
REPO="${GITHUB_REPOSITORY:-$(git config --get remote.origin.url | sed 's|.*github.com[:/]||;s|\.git$||')}"
TAG="${IMAGE_TAG:-latest}"
COMPOSE_PROJECT="${COMPOSE_PROJECT:-bazpos}"

IMAGE_APP="${REGISTRY}/${REPO}/app:${TAG}"
IMAGE_NGINX="${REGISTRY}/${REPO}/nginx:${TAG}"

NETWORK="${COMPOSE_PROJECT}_bazpos"
STATIC_VOL="${COMPOSE_PROJECT}_static_files"
MEDIA_VOL="${COMPOSE_PROJECT}_media_files"

APP_OLD="bazpos_app"
APP_NEW="bazpos_app_new"
NGINX_NAME="bazpos_nginx"
DB_NAME="bazpos_db"

echo "=== Logging in to GHCR ==="
if [ -n "${GHCR_TOKEN:-}" ]; then
    echo "${GHCR_TOKEN}" | docker login "${REGISTRY}" -u ignored --password-stdin
else
    echo "No GHCR_TOKEN — assuming images are public or already logged in."
fi

echo "=== Pulling images ==="
docker pull "${IMAGE_APP}"
docker pull "${IMAGE_NGINX}"

echo "=== Deploying app (blue-green) ==="

if docker ps -q -f name="${DB_NAME}" | grep -q .; then
    echo "DB is running"
else
    echo "DB not running — starting full stack first"
    docker compose up -d db
fi

OLD_APP_ID=$(docker ps -q -f name="^${APP_OLD}$" 2>/dev/null || true)

if [ -n "$OLD_APP_ID" ]; then
    echo "Starting new app container (green)…"

    docker run -d --name "${APP_NEW}" \
        --network "${NETWORK}" \
        --network-alias app \
        --env-file .env \
        --restart unless-stopped \
        --volume "${STATIC_VOL}:/app/staticfiles" \
        --volume "${MEDIA_VOL}:/app/media" \
        --health-cmd "python -c \"import urllib.request; print(urllib.request.urlopen('http://localhost:8000/health/').read().decode())\"" \
        --health-interval 5s \
        --health-timeout 5s \
        --health-retries 10 \
        --health-start-period 15s \
        "${IMAGE_APP}"

    echo "Waiting for new app health check…"
    for i in $(seq 1 60); do
        HEALTH=$(docker inspect --format '{{.State.Health.Status}}' "${APP_NEW}" 2>/dev/null || echo "")
        if [ "$HEALTH" = "healthy" ]; then
            echo "New app healthy after ${i}s."
            break
        fi
        if [ "$HEALTH" = "unhealthy" ]; then
            echo "ERROR: New app is unhealthy — aborting."
            docker stop "${APP_NEW}" && docker rm "${APP_NEW}"
            exit 1
        fi
        sleep 2
    done

    if [ "$HEALTH" != "healthy" ]; then
        echo "ERROR: New app did not become healthy in time — aborting."
        docker stop "${APP_NEW}" && docker rm "${APP_NEW}"
        exit 1
    fi

    echo "Soft-reloading nginx to pick up new app…"
    docker exec "${NGINX_NAME}" nginx -s reload

    echo "Stopping old app (blue)…"
    docker stop "${APP_OLD}" && docker rm "${APP_OLD}"

    echo "Renaming new container to ${APP_OLD}…"
    docker rename "${APP_NEW}" "${APP_OLD}"
else
    echo "No running app container — starting first instance…"
    docker run -d --name "${APP_OLD}" \
        --network "${NETWORK}" \
        --network-alias app \
        --env-file .env \
        --restart unless-stopped \
        --volume "${STATIC_VOL}:/app/staticfiles" \
        --volume "${MEDIA_VOL}:/app/media" \
        --health-cmd "python -c \"import urllib.request; print(urllib.request.urlopen('http://localhost:8000/health/').read().decode())\"" \
        --health-interval 5s \
        --health-timeout 5s \
        --health-retries 10 \
        --health-start-period 15s \
        "${IMAGE_APP}"
fi

echo "=== Deploying nginx ==="

OLD_NGINX_ID=$(docker ps -q -f name="^${NGINX_NAME}$" 2>/dev/null || true)

if [ -n "$OLD_NGINX_ID" ]; then
    echo "Comparing nginx images…"
    OLD_NGINX_IMAGE=$(docker inspect --format '{{.Config.Image}}' "${NGINX_NAME}")
    if [ "$OLD_NGINX_IMAGE" = "${IMAGE_NGINX}" ]; then
        echo "Nginx image unchanged — skipping."
    else
        echo "Nginx image changed — restarting container…"
        # Stop the old nginx & start new one (ports 80/443 constrain us to one at a time)
        docker stop "${NGINX_NAME}" && docker rm "${NGINX_NAME}"
        docker run -d --name "${NGINX_NAME}" \
            --network "${NETWORK}" \
            -p 0.0.0.0:80:80 \
            -p 0.0.0.0:443:443 \
            --restart unless-stopped \
            --volume "${STATIC_VOL}:/var/www/static:ro" \
            --volume "${MEDIA_VOL}:/var/www/media:ro" \
            --volume ./certs:/etc/nginx/certs:ro \
            "${IMAGE_NGINX}"
    fi
else
    echo "No running nginx container — starting…"
    docker run -d --name "${NGINX_NAME}" \
        --network "${NETWORK}" \
        -p 0.0.0.0:80:80 \
        -p 0.0.0.0:443:443 \
        --restart unless-stopped \
        --volume "${STATIC_VOL}:/var/www/static:ro" \
        --volume "${MEDIA_VOL}:/var/www/media:ro" \
        --volume ./certs:/etc/nginx/certs:ro \
        "${IMAGE_NGINX}"
fi

echo "=== Cleaning up old images ==="
docker image prune -a -f

echo "=== Deploy complete ==="
