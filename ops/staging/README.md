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
- PAT de GitHub con scope `read:packages` para `docker login ghcr.io`. Exportarlo solo para `deploy-stack.sh`: `export GHCR_TOKEN=ghp_...`
- VM creada con `ops/staging/terraform` (`terraform apply`), accesible por SSH con clave (`staging@192.168.150.160`).
- `gh` autenticado (para resolver el SHA de `main`).

## Uso

```bash
# 1) Bootstrap: Docker + compose + swap + /opt/bazpos dentro de la VM
ops/staging/scripts/bootstrap-vm.sh

# 2) Deploy del stack con las imágenes exactas de producción
export GHCR_TOKEN=ghp_...
ops/staging/scripts/deploy-stack.sh

# 3) Restaurar los datos de producción (dump + media) — tarda según el volumen
ops/staging/scripts/restore-backup.sh

# 4) Inyectar la latencia de 100 ms por dirección (hacer SIEMPRE al final)
ops/staging/scripts/apply-latency.sh

# 5) Verificar
ops/staging/scripts/verify.sh
```

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