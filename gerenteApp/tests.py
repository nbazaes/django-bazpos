from decimal import Decimal

from django.test import TestCase

from docker.test_utils import auth_client, create_business_groups, make_user
from gerenteApp.models import PrecioHistorico, Proveedor, StoreConfig, Tax
from vendedorApp.models import Producto, StockProductoUbicacion, Ubicacion


class TaxTest(TestCase):
    def test_apply_to_amount_19_percent(self):
        self.assertEqual(Tax.apply_to_amount(1000), 1190)
        self.assertEqual(Tax.apply_to_amount(841), 1001)

    def test_current_percent_default(self):
        self.assertEqual(Tax.current_percent(), Decimal("19"))


class StoreConfigTest(TestCase):
    def test_current_creates_singleton(self):
        config1 = StoreConfig.current()
        config2 = StoreConfig.current()
        self.assertEqual(config1.pk, config2.pk)
        self.assertEqual(StoreConfig.objects.count(), 1)

    def test_apply_to_amount(self):
        config = StoreConfig.current()
        config.tax_percent = Decimal("19")
        config.save()
        self.assertEqual(StoreConfig.apply_to_amount(1000), 1190)


class ProveedorApiTest(TestCase):
    @classmethod
    def setUpTestData(cls):
        create_business_groups()
        cls.gerente = make_user("Gerente")
        cls.encargado = make_user("Encargado")
        cls.vendedor = make_user("Vendedor")
        cls.proveedor = Proveedor.objects.create(
            rut="7654321-8",
            nombre="Proveedor Uno",
        )

    def test_gerente_can_list(self):
        resp = auth_client(self.gerente).get("/api/proveedores/")
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(resp.data["count"], 1)

    def test_encargado_can_create(self):
        resp = auth_client(self.encargado).post(
            "/api/proveedores/",
            {"rut": "1234567-4", "nombre": "Nuevo Proveedor"},
            format="json",
        )
        self.assertEqual(resp.status_code, 201)
        self.assertTrue(Proveedor.objects.filter(rut="1234567-4").exists())

    def test_vendedor_forbidden(self):
        resp = auth_client(self.vendedor).get("/api/proveedores/")
        self.assertEqual(resp.status_code, 403)

    def test_unauthenticated(self):
        resp = self.client.get("/api/proveedores/")
        self.assertEqual(resp.status_code, 401)


class FacturaUpsertTest(TestCase):
    @classmethod
    def setUpTestData(cls):
        create_business_groups()
        cls.gerente = make_user("Gerente")
        cls.proveedor = Proveedor.objects.create(
            rut="1111111-1",
            nombre="Proveedor Factura",
        )
        cls.ubicacion = Ubicacion.objects.create(nombre="Bodega Central")
        cls.producto = Producto.objects.create(
            nombre="Producto A",
            codigo_producto="PA001",
            oem="OEM1",
            descripcion="Desc A",
            precio_costo=5000,
            margen_utilidad=Decimal("30.00"),
            stock_minimo=2,
            stock_maximo=50,
            proveedor=cls.proveedor,
        )

    def _factura_payload(self, precio=7000, cantidad=5, ubicaciones=None):
        item = {
            "producto_id": self.producto.producto_id,
            "precio": precio,
            "cantidad": cantidad,
        }
        if ubicaciones is not None:
            item["ubicaciones"] = ubicaciones
        return {
            "numero_factura": 1001,
            "proveedor_id": self.proveedor.proveedor_id,
            "fecha": "2026-08-11",
            "productos": [item],
        }

    def test_create_updates_cost_and_history(self):
        client = auth_client(self.gerente)
        resp = client.post(
            "/api/facturas/",
            self._factura_payload(),
            format="json",
        )
        self.assertEqual(resp.status_code, 201)
        self.producto.refresh_from_db()
        self.assertEqual(self.producto.precio_costo, 7000)
        historial = PrecioHistorico.objects.filter(producto=self.producto)
        self.assertTrue(historial.exists())
        self.assertEqual(historial.first().precio_costo_anterior, 5000)
        self.assertEqual(historial.first().precio_costo_nuevo, 7000)

    def test_create_adds_stock_to_default_ubicacion(self):
        resp = auth_client(self.gerente).post(
            "/api/facturas/",
            self._factura_payload(),
            format="json",
        )
        self.assertEqual(resp.status_code, 201)
        stock = StockProductoUbicacion.objects.get(
            producto=self.producto,
            ubicacion=Ubicacion.objects.first(),
        )
        self.assertEqual(stock.cantidad, 5)

    def test_create_adds_stock_to_specific_ubicacion(self):
        ubicacion2 = Ubicacion.objects.create(nombre="Bodega Norte")
        payload = self._factura_payload(
            ubicaciones=[
                {"ubicacion_id": ubicacion2.id, "cantidad": 5},
            ]
        )
        resp = auth_client(self.gerente).post(
            "/api/facturas/",
            payload,
            format="json",
        )
        self.assertEqual(resp.status_code, 201)
        stock = StockProductoUbicacion.objects.get(
            producto=self.producto,
            ubicacion=ubicacion2,
        )
        self.assertEqual(stock.cantidad, 5)
        self.assertFalse(
            StockProductoUbicacion.objects.filter(
                producto=self.producto,
                ubicacion=self.ubicacion,
            ).exists()
        )

    def test_monto_total_computed(self):
        resp = auth_client(self.gerente).post(
            "/api/facturas/",
            self._factura_payload(precio=7000, cantidad=3),
            format="json",
        )
        self.assertEqual(resp.status_code, 201)
        self.assertEqual(resp.data["monto_total"], 21000)

    def test_duplicate_invoice_returns_existing(self):
        client = auth_client(self.gerente)
        payload = self._factura_payload()
        first = client.post("/api/facturas/", payload, format="json")
        self.assertEqual(first.status_code, 201)
        second = client.post("/api/facturas/", payload, format="json")
        self.assertEqual(second.status_code, 200)
        self.assertTrue(second.data["existing"])


class StoreConfigApiTest(TestCase):
    @classmethod
    def setUpTestData(cls):
        create_business_groups()
        cls.gerente = make_user("Gerente")
        cls.vendedor = make_user("Vendedor")

    def test_get_config(self):
        resp = auth_client(self.vendedor).get("/api/configuracion/")
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(resp.data[0]["tax_percent"], "19.00")

    def test_patch_config(self):
        resp = auth_client(self.gerente).patch(
            "/api/configuracion/1/",
            {"telefono": "2222 3333"},
            format="json",
        )
        self.assertEqual(resp.status_code, 200)
        config = StoreConfig.current()
        self.assertEqual(config.telefono, "2222 3333")
