# Instalación, respaldo y actualización

BazPOS se distribuye como un **POS retail de tenant único**: una instalación por cliente, cada una con su propio stack Docker (MariaDB + Django/Gunicorn + nginx). Este documento describe cómo instalar, respaldar y actualizar una instalación nueva, sin leer los procedimientos internos de ninguna tienda en particular.

---

## 1. Requisitos

- **Servidor VPS** con Docker + Docker Compose.
- Recursos mínimos recomendados: **1 vCPU / 1 GiB RAM / 20 GiB disco**.
- Acceso **HTTPS**: nginx redirige HTTP→HTTPS por defecto; se necesitan certificados (o un reverse proxy / túnel frente al stack).

## 2. Instalación nueva

```bash
git clone <repo> && cd bazpos
cp .env.production.example .env
# Editar .env: DJANGO_SECRET_KEY, DJANGO_ALLOWED_HOSTS, DB_PASSWORD,
# ADMIN_USER/ADMIN_PASS, STORE_NAME, VITE_STORE_NAME, etc.
docker compose up -d --build
```

Al arrancar, el contenedor de la app ejecuta automáticamente:

1. Espera a que MariaDB esté disponible.
2. Aplica las migraciones.
3. Crea los grupos de roles (`setup_groups`).
4. Crea el superusuario (`create_admin`) desde las variables de entorno.
5. Recopila los estáticos (`collectstatic --clear`).

Una vez arriba:

1. Inicie sesión con el superusuario en `https://<host>/`.
2. La primera vez, el sistema **redirige al Gerente a Configuración** para completar la puesta a punto inicial: nombre de la tienda, moneda, impuesto, redondeo, costo de envío por defecto, ubicación por defecto, medios de pago y documentos.
3. (Opcional) Cargue datos de demostración con un perfil vertical:

```bash
docker compose exec app python manage.py seed_data --profile generic_retail   # retail genérico
docker compose exec app python manage.py seed_data --profile auto_parts       # autopartes (comportamiento original)
```

> El perfil `generic_retail` crea productos SKU simples sin OEM, envío en 0 y flags desactivados. El perfil `auto_parts` reproduce el comportamiento original (OEM, marcas, RUT, descuento Stellantis, etc.).

## 3. Configuración del negocio

Toda la configuración vive en **Configuración** (módulo `/configuracion`) y se edita desde la interfaz, no en código:

| Sección | Qué configura |
|---|---|
| Identidad | Nombre de la tienda (reemplaza `STORE_NAME`), teléfono, dirección |
| Moneda y formato | Código de moneda ISO 4217, locale, zona horaria |
| Impuestos y redondeo | Impuesto %, redondeo de precio, redondeo de total, umbral de redondeo |
| Pedidos | Costo de envío por defecto, margen de utilidad por defecto |
| Medios de pago / Documentos | Listas editables `{code, label, active}` que alimentan ventas, pedidos y cierre de caja |
| Ubicación por defecto | Ubicación predeterminada para stock |

Los **flags de perfil vertical** (`feature_flags`) activan/ocultan las partes específicas de autopartes:

- `product_oem_fields` — campos OEM/marca en formularios de producto y reportes.
- `oem_primary_search` — búsqueda de venta enfocada en OEM.
- `order_shipping_toggle` — conmutador "sumar envío" por línea en pedidos.
- `order_pricing_rules` — reglas de costo por línea (extensión ex-Stellantis).
- `daily_supplier_orders` — módulo de pedidos a proveedores.
- `oem_stock_substitutes` — aviso "mismo OEM con stock" en el dashboard.
- `supplier_rut_field` — etiqueta RUT vs "ID tributario" en proveedores.

Una instalación genérica arranca con todos los flags apagados; una instalación de autopartes los enciende vía migración.

## 4. Respaldo

El script de respaldo vive en [`ops/backup/`](../ops/backup/). Usa **restic** contra un bucket **Backblaze B2**:

```bash
# Ver ops/backup/bazpos-backup.env.example para las variables requeridas
# (B2_ACCOUNT_ID, B2_ACCOUNT_KEY, B2_BUCKET, RESTIC_PASSWORD, ...)
cp ops/backup/bazpos-backup.env.example ops/backup/bazpos-backup.env
ops/backup/bazpos-backup.sh backup      # respaldo manual
ops/backup/bazpos-backup.sh restore <snapshot_id>   # restaurar
```

Consulte `ops/backup/restore.md` para el procedimiento de restauración detallado. Programe respaldos diarios (cron/systemd timer).

## 5. Actualización (upgrade path)

```bash
git pull
docker compose up -d --build
```

El contenedor aplica las migraciones automáticamente al arrancar. Las novedades se muestran a los usuarios en el modal **Novedades** (basado en `CHANGELOG.md`, que se empaqueta en el frontend al construir).

Recomendaciones:

- Respaldar antes de actualizar.
- Revisar `CHANGELOG.md` y las notas de la versión por cambios de esquema o de comportamiento.
- Los cambios de configuración de esquema (p. ej. 2.0.0) preservan el comportamiento actual mediante migraciones de datos y valores por defecto.

## 6. Recursos y limitaciones

- Los contenedores tienen `mem_limit` calibrados para un VPS de 1 vCPU / 1 GiB: MariaDB 448m, app 320m, nginx 64m.
- Gunicorn corre con **2 workers síncronos**. No suba workers ni `mem_limit` sin medir `docker stats` y la latencia de la API primero (ver `docs/guia-tecnica.md §5.6`).