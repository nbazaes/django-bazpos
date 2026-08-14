from datetime import date, timedelta
from decimal import Decimal

from django.test import TestCase
from django.utils import timezone

from docker.test_utils import auth_client, create_business_groups, make_user
from gerenteApp.models import PrecioHistorico, Proveedor, StoreConfig
from vendedorApp.models import (
    Anulacion,
    AjusteStock,
    DetalleDevolucion,
    Devolucion,
    ItemPedidoProveedor,
    Pedido,
    PedidoDetalle,
    PedidoProveedorDia,
    Producto,
    StockProductoUbicacion,
    Ubicacion,
    Venta,
)
from vendedorApp.serializers import _distribute_discount, _round_total


class BaseTest(TestCase):
    @classmethod
    def setUpTestData(cls):
        create_business_groups()
        cls.gerente = make_user("Gerente")
        cls.vendedor = make_user("Vendedor", first_name="Ana", last_name="Perez")
        cls.vendedor2 = make_user("Vendedor", first_name="Luis", last_name="Rojas")
        cls.bodeguero = make_user("Bodeguero")
        cls.proveedor = Proveedor.objects.create(
            rut="7654321-8", nombre="Proveedor Uno"
        )
        cls.ubicacion = Ubicacion.objects.create(nombre="Bodega Central")


class ProductoModelTest(TestCase):
    @classmethod
    def setUpTestData(cls):
        create_business_groups()
        cls.proveedor = Proveedor.objects.create(rut="1111111-1", nombre="Prov")

    def _create(self, **kwargs):
        data = dict(
            nombre="Producto",
            codigo_producto="PROD1",
            oem="OEM1",
            descripcion="Desc",
            precio_costo=10000,
            stock_minimo=2,
            stock_maximo=50,
            margen_utilidad=Decimal("30.00"),
            proveedor=self.proveedor,
        )
        data.update(kwargs)
        return Producto.objects.create(**data)

    def test_precio_calculated(self):
        producto = self._create()
        # costo 10000 * 1.30 = 13000 * 1.19 = 15470 -> round up to 15500
        self.assertEqual(producto.precio, 15500)

    def test_stock_actual_aggregates(self):
        producto = self._create()
        u1 = Ubicacion.objects.create(nombre="B1")
        u2 = Ubicacion.objects.create(nombre="B2")
        StockProductoUbicacion.objects.create(producto=producto, ubicacion=u1, cantidad=3)
        StockProductoUbicacion.objects.create(producto=producto, ubicacion=u2, cantidad=2)
        self.assertEqual(producto.stock_actual, 5)


class RoundAndDiscountTest(TestCase):
    def test_round_total(self):
        self.assertEqual(_round_total(899), 0)
        self.assertEqual(_round_total(900), 1000)
        self.assertEqual(_round_total(950), 1000)
        self.assertEqual(_round_total(1000), 1000)
        self.assertEqual(_round_total(1900), 2000)

    def test_distribute_discount_no_discount(self):
        items = [(1, 6000, 6000, 6000), (1, 4000, 4000, 4000)]
        result = _distribute_discount(10000, 10000, 0, items)
        self.assertEqual(result, [6000, 4000])

    def test_distribute_discount_with_discount(self):
        items = [(1, 6000, 6000, 6000), (1, 4000, 4000, 4000)]
        result = _distribute_discount(10000, 9000, 10, items)
        self.assertEqual(result, [5000, 4000])


