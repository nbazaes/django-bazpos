import os
import random
from datetime import timedelta

from django.contrib.auth.models import Group, User
from django.core.management import call_command
from django.core.management.base import BaseCommand
from django.db import transaction
from django.utils import timezone

from faker import Faker

from gerenteApp.models import DetalleFactura, Factura, PrecioHistorico, Proveedor
from vendedorApp.models import (
    DetalleVenta, Producto, StockProductoUbicacion, Ubicacion, Venta,
)

fake = Faker("es_CL")

NOMBRES_UBICACIONES = [
    "Bodega Central", "Local Principal", "Sucursal Norte",
    "Sucursal Sur", "Depósito General",
]

AUTOPARTS_FLAGS = {
    "product_oem_fields": True,
    "oem_primary_search": True,
    "order_shipping_toggle": True,
    "order_pricing_rules": True,
    "daily_supplier_orders": True,
    "oem_stock_substitutes": True,
    "supplier_rut_field": True,
}

AUTOPARTS_MARCAS = [
    "Bosch", "Mann-Filter", "Febi", "Valeo", "Hella", "SKF", "TRW", "Denso",
    "NGK", "Monroe", "KYB", "Delphi", "Gates", "Dayco", "Brembo", "Luk",
    "Sachs", "Continental", "Mahle", "Meyle",
]

AUTOPARTS_CATEGORIAS = [
    ("Filtro de aceite", 8000, 15000),
    ("Filtro de aire", 10000, 20000),
    ("Filtro de combustible", 12000, 22000),
    ("Pastilla de freno", 15000, 35000),
    ("Disco de freno", 25000, 60000),
    ("Amortiguador delantero", 40000, 90000),
    ("Amortiguador trasero", 35000, 80000),
    ("Bujía de encendido", 5000, 12000),
    ("Correa de distribución", 20000, 50000),
    ("Correa de accesorios", 10000, 25000),
    ("Bomba de agua", 30000, 70000),
    ("Radiador", 50000, 120000),
    ("Alternador", 60000, 150000),
    ("Motor de arranque", 55000, 140000),
    ("Sensor de oxígeno", 20000, 50000),
    ("Sensor de temperatura", 15000, 35000),
    ("Termostato", 8000, 20000),
    ("Bomba de combustible", 45000, 110000),
    ("Embrague completo", 80000, 200000),
    ("Aceite de motor 5W-30", 15000, 30000),
]

AUTOPARTS_EMPRESAS = [
    "Importadora", "Distribuidora", "Comercial",
    "Repuestos", "Automotriz", "Partes y Piezas",
]

GENERIC_MARCAS = [
    "Nova", "Zafiro", "Delta", "Vega", "Aurora", "Cumbres", "Andes", "Pacífico",
]

GENERIC_CATEGORIAS = [
    ("Camiseta", 4000, 12000),
    ("Polera", 6000, 15000),
    ("Pantalón", 8000, 25000),
    ("Zapatilla", 12000, 45000),
    ("Chaqueta", 15000, 60000),
    ("Gorra", 3000, 9000),
    ("Calcetines", 1500, 5000),
    ("Buzo", 10000, 30000),
    ("Mochila", 8000, 25000),
    ("Cinturón", 4000, 12000),
]

GENERIC_EMPRESAS = [
    "Distribuidora", "Importadora", "Comercial", "Mayorista", "Tienda", "Suministros",
]


