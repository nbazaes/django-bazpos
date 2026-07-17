# BazPOS - Sistema de Punto de Venta

Sistema POS con backend Django REST + JWT y frontend React (Vite) SPA.

## Arquitectura

- **Backend:** Django 5 + Django REST Framework + SimpleJWT + MariaDB 12
- **Apps:**
  - `gerenteApp` — gestión: proveedores, facturas, usuarios, ubicaciones
  - `vendedorApp` — ventas: productos, ventas, stock por ubicación
  - `docker` — management commands: `setup_groups`, `create_admin`
- **Frontend:** React 19 + Vite 8 SPA con react-router-dom. Entrada única: `frontend/index.html` → `src/main.jsx` → `src/router.jsx`
- **Despliegue:** Docker Compose (MariaDB + Django/Gunicorn + nginx)

## API

Router en `bazpos/api_urls.py`. Endpoints bajo `/api/`:

- `POST /api/auth/token/` — login JWT
- `POST /api/auth/token/refresh/` — refresh token
- `GET /api/auth/me/` — usuario actual
- `GET /api/dashboard/stats/` — estadísticas del dashboard
- CRUD: `/api/productos/`, `/api/ventas/`, `/api/proveedores/`, `/api/facturas/`, `/api/usuarios/`, `/api/ubicaciones/`

## Requisitos

- **Python 3.13+**
- **MariaDB 12+** (o MySQL 8.0+)
- **Node.js 20+** (frontend)
- **Docker + Docker Compose** (producción)

## Desarrollo Local

### Backend

```bash
git clone <repo> && cd bazpos
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env   # editar credenciales
python manage.py migrate
python manage.py setup_groups
python manage.py create_admin
python manage.py runserver
```

Para acceder desde otras PCs en LAN:

```bash
python manage.py runserver 0.0.0.0:8000
```

### Frontend

```bash
cd frontend
npm install
cp .env.example .env   # por defecto VITE_API_BASE_URL=/api
npm run dev            # http://127.0.0.1:5173
```

Para acceder desde otras PCs en LAN:

```bash
npm run dev -- --host 0.0.0.0
```

Verificar lint y build:

```bash
cd frontend && npm run lint && npm run build
```

## Docker (Producción / LAN)

1. Copiar y editar el archivo de entorno de producción:

```bash
cp .env.production.example .env
# Editar secretos: DJANGO_SECRET_KEY, DJANGO_ALLOWED_HOSTS, contraseñas, etc.
```

2. Levantar el stack:

```bash
docker compose up -d --build
```

Servicios:

- **MariaDB** (`bazpos_db`)
- **Django + Gunicorn** (`bazpos_app`) — migraciones, grupos, superusuario y `collectstatic` automáticos
- **nginx** (`bazpos_nginx`) — sirve el SPA y el API en el puerto `80`

Rebuild tras cambios:

```bash
docker compose up -d --build
```

### Despliegue LAN/VPN con Tailscale

1. Instalar Tailscale en el servidor y habilitar Magic DNS.
2. Incluir el hostname Tailscale en `DJANGO_ALLOWED_HOSTS` (ej. `bazpos-server.tailnet-name.ts.net`).
3. Ejecutar `docker compose up -d --build`.
4. Desde cada cliente, abrir `http://<tailscale-hostname>`.

### Management commands útiles

- `python manage.py setup_groups` — crea grupos y permisos (Vendedor, Encargado, Gerente)
- `python manage.py create_admin` — crea superusuario desde variables de entorno
- `python manage.py collectstatic` — recolecta estáticos

## Base de Datos

```sql
CREATE DATABASE bazpos_db CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE USER 'bazpos'@'localhost' IDENTIFIED BY 'tu_password';
GRANT ALL PRIVILEGES ON bazpos_db.* TO 'bazpos'@'localhost';
FLUSH PRIVILEGES;
```

## Variables de Entorno

Nunca commitear `.env`.

