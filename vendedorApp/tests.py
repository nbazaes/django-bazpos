from datetime import date, datetime, timedelta
from decimal import Decimal

from django.db.models import Sum
from django.test import TestCase
from django.utils import timezone

from docker.test_utils import auth_client, create_business_groups, make_user
from gerenteApp.models import DetalleFactura, Factura, PrecioHistorico, Proveedor, StoreConfig
from vendedorApp.models import (
    Anulacion,
    AjusteStock,
    CierreCaja,
    DetalleDevolucion,
    DetalleVenta,
    Devolucion,
    ItemPedidoProveedor,
    Pedido,
    PedidoDetalle,
    PedidoProveedorDia,
    Producto,
    StockHistorico,
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

    def test_create_venta_rechaza_stock_negativo(self):
        producto = Producto.objects.create(
            nombre="Producto Negativo", codigo_producto="PNEG1", oem="OEM-NEG",
            descripcion="Desc", precio_costo=5000, stock_minimo=2,
            stock_maximo=50, margen_utilidad=Decimal("30.00"),
            proveedor=self.proveedor,
        )
        StockProductoUbicacion.objects.create(
            producto=producto, ubicacion=self.ubicacion, cantidad=-1
        )
        payload = {
            "productos": [
                {
                    "producto_id": producto.producto_id,
                    "cantidad": 1,
                    "precio": producto.precio,
                }
            ],
            "total": producto.precio,
            "monto_subtotal": producto.precio,
        }
        resp = auth_client(self.vendedor).post(
            "/api/ventas/", payload, format="json"
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

    def test_deducir_stock_mixto(self):
        u2 = Ubicacion.objects.create(nombre="Bodega Norte")
        StockProductoUbicacion.objects.create(
            producto=self.producto, ubicacion=u2, cantidad=5
        )
        venta_id = self._crear_venta()
        resp = auth_client(self.vendedor).post(
            f"/api/ventas/{venta_id}/deducir-stock/",
            {
                "deducciones": [
                    {
                        "producto_id": self.producto.producto_id,
                        "ubicacion_id": self.ubicacion.id,
                        "cantidad": 1,
                    },
                    {
                        "producto_id": self.producto.producto_id,
                        "ubicacion_id": u2.id,
                        "cantidad": 1,
                    },
                ]
            },
            format="json",
        )
        self.assertEqual(resp.status_code, 200)
        stock1 = StockProductoUbicacion.objects.get(
            producto=self.producto, ubicacion=self.ubicacion
        )
        stock2 = StockProductoUbicacion.objects.get(
            producto=self.producto, ubicacion=u2
        )
        self.assertEqual(stock1.cantidad, 9)
        self.assertEqual(stock2.cantidad, 4)

    def test_deducir_stock_over_deduction(self):
        venta_id = self._crear_venta()
        resp = auth_client(self.vendedor).post(
            f"/api/ventas/{venta_id}/deducir-stock/",
            {
                "deducciones": [
                    {
                        "producto_id": self.producto.producto_id,
                        "ubicacion_id": self.ubicacion.id,
                        "cantidad": 2,
                    },
                    {
                        "producto_id": self.producto.producto_id,
                        "ubicacion_id": self.ubicacion.id,
                        "cantidad": 1,
                    },
                ]
            },
            format="json",
        )
        self.assertEqual(resp.status_code, 400)

    def test_venta_creacion_descarta_stock(self):
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
        self.assertEqual(resp.status_code, 201)
        venta = Venta.objects.get(id=resp.data["id"])
        stock = StockProductoUbicacion.objects.get(
            producto=self.producto, ubicacion=self.ubicacion
        )
        self.assertEqual(stock.cantidad, 8)
        self.assertEqual(
            venta.deduccion_original,
            {str(self.producto.producto_id): {str(self.ubicacion.id): 2}},
        )

    def test_venta_creacion_descarta_stock_multi_ubicacion(self):
        u2 = Ubicacion.objects.create(nombre="Bodega Norte")
        StockProductoUbicacion.objects.create(
            producto=self.producto, ubicacion=u2, cantidad=5
        )
        venta_id = self._crear_venta()
        venta = Venta.objects.get(id=venta_id)
        stock1 = StockProductoUbicacion.objects.get(
            producto=self.producto, ubicacion=self.ubicacion
        )
        stock2 = StockProductoUbicacion.objects.get(
            producto=self.producto, ubicacion=u2
        )
        self.assertEqual(stock1.cantidad, 8)
        self.assertEqual(stock2.cantidad, 5)
        self.assertEqual(
            venta.deduccion_original,
            {str(self.producto.producto_id): {str(self.ubicacion.id): 2}},
        )
        detalle = DetalleVenta.objects.get(
            venta_id=venta_id, producto=self.producto
        )
        self.assertEqual(detalle.ubicacion_id, self.ubicacion.id)

    def test_venta_sin_deducir_stock_queda_descontada(self):
        venta_id = self._crear_venta()
        stock = StockProductoUbicacion.objects.get(
            producto=self.producto, ubicacion=self.ubicacion
        )
        self.assertEqual(stock.cantidad, 8)
        venta = Venta.objects.get(id=venta_id)
        self.assertIn(str(self.producto.producto_id), venta.deduccion_original)

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
        stocks = {u["id"]: u["stock"] for u in resp.data[0]["ubicaciones"]}
        self.assertEqual(stocks[self.ubicacion.id], 10)
        self.assertEqual(stocks[u2.id], 4)

    def test_ubicaciones_para_deducir_incluye_stock_sin_ubicacion(self):
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
        self.assertEqual(len(resp.data[0]["ubicaciones"]), 3)
        stocks = {u["id"]: u["stock"] for u in resp.data[0]["ubicaciones"]}
        self.assertEqual(stocks[self.ubicacion.id], 10)
        self.assertEqual(stocks[u2.id], 4)
        self.assertEqual(stocks[None], 3)
        self.assertEqual(resp.data[0]["ubicaciones"][0]["id"], self.ubicacion.id)

    def test_deducir_stock_reenasigna_desde_sin_ubicacion(self):
        StockProductoUbicacion.objects.create(
            producto=self.producto, ubicacion=None, cantidad=50
        )
        u2 = Ubicacion.objects.create(nombre="Bodega Norte")
        StockProductoUbicacion.objects.create(
            producto=self.producto, ubicacion=u2, cantidad=5
        )
        venta_id = self._crear_venta()
        venta = Venta.objects.get(id=venta_id)
        stock_none = StockProductoUbicacion.objects.get(
            producto=self.producto, ubicacion=None
        )
        self.assertEqual(stock_none.cantidad, 48)
        self.assertEqual(
            venta.deduccion_original,
            {str(self.producto.producto_id): {"None": 2}},
        )
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
        stock_none.refresh_from_db()
        stock_u = StockProductoUbicacion.objects.get(
            producto=self.producto, ubicacion=self.ubicacion
        )
        self.assertEqual(stock_none.cantidad, 50)
        self.assertEqual(stock_u.cantidad, 8)
        venta.refresh_from_db()
        self.assertEqual(
            venta.deduccion_original,
            {str(self.producto.producto_id): {str(self.ubicacion.id): 2}},
        )

    def test_deducir_stock_sin_ubicacion_explicita(self):
        StockProductoUbicacion.objects.create(
            producto=self.producto, ubicacion=None, cantidad=50
        )
        venta_id = self._crear_venta()
        resp = auth_client(self.vendedor).post(
            f"/api/ventas/{venta_id}/deducir-stock/",
            {
                "deducciones": [
                    {
                        "producto_id": self.producto.producto_id,
                        "ubicacion_id": None,
                        "cantidad": 2,
                    }
                ]
            },
            format="json",
        )
        self.assertEqual(resp.status_code, 200)
        stock_none = StockProductoUbicacion.objects.get(
            producto=self.producto, ubicacion=None
        )
        self.assertEqual(stock_none.cantidad, 48)

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
                    "codigo_proveedor": self.producto.codigo_producto,
                    "proveedor_id": self.proveedor.proveedor_id,
                    "oem": self.producto.oem,
                    "nombre": self.producto.nombre,
                    "precio_costo": 10000,
                    "porcentaje_utilidad": "30.00",
                    "sumar_envio": True,
                }
            ],
        }

    def _item_multi(self, n=2):
        payload = self._item()
        item = payload["items"][0]
        payload["items"] = [dict(item) for _ in range(n)]
        return payload

    def _item_producto(self, producto, codigo_proveedor=None, oem=None):
        return {
            "nombre_cliente": "Cliente Uno",
            "telefono_cliente": "912345678",
            "metodo_pago": "EF",
            "items": [
                {
                    "producto_id": producto.producto_id,
                    "codigo_proveedor": codigo_proveedor or producto.codigo_producto,
                    "proveedor_id": self.proveedor.proveedor_id,
                    "oem": oem or producto.oem,
                    "nombre": producto.nombre,
                    "precio_costo": 10000,
                    "porcentaje_utilidad": "30.00",
                    "sumar_envio": True,
                }
            ],
        }

    def _item_custom(self):
        return {
            "nombre_cliente": "Cliente Custom",
            "telefono_cliente": "912345678",
            "metodo_pago": "EF",
            "items": [
                {
                    "producto_id": None,
                    "codigo_proveedor": "CUSTOM-XYZ",
                    "proveedor_id": self.proveedor.proveedor_id,
                    "oem": "CUSTOM-OEM",
                    "nombre": "Repuesto a pedido",
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

    def test_crear_pedido_acepta_todos_los_medios_de_pago_y_documentos(self):
        for metodo_pago in ["EF", "TJ", "TR", "CH"]:
            payload = self._item()
            payload["metodo_pago"] = metodo_pago
            resp = auth_client(self.vendedor).post(
                "/api/pedidos/", payload, format="json"
            )
            self.assertEqual(resp.status_code, 201, f"metodo_pago={metodo_pago}")
            pedido = Pedido.objects.get(id=resp.data["id"])
            self.assertEqual(pedido.metodo_pago, metodo_pago)

        payload = self._item()
        payload["estado_documento"] = "OT"
        resp = auth_client(self.vendedor).post("/api/pedidos/", payload, format="json")
        self.assertEqual(resp.status_code, 201)
        pedido = Pedido.objects.get(id=resp.data["id"])
        self.assertEqual(pedido.estado_documento, Pedido.EstadoDocumento.OTROS)

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

    def test_marcar_retiro_sin_stock_queda_negativo(self):
        producto = Producto.objects.create(
            nombre="Sin Stock", codigo_producto="PSS001", oem="OEM-SS",
            descripcion="Desc", precio_costo=10000, stock_minimo=2,
            stock_maximo=50, margen_utilidad=Decimal("30.00"),
            proveedor=self.proveedor,
        )
        resp = auth_client(self.vendedor).post(
            "/api/pedidos/", self._item_producto(producto), format="json"
        )
        self.assertEqual(resp.status_code, 201)
        pedido_id = resp.data["id"]
        resp = auth_client(self.vendedor).post(
            f"/api/pedidos/{pedido_id}/marcar-retiro/",
            {"persona_retiro": "Maria Lopez"},
            format="json",
        )
        self.assertEqual(resp.status_code, 200)
        pedido = Pedido.objects.get(id=pedido_id)
        self.assertTrue(pedido.stock_descontado)
        total = sum(
            s.cantidad
            for s in StockProductoUbicacion.objects.filter(producto=producto)
        )
        self.assertEqual(total, -1)

    def test_crear_pedido_resuelve_producto_por_codigo(self):
        a = Producto.objects.create(
            nombre="Copiado", codigo_producto="9816338580", oem="OEM-A",
            descripcion="Desc", precio_costo=10000, stock_minimo=2,
            stock_maximo=50, margen_utilidad=Decimal("30.00"),
            proveedor=self.proveedor,
        )
        b = Producto.objects.create(
            nombre="Real", codigo_producto="1806A-05", oem="OEM-B",
            descripcion="Desc", precio_costo=10000, stock_minimo=2,
            stock_maximo=50, margen_utilidad=Decimal("30.00"),
            proveedor=self.proveedor,
        )
        resp = auth_client(self.vendedor).post(
            "/api/pedidos/",
            self._item_producto(a, codigo_proveedor="1806A-05"),
            format="json",
        )
        self.assertEqual(resp.status_code, 201)
        detalle = PedidoDetalle.objects.get(pedido_id=resp.data["id"])
        self.assertEqual(detalle.producto_id, b.producto_id)
        dia = PedidoProveedorDia.objects.filter(fecha=date.today()).first()
        self.assertTrue(
            ItemPedidoProveedor.objects.filter(dia=dia, producto=b).exists()
        )
        self.assertFalse(
            ItemPedidoProveedor.objects.filter(dia=dia, producto=a).exists()
        )

    def test_retiro_fk_incoherente_descuenta_producto_correcto(self):
        a = Producto.objects.create(
            nombre="Copiado", codigo_producto="9816338580", oem="OEM-A",
            descripcion="Desc", precio_costo=10000, stock_minimo=2,
            stock_maximo=50, margen_utilidad=Decimal("30.00"),
            proveedor=self.proveedor,
        )
        b = Producto.objects.create(
            nombre="Real", codigo_producto="1806A-05", oem="OEM-B",
            descripcion="Desc", precio_costo=10000, stock_minimo=2,
            stock_maximo=50, margen_utilidad=Decimal("30.00"),
            proveedor=self.proveedor,
        )
        StockProductoUbicacion.objects.create(
            producto=a, ubicacion=self.ubicacion, cantidad=5
        )
        StockProductoUbicacion.objects.create(
            producto=b, ubicacion=self.ubicacion, cantidad=5
        )
        venta = Venta.objects.create(
            usuario=self.vendedor, monto_total=10000, monto_subtotal=10000,
            estado=Venta.Estado.COMPLETADA, tipo_documento=Venta.TipoDocumento.PEDIDO,
        )
        pedido = Pedido.objects.create(
            usuario=self.vendedor, nombre_cliente="Cliente X",
            telefono_cliente="1", monto_subtotal=10000, monto_total=10000,
            estado=Pedido.Estado.PENDIENTE_RETIRAR, venta=venta,
        )
        PedidoDetalle.objects.create(
            pedido=pedido, producto=a, codigo_proveedor="1806A-05",
            proveedor=self.proveedor, oem="OEM-B", nombre="Real",
            precio_costo=10000, porcentaje_utilidad=Decimal("30.00"),
            precio_final=20000,
        )
        resp = auth_client(self.vendedor).post(
            f"/api/pedidos/{pedido.id}/marcar-retiro/",
            {"persona_retiro": "Maria"},
            format="json",
        )
        self.assertEqual(resp.status_code, 200)
        detalle = PedidoDetalle.objects.get(pedido_id=pedido.id)
        self.assertEqual(detalle.producto_id, b.producto_id)
        self.assertEqual(
            StockProductoUbicacion.objects.get(
                producto=a, ubicacion=self.ubicacion
            ).cantidad,
            5,
        )
        self.assertEqual(
            StockProductoUbicacion.objects.get(
                producto=b, ubicacion=self.ubicacion
            ).cantidad,
            4,
        )

    def test_retiro_item_custom_no_crea_stock(self):
        resp = auth_client(self.vendedor).post(
            "/api/pedidos/", self._item_custom(), format="json"
        )
        self.assertEqual(resp.status_code, 201)
        pedido_id = resp.data["id"]
        stock_before = StockProductoUbicacion.objects.count()
        resp = auth_client(self.vendedor).post(
            f"/api/pedidos/{pedido_id}/marcar-retiro/",
            {"persona_retiro": "Maria"},
            format="json",
        )
        self.assertEqual(resp.status_code, 200)
        pedido = Pedido.objects.get(id=pedido_id)
        self.assertTrue(pedido.stock_descontado)
        self.assertEqual(StockProductoUbicacion.objects.count(), stock_before)

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
        self.assertEqual(stats["pagos"]["EF"], 25000)
        self.assertEqual(stats["pagos"]["TJ"], 5000)
        self.assertEqual(stats["pagos"]["CH"], 3000)
        self.assertEqual(stats["pagos"]["TR"], 0)
        self.assertEqual(stats["documentos"]["FA"], 18000)
        self.assertEqual(stats["documentos"]["BO"], 15000)
        self.assertFalse(stats["guardado"])

    def test_get_cierre_cuenta_transferencia_cheque_y_otros_de_pedidos(self):
        self._crear_pedido_venta(metodo_pago="TR", estado_documento="OT")
        self._crear_pedido_venta(metodo_pago="CH", estado_documento="OT")

        resp = auth_client(self.gerente).get("/api/cierre-caja/")
        self.assertEqual(resp.status_code, 200)
        stats = resp.data
        self.assertEqual(stats["pagos"]["TR"], 15000)
        self.assertEqual(stats["pagos"]["CH"], 15000)
        self.assertEqual(stats["documentos"]["OT"], 30000)

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
        self.assertEqual(historial.data[0]["pagos"]["TR"], 18000)
        self.assertEqual(historial.data[0]["documentos"]["OT"], 18000)

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

    def _get_detalle(self, fecha, tipo, clave=""):
        url = "/api/cierre-caja/detalle/"
        params = [f"fecha={fecha}"]
        if tipo:
            params.append(f"tipo={tipo}")
        if clave:
            params.append(f"clave={clave}")
        return auth_client(self.gerente).get(url + "?" + "&".join(params))

    def test_detalle_pago_efectivo_lista_ventas_y_pedidos(self):
        fecha = timezone.localtime().date().isoformat()
        self._crear_venta(
            monto=18000,
            pagos=[
                {"metodo_pago": "EF", "monto": 10000},
                {"metodo_pago": "TJ", "monto": 5000},
                {"metodo_pago": "CH", "monto": 3000},
            ],
            documento="FA",
        )
        self._crear_venta(monto=9000, pagos=[{"metodo_pago": "EF", "monto": 9000}], documento="BO")
        self._crear_pedido_venta(metodo_pago="EF", estado_documento="BO")

        resp = self._get_detalle(fecha, "pago", "EF")
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(len(resp.data), 3)
        montos = {r["monto"] for r in resp.data}
        self.assertEqual(montos, {10000, 9000, 15000})
        self.assertIn("pedido", {r["tipo"] for r in resp.data})

    def test_detalle_pago_sin_clasificar(self):
        fecha = timezone.localtime().date().isoformat()
        self._crear_venta(monto=12000, pagos=[{"metodo_pago": "TJ", "monto": 12000}])
        Venta.objects.create(
            usuario=self.vendedor,
            monto_total=6000,
            monto_subtotal=6000,
            estado=Venta.Estado.COMPLETADA,
        )

        resp = self._get_detalle(fecha, "pago", "SIN")
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(len(resp.data), 1)
        self.assertEqual(resp.data[0]["monto"], 6000)

    def test_detalle_documento_boleta(self):
        fecha = timezone.localtime().date().isoformat()
        self._crear_venta(monto=18000, pagos=[{"metodo_pago": "EF", "monto": 18000}], documento="FA")
        self._crear_venta(monto=9000, pagos=[{"metodo_pago": "EF", "monto": 9000}], documento="BO")
        self._crear_pedido_venta(metodo_pago="EF", estado_documento="BO")

        resp = self._get_detalle(fecha, "documento", "BO")
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(len(resp.data), 2)
        self.assertEqual(sum(r["monto"] for r in resp.data), 24000)

    def test_detalle_documento_sin_clasificar(self):
        fecha = timezone.localtime().date().isoformat()
        self._crear_venta(monto=12000, pagos=[{"metodo_pago": "TJ", "monto": 12000}], documento="FA")
        Venta.objects.create(
            usuario=self.vendedor,
            monto_total=7000,
            monto_subtotal=7000,
            estado=Venta.Estado.COMPLETADA,
        )
        self._crear_pedido_venta(metodo_pago="EF", estado_documento="SB")

        resp = self._get_detalle(fecha, "documento", "SIN")
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(len(resp.data), 2)
        self.assertEqual(sum(r["monto"] for r in resp.data), 22000)

    def test_detalle_devoluciones_y_anulaciones(self):
        fecha = timezone.localtime().date().isoformat()
        self._crear_venta(monto=18000, pagos=[{"metodo_pago": "EF", "monto": 18000}])
        venta_anulada = Venta.objects.create(
            usuario=self.vendedor,
            monto_total=9000,
            monto_subtotal=9000,
            estado=Venta.Estado.COMPLETADA,
        )
        Anulacion.objects.create(venta=venta_anulada, usuario=self.vendedor, motivo="Motivo anulación")
        venta_devuelta = Venta.objects.create(
            usuario=self.vendedor,
            monto_total=12000,
            monto_subtotal=12000,
            estado=Venta.Estado.COMPLETADA,
            cliente_nombre="Cliente D",
        )
        Devolucion.objects.create(
            venta=venta_devuelta, usuario=self.vendedor, motivo="Motivo devolución", monto_devuelto=3000
        )

        resp = self._get_detalle(fecha, "devolucion")
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(len(resp.data), 1)
        self.assertEqual(resp.data[0]["monto"], 3000)
        self.assertEqual(resp.data[0]["cliente"], "Cliente D")
        self.assertEqual(resp.data[0]["motivo"], "Motivo devolución")

        resp = self._get_detalle(fecha, "anulacion")
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(len(resp.data), 1)
        self.assertEqual(resp.data[0]["monto"], 9000)
        self.assertEqual(resp.data[0]["motivo"], "Motivo anulación")

    def test_detalle_cierre_validaciones_y_permisos(self):
        resp = self._get_detalle("2026-01-01", "pago", "ZZ")
        self.assertEqual(resp.status_code, 400)
        resp = self._get_detalle("2026-01-01", "foo")
        self.assertEqual(resp.status_code, 400)
        resp = auth_client(self.vendedor).get("/api/cierre-caja/detalle/?fecha=2026-01-01&tipo=pago&clave=EF")
        self.assertEqual(resp.status_code, 403)
        resp = self.client.get("/api/cierre-caja/detalle/?fecha=2026-01-01&tipo=pago&clave=EF")
        self.assertEqual(resp.status_code, 401)


class ReportesPersonalizadosApiTest(BaseTest):
    @classmethod
    def setUpTestData(cls):
        super().setUpTestData()
        cls.encargado = make_user("Encargado")
        cls.ubicacion2 = Ubicacion.objects.create(nombre="Bodega Sur")
        cls.producto = Producto.objects.create(
            nombre="Filtro Aire",
            codigo_producto="FA-001",
            oem="OEM-001",
            descripcion="Desc",
            precio_costo=5000,
            stock_minimo=1,
            stock_maximo=20,
            margen_utilidad=Decimal("30.00"),
            proveedor=cls.proveedor,
        )
        cls.stock_ubic1 = StockProductoUbicacion.objects.create(
            producto=cls.producto, ubicacion=cls.ubicacion, cantidad=4
        )
        cls.stock_ubic2 = StockProductoUbicacion.objects.create(
            producto=cls.producto, ubicacion=cls.ubicacion2, cantidad=6
        )

        factura_vieja = Factura.objects.create(
            numero_factura=100, proveedor=cls.proveedor, fecha=date(2026, 1, 10)
        )
        DetalleFactura.objects.create(
            factura=factura_vieja, producto=cls.producto, cantidad=10, costo_compra=4000
        )
        factura_reciente = Factura.objects.create(
            numero_factura=200, proveedor=cls.proveedor, fecha=date(2026, 3, 15)
        )
        DetalleFactura.objects.create(
            factura=factura_reciente, producto=cls.producto, cantidad=8, costo_compra=5000
        )

    def _venta(self, fecha, subtotal=20000):
        venta = Venta.objects.create(
            usuario=self.vendedor,
            fecha_venta=fecha,
            monto_total=subtotal,
            monto_subtotal=subtotal,
            estado=Venta.Estado.COMPLETADA,
            tipo_documento=Venta.TipoDocumento.VENTA,
            documento=Venta.Documento.BOLETA,
        )
        DetalleVenta.objects.create(
            venta=venta,
            producto=self.producto,
            ubicacion=self.ubicacion,
            cantidad=2,
            precio_unitario=subtotal // 2,
            subtotal=subtotal,
        )
        return venta

    def test_schema_requiere_rol_gestion(self):
        self.assertEqual(
            auth_client(self.vendedor).get("/api/reportes/custom/schema/").status_code, 403
        )
        self.assertEqual(
            auth_client(self.bodeguero).get("/api/reportes/custom/schema/").status_code, 403
        )

    def test_schema_para_gerente(self):
        resp = auth_client(self.gerente).get("/api/reportes/custom/schema/")
        self.assertEqual(resp.status_code, 200)
        datasets = {d["key"] for d in resp.data["datasets"]}
        self.assertIn("productos", datasets)
        self.assertIn("ventas", datasets)

    def test_query_acceso_encargado_y_gerente(self):
        self.assertEqual(
            auth_client(self.encargado).get("/api/reportes/custom/query/?dataset=productos").status_code,
            200,
        )
        self.assertEqual(
            auth_client(self.vendedor).get("/api/reportes/custom/query/?dataset=productos").status_code,
            403,
        )

    def test_productos_query_stock_por_ubicacion_y_ultima_factura(self):
        fields = (
            "codigo_producto,stock_actual,"
            f"stock_ubic_{self.ubicacion.id},stock_ubic_{self.ubicacion2.id},"
            "ultima_factura_fecha,ultima_factura_numero"
        )
        resp = auth_client(self.gerente).get(
            f"/api/reportes/custom/query/?dataset=productos&fields={fields}"
        )
        self.assertEqual(resp.status_code, 200)
        data = resp.data
        self.assertEqual(data["total"], 1)
        fila = data["rows"][0]
        self.assertEqual(fila["stock_actual"], 10)
        self.assertEqual(fila[f"stock_ubic_{self.ubicacion.id}"], 4)
        self.assertEqual(fila[f"stock_ubic_{self.ubicacion2.id}"], 6)
        self.assertEqual(fila["ultima_factura_numero"], 200)
        self.assertEqual(str(fila["ultima_factura_fecha"]), "2026-03-15")

    def test_productos_filtro_ubicaciones_no_duplica_stock(self):
        resp = auth_client(self.gerente).get(
            f"/api/reportes/custom/query/"
            f"?dataset=productos&ubicaciones={self.ubicacion2.id}&fields=codigo_producto,stock_actual"
        )
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(resp.data["total"], 1)
        self.assertEqual(resp.data["rows"][0]["stock_actual"], 10)

    def test_productos_filtro_ubicaciones_sin_coincidencia(self):
        vacia = Ubicacion.objects.create(nombre="Sin productos")
        resp = auth_client(self.gerente).get(
            f"/api/reportes/custom/query/?dataset=productos&ubicaciones={vacia.id}&fields=codigo_producto"
        )
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(resp.data["total"], 0)

    def test_ventas_query_rango_fechas(self):
        self._venta(datetime(2026, 5, 10, 12, 0), subtotal=20000)
        self._venta(datetime(2026, 6, 20, 12, 0), subtotal=30000)
        fields = "fecha_venta,vendedor,producto_nombre,cantidad,subtotal"
        resp = auth_client(self.gerente).get(
            f"/api/reportes/custom/query/?dataset=ventas&fields={fields}"
            "&fecha_desde=2026-06-01&fecha_hasta=2026-06-30"
        )
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(resp.data["total"], 1)
        fila = resp.data["rows"][0]
        self.assertEqual(fila["subtotal"], 30000)
        self.assertEqual(fila["vendedor"], "Ana Perez")

    def test_ventas_query_excluye_cotizaciones(self):
        self._venta(datetime(2026, 5, 10, 12, 0))
        cotizacion = Venta.objects.create(
            usuario=self.vendedor,
            fecha_venta=datetime(2026, 5, 11, 12, 0),
            monto_total=99000,
            estado=Venta.Estado.COMPLETADA,
            tipo_documento=Venta.TipoDocumento.COTIZACION,
        )
        DetalleVenta.objects.create(
            venta=cotizacion,
            producto=self.producto,
            cantidad=1,
            precio_unitario=99000,
            subtotal=99000,
        )
        resp = auth_client(self.gerente).get(
            "/api/reportes/custom/query/?dataset=ventas&fields=subtotal"
        )
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(resp.data["total"], 1)
        self.assertEqual(resp.data["rows"][0]["subtotal"], 20000)

    def test_export_csv_productos(self):
        resp = auth_client(self.gerente).get(
            "/api/reportes/custom/export/?dataset=productos&fields=codigo_producto,nombre,precio_costo"
        )
        self.assertEqual(resp.status_code, 200)
        self.assertIn("text/csv", resp["Content-Type"])
        self.assertIn("attachment", resp["Content-Disposition"])
        body = resp.content.decode("utf-8-sig")
        lines = [line for line in body.strip().splitlines() if line]
        self.assertEqual(lines[0], "Código;Nombre;Precio costo")
        self.assertIn("FA-001", lines[1])

    def test_export_denegado_vendedor(self):
        resp = auth_client(self.vendedor).get("/api/reportes/custom/export/?dataset=productos")
        self.assertEqual(resp.status_code, 403)

    def test_dataset_invalido(self):
        resp = auth_client(self.gerente).get("/api/reportes/custom/query/?dataset=nope")
        self.assertEqual(resp.status_code, 400)

    def test_fecha_invalida(self):
        resp = auth_client(self.gerente).get(
            "/api/reportes/custom/query/?dataset=ventas&fields=subtotal&fecha_desde=ayer"
        )
        self.assertEqual(resp.status_code, 400)

    def test_productos_stock_en_fecha(self):
        hace5 = timezone.now() - timedelta(days=5)
        hace2 = timezone.now() - timedelta(days=2)
        StockHistorico.objects.create(
            stock=self.stock_ubic1, cantidad=4, fecha=hace5
        )
        StockHistorico.objects.create(
            stock=self.stock_ubic2, cantidad=6, fecha=hace5
        )
        StockHistorico.objects.create(
            stock=self.stock_ubic1, cantidad=9, fecha=hace2
        )

        fecha = (timezone.now() - timedelta(days=3)).date()
        fields = f"stock_actual,stock_ubic_{self.ubicacion.id},stock_ubic_{self.ubicacion2.id}"
        resp = auth_client(self.gerente).get(
            f"/api/reportes/custom/query/?dataset=productos&stock_fecha={fecha.isoformat()}&fields={fields}"
        )
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(resp.data["total"], 1)
        fila = resp.data["rows"][0]
        self.assertEqual(fila["stock_actual"], 10)
        self.assertEqual(fila[f"stock_ubic_{self.ubicacion.id}"], 4)
        self.assertEqual(fila[f"stock_ubic_{self.ubicacion2.id}"], 6)

    def test_productos_stock_actual_sin_fecha(self):
        fields = f"stock_actual,stock_ubic_{self.ubicacion.id}"
        resp = auth_client(self.gerente).get(
            f"/api/reportes/custom/query/?dataset=productos&fields={fields}"
        )
        self.assertEqual(resp.status_code, 200)
        fila = resp.data["rows"][0]
        self.assertEqual(fila["stock_actual"], 10)
        self.assertEqual(fila[f"stock_ubic_{self.ubicacion.id}"], 4)

    def test_query_solo_columna_agregada(self):
        resp = auth_client(self.gerente).get(
            "/api/reportes/custom/query/?dataset=productos&fields=stock_actual"
        )
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(resp.data["total"], 1)
        self.assertEqual(resp.data["rows"][0], {"stock_actual": 10})

    def test_productos_solo_con_stock(self):
        sin_stock = Producto.objects.create(
            nombre="Sin Stock",
            codigo_producto="SS-001",
            oem="OEM-SS",
            descripcion="Desc",
            precio_costo=1000,
            stock_minimo=1,
            stock_maximo=10,
            margen_utilidad=Decimal("30.00"),
            proveedor=self.proveedor,
        )
        StockProductoUbicacion.objects.create(
            producto=sin_stock, ubicacion=self.ubicacion, cantidad=0
        )
        resp = auth_client(self.gerente).get(
            "/api/reportes/custom/query/?dataset=productos&con_stock=true&fields=codigo_producto"
        )
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(resp.data["total"], 1)
        self.assertEqual(resp.data["rows"][0]["codigo_producto"], "FA-001")

    def test_productos_solo_sin_stock(self):
        sin_stock = Producto.objects.create(
            nombre="Sin Stock",
            codigo_producto="SS-002",
            oem="OEM-SS",
            descripcion="Desc",
            precio_costo=1000,
            stock_minimo=1,
            stock_maximo=10,
            margen_utilidad=Decimal("30.00"),
            proveedor=self.proveedor,
        )
        StockProductoUbicacion.objects.create(
            producto=sin_stock, ubicacion=self.ubicacion, cantidad=0
        )
        resp = auth_client(self.gerente).get(
            "/api/reportes/custom/query/?dataset=productos&sin_stock=true&fields=codigo_producto"
        )
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(resp.data["total"], 1)
        self.assertEqual(resp.data["rows"][0]["codigo_producto"], "SS-002")

    def test_productos_sin_stock_en_fecha(self):
        hace5 = timezone.now() - timedelta(days=5)
        StockHistorico.objects.create(
            stock=self.stock_ubic1, cantidad=0, fecha=hace5
        )
        fecha = (timezone.now() - timedelta(days=3)).date()
        resp = auth_client(self.gerente).get(
            f"/api/reportes/custom/query/?dataset=productos&stock_fecha={fecha.isoformat()}"
            "&sin_stock=true&fields=codigo_producto"
        )
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(resp.data["total"], 1)

    def test_stock_fecha_invalida(self):
        resp = auth_client(self.gerente).get(
            "/api/reportes/custom/query/?dataset=productos&stock_fecha=mal"
        )
        self.assertEqual(resp.status_code, 400)


class StockHistoricoSignalTest(BaseTest):
    @classmethod
    def setUpTestData(cls):
        super().setUpTestData()
        cls.producto = Producto.objects.create(
            nombre="Bujia",
            codigo_producto="BU-001",
            oem="OEM-BU",
            descripcion="Desc",
            precio_costo=3000,
            stock_minimo=1,
            stock_maximo=20,
            margen_utilidad=Decimal("30.00"),
            proveedor=cls.proveedor,
        )

    def test_registra_al_crear_y_modificar(self):
        stock = StockProductoUbicacion.objects.create(
            producto=self.producto, ubicacion=self.ubicacion, cantidad=3
        )
        self.assertEqual(StockHistorico.objects.filter(stock__producto=self.producto).count(), 1)
        self.assertEqual(
            StockHistorico.objects.filter(stock__producto=self.producto).first().cantidad, 3
        )

        stock.cantidad = 5
        stock.save()
        self.assertEqual(StockHistorico.objects.filter(stock__producto=self.producto).count(), 2)
        self.assertEqual(
            StockHistorico.objects.filter(stock__producto=self.producto).order_by("-id").first().cantidad,
            5,
        )

    def test_no_registra_si_cantidad_no_cambia(self):
        stock = StockProductoUbicacion.objects.create(
            producto=self.producto, ubicacion=self.ubicacion, cantidad=3
        )
        stock.save()
        stock.save()
        self.assertEqual(StockHistorico.objects.filter(stock__producto=self.producto).count(), 1)

    def test_factura_registra_historial(self):
        StockHistorico.objects.all().delete()
        client = auth_client(self.gerente)
        resp = client.post(
            "/api/facturas/",
            {
                "numero_factura": 9001,
                "proveedor_id": self.proveedor.proveedor_id,
                "fecha": "2026-08-11",
                "productos": [
                    {"producto_id": self.producto.producto_id, "precio": 3000, "cantidad": 4}
                ],
            },
            format="json",
        )
        self.assertEqual(resp.status_code, 201)
        historial = StockHistorico.objects.filter(stock__producto=self.producto)
        self.assertEqual(historial.count(), 1)
        self.assertEqual(historial.first().cantidad, 4)


class CatalogoPublicoApiTest(BaseTest):
    @classmethod
    def setUpTestData(cls):
        super().setUpTestData()
        cls.freno = Producto.objects.create(
            nombre="Pastilla de freno",
            codigo_producto="PF-001",
            oem="OEM-FRENO",
            oem_alternativo="ALT-FRENO",
            marca="Bosch",
            descripcion="Pastilla de freno delantero",
            precio_costo=5000,
            stock_minimo=2,
            stock_maximo=50,
            margen_utilidad=Decimal("30.00"),
            proveedor=cls.proveedor,
        )
        StockProductoUbicacion.objects.create(
            producto=cls.freno, ubicacion=cls.ubicacion, cantidad=4
        )
        cls.filtro = Producto.objects.create(
            nombre="Filtro de aceite",
            codigo_producto="FA-002",
            oem="OEM-FILTRO",
            marca="Mann",
            descripcion="Filtro de aceite motor",
            precio_costo=3000,
            stock_minimo=1,
            stock_maximo=40,
            margen_utilidad=Decimal("25.00"),
            proveedor=cls.proveedor,
        )

    def test_list_sin_auth(self):
        resp = self.client.get("/api/publico/catalogo/")
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(resp.data["count"], 2)
        nombres = {p["nombre"] for p in resp.data["results"]}
        self.assertEqual(nombres, {"Pastilla de freno", "Filtro de aceite"})

    def test_no_expone_datos_internos(self):
        resp = self.client.get("/api/publico/catalogo/")
        item = resp.data["results"][0]
        for campo in ["precio_costo", "margen_utilidad", "proveedor", "proveedor_nombre", "codigo_proveedor", "stock_minimo", "stock_maximo"]:
            self.assertNotIn(campo, item)
        self.assertIn("stock_actual", item)
        self.assertIn("precio", item)

    def test_detalle_sin_auth_con_ubicaciones(self):
        resp = self.client.get(f"/api/publico/catalogo/{self.freno.producto_id}/")
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(resp.data["producto_id"], self.freno.producto_id)
        self.assertEqual(resp.data["stock_actual"], 4)
        self.assertEqual(resp.data["ubicaciones_stock"], [
            {"ubicacion_id": self.ubicacion.id, "nombre": "Bodega Central", "cantidad": 4}
        ])

    def test_busqueda_texto(self):
        resp = self.client.get("/api/publico/catalogo/?texto=freno")
        self.assertEqual(resp.data["count"], 1)
        self.assertEqual(resp.data["results"][0]["nombre"], "Pastilla de freno")

    def test_filtro_marca(self):
        resp = self.client.get("/api/publico/catalogo/?marca=mann")
        self.assertEqual(resp.data["count"], 1)
        self.assertEqual(resp.data["results"][0]["marca"], "Mann")

    def test_filtro_oem(self):
        resp = self.client.get("/api/publico/catalogo/?oem=OEM-FRENO")
        self.assertEqual(resp.data["count"], 1)
        self.assertEqual(resp.data["results"][0]["codigo_producto"], "PF-001")

    def test_con_stock(self):
        resp = self.client.get("/api/publico/catalogo/?con_stock=true")
        self.assertEqual(resp.data["count"], 1)
        self.assertEqual(resp.data["results"][0]["stock_actual"], 4)

    def test_marcas(self):
        resp = self.client.get("/api/publico/catalogo/marcas/")
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(resp.data["marcas"], ["Bosch", "Mann"])

    def test_oems(self):
        resp = self.client.get("/api/publico/catalogo/oems/")
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(resp.data["oems"], ["OEM-FILTRO", "OEM-FRENO"])
