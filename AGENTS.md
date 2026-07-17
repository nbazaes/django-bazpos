# AGENTS.md

## Repo Map
- `bazpos/` — Django project config (settings, urls, WSGI, API router at `api_urls.py`).
- `gerenteApp/` — management app: Proveedor, Factura, Usuario, Ubicacion models + DRF ViewSets.
- `vendedorApp/` — sales app: Producto, Venta, StockProductoUbicacion models + DRF ViewSets.
- `docker/` — helper Django app with management commands (`setup_groups`, `create_admin`).
- `frontend/` — Vite 8 / React 19 SPA with react-router-dom. Single entrypoint: `src/main.jsx` → `src/router.jsx`.
- `static/` — legacy assets; `sb-admin-2*.css` is built from SCSS and copied into `frontend/public/css/`.
- `Dockerfile` / `Dockerfile.nginx` / `docker-entrypoint.sh` / `nginx.conf` / `compose.yaml` — production container definitions.
- `deploy/` — **removed**. Production is handled by Docker Compose.

## Commands
```bash
# Frontend dev server (local only)
cd frontend && npm run dev
# Frontend dev server (LAN accessible — for testing from other PCs)
cd frontend && npm run dev -- --host 0.0.0.0

# Frontend verify (lint → build)
cd frontend && npm run lint && npm run build

# Backend dev server (local only, requires .env + DB)
python manage.py runserver
# Backend dev server (LAN accessible)
python manage.py runserver 0.0.0.0:8000

# Production: build and run the whole stack (nginx + Django + MariaDB)
cp .env.production.example .env   # edit secrets before running
docker compose up -d --build
# Rebuild after code changes
docker compose up -d --build

# Bootstrap roles & superuser (already run on container start)
python manage.py migrate
python manage.py setup_groups
python manage.py create_admin

# SCSS rebuild (then copy to frontend)
npx sass static/scss/sb-admin-2.scss static/css/sb-admin-2.css --style=expanded --no-source-map
npx sass static/scss/sb-admin-2.scss static/css/sb-admin-2.min.css --style=compressed --no-source-map
cp static/css/sb-admin-2.min.css frontend/public/css/
```

## Architecture
- Decoupled services via Docker Compose: MariaDB, Django + Gunicorn, and nginx each run in their own container.
- The frontend SPA is built into the nginx container and served from the same origin as the API, so the default API base is a relative path (`/api`).
- CORS is only needed if the API is accessed from a different origin; with the default setup it can be left empty.
- Frontend is a **SPA** (react-router-dom v7), NOT an MPA. The old HTML files in `frontend/gerencia/`, `frontend/ventas/`, `frontend/registration/`, `frontend/404.html`, `frontend/admin.html`, and `frontend/forgot-password.html` are **dead MPA leftovers** — do not edit them. All routes are defined in `frontend/src/router.jsx`.
- `GerenteGuard` (`frontend/src/guards.jsx:33`) wraps product/management routes — only Gerente and Encargado roles can access them.
- `ProtectedRoute` calls `/auth/me/` on mount to validate the JWT on every protected route visit.

## Production / LAN Deployment
- Production stack runs on a **single server** via Docker Compose: MariaDB container, Django + Gunicorn container, and nginx container. All services are isolated and can be scaled independently later.
- The frontend SPA is built into the nginx container and served on port 80 from the same origin as the API. Client machines only need a browser and a Tailscale connection.
- Backend is exposed through nginx (reverse proxy) on port 80. Gunicorn is not exposed directly.
- DB is inside a Docker container and reachable only on the internal Docker network — never exposed to the LAN or internet.
- `DEBUG` is controlled via `DJANGO_DEBUG` env var. Settings.py reads it at line 37:
  `DEBUG = os.environ.get("DJANGO_DEBUG", "False") == "True"`. Must be `False` in production.
- For LAN/VPN deployment:
  1. Install Tailscale on the server and enable Magic DNS.
  2. Copy `.env.production.example` to `.env` and set real secrets, `DJANGO_SECRET_KEY`, and `DJANGO_ALLOWED_HOSTS` (include the Tailscale hostname, e.g., `bazpos-server.tailnet-name.ts.net`).
  3. Run `docker compose up -d --build`.
  4. On each client PC, open a browser and navigate to `http://<tailscale-hostname>`.

