import random
from datetime import timedelta

from django.core.management.base import BaseCommand
from django.db import transaction
from django.utils import timezone

from vendedorApp.models import Producto, StockHistorico, StockProductoUbicacion


class Command(BaseCommand):
    help = "Inyecta un historial de stock sintético por producto/ubicación para probar los reportes con 'Stock al día'."

    def add_arguments(self, parser):
        parser.add_argument("--dias", type=int, default=90, help="Cuántos días hacia atrás cubrir.")
        parser.add_argument(
            "--no-limpiar",
            action="store_true",
            help="No borrar el historial existente antes de insertar.",
        )

    def handle(self, *args, **options):
        dias = options["dias"]
        rng = random.Random(20260825)
        ahora = timezone.now()

        if not options["no_limpiar"]:
            eliminados = StockHistorico.objects.count()
            StockHistorico.objects.all().delete()
            self.stdout.write(f"Historial previo eliminado: {eliminados} registros.")

        filas_stock = list(
            StockProductoUbicacion.objects.select_related("producto", "ubicacion").all()
        )
        if not filas_stock:
            self.stderr.write("No hay filas de stock. Ejecuta primero seed_data.")
            return

        creados = 0
        productos_afectados = set()
        for stock in filas_stock:
            cur = stock.cantidad
            n = rng.randint(5, 11)

            fechas = [
                ahora - timedelta(days=rng.uniform(1, dias)) for _ in range(n - 1)
            ]
            fechas.append(ahora - timedelta(hours=rng.randint(1, 18)))
            fechas.sort()

            if cur == 0:
                valores = [0] * n
            else:
                valores = [rng.randint(0, cur + 15)]
                for _ in range(n - 2):
                    valores.append(rng.randint(0, cur + 15))
                valores.append(cur)

            registros = [
                StockHistorico(
                    stock=stock,
                    cantidad=valor,
                    fecha=fecha,
                )
                for fecha, valor in zip(fechas, valores)
            ]
            with transaction.atomic():
                StockHistorico.objects.bulk_create(registros)
            creados += len(registros)
            productos_afectados.add(stock.producto_id)

        self.stdout.write(
            self.style.SUCCESS(
                f"Creados {creados} registros de historial para "
                f"{len(productos_afectados)} productos "
                f"(últimos {dias} días, cada serie termina en el stock actual)."
            )
        )