class VentaApiTest(BaseTest):
    @classmethod
    def setUpTestData(cls):
        super().setUpTestData()
        cls.producto = Producto.objects.create(
            nombre="Producto A",
            codigo_producto="PA001",
            oem="OEM-A",
            descripcion="Desc A",
            precio_costo=5000,
            stock_minimo=2,
            stock_maximo=50,
            margen_utilidad=Decimal("30.00"),
            proveedor=cls.proveedor,
        )
        StockProductoUbicacion.objects.create(
            producto=cls.producto, ubicacion=cls.ubicacion, cantidad=10
        )

    def _payload(self, cantidad=2, precio=None, total=None, **kwargs):
        precio = precio or self.producto.precio
        total = total if total is not None else precio * cantidad
        data = {
            "productos": [
                {
                    "producto_id": self.producto.producto_id,
                    "cantidad": cantidad,
                    "precio": precio,
                }
            ],
            "total": total,
            "monto_subtotal": total,
        }
        data.update(kwargs)
        return data

    def test_create_venta(self):
        resp = auth_client(self.vendedor).post(
            "/api/ventas/", self._payload(), format="json"
        )
        self.assertEqual(resp.status_code, 201)
        venta = Venta.objects.get(id=resp.data["id"])
        self.assertEqual(venta.estado, Venta.Estado.COMPLETADA)
        self.assertEqual(venta.detalleventa_set.count(), 1)
        detalle = venta.detalleventa_set.first()
        self.assertEqual(detalle.cantidad, 2)
        self.assertEqual(detalle.subtotal, self.producto.precio)

    def test_create_venta_insufficient_stock(self):
        resp = auth_client(self.vendedor).post(
            "/api/ventas/", self._payload(cantidad=50), format="json"
        )
        self.assertEqual(resp.status_code, 400)

    def test_create_venta_discount_mismatch(self):
        payload = self._payload(
            descuento_porcentaje=10,
            total=8999,
            monto_subtotal=10000,
        )
        resp = auth_client(self.vendedor).post("/api/ventas/", payload, format="json")
        self.assertEqual(resp.status_code, 400)

    def test_validar_stock_ok(self):
        resp = auth_client(self.vendedor).post(
            "/api/ventas/validar-stock/",
            {"productos": [{"producto_id": self.producto.producto_id, "cantidad": 5}]},
            format="json",
        )
        self.assertEqual(resp.status_code, 200)
        self.assertTrue(resp.data["stock_valido"])

    def test_validar_stock_insufficient(self):
        resp = auth_client(self.vendedor).post(
            "/api/ventas/validar-stock/",
            {"productos": [{"producto_id": self.producto.producto_id, "cantidad": 50}]},
            format="json",
        )
        self.assertEqual(resp.status_code, 200)
        self.assertFalse(resp.data["stock_valido"])

    def test_validar_stock_product_not_found(self):
        resp = auth_client(self.vendedor).post(
            "/api/ventas/validar-stock/",
            {"productos": [{"producto_id": 999999, "cantidad": 1}]},
            format="json",
        )
        self.assertEqual(resp.status_code, 404)

    def test_vendedor_sees_only_own_ventas(self):
        auth_client(self.vendedor).post("/api/ventas/", self._payload(), format="json")
        auth_client(self.vendedor2).post("/api/ventas/", self._payload(), format="json")

        own = auth_client(self.vendedor).get("/api/ventas/")
        self.assertEqual(own.data["count"], 1)

        all_ventas = auth_client(self.gerente).get("/api/ventas/")
        self.assertEqual(all_ventas.data["count"], 2)

    def test_gerente_sees_ventas_of_others(self):
        auth_client(self.vendedor).post("/api/ventas/", self._payload(), format="json")
        resp = auth_client(self.gerente).get("/api/ventas/")
        self.assertEqual(resp.data["count"], 1)
        self.assertEqual(resp.data["results"][0]["usuario_nombre"], self.vendedor.username)


class VentaStockActionsTest(BaseTest):
    @classmethod
    def setUpTestData(cls):
        super().setUpTestData()
        cls.producto = Producto.objects.create(
            nombre="Producto B",
            codigo_producto="PB001",
            oem="OEM-B",
            descripcion="Desc B",
            precio_costo=5000,
            stock_minimo=2,
            stock_maximo=50,
            margen_utilidad=Decimal("30.00"),
            proveedor=cls.proveedor,
        )
        StockProductoUbicacion.objects.create(
            producto=cls.producto, ubicacion=cls.ubicacion, cantidad=10
        )

    def _crear_venta(self):
        resp = auth_client(self.vendedor).post(
            "/api/ventas/",
            {
                "productos": [
                    {
                        "producto_id": self.producto.producto_id,
                        "cantidad": 2,
                        "precio": self.producto.precio,
                    }
                ],
                "total": self.producto.precio * 2,
            },
            format="json",
        )
        return resp.data["id"]

    def test_deducir_stock(self):
        venta_id = self._crear_venta()
        resp = auth_client(self.vendedor).post(
            f"/api/ventas/{venta_id}/deducir-stock/",
            {
                "deducciones": [
                    {
                        "producto_id": self.producto.producto_id,
                        "ubicacion_id": self.ubicacion.id,
                        "cantidad": 2,
                    }
                ]
            },
            format="json",
        )
        self.assertEqual(resp.status_code, 200)
        stock = StockProductoUbicacion.objects.get(
            producto=self.producto, ubicacion=self.ubicacion
        )
        self.assertEqual(stock.cantidad, 8)

    def test_deducir_stock_insufficient(self):
        venta_id = self._crear_venta()
        resp = auth_client(self.vendedor).post(
            f"/api/ventas/{venta_id}/deducir-stock/",
            {
                "deducciones": [
                    {
                        "producto_id": self.producto.producto_id,
                        "ubicacion_id": self.ubicacion.id,
                        "cantidad": 50,
                    }
                ]
            },
            format="json",
        )
        self.assertEqual(resp.status_code, 400)

    def test_ubicaciones_para_deducir(self):
        u2 = Ubicacion.objects.create(nombre="Bodega Norte")
        StockProductoUbicacion.objects.create(
            producto=self.producto, ubicacion=u2, cantidad=4
        )
        venta_id = self._crear_venta()
        resp = auth_client(self.vendedor).get(
            f"/api/ventas/{venta_id}/ubicaciones-para-deducir/"
        )
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(len(resp.data), 1)
        self.assertEqual(len(resp.data[0]["ubicaciones"]), 2)

    def test_documento_html(self):
        venta_id = self._crear_venta()
        resp = auth_client(self.vendedor).get(f"/api/ventas/{venta_id}/documento/")
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(resp["Content-Type"].split(";")[0], "text/html")
        self.assertIn("COMPROBANTE DE VENTA", resp.content.decode())


