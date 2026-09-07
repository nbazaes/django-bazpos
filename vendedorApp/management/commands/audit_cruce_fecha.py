import sys
from datetime import timedelta, timezone as dt_timezone

from django.core.management.base import BaseCommand
from django.utils import timezone

from gerenteApp.models import Factura
from vendedorApp.models import AjusteStock, Anulacion, Devolucion, StockHistorico, Venta
from vendedorApp.timezone_guard import LOCAL_TZ, cruce_de_dia

REGISTROS_DINERO = [
    ("Venta", Venta, "fecha_venta"),
    ("Devolucion", Devolucion, "fecha_devolucion"),
    ("Anulacion", Anulacion, "fecha_anulacion"),
]

REGISTROS_INVENTARIO = [
    ("Factura", Factura, "fecha"),
    ("AjusteStock", AjusteStock, "fecha_ajuste"),
    ("StockHistorico", StockHistorico, "fecha"),
]


class Command(BaseCommand):
    help = (
        "Detecta registros cuya fecha UTC difiere de su fecha local "
        "(America/Santiago): quedaron atribuidos al día UTC siguiente en "
        "cierres de caja y reportes. Útil como failsafe del cambio de hora."
    )

    def add_arguments(self, parser):
        parser.add_argument(
            "--days",
            type=int,
            default=90,
            help="Ventana de búsqueda en días hacia atrás (0 = todo el histórico).",
        )
        parser.add_argument(
            "--include-inventario",
            action="store_true",
            help="Incluye también Factura, AjusteStock y StockHistorico.",
        )

    def handle(self, *args, **opts):
        dias = opts["days"]
        modelos = list(REGISTROS_DINERO)
        if opts["include_inventario"]:
            modelos += REGISTROS_INVENTARIO

        cutoff = timezone.now() - timedelta(days=dias) if dias and dias > 0 else None

        total = 0
        total_revisados = 0
        for etiqueta, modelo, campo in modelos:
            qs = modelo.objects.all().order_by(campo)
            if cutoff is not None:
                qs = qs.filter(**{f"{campo}__gte": cutoff})
            cruces = []
            for rid, dt in qs.values_list("id", campo):
                total_revisados += 1
                if cruce_de_dia(dt):
                    local = dt.astimezone(LOCAL_TZ)
                    cruces.append((rid, dt, local))
            if cruces:
                self.stdout.write(
                    self.style.WARNING(f"{etiqueta}: {len(cruces)} registro(s) con cruce de día")
                )
                for rid, dt, local in cruces:
                    self.stdout.write(
                        f"  id={rid}  fecha UTC {dt.astimezone(dt_timezone.utc).date().isoformat()}"
                        f"  fecha local {local.strftime('%d/%m/%Y %H:%M')}"
                    )
            total += len(cruces)

        ventana = f"últimos {dias} días" if dias and dias > 0 else "todo el histórico"
        if total:
            self.stdout.write(
                self.style.ERROR(
                    f"TOTAL: {total} registro(s) con cruce de día ({ventana}); "
                    f"revisados {total_revisados}. Estos documentos pertenecen al día "
                    f"local anterior y quedaron en el cierre del día UTC siguiente."
                )
            )
            sys.exit(1)

        self.stdout.write(
            self.style.SUCCESS(
                f"Sin cruces de día ({ventana}); revisados {total_revisados} registros."
            )
        )
