from decimal import Decimal

from django.test import TestCase

from docker.test_utils import auth_client, create_business_groups, make_user
from gerenteApp.models import PrecioHistorico, Proveedor, StoreConfig
from gerenteApp.pricing import apply_tax, round_price, round_sale_total
from vendedorApp.models import Pedido, PedidoDetalle, Producto, StockProductoUbicacion, Ubicacion, Venta


class PricingTest(TestCase):
    def test_apply_tax_19_percent(self):
        self.assertEqual(apply_tax(1000), 1190)
        self.assertEqual(apply_tax(841), 1001)

    def test_round_price_default_100(self):
        self.assertEqual(round_price(1001), 1100)
        self.assertEqual(round_price(1000), 1000)
        self.assertEqual(round_price(199), 200)

    def test_round_sale_total_default_1000_threshold_900(self):
        self.assertEqual(round_sale_total(9100), 9000)
        self.assertEqual(round_sale_total(9900), 10000)
        self.assertEqual(round_sale_total(9000), 9000)


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


class ExtensionSeamTest(TestCase):
    def test_apply_modifiers_empty_returns_costo(self):
        from decimal import Decimal
        from gerenteApp.store_extensions import apply_modifiers

        self.assertEqual(apply_modifiers(Decimal("1000"), []), Decimal("1000"))
        self.assertEqual(apply_modifiers(Decimal("1000"), None), Decimal("1000"))

    def test_stellantis_extension_applies_20_percent_discount(self):
        from decimal import Decimal
        from gerenteApp.store_extensions import apply_modifiers, get_modifier

        modifier = get_modifier("stellantis")
        self.assertIsNotNone(modifier)
        self.assertEqual(modifier.label, "Stellantis (descuento 20%)")
        self.assertEqual(apply_modifiers(Decimal("1000"), ["stellantis"]), Decimal("800"))

    def test_unknown_modifier_key_is_ignored(self):
        from decimal import Decimal
        from gerenteApp.store_extensions import apply_modifiers

        self.assertEqual(apply_modifiers(Decimal("1000"), ["no_existe"]), Decimal("1000"))