class AnularDevolverTest(BaseTest):
    @classmethod
    def setUpTestData(cls):
        super().setUpTestData()
        cls.producto = Producto.objects.create(
            nombre="Producto C",
            codigo_producto="PC001",
            oem="OEM-C",
            descripcion="Desc C",
            precio_costo=5000,
            stock_minimo=2,
            stock_maximo=50,
            margen_utilidad=Decimal("30.00"),
            proveedor=cls.proveedor,
        )
        StockProductoUbicacion.objects.create(
            producto=cls.producto, ubicacion=cls.ubicacion, cantidad=10
        )

    def _crear_venta(self, cantidad=2):
        resp = auth_client(self.vendedor).post(
            "/api/ventas/",
            {
                "productos": [
                    {
                        "producto_id": self.producto.producto_id,
                        "cantidad": cantidad,
                        "precio": self.producto.precio,
                    }
                ],
                "total": self.producto.precio * cantidad,
            },
            format="json",
        )
        return resp.data["id"]

    def test_anular_restaura_stock(self):
        venta_id = self._crear_venta()
        stock = StockProductoUbicacion.objects.get(
            producto=self.producto, ubicacion=self.ubicacion
        )
        stock.cantidad = 8
        stock.save()

        resp = auth_client(self.gerente).post(
            f"/api/ventas/{venta_id}/anular/",
            {
                "motivo": "Error de caja",
                "restauraciones": [
                    {
                        "producto_id": self.producto.producto_id,
                        "ubicacion_id": self.ubicacion.id,
                        "cantidad": 2,
                    }
                ],
            },
            format="json",
        )
        self.assertEqual(resp.status_code, 201)
        venta = Venta.objects.get(id=venta_id)
        self.assertEqual(venta.estado, Venta.Estado.CANCELADA)
        self.assertTrue(Anulacion.objects.filter(venta=venta).exists())
        stock.refresh_from_db()
        self.assertEqual(stock.cantidad, 10)

    def test_anular_ya_anulada(self):
        venta_id = self._crear_venta()
        client = auth_client(self.gerente)
        payload = {
            "motivo": "Error",
            "restauraciones": [
                {
                    "producto_id": self.producto.producto_id,
                    "ubicacion_id": self.ubicacion.id,
                    "cantidad": 2,
                }
            ],
        }
        client.post(f"/api/ventas/{venta_id}/anular/", payload, format="json")
        resp = client.post(f"/api/ventas/{venta_id}/anular/", payload, format="json")
        self.assertEqual(resp.status_code, 400)

    def test_anular_requiere_todos_los_productos(self):
        venta_id = self._crear_venta()
        resp = auth_client(self.gerente).post(
            f"/api/ventas/{venta_id}/anular/",
            {"motivo": "Error", "restauraciones": []},
            format="json",
        )
        self.assertEqual(resp.status_code, 400)

    def test_devolver(self):
        venta_id = self._crear_venta()
        resp = auth_client(self.gerente).post(
            f"/api/ventas/{venta_id}/devolver/",
            {
                "motivo": "Cliente devolvió",
                "productos": [
                    {
                        "producto_id": self.producto.producto_id,
                        "cantidad": 1,
                        "reponer_stock": True,
                        "ubicacion_id": self.ubicacion.id,
                    }
                ],
            },
            format="json",
        )
        self.assertEqual(resp.status_code, 201)
        devolucion = Devolucion.objects.get(id=resp.data["id"])
        self.assertEqual(devolucion.monto_devuelto, self.producto.precio)
        self.assertTrue(
            DetalleDevolucion.objects.filter(devolucion=devolucion).exists()
        )

    def test_devolver_excede_disponible(self):
        venta_id = self._crear_venta(cantidad=2)
        resp = auth_client(self.gerente).post(
            f"/api/ventas/{venta_id}/devolver/",
            {
                "motivo": "Devolución",
                "productos": [
                    {
                        "producto_id": self.producto.producto_id,
                        "cantidad": 3,
                        "reponer_stock": False,
                    }
                ],
            },
            format="json",
        )
        self.assertEqual(resp.status_code, 400)

    def test_devolver_reponer_sin_ubicacion(self):
        venta_id = self._crear_venta()
        resp = auth_client(self.gerente).post(
            f"/api/ventas/{venta_id}/devolver/",
            {
                "motivo": "Devolución",
                "productos": [
                    {
                        "producto_id": self.producto.producto_id,
                        "cantidad": 1,
                        "reponer_stock": True,
                    }
                ],
            },
            format="json",
        )
        self.assertEqual(resp.status_code, 400)


