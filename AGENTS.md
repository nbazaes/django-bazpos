# AGENTS.md

## Repo Map
- `bazpos/` — Django project config (settings, urls, WSGI, API router at `api_urls.py`).
- `gerenteApp/` — management app: Proveedor, Factura, Usuario, Ubicacion models + DRF ViewSets.
- `vendedorApp/` — sales app: Producto, Venta, StockProductoUbicacion models + DRF ViewSets.
- `docker/` — helper Django app with management commands (`setup_groups`, `create_admin`).
- `frontend/` — Vite 8 / React 19 SPA with react-router-dom. Single entrypoint: `src/main.jsx` → `src/router.jsx`.
- `static/` — legacy assets; `sb-admin-2*.css` is built from SCSS and copied into `frontend/public/css/`.
- `deploy/` — production deployment files (systemd units, run script).

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

# Production: start with gunicorn (LAN accessible)
./deploy/run_prod.sh
# Same but with Django runserver instead (dev convenience)
./deploy/run_prod.sh --dev

# Production: enable systemd service (auto-start on boot)
sudo cp deploy/bazpos.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now bazpos

# Bootstrap roles & superuser
python manage.py migrate
python manage.py setup_groups
python manage.py create_admin

# SCSS rebuild (then copy to frontend)
npx sass static/scss/sb-admin-2.scss static/css/sb-admin-2.css --style=expanded --no-source-map
npx sass static/scss/sb-admin-2.scss static/css/sb-admin-2.min.css --style=compressed --no-source-map
cp static/css/sb-admin-2.min.css frontend/public/css/
```

## Architecture
- Fully decoupled frontend/backend. Frontend makes absolute API calls to the URL set in `VITE_API_BASE_URL` (from `frontend/.env`). No Vite proxy.
- CORS enforced on backend via `CORS_ALLOWED_ORIGINS` in root `.env`.
- Frontend is a **SPA** (react-router-dom v7), NOT an MPA. The old HTML files in `frontend/gerencia/`, `frontend/ventas/`, `frontend/registration/`, `frontend/404.html`, `frontend/admin.html`, and `frontend/forgot-password.html` are **dead MPA leftovers** — do not edit them. All routes are defined in `frontend/src/router.jsx`.
- `GerenteGuard` (`frontend/src/guards.jsx:33`) wraps product/management routes — only Gerente and Encargado roles can access them.
- `ProtectedRoute` calls `/auth/me/` on mount to validate the JWT on every protected route visit.

## Production / LAN Deployment
- Targeted architecture: a **single backend server** in the store (Django + Gunicorn), and **Electron-based clients** on each PC that point to the server's LAN IP.
- Backend listens on `0.0.0.0:8000`. Each Electron client sets `VITE_API_BASE_URL=http://<server-lan-ip>:8000/api`.
- DB stays on `127.0.0.1` — never expose MySQL to the network.
- `DEBUG` is controlled via `DJANGO_DEBUG=True` in `.env`. Settings.py reads it at line 37:
  `DEBUG = os.environ.get("DJANGO_DEBUG", "False") == "True"`.
- For LAN testing from other PCs during development, you need three things:
  1. Backend on `0.0.0.0:8000` (`python manage.py runserver 0.0.0.0:8000`)
  2. `.env` updated: `DJANGO_ALLOWED_HOSTS` must include the server's LAN IP, plus `CORS_ALLOWED_ORIGINS` and `CSRF_TRUSTED_ORIGINS` must include the frontend's LAN origin(s)
  3. `frontend/.env` updated: `VITE_API_BASE_URL=http://<server-lan-ip>:8000/api`

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
- `VITE_API_BASE_URL` — absolute backend API URL (e.g. `http://192.168.1.50:8000/api` for LAN)
- `VITE_BACKEND_URL` — backend base URL for redirects/media
- `VITE_STORE_NAME` — displayed in UI (default: `BAZPOS`)

## Backend Env Vars
Copy `.env.example` → `.env`. Never commit `.env`.
- `DJANGO_DEBUG` — `True` enables debug mode (must be `False` in production)
- `CORS_ALLOWED_ORIGINS` — comma-separated frontend origins (include LAN IPs for dev testing)
- `CSRF_TRUSTED_ORIGINS` — comma-separated origins for CSRF
- `DB_PASSWORD`, `DB_HOST`, `DB_USER`, `DB_NAME`, `DB_PORT` — MySQL connection
- `DJANGO_SECRET_KEY`, `DJANGO_ALLOWED_HOSTS`

## Frontend Rules
- Plain JSX with ESLint only. No TypeScript.
- `router.jsx` is the source of truth for all routes and page structure.
- `Shell.jsx` is the layout wrapper (sidebar + topbar + content area with dark/light theme toggle).
- Design uses a corporate purple palette with CSS custom properties (see `frontend/src/design-system.css`).

## Python Rules
- No linting, typechecking, or tests configured. All `tests.py` files are empty stubs.
- MySQL driver is PyMySQL (pinned). Do not swap to mysqlclient or other drivers.
- Docker entrypoint runs `migrate → setup_groups → create_admin → collectstatic → gunicorn` in sequence.
