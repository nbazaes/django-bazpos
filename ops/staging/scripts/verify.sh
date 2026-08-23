#!/usr/bin/env bash
# verify.sh — Estado del stack, latencia medida, tamaño de BD y uso de memoria.
set -euo pipefail
source "$(dirname "$0")/lib.sh"

echo "==> [verify] Contenedores:"
ssh_vm "docker ps --format 'table {{.Names}}\t{{.Status}}'"

echo "==> [verify] Latencia percibida (store-name público, 2 requests):"
curl -sk -o /dev/null -w '    req1 ttfb=%{time_starttransfer}s total=%{time_total}s\n' "https://${VM_HOST}/api/store-name/"
curl -sk -o /dev/null -w '    req2 ttfb=%{time_starttransfer}s total=%{time_total}s\n' "https://${VM_HOST}/api/store-name/"

echo "==> [verify] SPA (index):"
curl -sk -o /dev/null -w '    http=%{http_code} bytes=%{size_download} ttfb=%{time_starttransfer}s\n' "https://${VM_HOST}/"

echo "==> [verify] Tamaño BD (data+index):"
printf 'SELECT ROUND(SUM(data_length+index_length)/1024/1024,1) AS size_mb FROM information_schema.tables WHERE table_schema="bazpos_db";\n' \
  | ssh_vm "docker exec -i bazpos_db sh -c 'mariadb -uroot -p\$MYSQL_ROOT_PASSWORD -N bazpos_db'"

echo "==> [verify] Conteos de tablas principales:"
for t in productos ventas facturas proveedores auth_user ubicaciones devoluciones pedidos; do
  printf 'SELECT COUNT(*) FROM %s;\n' "${t}" \
    | ssh_vm "docker exec -i bazpos_db sh -c 'mariadb -uroot -p\$MYSQL_ROOT_PASSWORD -N bazpos_db'" \
    | sed "s/^/    ${t}: /"
done

echo "==> [verify] Uso de memoria dentro del envelope de 1GB:"
ssh_vm "docker stats --no-stream --format 'table {{.Name}}\t{{.CPUPerc}}\t{{.MemUsage}}'"

echo "==> [verify] qdisc de latencia (VM):"
ssh_vm "tc qdisc show dev ${VM_IFACE} | grep -E 'netem|ingress' || echo '    sin netem en ${VM_IFACE}'; tc qdisc show dev ifb0 | grep netem || echo '    sin netem en ifb0'" | sed 's/^/    /'