class PedidoApiTest(BaseTest):
    @classmethod
    def setUpTestData(cls):
        super().setUpTestData()
        cls.producto = Producto.objects.create(
            nombre="Producto D",
            codigo_producto="PD001",
            oem="OEM-D",
            descripcion="Desc D",
            precio_costo=10000,
            stock_minimo=2,
            stock_maximo=50,
            margen_utilidad=Decimal("30.00"),
            proveedor=cls.proveedor,
        )
        StockProductoUbicacion.objects.create(
            producto=cls.producto, ubicacion=cls.ubicacion, cantidad=10
        )

    def _item(self, es_cotizacion=False):
        return {
            "nombre_cliente": "Cliente Uno",
            "telefono_cliente": "912345678",
            "metodo_pago": "EF",
            "es_cotizacion": es_cotizacion,
            "items": [
                {
                    "producto_id": self.producto.producto_id,
                    "codigo_proveedor": "CP1",
                    "proveedor_id": self.proveedor.proveedor_id,
                    "oem": "OEM-D",
                    "nombre": "Producto D",
                    "precio_costo": 10000,
                    "porcentaje_utilidad": "30.00",
                    "sumar_envio": True,
                }
            ],
        }

    def test_crear_pedido(self):
        resp = auth_client(self.vendedor).post(
            "/api/pedidos/", self._item(), format="json"
        )
        self.assertEqual(resp.status_code, 201)
        pedido = Pedido.objects.get(id=resp.data["id"])
        self.assertFalse(pedido.es_cotizacion)
        self.assertEqual(pedido.estado, Pedido.Estado.PENDIENTE_RETIRAR)
        self.assertIsNotNone(pedido.venta)
        self.assertEqual(pedido.detalles.count(), 1)
        # El item del pedido de proveedor debe existir para hoy
        dia_hoy = PedidoProveedorDia.objects.filter(fecha=date.today()).first()
        self.assertIsNotNone(dia_hoy)
        self.assertTrue(
            ItemPedidoProveedor.objects.filter(
                dia=dia_hoy, producto=self.producto
            ).exists()
        )

    def test_crear_cotizacion_no_crea_venta(self):
        resp = auth_client(self.vendedor).post(
            "/api/pedidos/", self._item(es_cotizacion=True), format="json"
        )
        self.assertEqual(resp.status_code, 201)
        pedido = Pedido.objects.get(id=resp.data["id"])
        self.assertTrue(pedido.es_cotizacion)
        self.assertIsNone(pedido.venta)

    def test_cambiar_estado_retira_descuenta_stock(self):
        resp = auth_client(self.vendedor).post(
            "/api/pedidos/", self._item(), format="json"
        )
        pedido_id = resp.data["id"]
        resp = auth_client(self.vendedor).post(
            f"/api/pedidos/{pedido_id}/cambiar-estado/",
            {"estado": "RE"},
            format="json",
        )
        self.assertEqual(resp.status_code, 200)
        pedido = Pedido.objects.get(id=pedido_id)
        self.assertEqual(pedido.estado, Pedido.Estado.RETIRADO)
        self.assertTrue(pedido.stock_descontado)
        stock = StockProductoUbicacion.objects.get(
            producto=self.producto, ubicacion=self.ubicacion
        )
        self.assertEqual(stock.cantidad, 9)

    def test_marcar_retiro(self):
        resp = auth_client(self.vendedor).post(
            "/api/pedidos/", self._item(), format="json"
        )
        pedido_id = resp.data["id"]
        resp = auth_client(self.vendedor).post(
            f"/api/pedidos/{pedido_id}/marcar-retiro/",
            {"persona_retiro": "Maria Lopez"},
            format="json",
        )
        self.assertEqual(resp.status_code, 200)
        pedido = Pedido.objects.get(id=pedido_id)
        self.assertEqual(pedido.estado, Pedido.Estado.RETIRADO)
        self.assertEqual(pedido.persona_retiro, "Maria Lopez")
        self.assertIsNotNone(pedido.fecha_retiro)

    def test_marcar_retiro_dos_veces(self):
        resp = auth_client(self.vendedor).post(
            "/api/pedidos/", self._item(), format="json"
        )
        pedido_id = resp.data["id"]
        client = auth_client(self.vendedor)
        client.post(
            f"/api/pedidos/{pedido_id}/marcar-retiro/",
            {"persona_retiro": "Maria"},
            format="json",
        )
        resp = client.post(
            f"/api/pedidos/{pedido_id}/marcar-retiro/",
            {"persona_retiro": "Maria"},
            format="json",
        )
        self.assertEqual(resp.status_code, 400)

    def test_cancelar_pedido(self):
        resp = auth_client(self.vendedor).post(
            "/api/pedidos/", self._item(), format="json"
        )
        pedido_id = resp.data["id"]
        resp = auth_client(self.vendedor).post(
            f"/api/pedidos/{pedido_id}/cancelar/",
            {"motivo": "Cliente no lo retiró"},
            format="json",
        )
        self.assertEqual(resp.status_code, 200)
        pedido = Pedido.objects.get(id=pedido_id)
        self.assertEqual(pedido.estado, Pedido.Estado.CANCELADO)
        self.assertEqual(pedido.motivo_cancelacion, "Cliente no lo retiró")

    def test_convertir_cotizacion_a_pedido(self):
        resp = auth_client(self.vendedor).post(
            "/api/pedidos/", self._item(es_cotizacion=True), format="json"
        )
        cotizacion_id = resp.data["id"]
        detalle_id = PedidoDetalle.objects.get(pedido_id=cotizacion_id).id

        resp = auth_client(self.vendedor).post(
            f"/api/pedidos/{cotizacion_id}/convertir-a-pedido/",
            {"detalle_ids": [detalle_id], "nombre_cliente": "Cliente Convertido"},
            format="json",
        )
        self.assertEqual(resp.status_code, 201)
        nuevo = Pedido.objects.get(id=resp.data["id"])
        self.assertFalse(nuevo.es_cotizacion)
        self.assertIsNotNone(nuevo.venta)

    def test_convertir_cotizacion_dos_veces(self):
        resp = auth_client(self.vendedor).post(
            "/api/pedidos/", self._item(es_cotizacion=True), format="json"
        )
        cotizacion_id = resp.data["id"]
        detalle_id = PedidoDetalle.objects.get(pedido_id=cotizacion_id).id
        client = auth_client(self.vendedor)
        payload = {"detalle_ids": [detalle_id]}
        client.post(
            f"/api/pedidos/{cotizacion_id}/convertir-a-pedido/",
            payload,
            format="json",
        )
        resp = client.post(
            f"/api/pedidos/{cotizacion_id}/convertir-a-pedido/",
            payload,
            format="json",
        )
        self.assertEqual(resp.status_code, 400)