### Backend

Para desarrollo local copiar `.env.example` → `.env`.  
Para producción con Docker copiar `.env.production.example` → `.env`.

| Variable | Descripción |
|---|---|
| `DJANGO_SECRET_KEY` | Clave secreta de Django |
| `DJANGO_DEBUG` | `True`/`False` (debe ser `False` en producción) |
| `DJANGO_ALLOWED_HOSTS` | Hosts separados por coma |
| `DB_PASSWORD` | Contraseña MariaDB |
| `DB_HOST` | Host MariaDB (`db` en Docker, `127.0.0.1` en local) |
| `DB_USER` | Usuario MariaDB |
| `DB_NAME` | Nombre de la BD |
| `DB_PORT` | Puerto MariaDB (default `3306`) |
| `CORS_ALLOWED_ORIGINS` | Orígenes CORS adicionales (puede quedar vacío en mismo origen) |
| `CSRF_TRUSTED_ORIGINS` | Orígenes CSRF de confianza |
| `MYSQL_ROOT_PASSWORD` | Password root del contenedor MariaDB |
| `MYSQL_DATABASE` | BD inicial del contenedor MariaDB |
| `MYSQL_USER` | Usuario inicial del contenedor MariaDB |
| `MYSQL_PASSWORD` | Password inicial del contenedor MariaDB |
| `ADMIN_USER` | Superusuario creado por `create_admin` (Docker) |
| `ADMIN_EMAIL` | Email del superusuario (Docker) |
| `ADMIN_PASS` | Password del superusuario (Docker) |

### Frontend

Copiar `frontend/.env.example` → `frontend/.env`.

| Variable | Descripción |
|---|---|
| `VITE_API_BASE_URL` | Ruta del API. Default `/api` (mismo origen en producción). Para dev separado: `http://localhost:8000/api` |
| `VITE_BACKEND_URL` | URL base del backend para redirecciones/media. Default vacío (mismo origen) |
| `VITE_STORE_NAME` | Nombre mostrado en la UI (default: `BAZPOS`) |

## Estructura del Proyecto

```
bazpos/
├── bazpos/              # Configuración Django (settings, urls, api_urls, wsgi, permissions)
├── gerenteApp/          # App de gestión (modelos, API, admin)
├── vendedorApp/         # App de ventas (modelos, API, admin)
├── docker/              # Management commands (setup_groups, create_admin)
├── frontend/            # React SPA (Vite)
│   ├── src/             # Componentes, páginas, hooks, router, guards, API client
│   ├── public/          # Activos estáticos (CSS, imágenes)
│   ├── index.html       # Entrada única de la SPA
│   └── vite.config.js
├── static/              # Assets legacy (Django admin, vendor)
├── Dockerfile           # Imagen Python/Django
├── Dockerfile.nginx     # Imagen nginx con el SPA
├── docker-entrypoint.sh # Entrypoint del contenedor app
├── nginx.conf           # Configuración nginx
├── compose.yaml         # MariaDB + App + Nginx
└── requirements.txt     # Dependencias Python
```

## Auth y Roles

- Tres grupos: **Vendedor**, **Encargado**, **Gerente**.
- `RoleActionPermission` mapea acciones DRF a roles por ViewSet. Los superusuarios bypassan todo.
- Autenticación JWT vía `rest_framework_simplejwt`.

## Notas

- El frontend es una **SPA**; las rutas antiguas en `frontend/gerencia/`, `frontend/ventas/`, `frontend/registration/` y los HTML sueltos (`admin.html`, `forgot-password.html`, `404.html`) son restos del antiguo MPA y no se usan.
- `DEBUG` se controla con la variable `DJANGO_DEBUG`.
- Driver MySQL: **PyMySQL** (version pinnada en `settings.py`). No cambiar sin revisar compatibilidad con MariaDB.

## Licencias

Ver `THIRD_PARTY_NOTICES.md` y `licenses/`.
