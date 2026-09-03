# BazPOS — Point of Sale System

POS system with a Django REST + JWT backend and a React (Vite) SPA frontend.

## Architecture

- **Backend:** Django 6 + Django REST Framework + SimpleJWT + MariaDB 12
- **Apps:**
  - `gerenteApp` — management: suppliers, invoices, price history, taxes, store configuration
  - `vendedorApp` — sales: products, sales, stock by location, returns, orders, supplier orders, cash register closing, reports and custom report builder
  - `chatApp` — internal chat between active users
  - `docker` — management commands: `setup_groups`, `create_admin`, `seed_data`, `seed_ventas_diarias`, `seed_stock_historico`, `profile_endpoints`
- **Frontend:** React 19 + Vite 8 SPA with react-router-dom v7. Single entrypoint: `frontend/index.html` → `src/main.jsx` → `src/router.jsx`
- **Deployment:** Docker Compose (MariaDB + Django/Gunicorn + nginx)

## API

Router at `bazpos/api_urls.py`. Endpoints under `/api/`:

- `POST /api/auth/token/` — JWT login
- `POST /api/auth/token/refresh/` — refresh token
- `GET /api/auth/me/` — current user
- `GET /api/store-name/` — runtime store name (public, no auth)
- `GET /api/dashboard/stats/` — dashboard statistics
- `GET /api/reportes/stats/` — reports module statistics
- `POST /api/reportes/custom/schema/` — column schema for the custom report builder
- `POST /api/reportes/custom/query/` — custom report query
- `GET /api/reportes/custom/export/` — custom report CSV export
- `GET /api/cierre-caja/` — cash register closing for the day
- `GET /api/cierre-caja/historial/` — closing history
- `GET /api/cierre-caja/detalle/` — breakdown by payment method, document and returns
- `GET /api/chat/state/` — chat state (presence and messages)
- `POST /api/chat/messages/` — send chat messages
- `GET /api/health/` — health check (used by Docker)
- CRUD: `/api/productos/`, `/api/ventas/`, `/api/proveedores/`, `/api/facturas/`, `/api/usuarios/`, `/api/devoluciones/`, `/api/ubicaciones/`, `/api/pedidos/`, `/api/configuracion/`, `/api/pedidos-proveedor/`

The API client (`frontend/src/lib/api.js`) automatically refreshes the JWT on 401.

## Requirements

- **Python 3.12+**
- **MariaDB 12+** (or MySQL 8.0+)
- **Node.js 24** (frontend)
- **Docker + Docker Compose** (production)

## Local Development

### Backend

```bash
git clone <repo> && cd bazpos
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env   # edit credentials
python manage.py migrate
python manage.py setup_groups
python manage.py create_admin
python manage.py runserver
```

To access from other PCs on the LAN:

```bash
python manage.py runserver 0.0.0.0:8000
```

### Frontend

```bash
cd frontend
npm install
cp .env.example .env   # VITE_API_BASE_URL defaults to /api
npm run dev            # http://127.0.0.1:5173
```

To access from other PCs on the LAN:

```bash
npm run dev -- --host 0.0.0.0
```

Verify lint and build:

```bash
cd frontend && npm run lint && npm run build
```

## Docker (Production / LAN)

1. Copy and edit the production environment file:

```bash
cp .env.production.example .env
# Edit secrets: DJANGO_SECRET_KEY, DJANGO_ALLOWED_HOSTS, passwords, etc.
```

2. Bring up the stack:

```bash
docker compose up -d --build
```

Services:

- **MariaDB** (`bazpos_db`) — healthcheck with `mariadb-admin ping`
- **Django + Gunicorn** (`bazpos_app`) — automatic migrations, groups, superuser and `collectstatic --clear`; healthcheck at `/health/`
- **nginx** (`bazpos_nginx`) — serves the SPA and the API on ports `80`/`443`, redirects HTTP→HTTPS

