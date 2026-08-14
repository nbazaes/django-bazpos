import random
from datetime import datetime

from django.contrib.auth.models import User
from django.core.management.base import BaseCommand
from django.db import transaction
from django.utils import timezone

from vendedorApp.models import DetalleVenta, Producto, Venta


class Command(BaseCommand):
    help = "Inyecta ventas diarias de prueba para el mes actual (y meses anteriores) para poblar los reportes."

    def add_arguments(self, parser):
        parser.add_argument("--meses", type=int, default=3, help="Cuantos meses hacia atras incluir.")

    def handle(self, *args, **options):
        meses = options["meses"]
        vendedores = list(
            User.objects.filter(groups__name="Vendedor").order_by("id")
        )
        if not vendedores:
            vendedores = list(User.objects.filter(is_superuser=False).order_by("id")[:5])
        productos = list(Producto.objects.all())
        if not productos:
            self.stderr.write("No hay productos. Ejecuta primero seed_data.")
            return

        hoy = timezone.localdate()
        creadas = 0
        detalles = 0

        for offset_meses in range(meses):
            anio = hoy.year
            mes = hoy.month - offset_meses
            while mes <= 0:
                mes += 12
                anio -= 1

            if anio == hoy.year and mes == hoy.month:
                dias = list(range(1, hoy.day + 1))
            else:
                if mes == 12:
                    ultimo_dia = 31
                elif mes == 2:
                    ultimo_dia = 29 if anio % 4 == 0 else 28
                elif mes in (4, 6, 9, 11):
                    ultimo_dia = 30
                else:
                    ultimo_dia = 31
                dias = list(range(1, ultimo_dia + 1))

            for dia in dias:
                for _ in range(random.randint(2, 5)):
                    vendedor = random.choice(vendedores)
                    productos_muestra = random.sample(
                        productos, k=min(random.randint(1, 4), len(productos))
                    )
                    monto_subtotal = 0
                    filas = []

                    for prod in productos_muestra:
                        cantidad = random.randint(1, 3)
                        precio_unitario = prod.precio or (prod.precio_costo or 10000) * 2
                        subtotal = precio_unitario * cantidad
                        filas.append(
                            {
                                "producto": prod,
                                "cantidad": cantidad,
                                "precio_unitario": precio_unitario,
                                "subtotal": subtotal,
                            }
                        )
                        monto_subtotal += subtotal

                    hora = random.randint(10, 19)
                    minuto = random.randint(0, 59)
                    fecha_venta = timezone.make_aware(
                        datetime(anio, mes, dia, hora, minuto)
                    )

                    with transaction.atomic():
                        venta = Venta.objects.create(
                            usuario=vendedor,
                            fecha_venta=fecha_venta,
                            monto_subtotal=monto_subtotal,
                            monto_total=monto_subtotal,
                            descuento_porcentaje=0,
                            estado=Venta.Estado.COMPLETADA,
                            tipo_documento=Venta.TipoDocumento.VENTA,
                            cliente_nombre=random.choice(
                                ["Cliente andino", "Juan Pérez", "María Soto", "", "Camión rojo"]
                            ),
                        )
                        creadas += 1

                        for fila in filas:
                            DetalleVenta.objects.create(
                                venta=venta,
                                producto=fila["producto"],
                                cantidad=fila["cantidad"],
                                precio_unitario=fila["precio_unitario"],
                                subtotal=fila["subtotal"],
                            )
                            detalles += 1

        self.stdout.write(
            self.style.SUCCESS(
                f"Inyectadas {creadas} ventas y {detalles} detalles "
                f"({meses} meses desde {timezone.localdate()})."
            )
        )
