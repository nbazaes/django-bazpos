# Backups de BazPOS (restic → Backblaze B2)

Respaldo cifrado y deduplicado del VPS, ejecutado por cron en el host (no dentro de Docker).

**Qué se respalda (cada noche):**

| Dato | Origen | Forma |
|---|---|---|
| Base de datos MariaDB | contenedor `bazpos_db` | `mariadb-dump --single-transaction` (snapshot consistente, sin bloquear) → gzip |
| Media (imágenes subidas) | volumen `bazpos_media_files` | tar desde el contenedor `bazpos_app` (`/app/media`) |
| Config y secretos | `.env`, `certs/`, `compose*.yaml` | copia directa |

`static_files` **no** se respalda: se regenera con `collectstatic` al levantar.

**Cómo se guarda:** cada run sube un snapshot restic al repo B2. La retención se aplica **los domingos** con prune (7 diarios / 4 semanales / 6 mensuales) y ese día además corre `restic check --read-data-subset=5%` (verificación de integridad). Los días de semana solo `forget` sin prune para que la corrida nocturna sea rápida.

**Costo:** B2 tiene 10 GB gratuitos y luego ~USD 6/TB/mes. Para un POS, irrelevante.

---

## 1. Setup inicial en el VPS (una sola vez)

```bash
# Instalar restic (Debian/Ubuntu; o descarga el release binary oficial)
apt install restic

# Secretos — crear archivo root-only (reemplazar lugar del proyecto si difiere)
mkdir -p /etc/restic
install -m 600 -o root -g root ops/backup/bazpos-backup.env.example /etc/restic/bazpos.env
sudoedit /etc/restic/bazpos.env   # rellenar repo, passphrase y App Key B2

# Script — instalar y probar sintaxis
install -m 700 -o root -g root ops/backup/bazpos-backup.sh /usr/local/sbin/bazpos-backup.sh
bash -n /usr/local/sbin/bazpos-backup.sh

# Crear el bucket B2 (privado) y generar una App Key con scope SOLO a ese bucket.
# Inicializar el repo restic (error si ya existe ⇒ ya está inicializado)
sudo bazpos-backup.sh init

# Primera corrida de prueba (revisar la salida completa)
sudo bazpos-backup.sh
sudo bazpos-backup.sh snapshots
```

Ajustes que puede requerir el script según tu servidor (vía variables de entorno):

| Variable | Por defecto | Descripción |
|---|---|---|
| `BAZPOS_COMPOSE_DIR` | `/opt/bazpos` | directorio del proyecto (donde están `.env` y `certs/`) |
| `BAZPOS_DB_CONTAINER` | `bazpos_db` | contenedor de MariaDB |
| `BAZPOS_APP_CONTAINER` | `bazpos_app` | contenedor Django (monta `/app/media`) |
| `RESTIC_ENV_FILE` | `/etc/restic/bazpos.env` | archivo de secretos |

## 2. Programar el cron

```bash
sudo crontab -e
```

```
17 3 * * * /usr/local/sbin/bazpos-backup.sh backup >> /var/log/bazpos-backup.log 2>&1
```

Rotación del log (`/etc/logrotate.d/bazpos-backup`):

```
/var/log/bazpos-backup.log {
    weekly
    rotate 8
    compress
    missingok
    notifempty
}
```

**Alertas:** el script sale con código ≠ 0 ante cualquier fallo (DB caída, red, restic…). Si el VPS envía correo a root, agrega `MAILTO=tu@correo` arriba del cron. Para algo más robusto, una línea de notify (Telegram/healthchecks.io) es suficiente como mejora futura.

## 3. Restauración

### 3.1 Encontrar y restaurar un snapshot

```bash
sudo bazpos-backup.sh snapshots        # listar snapshots disponibles
sudo bazpos-backup.sh restore latest /tmp/restore   # o con el id del snapshot
```

El script imprime la ubicación de los archivos extraídos dentro de `/tmp/restore`. La estructura real se confirma con `find /tmp/restore -name bazpos_db.sql.gz`.

### 3.2 Restaurar la base de datos

```bash
DUMP="$(find /tmp/restore -name bazpos_db.sql.gz | head -n1)"
gunzip -c "$DUMP" | sudo docker exec -i bazpos_db \
    sh -c 'exec mysql -u"$DB_USER" -p"$DB_PASSWORD" "$DB_NAME"'
```

> Úselo con cuidado: sobrescribe los datos actuales de `bazpos_db`. Para validar sin tocar producción, importar a un esquema de prueba (`CREATE DATABASE bazpos_test_restore;` con `-D bazpos_test_restore`).

### 3.3 Restaurar media

```bash
sudo docker compose -f compose.prod.yaml down     # detiene todo, los volúmenes se conservan
MEDIA="$(find /tmp/restore -name media.tar.gz | head -n1)"
tar xzf "$MEDIA" -C /tmp/restore-media
sudo docker run --rm \
    -v bazpos_media_files:/media \
    -v /tmp/restore-media:/src:ro \
    alpine sh -c 'cp -a /src/. /media/'
sudo docker compose -f compose.prod.yaml up -d
```

### 3.4 Restaurar config

Los secretos para que el stack vuelva a arrancar están en el snapshot (`config/env`, `config/certs`, `config/compose*.yaml`). Cópialos de vuelta al directorio del proyecto respetando los nombres originales (`.env`, `certs/`, `compose.yaml`).

## 4. Prueba de restauración (obligatoria, trimestral)

1. `sudo bazpos-backup.sh check` ✓ integridad del repo.
2. `sudo bazpos-backup.sh restore latest /tmp/restore` y **verificar que existan** `bazpos_db.sql.gz`, `media.tar.gz` y `config/env`.
3. `gunzip -t <dump>` ✓ dump legible.
4. Al menos una vez al año: restore completo en un VPS de prueba y levantar el stack.

## 5. Monitoreo de rutina

- `sudo bazpos-backup.sh snapshots` para confirmar que hay un snapshot nuevo cada día.
- Revisar `tail /var/log/bazpos-backup.log` tras un `bazpos-backup.sh check` semanal.
- La regla 3-2-1: la copia encriptada está offsite (B2). Si además quieres una 3.ª copia, un `restic copy` a otro repo local (p. ej. `/var/backups/bazpos-local`) es barato y muy simple de añadir al cron del domingo.