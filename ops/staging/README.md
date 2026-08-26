# Staging local — réplica del VPS de producción (NYC)

Entorno de staging que reproduce las condiciones del VPS de producción:

- **Recursos**: VM KVM con **1 vCPU, 1 GB RAM, 25 GB de disco** (como el VPS).
- **Datos**: se restaura el **último snapshot de producción** (restic → Backblaze B2), dump completo + media.
- **Imágenes**: se usan las **mismas imágenes que corre producción** (`ghcr.io/nbazaes/django-bazpos:app-<sha>` y `:nginx-<sha>`), descargadas desde CI.
- **Latencia**: **100 ms por dirección** (~200 ms RTT) inyectada entre el navegador y el stack (simula Chile → NYC). El tráfico app↔DB interno queda sin latencia (fiel: la BD vive en el mismo VPS).

```
Browser (host) ──https──▶ VM enp0s2 ──▶ nginx ──▶ app ──▶ MariaDB
   │                        (dentro de la VM, app↔DB sin retraso)
   └──── tc netem 100ms por dirección (VM: egress enp0s2 + ingress vía ifb0) ────┘
```

## Prerrequisitos (una sola vez, en el host)

- `pacman -S restic` (o el equivalente de tu distro).
- Secretos de restic en `~/.config/restic/bazpos.env` (chmod 600), copiados del VPS (`/etc/restic/bazpos.env`).
- PAT de GitHub con scope `read:packages` para `docker login ghcr.io`. `deploy-stack.sh` lo lee de `$GHCR_TOKEN` o, si no está exportado, de `pass show ghcr.io/staging-bazpos`. Guardarlo una vez: `pass insert ghcr.io/staging-bazpos` (o exportar solo para la corrida: `export GHCR_TOKEN=ghp_...`).
- VM creada con `ops/staging/terraform` (`terraform apply`), accesible por SSH con clave (`staging@192.168.150.160`).
- `gh` autenticado (para resolver el SHA de `main`).

## Uso

```bash
# 0) (una vez) Bootstrap: Docker + compose + swap + /opt/bazpos dentro de la VM
ops/staging/scripts/bootstrap-vm.sh

# 1) (una vez) Deploy inicial del stack con las imágenes de producción
#    (lee el token de $GHCR_TOKEN o de `pass show ghcr.io/staging-bazpos`)
ops/staging/scripts/deploy-stack.sh

# 2) (una vez) Restaurar los datos de producción (dump + media) — tarda según el volumen
ops/staging/scripts/restore-backup.sh

# 3) (una vez) Inyectar la latencia de 100 ms por dirección (hacer SIEMPRE al final)
ops/staging/scripts/apply-latency.sh

# 4) Verificar
ops/staging/scripts/verify.sh
```

## Flujo CI/CD (rama staging)

`git push origin staging` → **GitHub Actions** corre tests y construye/subé imágenes
`app-<sha>` / `nginx-<sha>` a GHCR (los tags `-latest` quedan exclusivos de `main`).
Producción **nunca** recibe código de staging (`deploy.yml` filtra `head_branch == 'main'`).

Para desplegar esas imágenes en la VM, un solo comando manual desde tu PC:

```bash
ops/staging/scripts/update-images.sh            # SHA más reciente de origin/staging
ops/staging/scripts/update-images.sh <sha>      # un commit específico
FORCE=1 ops/staging/scripts/update-images.sh    # saltar la validación de que CI terminó
```

`update-images.sh` valida que CI terminó OK para esa SHA, actualiza `APP_IMAGE`/`NGINX_IMAGE`
en `/opt/bazpos/.env`, y hace `docker compose pull && up -d` en la VM. Los **datos** (volúmenes)
y la **latencia netem** (vive en las interfaces de la VM, no en los contenedores) se conservan;
las migraciones nuevas corren solas al arrancar el contenedor.

## Ciclo de vida diario

```bash
ops/staging/scripts/start.sh    # arranca VM + stack + reaplica latencia
ops/staging/scripts/stop.sh     # quita latencia y apaga la VM
ops/staging/scripts/remove-latency.sh   # solo quitar latencia (p. ej. para rsync/SSH rápido)
```

Acceso: **https://192.168.150.160/** (aceptar el certificado autofirmado) · admin en `/admin/`.

## Notas

- **Secretos**: el `.env` del staging se genera en `ops/staging/.env.generated` (gitignored) y se sincroniza a `/opt/bazpos/.env` en la VM. Nada secreto se versiona.
- **Certificados**: autofirmados en `<repo>/certs/` (gitignored), generados por `make-certs.sh` (SAN = IP de la VM).
- **La latencia no es persistente**: se pierde al reiniciar la VM. `apply-latency.sh`/`start.sh` la reaplican (todo dentro de la VM: `tc netem` en egress de `enp0s2` + ingress vía `ifb0`). No requiere módulos del kernel del host (el kernel zen del host no incluye `sch_netem`).
- **Envelope de 1 GB**: el app corre gunicorn con 4 workers (como prod). El swapfile de 1 GB absorbe picos; si aparecen OOM-kills, es un hallazgo real de producción, no un bug del staging.
- La latencia simula el enlace navegador→VPS; el `rsync`/SSH/docker a la VM va sin latencia mientras no se aplique.

## Teardown

```bash
ops/staging/scripts/stop.sh
virsh undefine bazpos-staging-vm --remove-all-storage
rm -rf /var/backups/bazpos-staging ops/staging/.env.generated
```