## API
Router at `bazpos/api_urls.py`. Endpoints under `/api/`:
- `auth/token/`, `auth/token/refresh/`, `auth/me/`
- `dashboard/stats/`
- CRUD: `productos`, `ventas`, `proveedores`, `facturas`, `usuarios`, `ubicaciones`

## API Client (`frontend/src/lib/api.js`)
- `apiRequest()` auto-refreshes the JWT on 401: tries `/auth/token/refresh/` → retries the request → falls through to redirect on double failure.
- `redirectToLogin()` clears tokens and redirects to `/registration/login.html` — this is a leftover MPA URL. It works because the SPA catches `/login` via the router. Do not rely on this redirect; prefer navigating to `/login` inside the SPA.

## Auth & Roles
- Three groups via `setup_groups`: Vendedor, Encargado, Gerente.
- `RoleActionPermission` at `bazpos/permissions.py` maps DRF actions to allowed roles per ViewSet. Superusers bypass all role checks.
- JWT auth via `rest_framework_simplejwt`. Session auth also enabled for Django admin.

## Django Settings Gotchas
- `DEBUG` is controlled by `DJANGO_DEBUG` env var (set to `True` in `.env` for dev).
- **PyMySQL version override** at the top of `settings.py:19-20` pins `(2, 2, 1)`. Do not remove or change this without understanding MariaDB compatibility.
- `load_dotenv()` runs at module level in settings.py — `.env` must exist at startup or env vars must be set externally.
- `LANGUAGE_CODE = "es-cl"` (Chilean Spanish). DRF responses may be in Spanish from the DB.
- `RequestLogMiddleware` is first in `MIDDLEWARE` to log all requests to a ring buffer (viewable at `/admin/logs/` by superusers).

## Frontend Env Vars
Copy `frontend/.env.example` → `frontend/.env`. Never commit `.env`.
- `VITE_API_BASE_URL` — backend API path. Default is `/api` (relative, same origin) for the Docker production setup. Override with an absolute URL (e.g. `http://localhost:8000/api`) only when running the Vite dev server separately from the backend.
- `VITE_BACKEND_URL` — backend base URL for redirects/media. Default is empty (same origin). Override only for local dev.
- `VITE_STORE_NAME` — displayed in UI (default: `BAZPOS`)

## Backend Env Vars
Copy `.env.production.example` → `.env` for production deployments. For local development, use `.env.example`.
Never commit `.env`.
- `DJANGO_DEBUG` — `True` enables debug mode (must be `False` in production)
- `CORS_ALLOWED_ORIGINS` — comma-separated frontend origins. Can be left empty when the SPA is served from the same origin as the API.
- `CSRF_TRUSTED_ORIGINS` — comma-separated origins for CSRF. Can be left empty for same-origin deployments.
- `DB_PASSWORD`, `DB_HOST`, `DB_USER`, `DB_NAME`, `DB_PORT` — MariaDB connection
- `DJANGO_SECRET_KEY`, `DJANGO_ALLOWED_HOSTS`
- `MYSQL_ROOT_PASSWORD`, `MYSQL_DATABASE`, `MYSQL_USER`, `MYSQL_PASSWORD` — MariaDB container initialization

## Frontend Rules
- Plain JSX with ESLint only. No TypeScript.
- `router.jsx` is the source of truth for all routes and page structure.
- `Shell.jsx` is the layout wrapper (sidebar + topbar + content area with dark/light theme toggle).
- Design uses a corporate purple palette with CSS custom properties (see `frontend/src/design-system.css`).

## Python Rules
- No linting, typechecking, or tests configured. All `tests.py` files are empty stubs.
- MySQL driver is PyMySQL (pinned). Do not swap to mysqlclient or other drivers.
- Docker entrypoint runs `migrate → setup_groups → create_admin → collectstatic → gunicorn` in sequence.