class Command(BaseCommand):
    help = "Popula la base de datos con datos de prueba (Faker)."

    def add_arguments(self, parser):
        parser.add_argument(
            "--profile",
            choices=["auto_parts", "generic_retail"],
            default="auto_parts",
            help="Perfil vertical de datos de prueba (default: auto_parts).",
        )

    def handle(self, *args, **options):
        self.profile = options["profile"]

        self.stdout.write(f"Perfil: {self.profile}")

        self.stdout.write("Limpiando datos existentes...")
        self._clean()

        self.stdout.write("Configurando grupos...")
        call_command("setup_groups")

        self.stdout.write("Configurando la tienda...")
        self._configure_store()

        self.stdout.write("Creando ubicaciones...")
        ubicaciones = self._create_ubicaciones()

        self.stdout.write("Creando proveedores...")
        proveedores = self._create_proveedores()

        self.stdout.write("Creando usuarios...")
        usuarios = self._create_usuarios()

        self.stdout.write("Creando productos...")
        productos = self._create_productos(proveedores)

        self.stdout.write("Creando stock por ubicación...")
        self._create_stock(productos, ubicaciones)

        self.stdout.write("Creando facturas...")
        self._create_facturas(proveedores, productos)

        self.stdout.write("Creando ventas...")
        self._create_ventas(usuarios, productos)

        self.stdout.write(self.style.SUCCESS("¡Datos de prueba creados exitosamente!"))

    def _clean(self):
        DetalleVenta.objects.all().delete()
        Venta.objects.all().delete()
        PrecioHistorico.objects.all().delete()
        DetalleFactura.objects.all().delete()
        Factura.objects.all().delete()
        StockProductoUbicacion.objects.all().delete()
        Producto.objects.all().delete()
        Proveedor.objects.all().delete()
        Ubicacion.objects.all().delete()
        User.objects.filter(is_superuser=False).delete()

    def _configure_store(self):
        from gerenteApp.models import StoreConfig

        is_auto = self.profile == "auto_parts"
        call_command("sync_store_config")
        config = StoreConfig.current()
        config.default_shipping_cost = 4500 if is_auto else 0
        config.feature_flags = dict(AUTOPARTS_FLAGS) if is_auto else {}
        config.save()
        self.stdout.write(f"  StoreConfig: shipping={config.default_shipping_cost}")

    def _create_ubicaciones(self):
        ubicaciones = []
        for nombre in NOMBRES_UBICACIONES:
            u = Ubicacion.objects.create(
                nombre=nombre,
                marca=f"{nombre} - Sucursal",
                descripcion=f"Descripción de {nombre.lower()}",
            )
            ubicaciones.append(u)
            self.stdout.write(f"  Ubicacion: {u.nombre}")
        return ubicaciones

    def _generate_rut(self):
        cuerpo = random.randint(1000000, 25000000)
        return f"{cuerpo}-{self._digito_verificador(cuerpo)}"

    def _digito_verificador(self, rut):
        suma = 0
        multiplicador = 2
        while rut > 0:
            suma += (rut % 10) * multiplicador
            rut //= 10
            multiplicador = 9 if multiplicador == 7 else multiplicador + 1
        dv = 11 - (suma % 11)
        if dv == 11:
            return "0"
        if dv == 10:
            return "K"
        return str(dv)

    def _create_proveedores(self):
        is_auto = self.profile == "auto_parts"
        proveedores = []
        empresas = AUTOPARTS_EMPRESAS if is_auto else GENERIC_EMPRESAS
        nombres = [fake.last_name() for _ in range(6)]
        for _ in range(12):
            tax_id = self._generate_rut() if is_auto else None
            nombre = f"{random.choice(empresas)} {random.choice(nombres)} {fake.company_suffix()}"
            p = Proveedor.objects.create(
                tax_id=tax_id,
                nombre=nombre[:100],
                persona_contacto=fake.name(),
                telefono=fake.phone_number()[:20],
                correo=fake.email()[:100],
                direccion=fake.address()[:200],
            )
            proveedores.append(p)
            self.stdout.write(f"  Proveedor: {p.nombre}")
        return proveedores

    def _create_usuarios(self):
        usuarios_vendedores = []
        usuarios_gerentes = []

        grupo_vendedor = Group.objects.get(name="Vendedor")
        grupo_gerente = Group.objects.get(name="Gerente")

        for i in range(5):
            username = f"vendedor{i+1}"
            user = User.objects.create_user(
                username=username,
                password=os.getenv("SEED_VENDEDOR_PASS", "vendedor123"),
                first_name=fake.first_name(),
                last_name=fake.last_name(),
                email=f"{username}@bazpos.cl",
            )
            user.groups.add(grupo_vendedor)
            usuarios_vendedores.append(user)
            self.stdout.write(f"  Vendedor: {username} / vendedor123")

        for i in range(3):
            username = f"gerente{i+1}"
            user = User.objects.create_user(
                username=username,
                password=os.getenv("SEED_GERENTE_PASS", "gerente123"),
                first_name=fake.first_name(),
                last_name=fake.last_name(),
                email=f"{username}@bazpos.cl",
            )
            user.groups.add(grupo_gerente)
            usuarios_gerentes.append(user)
            self.stdout.write(f"  Gerente: {username} / gerente123")

        return usuarios_vendedores + usuarios_gerentes

    def _create_productos(self, proveedores):
        is_auto = self.profile == "auto_parts"
        categorias = AUTOPARTS_CATEGORIAS if is_auto else GENERIC_CATEGORIAS
        marcas = AUTOPARTS_MARCAS if is_auto else GENERIC_MARCAS
        productos = []
        for _ in range(80):
            cat = random.choice(categorias)
            nombre_cat, costo_min, costo_max = cat
            marca = random.choice(marcas)
            sufijo = fake.bothify(text="??###") if is_auto else fake.bothify(text="##")
            nombre = f"{nombre_cat} {marca} {sufijo}"
            costo = random.randint(costo_min, costo_max)
            if is_auto:
                oem = fake.bothify(text="OEM-#####")
                descripcion = f"{nombre_cat} marca {marca}. Compatible con vehículos nacionales e importados."
            else:
                oem = ""
                descripcion = f"{nombre_cat} marca {marca}."
            p = Producto.objects.create(
                nombre=nombre[:100],
                codigo_producto=f"COD-{fake.unique.bothify(text='??-####')}",
                oem=oem,
                marca=marca,
                descripcion=descripcion,
                precio_costo=costo,
                stock_minimo=random.randint(5, 15),
                stock_maximo=random.randint(50, 200),
                margen_utilidad=random.choice([25, 30, 35, 40, 45]),
                proveedor=random.choice(proveedores),
            )
            productos.append(p)
        self.stdout.write(f"  {len(productos)} productos creados")
        return productos

    def _create_stock(self, productos, ubicaciones):
        ubicacion_default = ubicaciones[0]
        created = 0
        for producto in productos:
            StockProductoUbicacion.objects.create(
                producto=producto,
                ubicacion=ubicacion_default,
                cantidad=random.randint(10, 80),
            )
            created += 1
            if random.random() < 0.3:
                StockProductoUbicacion.objects.create(
                    producto=producto,
                    ubicacion=random.choice(ubicaciones[1:]),
                    cantidad=random.randint(0, 30),
                )
                created += 1
        self.stdout.write(f"  {created} registros de stock creados")

    def _create_facturas(self, proveedores, productos):
        ubicacion_default = Ubicacion.objects.first()
        factura_num = 1000
        facturas_creadas = 0

        for _ in range(30):
            proveedor = random.choice(proveedores)
            productos_muestra = random.sample(productos, k=random.randint(2, 6))
            detalles = []
            monto_total = 0

            for prod in productos_muestra:
                cantidad = random.randint(5, 50)
                costo_compra = random.randint(
                    max(1, prod.precio_costo - 2000),
                    prod.precio_costo + 3000,
                )
                detalles.append({
                    "producto": prod,
                    "cantidad": cantidad,
                    "costo_compra": costo_compra,
                })
                monto_total += costo_compra * cantidad

            with transaction.atomic():
                factura = Factura.objects.create(
                    numero_factura=factura_num,
                    proveedor=proveedor,
                    fecha=(timezone.now() - timedelta(days=random.randint(1, 365))).date(),
                    monto_total=monto_total,
                )
                factura_num += 1
                facturas_creadas += 1

                for det in detalles:
                    producto = det["producto"]
                    cantidad = det["cantidad"]
                    costo_compra = det["costo_compra"]

                    DetalleFactura.objects.create(
                        factura=factura,
                        producto=producto,
                        cantidad=cantidad,
                        costo_compra=costo_compra,
                    )

                    precio_costo_anterior = producto.precio_costo
                    precio_venta_anterior = producto.precio

                    if precio_costo_anterior != costo_compra:
                        producto.precio_costo = costo_compra
                        producto.save()
                        PrecioHistorico.objects.create(
                            producto=producto,
                            precio_costo_anterior=precio_costo_anterior,
                            precio_costo_nuevo=costo_compra,
                            precio_venta_anterior=precio_venta_anterior,
                            precio_venta_nuevo=producto.precio,
                            factura=factura,
                        )

                    if ubicacion_default:
                        stock, _ = StockProductoUbicacion.objects.get_or_create(
                            producto=producto,
                            ubicacion=ubicacion_default,
                            defaults={"cantidad": 0},
                        )
                        stock.cantidad += cantidad
                        stock.save()

        self.stdout.write(f"  {facturas_creadas} facturas creadas (desde #{1000} hasta #{1000 + facturas_creadas - 1})")

    def _create_ventas(self, usuarios, productos):
        ventas_creadas = 0
        detalles_creados = 0

        for _ in range(80):
            usuario = random.choice(usuarios)
            productos_muestra = random.sample(productos, k=random.randint(1, 5))
            monto_total = 0
            detalles = []

            for prod in productos_muestra:
                cantidad = random.randint(1, 5)
                precio_unitario = prod.precio or (prod.precio_costo * 2)
                subtotal = precio_unitario * cantidad
                detalles.append({
                    "producto": prod,
                    "cantidad": cantidad,
                    "precio_unitario": precio_unitario,
                    "subtotal": subtotal,
                })
                monto_total += subtotal

            with transaction.atomic():
                venta = Venta.objects.create(
                    usuario=usuario,
                    fecha_venta=timezone.now() - timedelta(days=random.randint(0, 180)),
                    monto_total=monto_total,
                    estado=random.choice([Venta.Estado.COMPLETADA, Venta.Estado.COMPLETADA, Venta.Estado.COMPLETADA, Venta.Estado.PENDIENTE]),
                    tipo_documento=random.choice([Venta.TipoDocumento.VENTA, Venta.TipoDocumento.VENTA, Venta.TipoDocumento.COTIZACION]),
                )
                ventas_creadas += 1

                for det in detalles:
                    DetalleVenta.objects.create(
                        venta=venta,
                        producto=det["producto"],
                        cantidad=det["cantidad"],
                        precio_unitario=det["precio_unitario"],
                        subtotal=det["subtotal"],
                    )
                    detalles_creados += 1

        self.stdout.write(f"  {ventas_creadas} ventas y {detalles_creados} detalles creados")