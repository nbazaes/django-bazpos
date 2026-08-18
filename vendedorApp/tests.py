from datetime import date, timedelta
from decimal import Decimal

from django.db.models import Sum
from django.test import TestCase
from django.utils import timezone

from docker.test_utils import auth_client, create_business_groups, make_user
from gerenteApp.models import PrecioHistorico, Proveedor, StoreConfig
from vendedorApp.models import (
    Anulacion,
    AjusteStock,
    CierreCaja,
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

    def test_create_venta_con_pago_simple(self):
        total = self.producto.precio * 2
        payload = self._payload(pagos=[{"metodo_pago": "TJ", "monto": total}], documento="FA")
        resp = auth_client(self.vendedor).post("/api/ventas/", payload, format="json")
        self.assertEqual(resp.status_code, 201)
        venta = Venta.objects.get(id=resp.data["id"])
        self.assertEqual(venta.documento, Venta.Documento.FACTURA)
        pagos = list(venta.pagos.all())
        self.assertEqual(len(pagos), 1)
        self.assertEqual(pagos[0].metodo_pago, Venta.MetodoPago.TARJETA)
        self.assertEqual(pagos[0].monto, total)

    def test_create_venta_pago_mixto(self):
        total = self.producto.precio * 2
        mitad = total // 2
        payload = self._payload(
            pagos=[
                {"metodo_pago": "EF", "monto": mitad},
                {"metodo_pago": "TJ", "monto": total - mitad},
            ]
        )
        resp = auth_client(self.vendedor).post("/api/ventas/", payload, format="json")
        self.assertEqual(resp.status_code, 201)
        venta = Venta.objects.get(id=resp.data["id"])
        self.assertEqual(venta.pagos.count(), 2)
        self.assertEqual(
            venta.pagos.aggregate(total=Sum("monto"))["total"], total
        )

    def test_create_venta_pago_cheque(self):
        total = self.producto.precio * 2
        payload = self._payload(pagos=[{"metodo_pago": "CH", "monto": total}])
        resp = auth_client(self.vendedor).post("/api/ventas/", payload, format="json")
        self.assertEqual(resp.status_code, 201)
        venta = Venta.objects.get(id=resp.data["id"])
        self.assertEqual(venta.pagos.first().metodo_pago, Venta.MetodoPago.CHEQUE)

    def test_create_venta_pago_mixto_suma_incorrecta(self):
        total = self.producto.precio * 2
        payload = self._payload(
            pagos=[
                {"metodo_pago": "EF", "monto": 1000},
                {"metodo_pago": "TJ", "monto": 1000},
            ]
        )
        resp = auth_client(self.vendedor).post("/api/ventas/", payload, format="json")
        self.assertEqual(resp.status_code, 400)
        self.assertIn("pagos", resp.data)
        self.assertIn("no coincide", str(resp.data["pagos"]))

    def test_create_venta_sin_pagos_default_efectivo(self):
        resp = auth_client(self.vendedor).post("/api/ventas/", self._payload(), format="json")
        self.assertEqual(resp.status_code, 201)
        venta = Venta.objects.get(id=resp.data["id"])
        pago = venta.pagos.get()
        self.assertEqual(pago.metodo_pago, Venta.MetodoPago.EFECTIVO)
        self.assertEqual(pago.monto, venta.monto_total)

    def test_cotizacion_marca_convertida_con_venta_derivada(self):
        total = self.producto.precio * 2
        resp = auth_client(self.vendedor).post(
            "/api/ventas/", self._payload(tipo_documento="CO"), format="json"
        )
        self.assertEqual(resp.status_code, 201)
        cotizacion_id = resp.data["id"]

        detail = auth_client(self.vendedor).get(f"/api/ventas/{cotizacion_id}/")
        self.assertFalse(detail.data["convertido"])
        self.assertIsNone(detail.data["venta_derivada_id"])

        sale = auth_client(self.vendedor).post(
            "/api/ventas/",
            self._payload(
                tipo_documento="VE",
                venta_origen=cotizacion_id,
                pagos=[{"metodo_pago": "EF", "monto": total}],
            ),
            format="json",
        )
        self.assertEqual(sale.status_code, 201)
        sale_id = sale.data["id"]

        detail = auth_client(self.vendedor).get(f"/api/ventas/{cotizacion_id}/")
        self.assertTrue(detail.data["convertido"])
        self.assertEqual(detail.data["venta_derivada_id"], sale_id)

    def test_cotizacion_no_puede_convertirse_dos_veces(self):
        total = self.producto.precio * 2
        resp = auth_client(self.vendedor).post(
            "/api/ventas/", self._payload(tipo_documento="CO"), format="json"
        )
        cotizacion_id = resp.data["id"]

        payload = self._payload(
            tipo_documento="VE",
            venta_origen=cotizacion_id,
            pagos=[{"metodo_pago": "EF", "monto": total}],
        )
        self.assertEqual(
            auth_client(self.vendedor).post("/api/ventas/", payload, format="json").status_code,
            201,
        )
        dup = auth_client(self.vendedor).post("/api/ventas/", payload, format="json")
        self.assertEqual(dup.status_code, 400)
        self.assertIn("ya fue convertida", str(dup.data))


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

    def test_ubicaciones_para_deducir_ignora_stock_sin_ubicacion(self):
        u2 = Ubicacion.objects.create(nombre="Bodega Norte")
        StockProductoUbicacion.objects.create(
            producto=self.producto, ubicacion=u2, cantidad=4
        )
        StockProductoUbicacion.objects.create(
            producto=self.producto, ubicacion=None, cantidad=3
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

    def test_devolver_monto_editado(self):
        venta_id = self._crear_venta()
        resp = auth_client(self.gerente).post(
            f"/api/ventas/{venta_id}/devolver/",
            {
                "motivo": "Devolución con reintegro parcial",
                "productos": [
                    {
                        "producto_id": self.producto.producto_id,
                        "cantidad": 1,
                        "reponer_stock": False,
                        "monto_devuelto": 5000,
                    }
                ],
            },
            format="json",
        )
        self.assertEqual(resp.status_code, 201, resp.data)
        devolucion = Devolucion.objects.get(id=resp.data["id"])
        self.assertEqual(devolucion.monto_devuelto, 5000)
        dd = DetalleDevolucion.objects.get(devolucion=devolucion)
        self.assertEqual(dd.precio_unitario, 5000)
        self.assertEqual(dd.nombre, self.producto.nombre)

    def test_devolver_monto_excede_valor(self):
        venta_id = self._crear_venta()
        resp = auth_client(self.gerente).post(
            f"/api/ventas/{venta_id}/devolver/",
            {
                "motivo": "Devolución",
                "productos": [
                    {
                        "producto_id": self.producto.producto_id,
                        "cantidad": 1,
                        "reponer_stock": False,
                        "monto_devuelto": self.producto.precio + 1000,
                    }
                ],
            },
            format="json",
        )
        self.assertEqual(resp.status_code, 400)

    def test_devolver_parcial_dos_veces(self):
        venta_id = self._crear_venta()
        client = auth_client(self.gerente)
        payload = {
            "motivo": "Devolución parcial",
            "productos": [
                {
                    "producto_id": self.producto.producto_id,
                    "cantidad": 1,
                    "reponer_stock": False,
                }
            ],
        }
        resp = client.post(
            f"/api/ventas/{venta_id}/devolver/", payload, format="json"
        )
        self.assertEqual(resp.status_code, 201, resp.data)

        resp = client.get(f"/api/ventas/{venta_id}/")
        self.assertEqual(resp.data["monto_devuelto"], self.producto.precio)
        self.assertEqual(
            resp.data["montos_devueltos"],
            {self.producto.producto_id: self.producto.precio},
        )
        self.assertEqual(
            resp.data["productos_devueltos"],
            {self.producto.producto_id: 1},
        )

        resp = client.post(
            f"/api/ventas/{venta_id}/devolver/", payload, format="json"
        )
        self.assertEqual(resp.status_code, 201, resp.data)

        resp = client.get(f"/api/ventas/{venta_id}/")
        self.assertEqual(resp.data["monto_devuelto"], self.producto.precio * 2)
        self.assertEqual(
            resp.data["productos_devueltos"],
            {self.producto.producto_id: 2},
        )

    def test_devolver_seleccion_vacia(self):
        venta_id = self._crear_venta()
        resp = auth_client(self.gerente).post(
            f"/api/ventas/{venta_id}/devolver/",
            {"motivo": "Sin productos", "productos": []},
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

    def _item_multi(self, n=2):
        payload = self._item()
        item = payload["items"][0]
        payload["items"] = [dict(item, codigo_proveedor=f"CP{i+1}") for i in range(n)]
        return payload

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

    def _crear_pedido_retirado(self):
        resp = auth_client(self.vendedor).post(
            "/api/pedidos/", self._item(), format="json"
        )
        pedido_id = resp.data["id"]
        auth_client(self.vendedor).post(
            f"/api/pedidos/{pedido_id}/cambiar-estado/",
            {"estado": "RE"},
            format="json",
        )
        pedido = Pedido.objects.get(id=pedido_id)
        detalle = PedidoDetalle.objects.get(pedido_id=pedido_id)
        return pedido, detalle

    def _devolver_payload(self, detalle, monto=None, reponer=True):
        return {
            "motivo": "Cliente devolvió el pedido",
            "productos": [
                {
                    "pedido_detalle_id": detalle.id,
                    "monto_devuelto": monto if monto is not None else detalle.precio_final,
                    "reponer_stock": reponer,
                    "ubicacion_id": self.ubicacion.id if reponer else None,
                }
            ],
        }

    def test_devolver_pedido_retirado(self):
        pedido, detalle = self._crear_pedido_retirado()
        self.assertEqual(pedido.stock_descontado, True)
        stock = StockProductoUbicacion.objects.get(
            producto=self.producto, ubicacion=self.ubicacion
        )
        self.assertEqual(stock.cantidad, 9)

        resp = auth_client(self.gerente).post(
            f"/api/pedidos/{pedido.id}/devolver/",
            self._devolver_payload(detalle),
            format="json",
        )
        self.assertEqual(resp.status_code, 201, resp.data)

        devolucion = Devolucion.objects.get(id=resp.data["id"])
        self.assertEqual(devolucion.monto_devuelto, detalle.precio_final)
        self.assertEqual(devolucion.venta_id, pedido.venta_id)
        self.assertEqual(resp.data["pedido_id"], pedido.id)

        pedido.refresh_from_db()
        self.assertEqual(pedido.estado, Pedido.Estado.DEVUELTO)
        self.assertTrue(pedido.activo)
        self.assertEqual(pedido.venta.estado, Venta.Estado.COMPLETADA)

        dd = DetalleDevolucion.objects.get(devolucion=devolucion)
        self.assertEqual(dd.pedido_detalle_id, detalle.id)
        self.assertEqual(dd.cantidad, 1)
        self.assertEqual(dd.precio_unitario, detalle.precio_final)
        self.assertEqual(dd.producto_id, self.producto.producto_id)

        stock.refresh_from_db()
        self.assertEqual(stock.cantidad, 10)

    def test_devolver_pedido_pendiente_no_restaura_stock(self):
        resp = auth_client(self.vendedor).post(
            "/api/pedidos/", self._item(), format="json"
        )
        pedido = Pedido.objects.get(id=resp.data["id"])
        self.assertFalse(pedido.stock_descontado)
        detalle = PedidoDetalle.objects.get(pedido_id=pedido.id)

        resp = auth_client(self.gerente).post(
            f"/api/pedidos/{pedido.id}/devolver/",
            self._devolver_payload(detalle),
            format="json",
        )
        self.assertEqual(resp.status_code, 201, resp.data)

        pedido.refresh_from_db()
        self.assertEqual(pedido.estado, Pedido.Estado.DEVUELTO)
        stock = StockProductoUbicacion.objects.get(
            producto=self.producto, ubicacion=self.ubicacion
        )
        self.assertEqual(stock.cantidad, 10)

    def test_devolver_pedido_linea_custom(self):
        resp = auth_client(self.vendedor).post(
            "/api/pedidos/",
            {
                "nombre_cliente": "Cliente Custom",
                "telefono_cliente": "912345678",
                "metodo_pago": "EF",
                "items": [
                    {
                        "producto_id": None,
                        "codigo_proveedor": "CUST1",
                        "proveedor_id": self.proveedor.proveedor_id,
                        "oem": "OEM-CUSTOM",
                        "nombre": "Pieza Especial",
                        "precio_costo": 20000,
                        "porcentaje_utilidad": "30.00",
                        "sumar_envio": True,
                    }
                ],
            },
            format="json",
        )
        pedido = Pedido.objects.get(id=resp.data["id"])
        detalle = PedidoDetalle.objects.get(pedido_id=pedido.id)
        self.assertIsNone(detalle.producto)

        resp = auth_client(self.gerente).post(
            f"/api/pedidos/{pedido.id}/devolver/",
            self._devolver_payload(detalle),
            format="json",
        )
        self.assertEqual(resp.status_code, 201, resp.data)
        devolucion = Devolucion.objects.get(id=resp.data["id"])
        dd = DetalleDevolucion.objects.get(devolucion=devolucion)
        self.assertIsNone(dd.producto)
        self.assertEqual(dd.nombre, "Pieza Especial")
        self.assertEqual(dd.precio_unitario, detalle.precio_final)

    def test_devolver_pedido_monto_editado(self):
        pedido, detalle = self._crear_pedido_retirado()
        monto = detalle.precio_final - 2000
        resp = auth_client(self.gerente).post(
            f"/api/pedidos/{pedido.id}/devolver/",
            self._devolver_payload(detalle, monto=monto),
            format="json",
        )
        self.assertEqual(resp.status_code, 201, resp.data)
        devolucion = Devolucion.objects.get(id=resp.data["id"])
        self.assertEqual(devolucion.monto_devuelto, monto)

    def test_devolver_pedido_excede_precio(self):
        pedido, detalle = self._crear_pedido_retirado()
        resp = auth_client(self.gerente).post(
            f"/api/pedidos/{pedido.id}/devolver/",
            self._devolver_payload(detalle, monto=detalle.precio_final + 1000),
            format="json",
        )
        self.assertEqual(resp.status_code, 400)

    def test_devolver_pedido_doble(self):
        pedido, detalle = self._crear_pedido_retirado()
        client = auth_client(self.gerente)
        resp = client.post(
            f"/api/pedidos/{pedido.id}/devolver/",
            self._devolver_payload(detalle),
            format="json",
        )
        self.assertEqual(resp.status_code, 201)
        resp = client.post(
            f"/api/pedidos/{pedido.id}/devolver/",
            self._devolver_payload(detalle),
            format="json",
        )
        self.assertEqual(resp.status_code, 400)

    def test_devolver_pedido_parcial_dos_veces(self):
        resp = auth_client(self.vendedor).post(
            "/api/pedidos/", self._item_multi(2), format="json"
        )
        pedido = Pedido.objects.get(id=resp.data["id"])
        auth_client(self.vendedor).post(
            f"/api/pedidos/{pedido.id}/cambiar-estado/",
            {"estado": "RE"},
            format="json",
        )
        detalles = list(PedidoDetalle.objects.filter(pedido_id=pedido.id).order_by("id"))
        self.assertEqual(len(detalles), 2)
        stock = StockProductoUbicacion.objects.get(
            producto=self.producto, ubicacion=self.ubicacion
        )
        self.assertEqual(stock.cantidad, 8)

        client = auth_client(self.gerente)

        resp = client.post(
            f"/api/pedidos/{pedido.id}/devolver/",
            self._devolver_payload(detalles[0]),
            format="json",
        )
        self.assertEqual(resp.status_code, 201, resp.data)

        pedido.refresh_from_db()
        self.assertEqual(pedido.estado, Pedido.Estado.RETIRADO)
        stock.refresh_from_db()
        self.assertEqual(stock.cantidad, 9)

        resp = client.get(f"/api/pedidos/{pedido.id}/")
        self.assertTrue(resp.data["devuelto_parcial"])
        self.assertEqual(resp.data["lineas_devueltas"], 1)
        self.assertEqual(resp.data["lineas_total"], 2)
        self.assertEqual(resp.data["monto_devuelto"], detalles[0].precio_final)
        detalle_data = next(
            d for d in resp.data["detalles"] if d["id"] == detalles[0].id
        )
        self.assertTrue(detalle_data["devuelto"])
        self.assertEqual(detalle_data["monto_devuelto"], detalles[0].precio_final)

        resp = client.post(
            f"/api/pedidos/{pedido.id}/devolver/",
            self._devolver_payload(detalles[1]),
            format="json",
        )
        self.assertEqual(resp.status_code, 201, resp.data)

        pedido.refresh_from_db()
        self.assertEqual(pedido.estado, Pedido.Estado.DEVUELTO)
        stock.refresh_from_db()
        self.assertEqual(stock.cantidad, 10)

        resp = client.get(f"/api/pedidos/{pedido.id}/")
        self.assertFalse(resp.data["devuelto_parcial"])
        self.assertEqual(resp.data["lineas_devueltas"], 2)
        self.assertEqual(
            resp.data["monto_devuelto"],
            detalles[0].precio_final + detalles[1].precio_final,
        )

    def test_devolver_pedido_parcial_pendiente(self):
        resp = auth_client(self.vendedor).post(
            "/api/pedidos/", self._item_multi(2), format="json"
        )
        pedido = Pedido.objects.get(id=resp.data["id"])
        detalle = PedidoDetalle.objects.filter(pedido_id=pedido.id).order_by("id").first()

        resp = auth_client(self.gerente).post(
            f"/api/pedidos/{pedido.id}/devolver/",
            self._devolver_payload(detalle),
            format="json",
        )
        self.assertEqual(resp.status_code, 201, resp.data)

        pedido.refresh_from_db()
        self.assertEqual(pedido.estado, Pedido.Estado.PENDIENTE_RETIRAR)

        resp = auth_client(self.gerente).get(f"/api/pedidos/{pedido.id}/")
        self.assertTrue(resp.data["devuelto_parcial"])
        self.assertEqual(resp.data["lineas_devueltas"], 1)

    def test_devolver_pedido_seleccion_vacia(self):
        resp = auth_client(self.vendedor).post(
            "/api/pedidos/", self._item(), format="json"
        )
        pedido_id = resp.data["id"]
        resp = auth_client(self.gerente).post(
            f"/api/pedidos/{pedido_id}/devolver/",
            {"motivo": "Sin líneas", "productos": []},
            format="json",
        )
        self.assertEqual(resp.status_code, 400)

    def test_devolver_pedido_reponer_requiere_ubicacion(self):
        pedido, detalle = self._crear_pedido_retirado()
        payload = self._devolver_payload(detalle)
        payload["productos"][0]["ubicacion_id"] = None
        resp = auth_client(self.gerente).post(
            f"/api/pedidos/{pedido.id}/devolver/",
            payload,
            format="json",
        )
        self.assertEqual(resp.status_code, 400)

    def test_devolver_pedido_vendedor_denegado(self):
        pedido, detalle = self._crear_pedido_retirado()
        resp = auth_client(self.vendedor).post(
            f"/api/pedidos/{pedido.id}/devolver/",
            self._devolver_payload(detalle),
            format="json",
        )
        self.assertEqual(resp.status_code, 403)

    def test_devolver_cotizacion_denegado(self):
        resp = auth_client(self.vendedor).post(
            "/api/pedidos/", self._item(es_cotizacion=True), format="json"
        )
        cotizacion_id = resp.data["id"]
        resp = auth_client(self.gerente).post(
            f"/api/pedidos/{cotizacion_id}/devolver/",
            {"motivo": "N/A", "productos": []},
            format="json",
        )
        self.assertEqual(resp.status_code, 400)

    def test_dashboard_resta_devolucion_pedido(self):
        pedido, detalle = self._crear_pedido_retirado()
        auth_client(self.gerente).post(
            f"/api/pedidos/{pedido.id}/devolver/",
            self._devolver_payload(detalle),
            format="json",
        )
        resp = auth_client(self.gerente).get("/api/dashboard/stats/")
        self.assertEqual(resp.data["ventas_dia"]["devoluciones"], detalle.precio_final)
        self.assertEqual(
            resp.data["ventas_dia"]["total"],
            pedido.venta.monto_total - detalle.precio_final,
        )


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


class CierreCajaTest(BaseTest):
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
            producto=cls.producto, ubicacion=cls.ubicacion, cantidad=100
        )

    def _crear_venta(self, pagos=None, documento=None, monto=None):
        monto = monto or self.producto.precio * 2
        payload = {
            "productos": [
                {
                    "producto_id": self.producto.producto_id,
                    "cantidad": 2,
                    "precio": self.producto.precio,
                }
            ],
            "total": monto,
            "monto_subtotal": monto,
        }
        if pagos is not None:
            payload["pagos"] = pagos
        if documento:
            payload["documento"] = documento
        resp = auth_client(self.vendedor).post("/api/ventas/", payload, format="json")
        self.assertEqual(resp.status_code, 201)
        return resp.data["id"]

    def _crear_pedido_venta(self, metodo_pago="EF", estado_documento="BO"):
        pedido = Pedido.objects.create(
            usuario=self.vendedor,
            nombre_cliente="Cliente X",
            telefono_cliente="99999999",
            monto_subtotal=15000,
            monto_total=15000,
            costo_envio=4500,
            metodo_pago=metodo_pago,
            estado=Pedido.Estado.PENDIENTE_RETIRAR,
            estado_documento=estado_documento,
        )
        venta = Venta.objects.create(
            usuario=self.vendedor,
            monto_total=15000,
            monto_subtotal=15000,
            estado=Venta.Estado.COMPLETADA,
            tipo_documento=Venta.TipoDocumento.PEDIDO,
        )
        pedido.venta = venta
        pedido.save(update_fields=["venta"])
        return venta

    def test_get_cierre_totales_y_breakdown(self):
        self._crear_venta(
            monto=18000,
            pagos=[
                {"metodo_pago": "EF", "monto": 10000},
                {"metodo_pago": "TJ", "monto": 5000},
                {"metodo_pago": "CH", "monto": 3000},
            ],
            documento="FA",
        )
        self._crear_pedido_venta(metodo_pago="EF", estado_documento="BO")

        resp = auth_client(self.gerente).get("/api/cierre-caja/")
        self.assertEqual(resp.status_code, 200)
        stats = resp.data
        self.assertEqual(stats["total_vendido"], 33000)
        self.assertEqual(stats["cantidad_ventas"], 2)
        self.assertEqual(stats["pagos"]["efectivo"], 25000)
        self.assertEqual(stats["pagos"]["tarjeta"], 5000)
        self.assertEqual(stats["pagos"]["cheque"], 3000)
        self.assertEqual(stats["pagos"]["transferencia"], 0)
        self.assertEqual(stats["documentos"]["factura"], 18000)
        self.assertEqual(stats["documentos"]["boleta"], 15000)
        self.assertFalse(stats["guardado"])

    def test_get_cierre_resta_devoluciones_y_anulaciones(self):
        self._crear_venta(monto=18000, pagos=[{"metodo_pago": "EF", "monto": 18000}])
        venta_anulada = Venta.objects.create(
            usuario=self.vendedor,
            monto_total=9000,
            monto_subtotal=9000,
            estado=Venta.Estado.COMPLETADA,
        )
        Anulacion.objects.create(venta=venta_anulada, usuario=self.vendedor, motivo="Test")
        venta_anulada.estado = Venta.Estado.CANCELADA
        venta_anulada.save()

        venta_devuelta = Venta.objects.create(
            usuario=self.vendedor,
            monto_total=12000,
            monto_subtotal=12000,
            estado=Venta.Estado.COMPLETADA,
        )
        Devolucion.objects.create(
            venta=venta_devuelta,
            usuario=self.vendedor,
            motivo="Test",
            monto_devuelto=3000,
        )

        resp = auth_client(self.gerente).get("/api/cierre-caja/")
        stats = resp.data
        self.assertEqual(stats["total_vendido"], 30000)
        self.assertEqual(stats["total_devoluciones"], 3000)
        self.assertEqual(stats["total_anulaciones"], 9000)
        self.assertEqual(stats["total_final"], 18000)

    def test_post_cierre_append_only(self):
        self._crear_venta(monto=18000, pagos=[{"metodo_pago": "TR", "monto": 18000}], documento="OT")
        resp = auth_client(self.gerente).post("/api/cierre-caja/", {}, format="json")
        self.assertEqual(resp.status_code, 201)
        self.assertTrue(resp.data["guardado"])
        self.assertEqual(CierreCaja.objects.count(), 1)

        resp2 = auth_client(self.gerente).post("/api/cierre-caja/", {}, format="json")
        self.assertEqual(resp2.status_code, 201)
        self.assertEqual(CierreCaja.objects.count(), 2)

        historial = auth_client(self.gerente).get("/api/cierre-caja/historial/")
        self.assertEqual(len(historial.data), 2)
        self.assertEqual(historial.data[0]["pagos"]["transferencia"], 18000)
        self.assertEqual(historial.data[0]["documentos"]["otros"], 18000)

    def test_cierre_solo_gerente_o_encargado(self):
        resp = auth_client(self.vendedor).get("/api/cierre-caja/")
        self.assertEqual(resp.status_code, 403)
        resp = auth_client(self.vendedor).post("/api/cierre-caja/", {}, format="json")
        self.assertEqual(resp.status_code, 403)

    def test_cierre_requiere_auth(self):
        resp = self.client.get("/api/cierre-caja/")
        self.assertEqual(resp.status_code, 401)

    def test_venta_detalle_muestra_pagos_y_documento(self):
        vid = self._crear_venta(
            monto=18000,
            pagos=[
                {"metodo_pago": "EF", "monto": 10000},
                {"metodo_pago": "TJ", "monto": 8000},
            ],
            documento="FA",
        )
        resp = auth_client(self.vendedor).get(f"/api/ventas/{vid}/")
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(resp.data["documento_display"], "Factura")
        pagos = resp.data["pagos"]
        self.assertEqual(len(pagos), 2)
        self.assertEqual(pagos[0]["metodo_pago"], "EF")
        self.assertEqual(pagos[1]["metodo_pago_display"], "Tarjeta")
        self.assertEqual(sum(p["monto"] for p in pagos), 18000)

    def test_venta_pedido_muestra_pago_y_documento_del_pedido(self):
        venta = self._crear_pedido_venta(metodo_pago="TJ", estado_documento="FA")
        resp = auth_client(self.vendedor).get(f"/api/ventas/{venta.id}/")
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(resp.data["documento_display"], "Facturado")
        pagos = resp.data["pagos"]
        self.assertEqual(len(pagos), 1)
        self.assertEqual(pagos[0]["metodo_pago_display"], "Tarjeta")
        self.assertEqual(pagos[0]["monto"], 15000)