The containers have **memory limits** (`mem_limit`) sized for a 1 GiB VPS: MariaDB 448m, app 320m, nginx 64m (≈832 MiB max, leaving headroom for the host). MariaDB configuration is overridden in `docker/mariadb/zz-bazpos-tuning.cnf` (buffer pool, connections, temp tables). See `docs/guia-tecnica.md §5.6`.

Rebuild after changes:

```bash
docker compose up -d --build
```

### Useful management commands

- `python manage.py setup_groups` — creates groups and permissions (Vendedor, Bodeguero, Encargado, Gerente)
- `python manage.py create_admin` — creates a superuser from environment variables
- `python manage.py seed_data` — loads demo data (optional); `--profile auto_parts` (default) or `--profile generic_retail`
- `python manage.py collectstatic` — collects static files

## Database

```sql
CREATE DATABASE bazpos_db CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE USER 'bazpos'@'localhost' IDENTIFIED BY 'your_password';
GRANT ALL PRIVILEGES ON bazpos_db.* TO 'bazpos'@'localhost';
FLUSH PRIVILEGES;
```

## Environment Variables

Never commit `.env`.

### Backend

For local development copy `.env.example` → `.env`.  
For production with Docker copy `.env.production.example` → `.env`.

| Variable | Description |
|---|---|
| `DJANGO_SECRET_KEY` | Django secret key |
| `DJANGO_DEBUG` | `True`/`False` (must be `False` in production) |
| `DJANGO_ALLOWED_HOSTS` | Comma-separated hosts |
| `DB_PASSWORD` | MariaDB password |
| `DB_HOST` | MariaDB host (`db` in Docker, `127.0.0.1` locally) |
| `DB_USER` | MariaDB user |
| `DB_NAME` | Database name |
| `DB_PORT` | MariaDB port (default `3306`) |
| `CORS_ALLOWED_ORIGINS` | Additional CORS origins (can be empty on same origin) |
| `CSRF_TRUSTED_ORIGINS` | Trusted CSRF origins |
| `MYSQL_ROOT_PASSWORD` | Root password for the MariaDB container |
| `MYSQL_DATABASE` | Initial DB for the MariaDB container |
| `MYSQL_USER` | Initial user for the MariaDB container |
| `MYSQL_PASSWORD` | Initial password for the MariaDB container |
| `ADMIN_USER` | Superuser created by `create_admin` (Docker) |
| `ADMIN_EMAIL` | Superuser email (Docker) |
| `ADMIN_PASS` | Superuser password (Docker) |
| `STORE_NAME` | Store name served at runtime by `/api/store-name/` (default: `BAZPOS`) |

### Frontend

Copy `frontend/.env.example` → `frontend/.env`.

| Variable | Description |
|---|---|
| `VITE_API_BASE_URL` | API path. Default `/api` (same origin in production). For separated dev: `http://localhost:8000/api` |
| `VITE_BACKEND_URL` | Backend base URL for redirects/media. Default empty (same origin) |
| `VITE_STORE_NAME` | Name shown in the UI (default: `BAZPOS`). Build-time fallback; in production the real name is served by the backend at runtime from `STORE_NAME` |

## Project Structure

```
bazpos/
├── bazpos/              # Django configuration (settings, urls, api_urls, wsgi, permissions, middleware)
├── gerenteApp/          # Management app (models, API, admin)
├── vendedorApp/         # Sales app (models, API, admin)
├── chatApp/             # Internal chat between active users
├── docker/              # Management commands (setup_groups, create_admin, seed_data, seed_ventas_diarias, seed_stock_historico, profile_endpoints) + MariaDB tuning
├── docs/                # Diátaxis manuals (manual-usuario, guia-tecnica)
├── frontend/            # React SPA (Vite)
│   ├── src/             # Components, pages, hooks, router, guards, API client
│   ├── scripts/         # Helper scripts (release/changelog)
│   ├── public/          # Static assets (CSS, images)
│   ├── index.html       # Single SPA entrypoint
│   └── vite.config.js
├── ops/                 # Infrastructure tooling (restic/B2 backup, staging terraform)
├── static/              # Legacy assets (Django admin, vendor)
├── staticfiles/         # Collectstatic output (Docker volume in production)
├── media/               # Uploaded files (Docker volume in production)
├── certs/               # TLS certificates for nginx
├── templates/           # Django templates (admin)
├── Dockerfile           # Python/Django image
├── Dockerfile.nginx     # nginx image with the SPA (two-stage build)
├── docker-entrypoint.sh # App container entrypoint
├── nginx.conf           # nginx configuration
├── compose.yaml         # MariaDB + App + Nginx
├── compose.prod.yaml    # Production override
└── requirements.txt     # Python dependencies
```