class PedidoProveedorTest(BaseTest):
    @classmethod
    def setUpTestData(cls):
        super().setUpTestData()
        cls.producto = Producto.objects.create(
            nombre="Producto E",
            codigo_producto="PE001",
            oem="OEM-E",
            descripcion="Desc E",
            precio_costo=5000,
            stock_minimo=2,
            stock_maximo=50,
            margen_utilidad=Decimal("30.00"),
            proveedor=cls.proveedor,
        )

    def test_hoy_crea_dia(self):
        resp = auth_client(self.gerente).get("/api/pedidos-proveedor/hoy/")
        self.assertEqual(resp.status_code, 200)
        self.assertTrue(PedidoProveedorDia.objects.filter(fecha=date.today()).exists())

    def test_agregar_item_producto(self):
        client = auth_client(self.gerente)
        client.get("/api/pedidos-proveedor/hoy/")
        resp = client.post(
            "/api/pedidos-proveedor/agregar-item/",
            {"producto_id": self.producto.producto_id},
            format="json",
        )
        self.assertEqual(resp.status_code, 200)
        self.assertTrue(resp.data["created"])
        dia = PedidoProveedorDia.objects.get(fecha=date.today())
        self.assertTrue(
            ItemPedidoProveedor.objects.filter(
                dia=dia, producto=self.producto
            ).exists()
        )

    def test_agregar_item_custom(self):
        client = auth_client(self.gerente)
        client.get("/api/pedidos-proveedor/hoy/")
        resp = client.post(
            "/api/pedidos-proveedor/agregar-item/",
            {
                "proveedor_id": self.proveedor.proveedor_id,
                "nombre_custom": "Item Especial",
                "codigo_proveedor_custom": "XYZ",
            },
            format="json",
        )
        self.assertEqual(resp.status_code, 200)
        dia = PedidoProveedorDia.objects.get(fecha=date.today())
        item = ItemPedidoProveedor.objects.get(dia=dia, nombre_custom="Item Especial")
        self.assertIsNone(item.producto)

    def test_toggle_y_eliminar_item(self):
        client = auth_client(self.gerente)
        client.get("/api/pedidos-proveedor/hoy/")
        client.post(
            "/api/pedidos-proveedor/agregar-item/",
            {"producto_id": self.producto.producto_id},
            format="json",
        )
        dia = PedidoProveedorDia.objects.get(fecha=date.today())
        item = dia.items.get(producto=self.producto)

        resp = client.post(
            f"/api/pedidos-proveedor/{dia.id}/toggle-item/{item.id}/"
        )
        self.assertEqual(resp.status_code, 200)
        item.refresh_from_db()
        self.assertTrue(item.pedido)

        resp = client.delete(
            f"/api/pedidos-proveedor/{dia.id}/eliminar-item/{item.id}/"
        )
        self.assertEqual(resp.status_code, 200)
        self.assertFalse(ItemPedidoProveedor.objects.filter(id=item.id).exists())

    def test_finalizar_transfiere_pendientes(self):
        client = auth_client(self.gerente)
        client.get("/api/pedidos-proveedor/hoy/")
        client.post(
            "/api/pedidos-proveedor/agregar-item/",
            {"producto_id": self.producto.producto_id},
            format="json",
        )
        dia = PedidoProveedorDia.objects.get(fecha=date.today())
        resp = client.post(f"/api/pedidos-proveedor/{dia.id}/finalizar/")
        self.assertEqual(resp.status_code, 200)
        self.assertTrue(resp.data["finalizado"])
        dia.refresh_from_db()
        self.assertTrue(dia.finalizado)
        dia_manana = PedidoProveedorDia.objects.get(
            fecha=date.today() + timedelta(days=1)
        )
        self.assertTrue(
            ItemPedidoProveedor.objects.filter(
                dia=dia_manana, producto=self.producto
            ).exists()
        )

    def test_transferir(self):
        client = auth_client(self.gerente)
        client.get("/api/pedidos-proveedor/hoy/")
        client.post(
            "/api/pedidos-proveedor/agregar-item/",
            {"producto_id": self.producto.producto_id},
            format="json",
        )
        dia = PedidoProveedorDia.objects.get(fecha=date.today())
        resp = client.post(f"/api/pedidos-proveedor/{dia.id}/transferir/")
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(resp.data["transferidos"], 1)


