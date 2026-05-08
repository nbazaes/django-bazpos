# AGENTS.md

## Repo Map
- `api/` is the Django REST backend.
- `frontend/` is a separate Vite/React app with multiple HTML entrypoints.
- `static/` contains legacy/static assets; `static/css/sb-admin-2*.css` is built from SCSS.

## Commands
- Frontend install/run: `cd frontend && npm install && npm run dev`
- Frontend check/build: `cd frontend && npm run lint && npm run build`
- Legacy CSS rebuild: `npx sass static/scss/sb-admin-2.scss static/css/sb-admin-2.css --style=expanded --no-source-map` and `npx sass static/scss/sb-admin-2.scss static/css/sb-admin-2.min.css --style=compressed --no-source-map`

## Frontend Rules
- `frontend/vite.config.js` is the source of truth for page entrypoints; if you add or rename an HTML page, update the `build.rollupOptions.input` map.
- `frontend/src/main-mpa.jsx` dispatches pages by `window.__PAGE_ID__` and redirects non-`gerente` users away from manager-only pages.
- Vite dev proxies `/api` and `/static` to `http://127.0.0.1:8000`; keep the backend running there for local frontend work.
- `frontend/src/lib/config.js` defaults API calls to `/api`; set `VITE_API_BASE_URL` only when you need a different backend.

## Backend / Env
- Copy `.env.example` to `.env`; never commit `.env`.
- The backend expects MySQL and `DB_PASSWORD` from the environment.
- `requirements.txt` currently pins `PyMySQL`; do not swap MySQL drivers unless you are intentionally changing deployment behavior.

## Verification
- Prefer `npm run lint` before `npm run build` for frontend changes.
- When changing Django code or migrations, run the narrowest relevant Django test command from the repo root.
