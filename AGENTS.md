# AGENTS.md

## Repo Map
- `bazpos/` — Django project config (settings, urls, WSGI, API router at `api_urls.py`, middleware, permissions).
- `gerenteApp/` — management app: Proveedor, Factura, Usuario, Ubicacion, StoreConfig models + DRF ViewSets.
- `vendedorApp/` — sales app: Producto, Venta, StockProductoUbicacion, Devolucion, Pedido, PedidoProveedor models + DRF ViewSets.
- `docker/` — helper Django app with management commands (`setup_groups`, `create_admin`, `seed_data`).
- `frontend/` — Vite 8 / React 19 SPA with react-router-dom v7. Single entrypoint: `src/main.jsx` → `src/router.jsx`.
- `static/` — legacy assets (Django admin, vendor).
- `Dockerfile` / `Dockerfile.nginx` / `docker-entrypoint.sh` / `nginx.conf` / `compose.yaml` — production container definitions.

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
# Seed demo data (optional)
python manage.py seed_data
```

## Architecture
- Three services via Docker Compose: MariaDB, Django + Gunicorn, and nginx. Frontend SPA is built into the nginx container (`Dockerfile.nginx` two-stage build) and served from the same origin as the API.
- Default API base is a relative path (`/api`). CORS is only needed when the frontend dev server runs on a different origin.
- Frontend is a **SPA** (react-router-dom v7). Old HTML files in `frontend/gerencia/`, `frontend/ventas/`, `frontend/registration/`, `frontend/404.html`, `frontend/admin.html`, and `frontend/forgot-password.html` are **dead MPA leftovers** — do not edit them. All routes are in `frontend/src/router.jsx`.
- Nginx always redirects HTTP→HTTPS. For local Docker testing without certs, this will fail — either provide certs or modify nginx.conf temporarily.
- `collectstatic` uses `--clear` flag, wiping the staticfiles dir before collecting. The dir is a Docker volume in production.
- `@tanstack/react-query` is used for server-state caching in the frontend.

## API
Router at `bazpos/api_urls.py`. Endpoints under `/api/`:
- `auth/token/`, `auth/token/refresh/`, `auth/me/`
- `dashboard/stats/`
- CRUD: `productos`, `ventas`, `proveedores`, `facturas`, `usuarios`, `devoluciones`, `ubicaciones`, `pedidos`, `configuracion`, `pedidos-proveedor`
- Health check: `/health/` (used by Docker healthcheck)

## API Client (`frontend/src/lib/api.js`)
- `apiRequest()` auto-refreshes the JWT on 401: tries `/auth/token/refresh/` → retries the request → clears tokens and redirects on double failure.
- `redirectToLogin()` redirects to `/registration/login.html` — this is a leftover MPA URL. It works because the SPA catches `/login` via the router. Prefer navigating to `/login` in new code.

## Auth & Roles
- Four groups via `setup_groups`: Vendedor, Bodeguero, Encargado, Gerente.
- `RoleActionPermission` at `bazpos/permissions.py` maps DRF actions to allowed roles per ViewSet. Superusers bypass all role checks.
- `HasKnownRole` requires one of the four business roles for any protected endpoint.
- JWT auth via `rest_framework_simplejwt`. Session auth also enabled for Django admin.

## Guards (frontend routing)
- `ProtectedRoute` calls `/auth/me/` on mount to validate JWT on every protected route visit.
- `GerenteGuard` — allows Gerente and Encargado roles (wraps product/management routes).
- `BodegueroGuard` — allows Bodeguero, Encargado, and Gerente roles (wraps `/ubicaciones`).
- `isGerente()` in auth.js also treats Encargado as Gerente (both have management access).
- `isBodeguero()` in auth.js also allows Encargado and Gerente (both have warehouse access).

## Django Settings Gotchas
- `DEBUG` is controlled by `DJANGO_DEBUG` env var. Must be `False` in production.
- **PyMySQL version override** at the top of `settings.py` pins `(2, 2, 1)`. Do not remove or change — required for MariaDB compatibility.
- `load_dotenv()` runs at module level — `.env` must exist at startup or env vars must be set externally.
- `LANGUAGE_CODE = "es-cl"` (Chilean Spanish). DRF responses may be in Spanish from the DB.
- `RequestLogMiddleware` is first in `MIDDLEWARE` to log all requests to a ring buffer (viewable at `/admin/logs/` by superusers).
- `ALLOWED_HOSTS` reads from `DJANGO_ALLOWED_HOSTS` comma-separated env var.

## Frontend Rules
- Plain JSX with ESLint only. No TypeScript.
- `router.jsx` is the source of truth for all routes and page structure.
- `Shell.jsx` is the layout wrapper (sidebar + topbar + content area with dark/light theme toggle).
- Design uses a corporate purple palette with CSS custom properties (see `frontend/src/design-system.css`).

## Python Rules
- No linting, typechecking, or tests configured. All `tests.py` files are empty stubs.
- MySQL driver is PyMySQL (pinned). Do not swap to mysqlclient or other drivers.
- Docker entrypoint runs: `wait-for-db → migrate → setup_groups → create_admin → collectstatic --clear → gunicorn`.