class ProductoActionsTest(BaseTest):
    @classmethod
    def setUpTestData(cls):
        super().setUpTestData()
        cls.producto = Producto.objects.create(
            nombre="Producto F",
            codigo_producto="PF001",
            oem="OEM-F",
            descripcion="Desc F",
            precio_costo=5000,
            stock_minimo=2,
            stock_maximo=50,
            margen_utilidad=Decimal("30.00"),
            proveedor=cls.proveedor,
        )
        StockProductoUbicacion.objects.create(
            producto=cls.producto, ubicacion=cls.ubicacion, cantidad=5
        )

    def test_por_codigo(self):
        resp = auth_client(self.vendedor).get(
            "/api/productos/por-codigo/?codigo=PF001"
        )
        self.assertEqual(resp.status_code, 200)
        self.assertTrue(resp.data["encontrado"])
        self.assertEqual(resp.data["producto"]["codigo_producto"], "PF001")

    def test_por_codigo_no_encontrado(self):
        resp = auth_client(self.vendedor).get(
            "/api/productos/por-codigo/?codigo=NOPE"
        )
        self.assertEqual(resp.status_code, 200)
        self.assertFalse(resp.data["encontrado"])

    def test_ajustar_stock(self):
        resp = auth_client(self.bodeguero).post(
            f"/api/productos/{self.producto.producto_id}/ajustar-stock/",
            {
                "ajustes": [{"ubicacion_id": self.ubicacion.id, "cantidad": 15}],
                "motivo": "Conteo físico",
            },
            format="json",
        )
        self.assertEqual(resp.status_code, 200)
        stock = StockProductoUbicacion.objects.get(
            producto=self.producto, ubicacion=self.ubicacion
        )
        self.assertEqual(stock.cantidad, 15)
        self.assertTrue(
            AjusteStock.objects.filter(producto=self.producto, motivo="Conteo físico").exists()
        )

    def test_historial_ajustes(self):
        AjusteStock.objects.create(
            producto=self.producto,
            ubicacion=self.ubicacion,
            usuario=self.bodeguero,
            cantidad_anterior=5,
            cantidad_nueva=8,
            motivo="Ajuste",
        )
        resp = auth_client(self.bodeguero).get(
            f"/api/productos/{self.producto.producto_id}/historial-ajustes/"
        )
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(len(resp.data), 1)

    def test_ignorar_stock_permanente(self):
        resp = auth_client(self.gerente).post(
            f"/api/productos/{self.producto.producto_id}/ignorar-stock/",
            {"accion": "ignorar_permanente"},
            format="json",
        )
        self.assertEqual(resp.status_code, 200)
        self.producto.refresh_from_db()
        self.assertTrue(self.producto.ignorar_stock_permanente)

    def test_ignorar_stock_invalido(self):
        resp = auth_client(self.gerente).post(
            f"/api/productos/{self.producto.producto_id}/ignorar-stock/",
            {"accion": "algo_mas"},
            format="json",
        )
        self.assertEqual(resp.status_code, 400)

    def test_historial_precios(self):
        PrecioHistorico.objects.create(
            producto=self.producto,
            precio_costo_anterior=5000,
            precio_costo_nuevo=6000,
            precio_venta_anterior=10000,
            precio_venta_nuevo=11000,
        )
        resp = auth_client(self.gerente).get(
            f"/api/productos/{self.producto.producto_id}/historial-precios/"
        )
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(resp.data["count"], 1)

    def test_ultima_factura_none(self):
        resp = auth_client(self.vendedor).get(
            f"/api/productos/{self.producto.producto_id}/ultima-factura/"
        )
        self.assertEqual(resp.status_code, 200)
        self.assertIsNone(resp.data)


