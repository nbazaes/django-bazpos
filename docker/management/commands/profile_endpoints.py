"""Perfil de consultas SQL de los endpoints mas pesados.

Cuenta y mide las queries que dispara la serializacion de una muestra de
registros para cada endpoint listado. Usa CaptureQueriesContext, por lo que
funciona aunque DEBUG=False (no depende de connection.queries).

Uso:
    python manage.py profile_endpoints
    python manage.py profile_endpoints --endpoints ventas devoluciones
    python manage.py profile_endpoints --limit 100 --slow 10
"""

from django.core.management.base import BaseCommand
from django.db import connection
from django.db.models import Prefetch
from django.test.utils import CaptureQueriesContext

from vendedorApp.models import Devolucion, PedidoProveedorDia, Producto, Venta
from vendedorApp.serializers import (
    DevolucionSerializer,
    PedidoProveedorDiaHistorialSerializer,
    ProductoSerializer,
    VentaSerializer,
)


ENDPOINTS = {
    "ventas": (
        Venta.objects.select_related("usuario")
        .prefetch_related(
            "pagos",
            "pedido",
            "devoluciones",
            "devoluciones__detalles",
            "detalleventa_set__producto",
            Prefetch(
                "ventas_derivadas",
                queryset=Venta.objects.exclude(estado=Venta.Estado.CANCELADA).order_by("id"),
            ),
        )
        .order_by("-fecha_venta"),
        VentaSerializer,
    ),
    "devoluciones": (
        Devolucion.objects.select_related("venta__usuario", "usuario")
        .prefetch_related(
            "detalles__producto",
            "venta__pedido",
            "venta__detalleventa_set",
        )
        .order_by("-fecha_devolucion"),
        DevolucionSerializer,
    ),
    "productos": (
        Producto.objects.select_related("proveedor")
        .prefetch_related("stocks_ubicacion__ubicacion")
        .order_by("producto_id"),
        ProductoSerializer,
    ),
    "pedidos_proveedor": (
        PedidoProveedorDia.objects.prefetch_related("items__producto", "items__proveedor"),
        PedidoProveedorDiaHistorialSerializer,
    ),
}


class Command(BaseCommand):
    help = "Perfila queries SQL de los endpoints mas pesados (N+1 audit)."

    def add_arguments(self, parser):
        parser.add_argument(
            "--endpoints",
            nargs="+",
            type=str,
            default=list(ENDPOINTS),
            help="Nombres de endpoints a perfilar (por defecto: todos).",
        )
        parser.add_argument(
            "--limit",
            type=int,
            default=50,
            help="Tamano de la muestra por endpoint (filas serializadas).",
        )
        parser.add_argument(
            "--slow",
            type=int,
            default=5,
            help="Cuantas queries mas lentas mostrar por endpoint.",
        )

    def handle(self, *args, **options):
        endpoints = [e for e in options["endpoints"] if e in ENDPOINTS]
        missing = [e for e in options["endpoints"] if e not in ENDPOINTS]
        if missing:
            self.stderr.write(f"Endpoints desconocidos (ignorados): {', '.join(missing)}")
        if not endpoints:
            self.stderr.write("No hay endpoints validos.")
            return

        for name in endpoints:
            self._profile(name, options["limit"], options["slow"])

    def _profile(self, name, limit, slow):
        queryset, serializer_class = ENDPOINTS[name]
        sample = list(queryset[:limit])
        self.stdout.write(f"--- {name}: {len(sample)} filas ---")

        with CaptureQueriesContext(connection) as context:
            serializer_class(sample, many=True).data

        queries = context.captured_queries
        total_time = sum(float(q["time"]) for q in queries)
        self.stdout.write(
            f"    Queries: {len(queries)} | tiempo total: {total_time:.2f}s "
            f"({total_time / max(len(sample), 1) * 1000:.1f} ms/fila)"
        )

        if len(queries) > len(sample) * 3:
            self.stderr.write(
                "    ALERTA: volumen de queries > 3x filas — posible N+1."
            )

        for q in sorted(queries, key=lambda x: float(x["time"]), reverse=True)[:slow]:
            sql = " ".join(q["sql"].split())
            self.stdout.write(f"    [{q['time']}s] {sql[:200]}")