class StoreConfigListsTest(TestCase):
    def test_default_payment_methods_and_document_types(self):
        config = StoreConfig.current()
        codes = [m["code"] for m in config.active_payment_methods()]
        self.assertEqual(codes, ["EF", "TJ", "TR", "CH"])
        doc_codes = [d["code"] for d in config.active_document_types()]
        self.assertEqual(doc_codes, ["BO", "FA", "OT"])

    def test_custom_lists_override_defaults(self):
        config = StoreConfig.current()
        config.payment_methods = [{"code": "QR", "label": "QR", "active": True}]
        config.document_types = [
            {"code": "TC", "label": "Ticket", "active": True},
            {"code": "FA", "label": "Factura", "active": False},
        ]
        config.save()
        self.assertEqual([m["code"] for m in config.active_payment_methods()], ["QR"])
        self.assertEqual([d["code"] for d in config.active_document_types()], ["TC"])


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

    def _crear_pedido_retirado_custom(self, codigo_proveedor=None, oem=None):
        venta = Venta.objects.create(
            usuario=self.gerente,
            monto_total=10000,
            monto_subtotal=10000,
            estado=Venta.Estado.COMPLETADA,
            tipo_documento=Venta.TipoDocumento.PEDIDO,
        )
        pedido = Pedido.objects.create(
            usuario=self.gerente,
            nombre_cliente="Cliente X",
            telefono_cliente="912345678",
            monto_subtotal=10000,
            monto_total=10000,
            estado=Pedido.Estado.RETIRADO,
            stock_descontado=True,
            venta=venta,
        )
        return PedidoDetalle.objects.create(
            pedido=pedido,
            producto=None,
            codigo_proveedor=codigo_proveedor or self.producto.codigo_producto,
            proveedor=self.proveedor,
            oem=oem or self.producto.oem,
            nombre=self.producto.nombre,
            precio_costo=5000,
            porcentaje_utilidad=Decimal("30.00"),
            precio_final=10000,
        )

    def test_factura_detecta_coincidencia_pedido_retirado(self):
        detalle = self._crear_pedido_retirado_custom()
        resp = auth_client(self.gerente).post(
            "/api/facturas/", self._factura_payload(), format="json"
        )
        self.assertEqual(resp.status_code, 201)
        self.assertEqual(len(resp.data["coincidencias"]), 1)
        co = resp.data["coincidencias"][0]
        self.assertEqual(co["pedido_detalle_id"], detalle.id)
        self.assertEqual(co["producto_id"], self.producto.producto_id)

    def test_factura_sin_coincidencias(self):
        resp = auth_client(self.gerente).post(
            "/api/facturas/", self._factura_payload(), format="json"
        )
        self.assertEqual(resp.status_code, 201)
        self.assertEqual(resp.data["coincidencias"], [])

    def test_factura_no_detecta_pedido_pendiente(self):
        venta = Venta.objects.create(
            usuario=self.gerente, monto_total=10000, monto_subtotal=10000,
            estado=Venta.Estado.COMPLETADA, tipo_documento=Venta.TipoDocumento.PEDIDO,
        )
        pedido = Pedido.objects.create(
            usuario=self.gerente, nombre_cliente="X", telefono_cliente="1",
            monto_subtotal=10000, monto_total=10000,
            estado=Pedido.Estado.PENDIENTE_RETIRAR, venta=venta,
        )
        PedidoDetalle.objects.create(
            pedido=pedido, producto=None,
            codigo_proveedor=self.producto.codigo_producto,
            proveedor=self.proveedor, oem=self.producto.oem,
            nombre=self.producto.nombre, precio_costo=5000,
            porcentaje_utilidad=Decimal("30.00"), precio_final=10000,
        )
        resp = auth_client(self.gerente).post(
            "/api/facturas/", self._factura_payload(), format="json"
        )
        self.assertEqual(resp.status_code, 201)
        self.assertEqual(resp.data["coincidencias"], [])

    def test_reconciliar_pedidos_descuenta(self):
        detalle = self._crear_pedido_retirado_custom()
        resp = auth_client(self.gerente).post(
            "/api/facturas/", self._factura_payload(), format="json"
        )
        factura_id = resp.data["id"]
        resp = auth_client(self.gerente).post(
            f"/api/facturas/{factura_id}/reconciliar-pedidos/",
            {"descontar": [detalle.id]},
            format="json",
        )
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(resp.data["aplicados"], [detalle.id])
        detalle.refresh_from_db()
        self.assertEqual(detalle.producto_id, self.producto.producto_id)
        stock = StockProductoUbicacion.objects.get(producto=self.producto)
        self.assertEqual(stock.cantidad, 4)

    def test_reconciliar_pedidos_idempotente(self):
        detalle = self._crear_pedido_retirado_custom()
        resp = auth_client(self.gerente).post(
            "/api/facturas/", self._factura_payload(), format="json"
        )
        factura_id = resp.data["id"]
        client = auth_client(self.gerente)
        first = client.post(
            f"/api/facturas/{factura_id}/reconciliar-pedidos/",
            {"descontar": [detalle.id]},
            format="json",
        )
        second = client.post(
            f"/api/facturas/{factura_id}/reconciliar-pedidos/",
            {"descontar": [detalle.id]},
            format="json",
        )
        self.assertEqual(first.data["aplicados"], [detalle.id])
        self.assertEqual(second.data["aplicados"], [])

    def test_reconciliar_pedidos_id_invalido_ignorado(self):
        resp = auth_client(self.gerente).post(
            "/api/facturas/", self._factura_payload(), format="json"
        )
        factura_id = resp.data["id"]
        resp = auth_client(self.gerente).post(
            f"/api/facturas/{factura_id}/reconciliar-pedidos/",
            {"descontar": [999999]},
            format="json",
        )
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(resp.data["aplicados"], [])


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