class RolePermissionTest(BaseTest):
    @classmethod
    def setUpTestData(cls):
        super().setUpTestData()

    def test_vendedor_no_crea_producto(self):
        resp = auth_client(self.vendedor).post(
            "/api/productos/",
            {
                "nombre": "Nuevo",
                "codigo_producto": "NUEVO1",
                "oem": "OEM",
                "descripcion": "Desc",
                "precio_costo": 1000,
                "margen_utilidad": "30.00",
                "stock_minimo": 1,
                "stock_maximo": 10,
                "proveedor": self.proveedor.proveedor_id,
            },
            format="json",
        )
        self.assertEqual(resp.status_code, 403)

    def test_vendedor_no_crea_proveedor(self):
        resp = auth_client(self.vendedor).post(
            "/api/proveedores/",
            {"rut": "1234567-4", "nombre": "Prov"},
            format="json",
        )
        self.assertEqual(resp.status_code, 403)

    def test_gerente_crea_producto(self):
        resp = auth_client(self.gerente).post(
            "/api/productos/",
            {
                "nombre": "Nuevo",
                "codigo_producto": "NUEVO2",
                "oem": "OEM",
                "descripcion": "Desc",
                "precio_costo": 1000,
                "margen_utilidad": "30.00",
                "stock_minimo": 1,
                "stock_maximo": 10,
                "proveedor": self.proveedor.proveedor_id,
            },
            format="json",
        )
        self.assertEqual(resp.status_code, 201)

    def test_bodeguero_puede_listar_productos(self):
        resp = auth_client(self.bodeguero).get("/api/productos/")
        self.assertEqual(resp.status_code, 200)

    def test_vendedor_puede_crear_venta(self):
        producto = Producto.objects.create(
            nombre="Producto G",
            codigo_producto="PG001",
            oem="OEM-G",
            descripcion="Desc G",
            precio_costo=5000,
            stock_minimo=1,
            stock_maximo=10,
            margen_utilidad=Decimal("30.00"),
            proveedor=self.proveedor,
        )
        StockProductoUbicacion.objects.create(
            producto=producto, ubicacion=self.ubicacion, cantidad=5
        )
        resp = auth_client(self.vendedor).post(
            "/api/ventas/",
            {
                "productos": [
                    {
                        "producto_id": producto.producto_id,
                        "cantidad": 1,
                        "precio": producto.precio,
                    }
                ],
                "total": producto.precio,
            },
            format="json",
        )
        self.assertEqual(resp.status_code, 201)


