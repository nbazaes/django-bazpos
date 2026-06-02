# AGENTS.md

## Repo Map
- `bazpos/` — Django project config (settings, urls, WSGI, API router at `api_urls.py`).
- `gerenteApp/` — management app: Proveedor, Factura, Usuario, Ubicacion models + DRF ViewSets.
- `vendedorApp/` — sales app: Producto, Venta, StockProductoUbicacion models + DRF ViewSets.
- `docker/` — helper Django app with management commands (`setup_groups`, `create_admin`).
- `frontend/` — Vite 8 / React 19 MPA; each HTML page sets `window.__PAGE_ID__`.
- `static/` — legacy assets; `sb-admin-2*.css` is built from SCSS.

## Commands
- Frontend: `cd frontend && npm install && npm run dev`
- Check: `cd frontend && npm run lint && npm run build`
- Backend dev: `python manage.py runserver`
- Migrate: `python manage.py migrate`
- Bootstrap roles: `python manage.py setup_groups && python manage.py create_admin`
- SCSS rebuild: `npx sass static/scss/sb-admin-2.scss static/css/sb-admin-2.css --style=expanded --no-source-map` (repeat `.min.css` with `--style=compressed`)
- After SCSS rebuild: `cp static/css/sb-admin-2.min.css frontend/public/css/`

## Architecture
- Frontend and backend are fully decoupled. The frontend makes API calls to an absolute URL configured via `VITE_API_BASE_URL` in `frontend/.env`.
- No Vite proxy. No shared Nginx. No Docker images.
- CORS is enforced on the backend (`CORS_ALLOWED_ORIGINS` in `.env`).
- The frontend serves its own copy of `sb-admin-2.min.css` from `public/css/`.

## API
Router at `bazpos/api_urls.py`. Endpoints under `/api/`:
- `auth/token/`, `auth/token/refresh/`, `auth/me/`
- `dashboard/stats/`
- CRUD: `productos`, `ventas`, `proveedores`, `facturas`, `usuarios`, `ubicaciones`

## Auth & Roles
Three groups via `setup_groups`: Vendedor, Encargado, Gerente. `RoleActionPermission` at `bazpos/permissions.py` maps DRF actions to allowed roles per ViewSet. Frontend `main-mpa.jsx` whitelists `GERENTE_PAGES` for Encargado/Gerente only.

## Frontend Rules
- `vite.config.js` is the source of truth for entrypoints. Add/rename HTML pages there.
- `main-mpa.jsx` dispatches by `window.__PAGE_ID__`; `index.html` uses `main.jsx` (SPA-style dashboard).
- No TypeScript — plain JSX with ESLint only.
- Copy `frontend/.env.example` → `frontend/.env` and set the backend URL. Never commit `.env`.

## Backend / Env
- Copy `.env.example` → `.env`. Never commit `.env`.
- Set `CORS_ALLOWED_ORIGINS` to the frontend origin(s) (comma-separated).
- MySQL via PyMySQL (pinned). Do not swap drivers.
- No Python linting, typechecking, or tests configured (all `tests.py` are empty stubs).