## Auth and Roles

- Four groups: **Vendedor**, **Bodeguero**, **Encargado**, **Gerente**.
- `RoleActionPermission` maps DRF actions to roles per ViewSet. Superusers bypass everything.
- `HasKnownRole` requires membership in one of the four roles for any protected endpoint.
- JWT authentication via `rest_framework_simplejwt`. Session auth is also enabled for Django admin.

### Guards (frontend)

- `ProtectedRoute` — validates the JWT by calling `/auth/me/` on every protected route visit.
- `GerenteGuard` — allows Gerente and Encargado (management routes: products, suppliers, users, invoices, supplier orders, configuration, reports, cash register closing).
- `BodegueroGuard` — allows Bodeguero, Encargado and Gerente (`/ubicaciones` route).

## Notes

- The frontend is a **SPA** with a single entrypoint at `frontend/index.html`; all routes live in `frontend/src/router.jsx`.
- `DEBUG` is controlled by the `DJANGO_DEBUG` variable.
- MySQL driver: **PyMySQL** (version pinned in `settings.py`). Do not change without reviewing MariaDB compatibility.
- Gunicorn runs with **2 workers** (sync) due to the VPS memory budget (1 vCPU / 1 GiB). Do not raise to 4 without first measuring `docker stats` and latency.
- `LANGUAGE_CODE = "es-cl"` — DRF responses may appear in Spanish.
- `collectstatic` uses the `--clear` flag, which wipes the `staticfiles/` directory before collecting.
- nginx redirects HTTP→HTTPS by default. For local Docker testing without certificates, temporarily modify `nginx.conf`.
- `@tanstack/react-query` is used for server-state caching in the frontend.

## Roadmap

BazPOS is a **productized, single-tenant retail POS**: one Docker installation per customer, each with its own MariaDB. Business rules (tax, currency, rounding, shipping, payment methods, document types, feature flags) live in a single configurable `StoreConfig` edited from the UI — not in code. Optional vertical profiles are enabled with feature flags, so the same codebase serves a generic retailer and an auto-parts shop without forks.

Current status (see `ROADMAP.md`):

- **Unified config** — `StoreConfig` is the single source of truth for tax/rounding; `gerenteApp/pricing.py` + frontend `storeConfig.js` provide one pricing path and one config fetch at app init.
- **Dynamic rules** — payment methods and document types are configurable JSON lists; order-line cost modifiers use a minimal `gerenteApp/store_extensions/` seam (Biocar's 20% rule ships as a reference extension); shipping defaults from config.
- **Feature flags** — `product_oem_fields`, `oem_primary_search`, `order_shipping_toggle`, `order_pricing_rules`, `daily_supplier_orders`, `oem_stock_substitutes`, `supplier_rut_field` gate the auto-parts UI and report columns.
- **Packaging** — first-run setup redirects to configuration, `seed_data --profile generic_retail|auto_parts`, install/backup/upgrade docs (`docs/instalacion.md`).
- **Next (post-2.0)** — full UI redesign (`feat/redesign`) and a plugin framework once there are 3+ vertical profiles.

## Licenses

BazPOS is distributed under the **GNU General Public License v2** (see `LICENSE` in the repository root).

Third-party dependencies are distributed under their respective licenses. See `THIRD_PARTY_NOTICES.md` and `licenses/`.