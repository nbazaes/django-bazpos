# BazPOS - Sistema de Punto de Venta

Sistema POS con backend Django REST + JWT y frontend React (Vite) multipágina.

## Arquitectura

- **Backend:** Django 5 + DRF + SimpleJWT + MySQL/MariaDB en `bazpos/`
- **Apps:** `gerenteApp` (gestión) y `vendedorApp` (ventas)
- **Frontend:** React 19 + Vite 8 en `frontend/`, con entradas HTML independientes por módulo
- **Despliegue:** Docker Compose (MariaDB + Gunicorn + Nginx)

## Endpoints API

- `POST /api/auth/token/` — login JWT
- `POST /api/auth/token/refresh/` — refresh token
- `GET /api/auth/me/` — usuario actual
- `GET /api/dashboard/stats/` — estadísticas
- CRUD: `/api/productos/`, `/api/ventas/`, `/api/proveedores/`, `/api/facturas/`, `/api/usuarios/`

## Requisitos

- **Python 3.13+**
- **MySQL 8.0+** o **MariaDB 12+**
- **Node.js 20+** (frontend)

## Desarrollo Local

### Backend

```bash
git clone <repo> && cd bazpos
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env   # editar credenciales
DB_PASSWORD='...' python manage.py migrate
DB_PASSWORD='...' python manage.py createsuperuser
DB_PASSWORD='...' python manage.py runserver
```

### Frontend

```bash
cd frontend
npm install
npm run dev           # http://127.0.0.1:5173
```

El dev server de Vite proxea `/api` y `/static` a `http://127.0.0.1:8000`.

### Build frontend

```bash
cd frontend && npm run build
```

## Docker (Producción)

```bash
docker compose up -d
```

Esto levanta:
- **MariaDB 12** (`bazpos_db`)
- **App Django** con Gunicorn (`bazpos_app`) — migraciones, grupos, superusuario y collectstatic automáticos
- **Nginx** (`bazpos_nginx`) — sirve en `http://127.0.0.1:80`

### Management commands útiles

- `python manage.py setup_groups` — configura grupos y permisos
- `python manage.py create_admin` — crea superusuario desde variables de entorno
- `python manage.py collectstatic` — recolecta estáticos

## SCSS Legacy

```bash
npx sass static/scss/sb-admin-2.scss static/css/sb-admin-2.css --style=expanded --no-source-map
npx sass static/scss/sb-admin-2.scss static/css/sb-admin-2.min.css --style=compressed --no-source-map
```

## Base de Datos

```sql
CREATE DATABASE bazpos_db CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE USER 'bazpos'@'localhost' IDENTIFIED BY 'tu_password';
GRANT ALL PRIVILEGES ON bazpos_db.* TO 'bazpos'@'localhost';
FLUSH PRIVILEGES;
```

## Variables de Entorno (`.env`)

| Variable | Descripción |
|---|---|
| `DJANGO_SECRET_KEY` | Clave secreta de Django |
| `DJANGO_DEBUG` | `True`/`False` |
| `DJANGO_ALLOWED_HOSTS` | Hosts separados por coma |
| `DB_PASSWORD` | Contraseña MySQL |
| `DB_HOST` | Host MySQL (default: `127.0.0.1`) |
| `DB_USER` | Usuario MySQL (default: `nicolas`) |
| `DB_NAME` | Nombre BD (default: `bazpos_db`) |
| `CORS_ALLOWED_ORIGINS` | Orígenes CORS adicionales |
| `ADMIN_USER` | Superusuario (Docker) |
| `ADMIN_EMAIL` | Email superusuario (Docker) |
| `ADMIN_PASS` | Password superusuario (Docker) |

## Estructura del Proyecto

```
bazpos/
├── bazpos/              # Configuración Django (settings, urls, api_urls, wsgi)
├── gerenteApp/          # App de gestión (modelos, API, admin, vistas)
├── vendedorApp/         # App de ventas (modelos, API, admin, vistas)
├── frontend/            # React + Vite (entradas: admin, ventas, gerencia, etc.)
│   ├── src/            # Componentes React
│   ├── gerencia/       # HTML: proveedores, usuarios, facturas, ubicaciones
│   ├── ventas/         # HTML: venta, pedidos, inventario, productos
│   └── vite.config.js  # Proxy API + rollup entries
├── static/              # CSS, SCSS, vendor
│   ├── css/
│   ├── scss/
│   └── vendor/
├── docker/              # Recursos Docker
├── Dockerfile           # Imagen Python Django
├── Dockerfile.nginx     # Imagen Nginx personalizada
├── compose.yaml         # MariaDB + App + Nginx
├── nginx.conf           # Configuración Nginx
└── requirements.txt     # Dependencias Python
```

## Licencias

Ver `THIRD_PARTY_NOTICES.md` y `licenses/`.
