# BazPOS - Django Point of Sale System

Sistema de punto de venta desarrollado con Django 5.1.2.

## Requisitos del Sistema

- Python 3.13+
- MySQL 8.0+
- Node.js/npm (para compilar SCSS)

## Instalación - Desarrollo Local

### 1. Clonar el repositorio
```bash
git clone <repository-url>
cd python-bazpos
```

### 2. Crear entorno virtual
```bash
python -m venv .venv
source .venv/bin/activate  # En Windows: .venv\Scripts\activate
```

### 3. Instalar dependencias
```bash
pip install -r requirements.txt
```

### 4. Configurar variables de entorno
```bash
cp .env.example .env
# Editar .env con tus credenciales de MySQL
```

### 5. Ejecutar migraciones
```bash
DB_PASSWORD='tu_password' python manage.py migrate
```

### 6. Crear superusuario
```bash
DB_PASSWORD='tu_password' python manage.py createsuperuser
```

### 7. Ejecutar servidor de desarrollo
```bash
DB_PASSWORD='tu_password' python manage.py runserver
```

## Instalación - Producción

### Opción 1: Usar mysql-connector-python (Oracle)

Si ya tienes `mysql-connector-python` funcionando en producción:

1. **Editar `requirements.txt`:**
   ```txt
   # Comentar PyMySQL
   # PyMySQL==1.1.2
   
   # Descomentar mysql-connector-python
   mysql-connector-python==9.5.0
   ```

2. **Editar `bazpos/settings.py`:**
   ```python
   DATABASES = {
       "default": {
           "ENGINE": "mysql.connector.django",  # Cambiar aquí
           "NAME": "bazpos_db",
           # ... resto igual
       }
   }
   ```

3. **Editar `bazpos/__init__.py`:**
   ```python
   # Comentar o eliminar el shim de PyMySQL
   # try:
   #     import pymysql
   #     pymysql.install_as_MySQLdb()
   # except Exception:
   #     pass
   ```

4. **Instalar dependencias:**
   ```bash
   pip install -r requirements.txt
   ```

### Opción 2: Usar mysqlclient (Recomendado para producción)

Para mejor rendimiento:

1. **Instalar dependencias del sistema:**
   ```bash
   # Ubuntu/Debian
   sudo apt-get update
   sudo apt-get install python3-dev default-libmysqlclient-dev build-essential pkg-config
   
   # CentOS/RHEL
   sudo yum install python3-devel mysql-devel gcc
   ```

2. **Editar `requirements.txt`:**
   ```txt
   # Comentar PyMySQL
   # PyMySQL==1.1.2
   
   # Descomentar mysqlclient
   mysqlclient==2.2.7
   ```

3. **Editar `bazpos/__init__.py`:**
   ```python
   # Eliminar completamente el contenido (archivo vacío)
   ```

4. **Mantener en `bazpos/settings.py`:**
   ```python
   DATABASES = {
       "default": {
           "ENGINE": "django.db.backends.mysql",  # Ya está correcto
           # ... resto igual
       }
   }
   ```

5. **Instalar dependencias:**
   ```bash
   pip install -r requirements.txt
   ```

## Compilar CSS (desarrollo)

Si modificas los archivos SCSS:

```bash
# CSS expandido
npx sass static/scss/sb-admin-2.scss static/css/sb-admin-2.css --style=expanded --no-source-map

# CSS minificado
npx sass static/scss/sb-admin-2.scss static/css/sb-admin-2.min.css --style=compressed --no-source-map
```

## Configuración de Base de Datos

### Crear base de datos en MySQL:
```sql
CREATE DATABASE bazpos_db CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE USER 'tu_usuario'@'localhost' IDENTIFIED BY 'tu_password';
GRANT ALL PRIVILEGES ON bazpos_db.* TO 'tu_usuario'@'localhost';
FLUSH PRIVILEGES;
```

### Ajustar plugin de autenticación (si es necesario):
```sql
ALTER USER 'tu_usuario'@'localhost' IDENTIFIED WITH mysql_native_password BY 'tu_password';
FLUSH PRIVILEGES;
```

## Variables de Entorno

Configura las siguientes variables (copia `.env.example` a `.env`):

- `DJANGO_SECRET_KEY`: Clave secreta de Django (cambiar en producción)
- `DJANGO_DEBUG`: True/False (False en producción)
- `DJANGO_ALLOWED_HOSTS`: Hosts permitidos separados por coma
- `DB_PASSWORD`: Contraseña de MySQL

## Estructura del Proyecto

```
biocar/
├── bazpos/              # Configuración principal del proyecto
├── gerenteApp/          # App de gestión/gerencia
├── vendedorApp/         # App de ventas
├── static/              # Archivos estáticos (CSS, JS, imágenes)
│   ├── css/            # CSS compilado
│   ├── scss/           # SCSS fuente
│   └── vendor/         # Librerías de terceros
├── templates/          # Templates HTML
├── licenses/           # Licencias de terceros
└── requirements.txt    # Dependencias Python
```

## Licencias

Este proyecto usa componentes de terceros. Ver:
- `THIRD_PARTY_NOTICES.md` - Lista de componentes
- `licenses/` - Textos de licencias completos

## Soporte

Para problemas o preguntas, contactar al equipo de desarrollo.
