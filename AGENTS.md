# AGENTS.md

## Repo Map
- `bazpos/` — Django project config (settings, urls, WSGI, API router at `api_urls.py`, middleware, permissions).
- `gerenteApp/` — management app: Proveedor, Factura (DetalleFactura), PrecioHistorico, Tax, StoreConfig models + DRF ViewSets (Usuarios via Django's User through UserViewSet).
- `vendedorApp/` — sales app: Producto, Venta (PagoVenta, DetalleVenta, Anulacion), Devolucion (DetalleDevolucion), StockProductoUbicacion, Ubicacion, AjusteStock, StockHistorico, Pedido, PedidoDetalle, PedidoProveedorDia, ItemPedidoProveedor, CierreCaja models + DRF ViewSets. Also hosts `CierreCaja*`, `DashboardStats`, `ReportesStats`, the custom report builder (`ReporteSchemaView`, `ReporteQueryView`, `ReporteExportView`) API views, and the public catalog (`publico_api.py`). Cross-app quirk: the `Ubicacion` model is here but its `UbicacionViewSet` lives in `gerenteApp/api.py`.
- `chatApp/` — internal team chat (ChatMessage, ChatPresence + two APIView endpoints, no ViewSet/router). Polls `/api/chat/state/`, posts to `/api/chat/messages/`; messages purge after 8h idle (daily reset).
- `.agents/skills/` + `skills-lock.json` — repo-local OpenCode agent skills, not part of the app.
- `docker/` — helper Django app with management commands (`setup_groups`, `create_admin`, `seed_data`, `seed_ventas_diarias`, `seed_stock_historico`, `profile_endpoints`).
- `frontend/` — Vite 8 / React 19 SPA with react-router-dom v7. Single entrypoint: `src/main.jsx` → `src/router.jsx`.
- `static/` — legacy assets (Django admin, vendor).
- `docs/` — Diátaxis user & technical manuals (`manual-usuario.md`, `guia-tecnica.md` + `.docx`). The technical guide is the API/data-model reference; source of truth is the code.
- `ops/` — ops/infra tooling: `backup/` (restic → Backblaze B2 backup script) and `staging/` (terraform/libvirt). `ops/staging/` is untracked/ignored.
- `Dockerfile` / `Dockerfile.nginx` / `docker-entrypoint.sh` / `nginx.conf` / `compose.yaml` / `compose.prod.yaml` — container definitions.

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

# Container memory is capped for a 1 vCPU / 1 GiB VPS: db 448m, app 320m, nginx 64m.
# MariaDB tuning lives in docker/mariadb/zz-bazpos-tuning.cnf (buffer pool 128M, max_connections 30).
# Gunicorn runs 2 sync workers (--max-requests 500 ± 50). Do not raise workers/mem_limit without
# measuring `docker stats` and API latency first. See docs/guia-tecnica.md §5.6.
# Query N+1 audit: python manage.py profile_endpoints (works with DEBUG=False).

# Bootstrap roles & superuser (already run on container start)
python manage.py migrate
python manage.py setup_groups
python manage.py create_admin
# Seed demo data (optional)
python manage.py seed_data
```

## Release & Changelog
- `CHANGELOG.md` (repo root) is bundled into the frontend at build time (`import.meta.env.CHANGELOG` in `vite.config.js`) and shown to users in a "Novedades" modal (auto-opens once per new version via localStorage `bazpos_changelog_seen`, plus a "Novedades" button in the sidebar).
- To cut a release (after feature commits are on the branch), control the version with `npm version` (default: bumps `package.json`, commits the bare version `X.Y.Z`, and creates tag `vX.Y.Z`), then generate the changelog:
  ```bash
  cd frontend
  npm version X.Y.Z   # X.Y.Z = whatever you decide; or npm version patch|minor|major
  npm run release     # LLM-drafts a CHANGELOG.md entry for the version it finds in package.json
  git add ../CHANGELOG.md
  git commit -m "changelog X.Y.Z"
  ```
  Review/edit `../CHANGELOG.md` (LLM drafts; it's user-facing Chilean Spanish) before committing. `npm run release` never bumps the version — it only generates the changelog entry for whatever version is already in `package.json`. The LLM call is optional — it falls back to a plain commit-subject list if no API key is set.
- `npm run changelog` regenerates an entry without bumping the version.
- LLM config (OpenRouter, free auto-routing) via env vars read from shell env or `frontend/.env`: `BAZPOS_LLM_API_KEY` (sk-or-…), `BAZPOS_LLM_BASE_URL` (default `https://openrouter.ai/api/v1`), `BAZPOS_LLM_MODEL` (default `openrouter/auto:free`).
- `Dockerfile.nginx` copies `CHANGELOG.md` into the build context so the bundled modal stays in sync with the deployed version.

## Architecture
- Three services via Docker Compose: MariaDB, Django + Gunicorn, and nginx. Frontend SPA is built into the nginx container (`Dockerfile.nginx` two-stage build) and served from the same origin as the API.
- Default API base is a relative path (`/api`). CORS is only needed when the frontend dev server runs on a different origin.
- Frontend is a **SPA** (react-router-dom v7) with a single `frontend/index.html` entrypoint. All routes live in `frontend/src/router.jsx` — do not add new HTML pages.
- Both `package-lock.json` (npm) and `pnpm-lock.yaml` are tracked. CI uses `npm ci`; use whichever you actually install with, but keep the corresponding lockfile in sync.
- Nginx always redirects HTTP→HTTPS. For local Docker testing without certs, this will fail — either provide certs or modify nginx.conf temporarily.
- `collectstatic` uses `--clear` flag, wiping the staticfiles dir before collecting. The dir is a Docker volume in production.
- `@tanstack/react-query` is used for server-state caching in the frontend.

## API
Router at `bazpos/api_urls.py`. Endpoints under `/api/`:
- `auth/token/`, `auth/token/refresh/`, `auth/me/`
- `store-name/` (public, no auth): returns `{"name": settings.STORE_NAME}` — runtime store name
- `dashboard/stats/`, `reportes/stats/`, `reportes/custom/schema/`, `reportes/custom/query/`, `reportes/custom/export/`, `cierre-caja/`, `cierre-caja/historial/`, `cierre-caja/detalle/`
- `chat/state/`, `chat/messages/` (team chat — APIViews, not router)
- `publico/catalogo/` — public product catalog with stock. The only `AllowAny` endpoint besides `store-name/`; throttled 120/min. Actions: `/marcas`, `/oems`. Impl: `vendedorApp/publico_api.py`.
- CRUD: `productos`, `ventas`, `proveedores`, `facturas`, `usuarios`, `devoluciones`, `ubicaciones`, `pedidos`, `configuracion`, `pedidos-proveedor`
- Health check: `/health/` (used by Docker healthcheck)

## API Client (`frontend/src/lib/api.js`)
- `apiRequest()` auto-refreshes the JWT on 401: tries `/auth/token/refresh/` → retries the request → clears tokens and redirects on double failure.
- `redirectToLogin()` clears tokens and navigates to `/login` (api.js:4).

## Auth & Roles
- Four groups via `setup_groups`: Vendedor, Bodeguero, Encargado, Gerente.
- `RoleActionPermission` at `bazpos/permissions.py` maps DRF actions to allowed roles per ViewSet. Superusers bypass all role checks.
- `HasKnownRole` requires one of the four business roles for any protected endpoint.
- JWT auth via `rest_framework_simplejwt`. Session auth also enabled for Django admin.

## Guards (frontend routing)
- `ProtectedRoute` calls `/auth/me/` on mount to validate JWT on every protected route visit.
- `GerenteGuard` — allows Gerente and Encargado roles (wraps product/management routes, plus `/reportes` and `/cierre-caja`).
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
- `STORE_NAME` (settings) reads the env var of the same name (default `BAZPOS`). Install-time: the container runs `sync_store_config` on start, copying `STORE_NAME`/`STORE_LOCALE` into `StoreConfig.nombre`/`locale`, which are read-only in the API (not editable in the Configuración UI). Served publicly at `/api/store-name/`; the frontend reads `config.nombre` at runtime (see `frontend/src/lib/storeConfig.js`), falling back to the build-time `VITE_STORE_NAME`. Edit `.env` → `docker compose up -d` to change the name without rebuilding the nginx image.

## Frontend Rules
- Plain JSX with ESLint only. No TypeScript.
- Node 24 required (`package.json` engines `>=24 <25`); CI uses Node 24.
- Pages are lazy-loaded: register new pages in `frontend/src/lazyRoutes.jsx`, not as static imports in `router.jsx`.
- `router.jsx` is the source of truth for all routes and page structure.
- `Shell.jsx` is the layout wrapper (sidebar + topbar + content area with dark/light theme toggle).
- Design uses a corporate purple palette with CSS custom properties (see `frontend/src/design-system.css`).

## Python Rules
- No linting, typechecking, or test framework (pytest) configured. Tests use Django's `manage.py test` (TestCases in each app's `tests.py`).
- Tests create business groups via `call_command("setup_groups")`; shared fixtures live in `docker/test_utils.py` (`create_business_groups`, `make_user`, `auth_client`).
- The test DB is `test_bazpos_db` — the local DB user needs `ALL ON test_bazpos_db.*`. CI uses the MariaDB service with root, so it works out of the box.
- Run tests locally: `python manage.py test --noinput`. CI (`.github/workflows/test.yml`) runs the backend suite on a MariaDB 12 service, then frontend lint+build on Node 24, then builds/pushes `app-*`/`nginx-*` images to `ghcr.io`. `.github/workflows/deploy.yml` auto-deploys to the VPS via SSH after a successful CI push to `main`.
- MySQL driver is PyMySQL (pinned). Do not swap to mysqlclient or other drivers.
- Docker entrypoint runs: `wait-for-db → migrate → setup_groups → create_admin → collectstatic --clear → gunicorn` (2 sync workers).
- MariaDB (not SQLite): SQLite was evaluated and rejected — `select_for_update` is a no-op there and multi-worker stock updates would race. Keep MariaDB for scaling; mitigate resource use with the mem_limits and `docker/mariadb/zz-bazpos-tuning.cnf`.