class DashboardTest(BaseTest):
    @classmethod
    def setUpTestData(cls):
        super().setUpTestData()
        cls.producto = Producto.objects.create(
            nombre="Producto H",
            codigo_producto="PH001",
            oem="OEM-H",
            descripcion="Desc H",
            precio_costo=5000,
            stock_minimo=5,
            stock_maximo=50,
            margen_utilidad=Decimal("30.00"),
            proveedor=cls.proveedor,
        )
        # Bajo mínimo: 2 < 5
        StockProductoUbicacion.objects.create(
            producto=cls.producto, ubicacion=cls.ubicacion, cantidad=2
        )

    def _crear_venta(self, monto=15000, usuario=None):
        usuario = usuario or self.vendedor
        Venta.objects.create(
            usuario=usuario,
            monto_total=monto,
            monto_subtotal=monto,
            estado=Venta.Estado.COMPLETADA,
        )

    def test_dashboard_gerente_agrega_todos(self):
        self._crear_venta(monto=10000, usuario=self.vendedor)
        self._crear_venta(monto=20000, usuario=self.vendedor2)
        resp = auth_client(self.gerente).get("/api/dashboard/stats/")
        self.assertEqual(resp.status_code, 200)
        self.assertTrue(resp.data["es_gerente"])
        self.assertEqual(resp.data["ventas_dia"]["total"], 30000)
        self.assertEqual(resp.data["ventas_dia"]["cantidad"], 2)

    def test_dashboard_vendedor_solo_propias(self):
        self._crear_venta(monto=10000, usuario=self.vendedor)
        self._crear_venta(monto=20000, usuario=self.vendedor2)
        resp = auth_client(self.vendedor).get("/api/dashboard/stats/")
        self.assertFalse(resp.data["es_gerente"])
        self.assertEqual(resp.data["ventas_dia"]["total"], 10000)

    def test_dashboard_resta_devoluciones(self):
        venta = Venta.objects.create(
            usuario=self.vendedor,
            monto_total=15000,
            monto_subtotal=15000,
            estado=Venta.Estado.COMPLETADA,
        )
        Devolucion.objects.create(
            venta=venta,
            usuario=self.vendedor,
            motivo="Dev",
            monto_devuelto=3000,
        )
        resp = auth_client(self.gerente).get("/api/dashboard/stats/")
        self.assertEqual(resp.data["ventas_dia"]["total"], 12000)
        self.assertEqual(resp.data["ventas_dia"]["devoluciones"], 3000)

    def test_dashboard_bajo_minimo(self):
        resp = auth_client(self.gerente).get("/api/dashboard/stats/")
        self.assertEqual(resp.status_code, 200)
        self.assertTrue(
            any(
                p["producto_id"] == self.producto.producto_id
                for p in resp.data["stock"]["bajo_minimo"]
            )
        )

    def test_dashboard_requiere_auth(self):
        resp = self.client.get("/api/dashboard/stats/")
        self.assertEqual(resp.status_code, 401)


class StoreNameApiTest(TestCase):
    def test_store_name_publico(self):
        from django.test import override_settings

        with override_settings(STORE_NAME="EUROCAS"):
            resp = self.client.get("/api/store-name/")
            self.assertEqual(resp.status_code, 200)
            self.assertEqual(resp.data["name"], "EUROCAS")

    def test_store_name_sin_auth(self):
        resp = self.client.get("/api/store-name/")
        self.assertEqual(resp.status_code, 200)
        self.assertIn("name", resp.data)
