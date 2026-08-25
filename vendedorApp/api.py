import csv
import math
from datetime import date, datetime, timedelta
from decimal import Decimal

from django.contrib.auth.models import User
from django.db.models import Case, CharField, Count, F, Max, OuterRef, Prefetch, Q, Subquery, Sum, Value, When
from django.db.models.functions import Coalesce
from django.db import transaction
from django.conf import settings
from django.http import HttpResponse
from django.utils import timezone
from rest_framework import mixins, serializers, status, viewsets
from rest_framework.decorators import action
from rest_framework.exceptions import PermissionDenied
from rest_framework.permissions import DjangoModelPermissions, IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from vendedorApp.models import AjusteStock, Anulacion, CierreCaja, DetalleVenta, Devolucion, DetalleDevolucion, ItemPedidoProveedor, PagoVenta, Pedido, PedidoDetalle, PedidoProveedorDia, Producto, StockHistorico, StockProductoUbicacion, Ubicacion, Venta
from vendedorApp.serializers import (
    AgregarItemPedidoProveedorSerializer,
    AjustarStockInputSerializer,
    AjusteStockSerializer,
    AnulacionInputSerializer,
    AnulacionSerializer,
    CrearPedidoSerializer,
    DevolucionInputSerializer,
    DevolucionSerializer,
    DevolverPedidoInputSerializer,
    PedidoProveedorDiaSerializer,
    PedidoProveedorDiaHistorialSerializer,
    PedidoSerializer,
    PrecioHistoricoSerializer,
    ProductoSerializer,
    RegistrarVentaSerializer,
    VentaSerializer,
)
from vendedorApp.pagination import (
    DefaultPagination,
    DevolucionPagination,
    PedidoPagination,
    ProductoPagination,
    VentaPagination,
)
from vendedorApp.report_fields import (
    DYNAMIC_STOCK_FIELD_PREFIX,
    get_dataset,
    resolve_field_metas,
    schema_payload,
)
from gerenteApp.models import DetalleFactura, Proveedor, StoreConfig
from bazpos.permissions import (
    HasKnownRole,
    ROLE_BODEGUERO,
    ROLE_ENCARGADO,
    ROLE_GERENTE,
    ROLE_VENDEDOR,
    RoleActionPermission,
    has_any_role,
)


class DashboardStatsView(APIView):
    permission_classes = [IsAuthenticated, HasKnownRole]

    def get(self, request):
        hoy = timezone.localtime(timezone.now()).date()
        user = request.user
        es_gerente = (
            user.groups.filter(name__in=["Gerente", "Encargado"]).exists() or user.is_superuser
        )

        ventas_hoy = (
            Venta.objects.filter(fecha_venta__date=hoy, estado=Venta.Estado.COMPLETADA)
            .exclude(tipo_documento=Venta.TipoDocumento.PEDIDO, pedido__activo=False)
        )

        devoluciones_hoy = Devolucion.objects.filter(fecha_devolucion__date=hoy)
        anulaciones_hoy = Anulacion.objects.filter(fecha_anulacion__date=hoy)

        def _nombre(row):
            nombre = f"{row.get('usuario__first_name', '')} {row.get('usuario__last_name', '')}".strip()
            return nombre if nombre else row.get("usuario__username", "")

        if es_gerente:
            total_vendido = (
                ventas_hoy.aggregate(total=Sum("monto_total"))["total"] or 0
            ) + (
                anulaciones_hoy.aggregate(total=Sum("venta__monto_total"))["total"] or 0
            )
            monto_devuelto = devoluciones_hoy.aggregate(total=Sum("monto_devuelto"))["total"] or 0
            monto_anulaciones = anulaciones_hoy.aggregate(total=Sum("venta__monto_total"))["total"] or 0
            total_dia = total_vendido - monto_devuelto - monto_anulaciones
            cant_ventas_dia = ventas_hoy.count()

            ventas_por_vendedor = (
                ventas_hoy.values("usuario_id", "usuario__first_name", "usuario__last_name", "usuario__username")
                .annotate(total=Sum("monto_total"), cantidad=Count("id"))
            )
            devueltos_por_usuario = {
                r["usuario_id"]: r["total"]
                for r in devoluciones_hoy.values("usuario_id").annotate(total=Sum("monto_devuelto"))
            }
            anulados_por_usuario = {
                r["usuario_id"]: r["total"]
                for r in anulaciones_hoy.values("usuario_id").annotate(total=Sum("venta__monto_total"))
            }

            filas = {}
            for row in ventas_por_vendedor:
                uid = row["usuario_id"]
                filas[uid] = {
                    "vendedor": _nombre(row),
                    "total_vendido": row["total"],
                    "devoluciones": devueltos_por_usuario.get(uid, 0),
                    "anulaciones": anulados_por_usuario.get(uid, 0),
                    "cantidad": row["cantidad"],
                }
            for row in devoluciones_hoy.values(
                "usuario_id", "usuario__first_name", "usuario__last_name", "usuario__username"
            ).distinct():
                uid = row["usuario_id"]
                if uid not in filas:
                    filas[uid] = {
                        "vendedor": _nombre(row),
                        "total_vendido": 0,
                        "devoluciones": devueltos_por_usuario.get(uid, 0),
                        "anulaciones": 0,
                        "cantidad": 0,
                    }
            for row in anulaciones_hoy.values(
                "usuario_id", "usuario__first_name", "usuario__last_name", "usuario__username"
            ).distinct():
                uid = row["usuario_id"]
                if uid not in filas:
                    filas[uid] = {
                        "vendedor": _nombre(row),
                        "total_vendido": 0,
                        "devoluciones": 0,
                        "anulaciones": anulados_por_usuario.get(uid, 0),
                        "cantidad": 0,
                    }

            desglose = []
            for uid, fila in filas.items():
                fila["total"] = (
                    fila["total_vendido"] - fila["devoluciones"] - fila["anulaciones"]
                )
                desglose.append(fila)
            desglose.sort(key=lambda d: d["total"], reverse=True)
        else:
            ventas_propias = ventas_hoy.filter(usuario=user)
            anulaciones_propias = anulaciones_hoy.filter(usuario=user)
            devoluciones_propias = devoluciones_hoy.filter(usuario=user)
            total_vendido = (
                ventas_propias.aggregate(total=Sum("monto_total"))["total"] or 0
            ) + (
                anulaciones_propias.aggregate(total=Sum("venta__monto_total"))["total"] or 0
            )
            monto_devuelto = devoluciones_propias.aggregate(total=Sum("monto_devuelto"))["total"] or 0
            monto_anulaciones = anulaciones_propias.aggregate(total=Sum("venta__monto_total"))["total"] or 0
            total_dia = total_vendido - monto_devuelto - monto_anulaciones
            cant_ventas_dia = ventas_propias.count()
            nombre = f"{user.first_name} {user.last_name}".strip()
            desglose = [
                {
                    "vendedor": nombre if nombre else user.username,
                    "total": total_dia,
                    "total_vendido": total_vendido,
                    "devoluciones": monto_devuelto,
                    "anulaciones": monto_anulaciones,
                    "cantidad": cant_ventas_dia,
                }
            ]

        now = timezone.now()
        bajo_minimo_qs = (
            Producto.objects.filter(
                stock_actual__lt=F("stock_minimo"),
                stock_minimo__gt=0,
                ignorar_stock_permanente=False,
            )
            .filter(Q(recordar_stock_desde__isnull=True) | Q(recordar_stock_desde__lte=now))
            .values(
                "producto_id",
                "codigo_producto",
                "oem",
                "nombre",
                "proveedor__nombre",
                "stock_actual",
                "stock_minimo",
            )
            .order_by("stock_actual")[:10]
        )
        bajo_minimo = list(bajo_minimo_qs)

        # Find related products by OEM that have active stock.
        if bajo_minimo:
            oems = [p["oem"] for p in bajo_minimo]
            producto_ids = [p["producto_id"] for p in bajo_minimo]
            oem_productos = (
                Producto.objects.filter(oem__in=oems, stock_actual__gt=0)
                .exclude(producto_id__in=producto_ids)
                .prefetch_related("stocks_ubicacion__ubicacion")
            )
            oem_map = {}
            for p in oem_productos:
                oem_map.setdefault(p.oem, []).append(
                    {
                        "producto_id": p.producto_id,
                        "codigo_producto": p.codigo_producto,
                        "nombre": p.nombre,
                        "stock_actual": p.stock_actual,
                        "ubicaciones": [
                            {"nombre": s.ubicacion.nombre if s.ubicacion else "Sin ubicación", "cantidad": s.cantidad}
                            for s in p.stocks_ubicacion.all()
                            if s.cantidad > 0
                        ],
                    }
                )
            for p in bajo_minimo:
                p["proveedor_nombre"] = p.pop("proveedor__nombre")
                p["oem_productos"] = oem_map.get(p["oem"], [])

        productos_en_pedido = []
        hoy_fecha = date.today()
        try:
            dia_hoy = PedidoProveedorDia.objects.filter(fecha=hoy_fecha).first()
            if dia_hoy:
                productos_en_pedido = list(
                    ItemPedidoProveedor.objects.filter(dia=dia_hoy).values_list("producto_id", flat=True)
                )
        except Exception:
            pass

        return Response(
            {
                "es_gerente": es_gerente,
                "ventas_dia": {
                    "total": total_dia,
                    "total_vendido": total_vendido,
                    "devoluciones": monto_devuelto,
                    "anulaciones": monto_anulaciones,
                    "cantidad": cant_ventas_dia,
                    "desglose": desglose,
                },
                "stock": {
                    "total_productos": Producto.objects.count(),
                    "sin_stock": Producto.objects.filter(stock_actual=0).count(),
                    "bajo_minimo": bajo_minimo,
                    "productos_en_pedido": productos_en_pedido,
                },
            }
        )


class ReportesStatsView(APIView):
    permission_classes = [IsAuthenticated, HasKnownRole]

    def get(self, request):
        hoy = timezone.localtime(timezone.now()).date()
        mes = int(request.query_params.get("mes", hoy.month))
        anio = int(request.query_params.get("anio", hoy.year))

        ventas = (
            Venta.objects.filter(
                fecha_venta__date__month=mes,
                fecha_venta__date__year=anio,
                estado=Venta.Estado.COMPLETADA,
            )
            .exclude(tipo_documento=Venta.TipoDocumento.PEDIDO, pedido__activo=False)
        )

        total_ventas_mes = ventas.aggregate(total=Sum("monto_total"))["total"] or 0

        ventas_diarias_qs = (
            ventas.values("fecha_venta__date")
            .annotate(total=Sum("monto_total"), cantidad=Count("id"))
            .order_by("fecha_venta__date")
        )
        ventas_diarias = [
            {"fecha": str(row["fecha_venta__date"]), "total": row["total"], "cantidad": row["cantidad"]}
            for row in ventas_diarias_qs
        ]

        top_productos_qs = (
            DetalleVenta.objects.filter(
                venta__fecha_venta__date__month=mes,
                venta__fecha_venta__date__year=anio,
                venta__estado=Venta.Estado.COMPLETADA,
                producto__isnull=False,
            )
            .exclude(venta__tipo_documento=Venta.TipoDocumento.PEDIDO, venta__pedido__activo=False)
            .values("producto__producto_id", "producto__codigo_producto", "producto__nombre")
            .annotate(total_vendido=Sum("cantidad"), monto_total=Sum("subtotal"))
            .order_by("-total_vendido")[:10]
        )
        top_productos = list(top_productos_qs)

        ventas_por_vendedor_qs = (
            ventas.values("usuario__first_name", "usuario__last_name", "usuario__username")
            .annotate(total=Sum("monto_total"), cantidad=Count("id"))
            .order_by("-total")
        )
        ventas_por_vendedor = []
        for row in ventas_por_vendedor_qs:
            nombre = f"{row['usuario__first_name']} {row['usuario__last_name']}".strip()
            ventas_por_vendedor.append(
                {
                    "vendedor": nombre if nombre else row["usuario__username"],
                    "total": row["total"],
                    "cantidad": row["cantidad"],
                }
            )

        now = timezone.now()
        bajo_minimo_qs = (
            Producto.objects.filter(
                stock_actual__lt=F("stock_minimo"),
                stock_minimo__gt=0,
                ignorar_stock_permanente=False,
            )
            .filter(Q(recordar_stock_desde__isnull=True) | Q(recordar_stock_desde__lte=now))
            .values(
                "producto_id",
                "codigo_producto",
                "oem",
                "nombre",
                "proveedor__nombre",
                "stock_actual",
                "stock_minimo",
            )
            .order_by("stock_actual")[:10]
        )
        stock_critico = list(bajo_minimo_qs)
        for p in stock_critico:
            p["proveedor_nombre"] = p.pop("proveedor__nombre")

        return Response(
            {
                "periodo": {"mes": mes, "anio": anio},
                "total_ventas_mes": total_ventas_mes,
                "ventas_diarias": ventas_diarias,
                "top_productos_mes": top_productos,
                "ventas_por_vendedor_mes": ventas_por_vendedor,
                "stock_critico": stock_critico,
            }
        )


def calcular_cierre(fecha):
    ventas_hoy = (
        Venta.objects.filter(fecha_venta__date=fecha, estado=Venta.Estado.COMPLETADA)
        .exclude(tipo_documento=Venta.TipoDocumento.PEDIDO, pedido__activo=False)
    )

    devoluciones_hoy = Devolucion.objects.filter(fecha_devolucion__date=fecha)
    anulaciones_hoy = Anulacion.objects.filter(fecha_anulacion__date=fecha)

    total_vendido = ventas_hoy.aggregate(total=Sum("monto_total"))["total"] or 0
    total_devoluciones = devoluciones_hoy.aggregate(total=Sum("monto_devuelto"))["total"] or 0
    total_anulaciones = anulaciones_hoy.aggregate(total=Sum("venta__monto_total"))["total"] or 0
    total_final = total_vendido - total_devoluciones - total_anulaciones
    cantidad_ventas = ventas_hoy.count()

    # ── Desglose por medio de pago ──
    ventas_ve = ventas_hoy.exclude(tipo_documento=Venta.TipoDocumento.PEDIDO)
    ventas_pedido = ventas_hoy.filter(
        tipo_documento=Venta.TipoDocumento.PEDIDO, pedido__activo=True
    )

    pagos_ve = (
        PagoVenta.objects.filter(venta__in=ventas_ve)
        .values("metodo_pago")
        .annotate(total=Sum("monto"))
    )
    pagos_ve_map = {p["metodo_pago"]: p["total"] for p in pagos_ve}
    ve_ids_con_pagos = set(
        PagoVenta.objects.filter(venta__in=ventas_ve).values_list("venta_id", flat=True)
    )
    sin_clasificar_pago = (
        ventas_ve.exclude(pk__in=ve_ids_con_pagos).aggregate(total=Sum("monto_total"))["total"] or 0
    )

    pagos_pedido = (
        ventas_pedido.values("pedido__metodo_pago")
        .annotate(total=Sum("monto_total"))
    )
    pagos_pedido_map = {p["pedido__metodo_pago"]: p["total"] for p in pagos_pedido}

    efectivo = pagos_ve_map.get(Venta.MetodoPago.EFECTIVO, 0) + pagos_pedido_map.get("EF", 0)
    tarjeta = pagos_ve_map.get(Venta.MetodoPago.TARJETA, 0) + pagos_pedido_map.get("TJ", 0)
    transferencia = pagos_ve_map.get(Venta.MetodoPago.TRANSFERENCIA, 0)
    cheque = pagos_ve_map.get(Venta.MetodoPago.CHEQUE, 0)

    # ── Desglose por documento ──
    docs_ve = (
        ventas_ve.values("documento")
        .annotate(total=Sum("monto_total"))
    )
    docs_ve_map = {d["documento"]: d["total"] for d in docs_ve}
    docs_pedido = (
        ventas_pedido.values("pedido__estado_documento")
        .annotate(total=Sum("monto_total"))
    )
    docs_pedido_map = {d["pedido__estado_documento"]: d["total"] for d in docs_pedido}

    boleta = docs_ve_map.get(Venta.Documento.BOLETA, 0) + docs_pedido_map.get(Pedido.EstadoDocumento.BOLETEADO, 0)
    factura = docs_ve_map.get(Venta.Documento.FACTURA, 0) + docs_pedido_map.get(Pedido.EstadoDocumento.FACTURADO, 0)
    otros = docs_ve_map.get(Venta.Documento.OTROS, 0)
    doc_sin_clasificar = (
        docs_ve_map.get(None, 0)
        + docs_pedido_map.get(Pedido.EstadoDocumento.SIN_BOLETEAR, 0)
    )

    return {
        "fecha": str(fecha),
        "total_vendido": total_vendido,
        "total_devoluciones": total_devoluciones,
        "total_anulaciones": total_anulaciones,
        "total_final": total_final,
        "cantidad_ventas": cantidad_ventas,
        "pagos": {
            "efectivo": efectivo,
            "tarjeta": tarjeta,
            "transferencia": transferencia,
            "cheque": cheque,
            "sin_clasificar": sin_clasificar_pago,
        },
        "documentos": {
            "boleta": boleta,
            "factura": factura,
            "otros": otros,
            "sin_clasificar": doc_sin_clasificar,
        },
    }


class CierreCajaView(APIView):
    permission_classes = [IsAuthenticated, HasKnownRole]

    def _authorize(self, request):
        if not has_any_role(request.user, [ROLE_ENCARGADO, ROLE_GERENTE]):
            raise PermissionDenied("No tiene permisos para acceder al cierre de caja")

    def get(self, request):
        self._authorize(request)
        fecha_str = request.query_params.get("fecha", "").strip()
        if fecha_str:
            try:
                fecha = date.fromisoformat(fecha_str)
            except ValueError:
                return Response({"error": "Fecha inválida"}, status=400)
        else:
            fecha = timezone.localtime(timezone.now()).date()

        stats = calcular_cierre(fecha)
        cierre = CierreCaja.objects.filter(fecha=fecha).first()
        stats["guardado"] = cierre is not None
        if cierre:
            stats["cierre_guardado"] = {
                "id": cierre.id,
                "fecha": str(cierre.fecha),
                "usuario": cierre.usuario.username if cierre.usuario else None,
                "created_at": cierre.created_at,
            }
        return Response(stats)

    def post(self, request):
        self._authorize(request)
        fecha_str = request.data.get("fecha", "")
        if fecha_str:
            try:
                fecha = date.fromisoformat(fecha_str)
            except (ValueError, TypeError):
                return Response({"error": "Fecha inválida"}, status=400)
        else:
            fecha = timezone.localtime(timezone.now()).date()

        stats = calcular_cierre(fecha)
        cierre = CierreCaja.objects.create(
            fecha=fecha,
            usuario=request.user,
            total_vendido=stats["total_vendido"],
            total_devoluciones=stats["total_devoluciones"],
            total_anulaciones=stats["total_anulaciones"],
            total_final=stats["total_final"],
            cantidad_ventas=stats["cantidad_ventas"],
            efectivo=stats["pagos"]["efectivo"],
            tarjeta=stats["pagos"]["tarjeta"],
            transferencia=stats["pagos"]["transferencia"],
            cheque=stats["pagos"]["cheque"],
            pago_sin_clasificar=stats["pagos"]["sin_clasificar"],
            boleta=stats["documentos"]["boleta"],
            factura=stats["documentos"]["factura"],
            otros=stats["documentos"]["otros"],
            doc_sin_clasificar=stats["documentos"]["sin_clasificar"],
        )

        stats["guardado"] = True
        stats["cierre_guardado"] = {
            "id": cierre.id,
            "fecha": str(cierre.fecha),
            "usuario": cierre.usuario.username if cierre.usuario else None,
            "created_at": cierre.created_at,
        }
        return Response(stats, status=status.HTTP_201_CREATED)


class CierreCajaHistorialView(APIView):
    permission_classes = [IsAuthenticated, HasKnownRole]

    def get(self, request):
        if not has_any_role(request.user, [ROLE_ENCARGADO, ROLE_GERENTE]):
            return Response(
                {"error": "No tiene permisos para acceder al cierre de caja"},
                status=403,
            )

        cierres = CierreCaja.objects.select_related("usuario").all()
        data = [
            {
                "id": c.id,
                "fecha": str(c.fecha),
                "usuario": c.usuario.username if c.usuario else None,
                "created_at": c.created_at,
                "total_vendido": c.total_vendido,
                "total_devoluciones": c.total_devoluciones,
                "total_anulaciones": c.total_anulaciones,
                "total_final": c.total_final,
                "cantidad_ventas": c.cantidad_ventas,
                "pagos": {
                    "efectivo": c.efectivo,
                    "tarjeta": c.tarjeta,
                    "transferencia": c.transferencia,
                    "cheque": c.cheque,
                    "sin_clasificar": c.pago_sin_clasificar,
                },
                "documentos": {
                    "boleta": c.boleta,
                    "factura": c.factura,
                    "otros": c.otros,
                    "sin_clasificar": c.doc_sin_clasificar,
                },
            }
            for c in cierres
        ]
        return Response(data)


class ProductoViewSet(viewsets.ModelViewSet):
    serializer_class = ProductoSerializer
    permission_classes = [IsAuthenticated, DjangoModelPermissions, RoleActionPermission]
    queryset = Producto.objects.select_related("proveedor").prefetch_related("stocks_ubicacion__ubicacion").all().order_by("producto_id")
    pagination_class = ProductoPagination
    role_action_map = {
        "list": [ROLE_VENDEDOR, ROLE_ENCARGADO, ROLE_GERENTE, ROLE_BODEGUERO],
        "retrieve": [ROLE_VENDEDOR, ROLE_ENCARGADO, ROLE_GERENTE, ROLE_BODEGUERO],
        "create": [ROLE_ENCARGADO, ROLE_GERENTE],
        "update": [ROLE_ENCARGADO, ROLE_GERENTE],
        "partial_update": [ROLE_ENCARGADO, ROLE_GERENTE],
        "destroy": [ROLE_ENCARGADO, ROLE_GERENTE],
        "por_codigo": [ROLE_VENDEDOR, ROLE_ENCARGADO, ROLE_GERENTE, ROLE_BODEGUERO],
        "ajustar_stock": [ROLE_ENCARGADO, ROLE_GERENTE, ROLE_BODEGUERO],
        "historial_ajustes": [ROLE_ENCARGADO, ROLE_GERENTE, ROLE_BODEGUERO],
        "ignorar_stock": [ROLE_ENCARGADO, ROLE_GERENTE],
        "ultima_factura": [ROLE_VENDEDOR, ROLE_ENCARGADO, ROLE_GERENTE, ROLE_BODEGUERO],
        "historial_precios": [ROLE_ENCARGADO, ROLE_GERENTE],
    }

    def get_queryset(self):
        queryset = super().get_queryset()
        texto = self.request.query_params.get("texto", "").strip()
        proveedor = self.request.query_params.get("proveedor", "").strip()

        if self.action == 'retrieve':
            ultima_fecha = DetalleFactura.objects.filter(
                producto_id=OuterRef("producto_id")
            ).values("factura__fecha").order_by("-factura__fecha")[:1]
            queryset = queryset.annotate(ultima_fecha_llegada=Subquery(ultima_fecha))

        if texto:
            queryset = queryset.filter(Q(nombre__icontains=texto) | Q(oem__icontains=texto) | Q(codigo_producto__icontains=texto) | Q(oem_alternativo__icontains=texto) | Q(codigo_proveedor__icontains=texto))
        if proveedor:
            queryset = queryset.filter(proveedor_id=proveedor)
        if "sin_stock" in self.request.query_params:
            sin_stock = self.request.query_params["sin_stock"].lower() == "true"
            if not sin_stock:
                queryset = queryset.filter(stock_actual__gt=0)
        return queryset

    @action(detail=False, methods=["get"], url_path="por-codigo")
    def por_codigo(self, request):
        codigo = request.query_params.get("codigo", "").strip()
        if not codigo:
            return Response({"encontrado": False})
        try:
            producto = Producto.objects.get(codigo_producto=codigo)
        except Producto.DoesNotExist:
            return Response({"encontrado": False})
        serializer = self.get_serializer(producto)
        return Response({"encontrado": True, "producto": serializer.data})

    @action(detail=True, methods=["post"], url_path="ajustar-stock")
    def ajustar_stock(self, request, pk=None):
        producto = self.get_object()

        serializer = AjustarStockInputSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data

        motivo = data["motivo"]
        fecha = data.get("fecha", timezone.now().date())

        with transaction.atomic():
            for item in data["ajustes"]:
                ubicacion_id = item["ubicacion_id"]
                cantidad_nueva = item["cantidad"]

                if ubicacion_id is None:
                    try:
                        stock = StockProductoUbicacion.objects.select_for_update().get(
                            producto=producto,
                            ubicacion__isnull=True,
                        )
                    except StockProductoUbicacion.DoesNotExist:
                        continue

                    cantidad_anterior = stock.cantidad

                    if cantidad_anterior == cantidad_nueva:
                        continue

                    if cantidad_nueva == 0:
                        stock.delete()
                    else:
                        stock.cantidad = cantidad_nueva
                        stock.save()

                    continue

                try:
                    ubicacion = Ubicacion.objects.get(id=ubicacion_id)
                except Ubicacion.DoesNotExist:
                    return Response(
                        {"error": f"Ubicación {ubicacion_id} no encontrada"},
                        status=404,
                    )

                stock, _ = StockProductoUbicacion.objects.select_for_update().get_or_create(
                    producto=producto,
                    ubicacion=ubicacion,
                    defaults={"cantidad": 0},
                )

                cantidad_anterior = stock.cantidad

                if cantidad_anterior == cantidad_nueva:
                    continue

                stock.cantidad = cantidad_nueva
                stock.save()

                AjusteStock.objects.create(
                    producto=producto,
                    ubicacion=ubicacion,
                    usuario=request.user,
                    cantidad_anterior=cantidad_anterior,
                    cantidad_nueva=cantidad_nueva,
                    motivo=motivo,
                    fecha_ajuste=fecha,
                )

        producto_actualizado = self.get_serializer(producto)
        return Response(producto_actualizado.data)

    @action(detail=True, methods=["get"], url_path="historial-ajustes")
    def historial_ajustes(self, request, pk=None):
        producto = self.get_object()
        ajustes = producto.ajustes_stock.select_related("ubicacion", "usuario").all()
        serializer = AjusteStockSerializer(ajustes, many=True)
        return Response(serializer.data)

    @action(detail=True, methods=["post"], url_path="ignorar-stock")
    def ignorar_stock(self, request, pk=None):
        producto = self.get_object()
        accion = request.data.get("accion")

        if accion == "recordar_manana":
            producto.recordar_stock_desde = timezone.now().date() + timedelta(days=1)
            producto.save(update_fields=["recordar_stock_desde"])
        elif accion == "ignorar_permanente":
            producto.ignorar_stock_permanente = True
            producto.save(update_fields=["ignorar_stock_permanente"])
        else:
            return Response(
                {"error": "Acción inválida. Use 'recordar_manana' o 'ignorar_permanente'."},
                status=400,
            )

        return Response({"ok": True})

    @action(detail=True, methods=["get"], url_path="ultima-factura")
    def ultima_factura(self, request, pk=None):
        producto = self.get_object()
        last = DetalleFactura.objects.filter(
            producto=producto
        ).select_related("factura__proveedor").order_by("-factura__fecha").first()
        if not last:
            return Response(None)
        return Response({
            "factura_id": last.factura.id,
            "numero_factura": last.factura.numero_factura,
            "fecha": last.factura.fecha,
            "proveedor_nombre": last.factura.proveedor.nombre,
        })

    @action(detail=True, methods=["get"], url_path="historial-precios")
    def historial_precios(self, request, pk=None):
        producto = self.get_object()
        historial = producto.precios_historicos.select_related("factura").order_by("-fecha")
        paginator = DefaultPagination()
        paginator.page_size = 10
        page = paginator.paginate_queryset(historial, request)
        serializer = PrecioHistoricoSerializer(page, many=True)
        return paginator.get_paginated_response(serializer.data)


class DeducirStockInputSerializer(serializers.Serializer):
    producto_id = serializers.IntegerField()
    ubicacion_id = serializers.IntegerField()
    cantidad = serializers.IntegerField(min_value=1)


class DeducirStockSerializer(serializers.Serializer):
    deducciones = DeducirStockInputSerializer(many=True)

    def validate_deducciones(self, value):
        if not value:
            raise serializers.ValidationError("Debe especificar al menos una deducción")
        return value


class VentaViewSet(mixins.CreateModelMixin, mixins.ListModelMixin, mixins.RetrieveModelMixin, viewsets.GenericViewSet):
    permission_classes = [IsAuthenticated, DjangoModelPermissions, RoleActionPermission]
    queryset = Venta.objects.select_related("usuario").prefetch_related(
        "pagos",
        "pedido",
        "devoluciones",
        "devoluciones__detalles",
        "detalleventa_set__producto",
        Prefetch(
            "ventas_derivadas",
            queryset=Venta.objects.exclude(estado=Venta.Estado.CANCELADA).order_by("id"),
        ),
    ).all().order_by("-fecha_venta")
    serializer_class = VentaSerializer
    pagination_class = VentaPagination
    role_action_map = {
        "list": [ROLE_VENDEDOR, ROLE_ENCARGADO, ROLE_GERENTE, ROLE_BODEGUERO],
        "retrieve": [ROLE_VENDEDOR, ROLE_ENCARGADO, ROLE_GERENTE, ROLE_BODEGUERO],
        "create": [ROLE_VENDEDOR, ROLE_ENCARGADO, ROLE_GERENTE, ROLE_BODEGUERO],
        "validar_stock": [ROLE_VENDEDOR, ROLE_ENCARGADO, ROLE_GERENTE, ROLE_BODEGUERO],
        "ubicaciones_para_deducir": [ROLE_VENDEDOR, ROLE_ENCARGADO, ROLE_GERENTE, ROLE_BODEGUERO],
        "deducir_stock": [ROLE_VENDEDOR, ROLE_ENCARGADO, ROLE_GERENTE, ROLE_BODEGUERO],
        "anular": [ROLE_ENCARGADO, ROLE_GERENTE],
        "devolver": [ROLE_ENCARGADO, ROLE_GERENTE],
        "documento": [ROLE_VENDEDOR, ROLE_ENCARGADO, ROLE_GERENTE, ROLE_BODEGUERO],
    }

    def get_queryset(self):
        queryset = super().get_queryset()
        queryset = queryset.exclude(
            tipo_documento=Venta.TipoDocumento.PEDIDO,
            pedido__activo=False,
        )

        codigo = self.request.query_params.get("codigo", "").strip()
        tipo_documento = self.request.query_params.get("tipo_documento", "").strip()

        if codigo:
            queryset = queryset.filter(
                Q(id__startswith=codigo) | Q(cliente_nombre__icontains=codigo)
            )
        if tipo_documento:
            queryset = queryset.filter(tipo_documento=tipo_documento)

        fecha_desde = self.request.query_params.get("fecha_desde", "").strip()
        fecha_hasta = self.request.query_params.get("fecha_hasta", "").strip()

        if fecha_desde:
            queryset = queryset.filter(fecha_venta__date__gte=fecha_desde)
        if fecha_hasta:
            queryset = queryset.filter(fecha_venta__date__lte=fecha_hasta)

        user = self.request.user
        if has_any_role(user, [ROLE_ENCARGADO, ROLE_GERENTE]):
            return queryset
        return queryset.filter(usuario=user)

    def create(self, request, *args, **kwargs):
        serializer = RegistrarVentaSerializer(data=request.data, context={"request": request})
        serializer.is_valid(raise_exception=True)
        venta = serializer.save()
        output = VentaSerializer(venta, context={"request": request})
        return Response(output.data, status=status.HTTP_201_CREATED)

    @action(detail=False, methods=["post"], url_path="validar-stock")
    def validar_stock(self, request):
        productos = request.data.get("productos", [])
        for item in productos:
            producto_id = item.get("producto_id")
            cantidad = item.get("cantidad", 0)
            if producto_id is None:
                return Response({"stock_valido": False, "error": "Producto sin ID"}, status=400)
            try:
                producto = Producto.objects.get(producto_id=producto_id)
            except Producto.DoesNotExist:
                return Response(
                    {"stock_valido": False, "error": f"Producto {producto_id} no encontrado"},
                    status=404,
                )
            if producto.stock_actual < int(cantidad):
                return Response({"stock_valido": False})

        return Response({"stock_valido": True})

    @action(detail=True, methods=["get"], url_path="ubicaciones-para-deducir")
    def ubicaciones_para_deducir(self, request, pk=None):
        venta = self.get_object()
        detalles = venta.detalleventa_set.select_related("producto").all()

        resultado = []
        for detalle in detalles:
            producto = detalle.producto
            stocks = StockProductoUbicacion.objects.filter(
                producto=producto, cantidad__gt=0, ubicacion__isnull=False
            ).select_related("ubicacion")

            ubicaciones_con_stock = list(stocks)
            if len(ubicaciones_con_stock) < 2:
                continue

            ubicaciones_info = [
                {"id": s.ubicacion.id, "nombre": s.ubicacion.nombre, "stock": s.cantidad}
                for s in ubicaciones_con_stock
            ]

            resultado.append({
                "producto_id": producto.producto_id,
                "nombre": producto.nombre,
                "codigo_producto": producto.codigo_producto,
                "cantidad_vendida": detalle.cantidad,
                "ubicaciones": ubicaciones_info,
            })

        return Response(resultado)

    @action(detail=True, methods=["post"], url_path="deducir-stock")
    def deducir_stock(self, request, pk=None):
        venta = self.get_object()

        detalles = venta.detalleventa_set.all()
        detalles_map = {d.producto_id: d for d in detalles}

        deducciones = request.data.get("deducciones", [])

        if deducciones:
            serializer = DeducirStockSerializer(data=request.data)
            serializer.is_valid(raise_exception=True)
            deducciones = serializer.validated_data["deducciones"]

            with transaction.atomic():
                for ded in deducciones:
                    producto_id = ded["producto_id"]
                    ubicacion_id = ded["ubicacion_id"]
                    cantidad = ded["cantidad"]

                    if producto_id not in detalles_map:
                        return Response(
                            {"error": f"Producto {producto_id} no está en esta venta"},
                            status=400,
                        )

                    stock = StockProductoUbicacion.objects.select_for_update().filter(
                        producto_id=producto_id,
                        ubicacion_id=ubicacion_id,
                    ).first()

                    if not stock or stock.cantidad < cantidad:
                        return Response(
                            {"error": f"Stock insuficiente en la ubicación seleccionada"},
                            status=400,
                        )

                    stock.cantidad -= cantidad
                    stock.save()

                    detalle = detalles_map[producto_id]
                    detalle.ubicacion_id = ubicacion_id
                    detalle.save(update_fields=["ubicacion"])

        with transaction.atomic():
            for producto_id, detalle in detalles_map.items():
                cantidad_vendida = detalle.cantidad
                ya_deducido = sum(
                    d["cantidad"] for d in deducciones if d["producto_id"] == producto_id
                ) if deducciones else 0

                restante = cantidad_vendida - ya_deducido

                if restante > 0:
                    stocks = StockProductoUbicacion.objects.select_for_update().filter(
                        producto_id=producto_id, cantidad__gt=0
                    ).order_by("-cantidad")

                    for stock in stocks:
                        if restante <= 0:
                            break
                        disponible = min(stock.cantidad, restante)
                        stock.cantidad -= disponible
                        stock.save()
                        restante -= disponible

                        if not detalle.ubicacion_id and stock.ubicacion_id:
                            detalle.ubicacion_id = stock.ubicacion_id
                            detalle.save(update_fields=["ubicacion"])

        return Response({"status": "ok"})

    @action(detail=True, methods=["post"], url_path="anular")
    def anular(self, request, pk=None):
        venta = self.get_object()

        if venta.estado == Venta.Estado.CANCELADA:
            return Response({"error": "Esta venta ya fue anulada"}, status=400)
        if venta.tipo_documento == Venta.TipoDocumento.COTIZACION:
            return Response({"error": "No se puede anular una cotización"}, status=400)
        if hasattr(venta, "anulacion"):
            return Response({"error": "Esta venta ya tiene una anulación registrada"}, status=400)

        serializer = AnulacionInputSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data

        detalles_map = {
            d.producto_id: d.cantidad
            for d in venta.detalleventa_set.all()
        }

        restauradas_productos = set()
        with transaction.atomic():
            for item in data["restauraciones"]:
                pid = item["producto_id"]
                if pid not in detalles_map:
                    return Response(
                        {"error": f"Producto {pid} no está en esta venta"},
                        status=400,
                    )
                restauradas_productos.add(pid)
                try:
                    ubicacion = Ubicacion.objects.get(id=item["ubicacion_id"])
                except Ubicacion.DoesNotExist:
                    return Response(
                        {"error": f"Ubicación {item['ubicacion_id']} no encontrada"},
                        status=404,
                    )
                stock, _ = StockProductoUbicacion.objects.select_for_update().get_or_create(
                    producto_id=pid,
                    ubicacion=ubicacion,
                    defaults={"cantidad": 0},
                )
                stock.cantidad += item["cantidad"]
                stock.save()

            for pid in detalles_map:
                if pid not in restauradas_productos:
                    return Response(
                        {"error": f"Falta especificar restauración para producto {pid}"},
                        status=400,
                    )

            anulacion = Anulacion.objects.create(
                venta=venta,
                usuario=request.user,
                motivo=data["motivo"],
            )
            venta.estado = Venta.Estado.CANCELADA
            venta.save()

        return Response(AnulacionSerializer(anulacion).data, status=status.HTTP_201_CREATED)

    @action(detail=True, methods=["post"], url_path="devolver")
    def devolver(self, request, pk=None):
        venta = self.get_object()

        if venta.estado == Venta.Estado.CANCELADA:
            return Response({"error": "No se puede devolver de una venta anulada"}, status=400)
        if venta.tipo_documento == Venta.TipoDocumento.COTIZACION:
            return Response({"error": "No se puede devolver de una cotización"}, status=400)

        serializer = DevolucionInputSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data

        detalles_venta = {d.producto_id: d for d in venta.detalleventa_set.select_related("producto").all()}
        detalles_map = {pid: d.cantidad for pid, d in detalles_venta.items()}

        devueltos = {}
        for dd in DetalleDevolucion.objects.filter(
            devolucion__venta=venta
        ).values("producto_id").annotate(total=Sum("cantidad")):
            devueltos[dd["producto_id"]] = dd["total"]

        with transaction.atomic():
            devolucion = Devolucion.objects.create(
                venta=venta,
                usuario=request.user,
                motivo=data["motivo"],
            )

            monto_devuelto = 0

            for item in data["productos"]:
                pid = item["producto_id"]
                cantidad = item["cantidad"]
                reponer = item["reponer_stock"]

                if pid not in detalles_map:
                    return Response(
                        {"error": f"Producto {pid} no está en esta venta"},
                        status=400,
                    )

                vendido = detalles_map[pid]
                ya_devuelto = devueltos.get(pid, 0)
                disponible = vendido - ya_devuelto
                if cantidad > disponible:
                    return Response(
                        {"error": f"Solo {disponible} de producto {pid} están disponibles para devolver"},
                        status=400,
                    )

                dv = detalles_venta[pid]
                price = dv.precio_descontado if dv.precio_descontado > 0 else dv.precio_unitario
                monto_item = item.get("monto_devuelto")
                if monto_item is None:
                    monto_item = cantidad * price
                else:
                    max_monto = cantidad * price
                    if monto_item > max_monto:
                        return Response(
                            {"error": f"El monto a devolver del producto {pid} "
                                      f"no puede superar su valor (${max_monto})"},
                            status=400,
                        )
                monto_devuelto += monto_item

                if reponer:
                    ubicacion_id = item.get("ubicacion_id")
                    if not ubicacion_id:
                        return Response(
                            {"error": f"Debe especificar ubicación para reponer stock del producto {pid}"},
                            status=400,
                        )
                    try:
                        ubicacion = Ubicacion.objects.get(id=ubicacion_id)
                    except Ubicacion.DoesNotExist:
                        return Response(
                            {"error": f"Ubicación {ubicacion_id} no encontrada"},
                            status=404,
                        )
                    stock, _ = StockProductoUbicacion.objects.select_for_update().get_or_create(
                        producto_id=pid,
                        ubicacion=ubicacion,
                        defaults={"cantidad": 0},
                    )
                    stock.cantidad += cantidad
                    stock.save()

                DetalleDevolucion.objects.create(
                    devolucion=devolucion,
                    producto_id=pid,
                    nombre=detalles_venta[pid].producto.nombre,
                    precio_unitario=monto_item,
                    cantidad=cantidad,
                    reponer_stock=reponer,
                )

            devolucion.monto_devuelto = monto_devuelto
            devolucion.save(update_fields=["monto_devuelto"])

        return Response(DevolucionSerializer(devolucion).data, status=status.HTTP_201_CREATED)

    @action(detail=True, methods=["get"], url_path="documento")
    def documento(self, request, pk=None):
        venta = self.get_object()

        if venta.documento_html:
            return HttpResponse(venta.documento_html, content_type="text/html; charset=utf-8")

        es_cotizacion = venta.tipo_documento == Venta.TipoDocumento.COTIZACION
        config = StoreConfig.current()

        detalles = venta.detalleventa_set.select_related("producto").all()

        items_html = ""
        for d in detalles:
            if es_cotizacion:
                label = f'{d.cantidad} x {d.producto.marca + " - " if d.producto.marca else ""}{d.producto.nombre}'
            else:
                label = f'{d.cantidad} x {d.producto.codigo_producto} - {d.producto.marca + " - " if d.producto.marca else ""}{d.producto.nombre}'
            items_html += f'\n<div style="display:flex;justify-content:space-between;color:#333;margin-bottom:2px;"><span>{label}</span><span>${d.subtotal}</span></div>'

        titulo = "COTIZACION" if es_cotizacion else "COMPROBANTE DE VENTA"

        tax_percent = float(config.tax_percent)
        factor = Decimal("1") + (Decimal(str(tax_percent)) / Decimal("100"))
        total_neto = int(round(Decimal(str(venta.monto_total)) / factor))
        impuesto = venta.monto_total - total_neto

        totales_html = ""
        if not es_cotizacion:
            desc_html = ""
            if venta.descuento_porcentaje > 0:
                monto_desc = venta.monto_subtotal - venta.monto_total
                desc_html = f'<div class="totals-row"><span>Descuento ({venta.descuento_porcentaje}%)</span><span>-${monto_desc}</span></div>'
            totales_html = f'<hr /><div class="totals-row"><span>Subtotal</span><span>${venta.monto_subtotal}</span></div>{desc_html}<div class="totals-row"><span>Neto</span><span>${total_neto}</span></div><div class="totals-row"><span>Impuesto</span><span>${impuesto}</span></div><div class="totals-row"><span class="bold">Total</span><span class="bold">${venta.monto_total}</span></div>'

        disclaimer = '<p class="disclaimer">Cotización válida hasta agotar stock</p>' if es_cotizacion else ""

        from django.utils.formats import date_format
        fecha_str = date_format(venta.fecha_venta, format="SHORT_DATETIME_FORMAT", use_l10n=True)

        direccion_line = f'<p class="address">{config.direccion}</p>' if config.direccion else ""
        telefono_line = f'<p class="address">{config.telefono}</p>' if config.telefono else ""

        html = f"""<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8" />
<title>{titulo}</title>
<style>
@import url('https://fonts.googleapis.com/css2?family=JetBrains+Mono:ital,wght@0,100..800;1,100..800&display=swap');
@page {{ size: letter; margin: 12mm; }}
body {{
font-family: "JetBrains Mono", monospace;
margin: 0;
padding: 1.25rem;
font-size: 0.8rem;
line-height: 1.5;
color: #1a1a1a;
background: #faf9f6;
}}
h1 {{ margin: 0 0 4px; text-align: center; font-size: 1rem; }}
.subtitle {{ text-align: center; margin: 0 0 4px; }}
.address {{ text-align: center; font-size: 0.7rem; color: #666; margin: 0 0 4px; }}
.doc-number {{ text-align: center; font-size: 0.75rem; color: #666; margin-bottom: 4px; }}
.date {{ text-align: center; font-size: 0.75rem; color: #666; margin-bottom: 8px; }}
hr {{ border: none; border-top: 1px dashed #999; margin: 8px 0; }}
.totals-row {{ display: flex; justify-content: space-between; }}
.disclaimer {{ text-align: center; color: #999; font-size: 0.7rem; margin-top: 8px; }}
.bold {{ font-weight: bold; }}
</style>
</head>
<body>
<h1>{settings.STORE_NAME}</h1>
{direccion_line}
{telefono_line}
<p class="subtitle">{titulo}</p>
<p class="doc-number">#{venta.id}</p>
<p class="date">{fecha_str}</p>
<hr />
{items_html}
{totales_html}
{disclaimer}
<p class="disclaimer">Documento carece de validez legal</p>
</body>
</html>"""

        venta.documento_html = html
        venta.save(update_fields=["documento_html"])

        return HttpResponse(html, content_type="text/html; charset=utf-8")


class DevolucionViewSet(mixins.ListModelMixin, mixins.RetrieveModelMixin, viewsets.GenericViewSet):
    permission_classes = [IsAuthenticated, DjangoModelPermissions, RoleActionPermission]
    queryset = Devolucion.objects.select_related("venta__usuario", "usuario").prefetch_related("detalles__producto", "venta__pedido", "venta__detalleventa_set").all().order_by("-fecha_devolucion")
    serializer_class = DevolucionSerializer
    pagination_class = DevolucionPagination
    role_action_map = {
        "list": [ROLE_VENDEDOR, ROLE_ENCARGADO, ROLE_GERENTE],
        "retrieve": [ROLE_VENDEDOR, ROLE_ENCARGADO, ROLE_GERENTE],
    }

    def get_queryset(self):
        queryset = super().get_queryset()
        user = self.request.user
        if has_any_role(user, [ROLE_ENCARGADO, ROLE_GERENTE]):
            return queryset
        return queryset.filter(venta__usuario=user)


class CambiarEstadoPedidoSerializer(serializers.Serializer):
    estado = serializers.ChoiceField(choices=Pedido.Estado.choices, required=False)
    estado_documento = serializers.ChoiceField(choices=Pedido.EstadoDocumento.choices, required=False)


class MarcarRetiroSerializer(serializers.Serializer):
    persona_retiro = serializers.CharField(max_length=200, trim_whitespace=True)
    estado_documento = serializers.ChoiceField(
        choices=Pedido.EstadoDocumento.choices, required=False
    )


class ConvertirCotizacionSerializer(serializers.Serializer):
    detalle_ids = serializers.ListField(
        child=serializers.IntegerField(min_value=1),
        min_length=1,
    )
    nombre_cliente = serializers.CharField(max_length=200, required=False, default="")
    telefono_cliente = serializers.CharField(max_length=50, required=False, default="")
    metodo_pago = serializers.CharField(max_length=2, required=False, default="EF")
    estado_documento = serializers.CharField(max_length=2, required=False, default="SB")


class CancelarPedidoSerializer(serializers.Serializer):
    motivo = serializers.CharField(max_length=500, trim_whitespace=True)


class PedidoViewSet(mixins.CreateModelMixin, mixins.ListModelMixin, mixins.RetrieveModelMixin, viewsets.GenericViewSet):
    permission_classes = [IsAuthenticated, DjangoModelPermissions, RoleActionPermission]
    serializer_class = PedidoSerializer
    pagination_class = PedidoPagination
    role_action_map = {
        "list": [ROLE_VENDEDOR, ROLE_ENCARGADO, ROLE_GERENTE, ROLE_BODEGUERO],
        "retrieve": [ROLE_VENDEDOR, ROLE_ENCARGADO, ROLE_GERENTE, ROLE_BODEGUERO],
        "create": [ROLE_VENDEDOR, ROLE_ENCARGADO, ROLE_GERENTE, ROLE_BODEGUERO],
        "cambiar_estado": [ROLE_VENDEDOR, ROLE_ENCARGADO, ROLE_GERENTE, ROLE_BODEGUERO],
        "marcar_retiro": [ROLE_VENDEDOR, ROLE_ENCARGADO, ROLE_GERENTE, ROLE_BODEGUERO],
        "cancelar": [ROLE_VENDEDOR, ROLE_ENCARGADO, ROLE_GERENTE, ROLE_BODEGUERO],
        "convertir_a_pedido": [ROLE_VENDEDOR, ROLE_ENCARGADO, ROLE_GERENTE, ROLE_BODEGUERO],
        "devolver": [ROLE_ENCARGADO, ROLE_GERENTE],
    }

    def get_queryset(self):
        queryset = Pedido.objects.filter(activo=True).select_related("usuario", "venta").prefetch_related(
            "detalles__proveedor", "detalles__producto", "detalles__devoluciones"
        ).order_by("-fecha_creacion")

        estado = self.request.query_params.get("estado", "").strip()
        search = self.request.query_params.get("search", "").strip()
        fecha_desde = self.request.query_params.get("fecha_desde", "").strip()
        fecha_hasta = self.request.query_params.get("fecha_hasta", "").strip()

        if estado == "CO":
            queryset = queryset.filter(es_cotizacion=True)
        elif estado:
            queryset = queryset.filter(estado=estado, es_cotizacion=False)
        if search:
            queryset = queryset.filter(
                Q(id__startswith=search) | Q(nombre_cliente__icontains=search)
            )
        if fecha_desde:
            queryset = queryset.filter(fecha_creacion__date__gte=fecha_desde)
        if fecha_hasta:
            queryset = queryset.filter(fecha_creacion__date__lte=fecha_hasta)

        return queryset

    def create(self, request, *args, **kwargs):
        serializer = CrearPedidoSerializer(data=request.data, context={"request": request})
        serializer.is_valid(raise_exception=True)
        pedido = serializer.save()
        output = PedidoSerializer(pedido, context={"request": request})
        return Response(output.data, status=status.HTTP_201_CREATED)

    def _descontar_stock_pedido(self, pedido):
        for detalle in pedido.detalles.filter(producto__isnull=False):
            producto = detalle.producto
            cantidad = 1
            stocks = StockProductoUbicacion.objects.select_for_update().filter(
                producto=producto, cantidad__gt=0
            ).order_by("-cantidad")

            restante = cantidad
            for stock in stocks:
                if restante <= 0:
                    break
                disponible = min(stock.cantidad, restante)
                stock.cantidad -= disponible
                stock.save()
                restante -= disponible

            if restante > 0:
                raise serializers.ValidationError(
                    {"estado": f"Stock insuficiente para {producto.nombre}"}
                )
        pedido.stock_descontado = True

    @action(detail=True, methods=["post"], url_path="cambiar-estado")
    def cambiar_estado(self, request, pk=None):
        pedido = self.get_object()
        serializer = CambiarEstadoPedidoSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data

        with transaction.atomic():
            if "estado" in data:
                pedido.estado = data["estado"]
                if pedido.estado == Pedido.Estado.RETIRADO and not pedido.stock_descontado:
                    self._descontar_stock_pedido(pedido)
            if "estado_documento" in data:
                pedido.estado_documento = data["estado_documento"]
            pedido.save(update_fields=["estado", "estado_documento", "stock_descontado"])

        return Response(PedidoSerializer(pedido, context={"request": request}).data)

    @action(detail=True, methods=["post"], url_path="marcar-retiro")
    def marcar_retiro(self, request, pk=None):
        pedido = self.get_object()
        if pedido.estado == Pedido.Estado.RETIRADO:
            return Response({"error": "El pedido ya fue retirado"}, status=status.HTTP_400_BAD_REQUEST)

        serializer = MarcarRetiroSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        persona_retiro = serializer.validated_data["persona_retiro"]

        with transaction.atomic():
            pedido.estado = Pedido.Estado.RETIRADO
            pedido.persona_retiro = persona_retiro
            pedido.fecha_retiro = timezone.now()
            if not pedido.stock_descontado:
                self._descontar_stock_pedido(pedido)
            if "estado_documento" in serializer.validated_data:
                pedido.estado_documento = serializer.validated_data["estado_documento"]
            pedido.save(update_fields=["estado", "persona_retiro", "fecha_retiro", "stock_descontado", "estado_documento"])

        return Response(PedidoSerializer(pedido, context={"request": request}).data)

    @action(detail=True, methods=["post"], url_path="cancelar")
    def cancelar(self, request, pk=None):
        pedido = self.get_object()
        serializer = CancelarPedidoSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        pedido.estado = Pedido.Estado.CANCELADO
        pedido.motivo_cancelacion = serializer.validated_data["motivo"]
        pedido.save(update_fields=["estado", "motivo_cancelacion"])
        return Response(PedidoSerializer(pedido, context={"request": request}).data)

    @action(detail=True, methods=["post"], url_path="devolver")
    def devolver(self, request, pk=None):
        pedido = self.get_object()

        if pedido.es_cotizacion:
            return Response({"error": "No se puede devolver una cotización"}, status=400)
        if pedido.estado == Pedido.Estado.CANCELADO:
            return Response({"error": "No se puede devolver un pedido cancelado"}, status=400)
        if pedido.venta is None:
            return Response({"error": "Este pedido no tiene venta asociada"}, status=400)

        serializer = DevolverPedidoInputSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data

        detalles_map = {d.id: d for d in pedido.detalles.select_related("producto").all()}
        if not detalles_map:
            return Response({"error": "Este pedido no tiene líneas para devolver"}, status=400)

        ya_devueltos = set(
            DetalleDevolucion.objects.filter(
                devolucion__venta=pedido.venta,
                pedido_detalle__isnull=False,
            ).values_list("pedido_detalle_id", flat=True)
        )
        if len(ya_devueltos) >= len(detalles_map):
            return Response({"error": "Este pedido ya fue devuelto por completo"}, status=400)

        lineas = []
        monto_devuelto = 0
        for item in data["productos"]:
            pedido_detalle = detalles_map.get(item["pedido_detalle_id"])
            if pedido_detalle is None:
                return Response(
                    {"error": f"Línea {item['pedido_detalle_id']} no pertenece a este pedido"},
                    status=400,
                )
            if pedido_detalle.id in ya_devueltos:
                return Response(
                    {"error": f"La línea {pedido_detalle.nombre} ya fue devuelta"},
                    status=400,
                )

            monto = item["monto_devuelto"]
            if monto > pedido_detalle.precio_final:
                return Response(
                    {"error": f"El monto a devolver de {pedido_detalle.nombre} "
                              f"no puede superar su precio (${pedido_detalle.precio_final})"},
                    status=400,
                )
            monto_devuelto += monto

            reponer = item["reponer_stock"]
            if reponer and pedido.stock_descontado and pedido_detalle.producto:
                ubicacion_id = item.get("ubicacion_id")
                if not ubicacion_id:
                    return Response(
                        {"error": f"Debe especificar ubicación para reponer stock de {pedido_detalle.nombre}"},
                        status=400,
                    )
                try:
                    Ubicacion.objects.get(id=ubicacion_id)
                except Ubicacion.DoesNotExist:
                    return Response(
                        {"error": f"Ubicación {ubicacion_id} no encontrada"},
                        status=404,
                    )

            lineas.append((pedido_detalle, monto, reponer, item.get("ubicacion_id")))

        with transaction.atomic():
            devolucion = Devolucion.objects.create(
                venta=pedido.venta,
                usuario=request.user,
                motivo=data["motivo"],
                monto_devuelto=monto_devuelto,
            )

            for pedido_detalle, monto, reponer, ubicacion_id in lineas:
                if reponer and pedido.stock_descontado and pedido_detalle.producto:
                    stock, _ = StockProductoUbicacion.objects.select_for_update().get_or_create(
                        producto=pedido_detalle.producto,
                        ubicacion_id=ubicacion_id,
                        defaults={"cantidad": 0},
                    )
                    stock.cantidad += 1
                    stock.save()

                DetalleDevolucion.objects.create(
                    devolucion=devolucion,
                    producto=pedido_detalle.producto,
                    pedido_detalle=pedido_detalle,
                    nombre=pedido_detalle.nombre,
                    precio_unitario=monto,
                    cantidad=1,
                    reponer_stock=reponer,
                )

            lineas_devueltas_ids = {linea[0].id for linea in lineas}
            if len(ya_devueltos | lineas_devueltas_ids) >= len(detalles_map):
                pedido.estado = Pedido.Estado.DEVUELTO
                pedido.save(update_fields=["estado"])

        return Response(DevolucionSerializer(devolucion).data, status=status.HTTP_201_CREATED)

    def _calcular_item_view(self, precio_costo, porcentaje_utilidad, costo_envio, sumar_envio=True, stellantis=False):
        from decimal import Decimal, ROUND_HALF_UP, ROUND_UP
        costo = Decimal(precio_costo)
        if stellantis:
            costo = costo * Decimal("0.80")
        utilidad = Decimal(porcentaje_utilidad) / Decimal(100)
        base = costo * (Decimal(1) + utilidad)
        con_iva = base * Decimal("1.19")
        if sumar_envio:
            con_envio = con_iva + Decimal(costo_envio)
        else:
            con_envio = con_iva
        item_total = int((con_envio / Decimal(100)).to_integral_value(rounding=ROUND_UP) * Decimal(100))
        return int(base.to_integral_value(rounding=ROUND_HALF_UP)), item_total

    @action(detail=True, methods=["post"], url_path="convertir-a-pedido")
    def convertir_a_pedido(self, request, pk=None):
        cotizacion = self.get_object()

        if not cotizacion.es_cotizacion:
            return Response({"error": "Este pedido no es una cotización"}, status=400)
        if Pedido.objects.filter(pedido_origen=cotizacion, activo=True).exists():
            return Response({"error": "Esta cotización ya fue convertida a pedido"}, status=400)

        serializer = ConvertirCotizacionSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        detalle_ids = serializer.validated_data["detalle_ids"]
        nombre_cliente = serializer.validated_data.get("nombre_cliente") or cotizacion.nombre_cliente
        telefono_cliente = serializer.validated_data.get("telefono_cliente") or cotizacion.telefono_cliente
        metodo_pago = serializer.validated_data.get("metodo_pago") or cotizacion.metodo_pago or "EF"
        estado_documento = serializer.validated_data.get("estado_documento") or "SB"

        detalles_originales = cotizacion.detalles.filter(id__in=detalle_ids)
        if not detalles_originales.exists():
            return Response({"error": "Ninguno de los items seleccionados pertenece a esta cotización"}, status=400)

        costo_envio = 4500
        monto_subtotal = 0
        monto_total = 0
        nuevos_items = []
        for detalle in detalles_originales:
            base, item_total = self._calcular_item_view(
                detalle.precio_costo,
                detalle.porcentaje_utilidad,
                costo_envio,
                sumar_envio=detalle.sumar_envio,
                stellantis=detalle.stellantis,
            )
            monto_subtotal += base
            monto_total += item_total
            nuevos_items.append({
                "detalle": detalle,
                "item_total": item_total,
            })

        with transaction.atomic():
            nuevo_pedido = Pedido.objects.create(
                usuario=request.user,
                nombre_cliente=nombre_cliente,
                telefono_cliente=telefono_cliente,
                monto_subtotal=monto_subtotal,
                monto_total=monto_total,
                costo_envio=costo_envio,
                metodo_pago=metodo_pago,
                estado=Pedido.Estado.PENDIENTE_RETIRAR,
                estado_documento=estado_documento,
                es_cotizacion=False,
                pedido_origen=cotizacion,
            )

            for item in nuevos_items:
                d = item["detalle"]
                PedidoDetalle.objects.create(
                    pedido=nuevo_pedido,
                    producto=d.producto,
                    codigo_proveedor=d.codigo_proveedor,
                    proveedor=d.proveedor,
                    oem=d.oem,
                    nombre=d.nombre,
                    precio_costo=d.precio_costo,
                    porcentaje_utilidad=d.porcentaje_utilidad,
                    precio_final=item["item_total"],
                    sumar_envio=d.sumar_envio,
                    stellantis=d.stellantis,
                )

                fecha = date.today()
                dia_hoy = PedidoProveedorDia.objects.filter(fecha=fecha).first()
                if dia_hoy and dia_hoy.finalizado:
                    fecha = date.today() + timedelta(days=1)

                dia, _ = PedidoProveedorDia.objects.get_or_create(fecha=fecha)

                if d.producto:
                    ItemPedidoProveedor.objects.get_or_create(
                        dia=dia,
                        producto=d.producto,
                        defaults={"proveedor": d.proveedor},
                    )
                else:
                    if not ItemPedidoProveedor.objects.filter(
                        dia=dia,
                        proveedor=d.proveedor,
                        nombre_custom=d.nombre,
                    ).exists():
                        ItemPedidoProveedor.objects.create(
                            dia=dia,
                            producto=None,
                            proveedor=d.proveedor,
                            nombre_custom=d.nombre,
                            codigo_proveedor_custom=d.codigo_proveedor,
                        )

            venta = Venta.objects.create(
                usuario=request.user,
                monto_total=monto_total,
                monto_subtotal=monto_subtotal,
                estado=Venta.Estado.COMPLETADA,
                tipo_documento=Venta.TipoDocumento.PEDIDO,
            )
            nuevo_pedido.venta = venta
            nuevo_pedido.save(update_fields=["venta"])

        return Response(
            PedidoSerializer(nuevo_pedido, context={"request": request}).data,
            status=status.HTTP_201_CREATED,
        )


class PedidoProveedorViewSet(viewsets.ModelViewSet):
    permission_classes = [IsAuthenticated, DjangoModelPermissions, RoleActionPermission]
    pagination_class = None
    role_action_map = {
        "list": [ROLE_ENCARGADO, ROLE_GERENTE],
        "retrieve": [ROLE_ENCARGADO, ROLE_GERENTE],
        "create": [ROLE_ENCARGADO, ROLE_GERENTE],
        "agregar_item": [ROLE_VENDEDOR, ROLE_ENCARGADO, ROLE_GERENTE, ROLE_BODEGUERO],
        "toggle_item": [ROLE_ENCARGADO, ROLE_GERENTE],
        "eliminar_item": [ROLE_ENCARGADO, ROLE_GERENTE],
        "finalizar": [ROLE_ENCARGADO, ROLE_GERENTE],
        "transferir": [ROLE_ENCARGADO, ROLE_GERENTE],
        "hoy": [ROLE_ENCARGADO, ROLE_GERENTE],
    }

    def get_queryset(self):
        return PedidoProveedorDia.objects.prefetch_related("items__producto", "items__proveedor").all()

    def get_serializer_class(self):
        if self.action == "list":
            return PedidoProveedorDiaHistorialSerializer
        return PedidoProveedorDiaSerializer

    def _check_finalizado(self, dia):
        if dia.finalizado:
            raise serializers.ValidationError({"error": "Este pedido ya fue finalizado"})

    @action(detail=False, methods=["get"], url_path="hoy")
    def hoy(self, request):
        fecha = date.today()
        dia, _ = PedidoProveedorDia.objects.get_or_create(
            fecha=fecha,
            defaults={"usuario": request.user},
        )
        serializer = self.get_serializer(dia)
        return Response(serializer.data)

    def retrieve(self, request, *args, **kwargs):
        instance = self.get_object()
        serializer = self.get_serializer(instance)
        return Response(serializer.data)

    @action(detail=False, methods=["post"], url_path="agregar-item")
    def agregar_item(self, request):
        serializer = AgregarItemPedidoProveedorSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data
        producto_id = data.get("producto_id")

        fecha = date.today()
        dia, _ = PedidoProveedorDia.objects.get_or_create(
            fecha=fecha,
            defaults={"usuario": request.user},
        )
        self._check_finalizado(dia)

        if producto_id:
            try:
                producto = Producto.objects.select_related("proveedor").get(producto_id=producto_id)
            except Producto.DoesNotExist:
                return Response({"error": "Producto no encontrado"}, status=404)

            item, created = ItemPedidoProveedor.objects.get_or_create(
                dia=dia,
                producto=producto,
                defaults={"proveedor": producto.proveedor},
            )
        else:
            from gerenteApp.models import Proveedor
            try:
                proveedor = Proveedor.objects.get(proveedor_id=data["proveedor_id"])
            except Proveedor.DoesNotExist:
                return Response({"error": "Proveedor no encontrado"}, status=404)

            item = ItemPedidoProveedor.objects.create(
                dia=dia,
                producto=None,
                proveedor=proveedor,
                nombre_custom=data["nombre_custom"],
                codigo_proveedor_custom=data["codigo_proveedor_custom"],
            )
            created = True

        return Response({"ok": True, "created": created})

    @action(detail=True, methods=["post"], url_path="toggle-item/(?P<item_id>[^/.]+)")
    def toggle_item(self, request, pk=None, item_id=None):
        dia = self.get_object()
        self._check_finalizado(dia)
        try:
            item = dia.items.get(id=item_id)
        except ItemPedidoProveedor.DoesNotExist:
            return Response({"error": "Item no encontrado"}, status=404)
        item.pedido = not item.pedido
        item.save(update_fields=["pedido"])
        return Response({"ok": True, "pedido": item.pedido})

    @action(detail=True, methods=["delete"], url_path="eliminar-item/(?P<item_id>[^/.]+)")
    def eliminar_item(self, request, pk=None, item_id=None):
        dia = self.get_object()
        self._check_finalizado(dia)
        try:
            item = dia.items.get(id=item_id)
        except ItemPedidoProveedor.DoesNotExist:
            return Response({"error": "Item no encontrado"}, status=404)
        item.delete()
        return Response({"ok": True})

    @action(detail=True, methods=["post"], url_path="finalizar")
    def finalizar(self, request, pk=None):
        dia = self.get_object()
        self._check_finalizado(dia)

        pendientes = dia.items.filter(pedido=False)

        fecha_destino = date.today() + timedelta(days=1)
        dia_destino, _ = PedidoProveedorDia.objects.get_or_create(
            fecha=fecha_destino,
            defaults={"usuario": request.user},
        )

        transferidos = 0
        for item in pendientes:
            _, created = ItemPedidoProveedor.objects.get_or_create(
                dia=dia_destino,
                producto=item.producto,
                defaults={"proveedor": item.proveedor},
            )
            if created:
                transferidos += 1

        dia.finalizado = True
        dia.save(update_fields=["finalizado"])

        return Response({"ok": True, "finalizado": True, "transferidos": transferidos})

    @action(detail=True, methods=["post"], url_path="transferir")
    def transferir(self, request, pk=None):
        dia_origen = self.get_object()
        self._check_finalizado(dia_origen)
        pendientes = dia_origen.items.filter(pedido=False)

        if not pendientes.exists():
            return Response({"ok": True, "transferidos": 0})

        fecha_destino = date.today() + timedelta(days=1)
        dia_destino, _ = PedidoProveedorDia.objects.get_or_create(
            fecha=fecha_destino,
            defaults={"usuario": request.user},
        )

        transferidos = 0
        for item in pendientes:
            _, created = ItemPedidoProveedor.objects.get_or_create(
                dia=dia_destino,
                producto=item.producto,
                defaults={"proveedor": item.proveedor},
            )
            if created:
                transferidos += 1

        return Response({"ok": True, "transferidos": transferidos})


REPORT_DEFAULT_PAGE_SIZE = 50
REPORT_MAX_PAGE_SIZE = 200
REPORT_EXPORT_MAX_ROWS = 10000
REPORT_MAX_UBICACION_COLUMNS = 20


def _ubicacion_options():
    return [{"value": u.id, "label": u.nombre} for u in Ubicacion.objects.order_by("nombre")]


def _proveedor_options():
    return [{"value": p.pk, "label": p.nombre} for p in Proveedor.objects.order_by("nombre")]


def _marca_options():
    valores = (
        Producto.objects.exclude(marca="")
        .values_list("marca", flat=True)
        .distinct()
        .order_by("marca")
    )
    return [{"value": marca, "label": marca} for marca in valores]


def _vendedor_options():
    opciones = []
    for user in User.objects.filter(is_active=True).order_by("first_name", "last_name", "username"):
        nombre = f"{user.first_name} {user.last_name}".strip()
        opciones.append({"value": user.id, "label": nombre or user.username})
    return opciones


SCHEMA_OPTIONS_SOURCES = {
    "ubicaciones": _ubicacion_options,
    "proveedores": _proveedor_options,
    "marcas": _marca_options,
    "vendedores": _vendedor_options,
}


def _parse_int_list(raw):
    valores = []
    for token in (raw or "").split(","):
        token = token.strip()
        if not token:
            continue
        try:
            valores.append(int(token))
        except ValueError:
            continue
    return valores


def _parse_str_list(raw):
    return [token.strip() for token in (raw or "").split(",") if token.strip()]


def _parse_date_param(request, key):
    raw = request.query_params.get(key, "").strip()
    if not raw:
        return None
    try:
        return date.fromisoformat(raw)
    except ValueError:
        raise ValueError(f"Fecha inválida en '{key}'")


def _collect_filters(request, fecha_desde, fecha_hasta, stock_fecha):
    return {
        "ubicaciones": _parse_int_list(request.query_params.get("ubicaciones")),
        "proveedores": _parse_int_list(request.query_params.get("proveedores")),
        "marcas": _parse_str_list(request.query_params.get("marcas")),
        "vendedores": _parse_int_list(request.query_params.get("vendedores")),
        "texto": request.query_params.get("texto", "").strip(),
        "sin_stock": request.query_params.get("sin_stock", "").lower() == "true",
        "bajo_minimo": request.query_params.get("bajo_minimo", "").lower() == "true",
        "fecha_desde": fecha_desde,
        "fecha_hasta": fecha_hasta,
        "stock_fecha": stock_fecha,
    }


def build_productos_report(filters):
    queryset = Producto.objects.all().order_by("nombre", "producto_id")

    ubicacion_ids = filters["ubicaciones"]
    if ubicacion_ids:
        queryset = queryset.filter(
            producto_id__in=StockProductoUbicacion.objects.filter(
                ubicacion_id__in=ubicacion_ids
            ).values("producto_id")
        )

    proveedor_ids = filters["proveedores"]
    if proveedor_ids:
        queryset = queryset.filter(proveedor_id__in=proveedor_ids)

    marcas = filters["marcas"]
    if marcas:
        queryset = queryset.filter(marca__in=marcas)

    texto = filters["texto"]
    if texto:
        queryset = queryset.filter(
            Q(nombre__icontains=texto)
            | Q(oem__icontains=texto)
            | Q(codigo_producto__icontains=texto)
            | Q(oem_alternativo__icontains=texto)
            | Q(codigo_proveedor__icontains=texto)
        )

    return queryset


def build_ventas_report(filters):
    queryset = DetalleVenta.objects.filter(
        venta__estado=Venta.Estado.COMPLETADA,
        venta__tipo_documento=Venta.TipoDocumento.VENTA,
    )

    if filters["fecha_desde"]:
        queryset = queryset.filter(venta__fecha_venta__date__gte=filters["fecha_desde"])
    if filters["fecha_hasta"]:
        queryset = queryset.filter(venta__fecha_venta__date__lte=filters["fecha_hasta"])

    vendedores = filters["vendedores"]
    if vendedores:
        queryset = queryset.filter(venta__usuario_id__in=vendedores)

    ubicacion_ids = filters["ubicaciones"]
    if ubicacion_ids:
        queryset = queryset.filter(ubicacion_id__in=ubicacion_ids)

    texto = filters["texto"]
    if texto:
        queryset = queryset.filter(
            Q(producto__nombre__icontains=texto)
            | Q(producto__oem__icontains=texto)
            | Q(producto__codigo_producto__icontains=texto)
        )

    return queryset.order_by("-venta__fecha_venta", "-id")


def _ultimo_stock_historico(ubicacion_id, fecha_limite):
    return Coalesce(
        Subquery(
            StockHistorico.objects.filter(
                stock__producto_id=OuterRef("producto_id"),
                stock__ubicacion_id=ubicacion_id,
                fecha__lt=fecha_limite,
            )
            .order_by("-fecha", "-id")
            .values("cantidad")[:1]
        ),
        Value(0),
    )


def _stock_total_historico(fecha_limite):
    ultimo_por_stock = Subquery(
        StockHistorico.objects.filter(
            stock_id=OuterRef("id"),
            fecha__lt=fecha_limite,
        )
        .order_by("-fecha", "-id")
        .values("cantidad")[:1]
    )
    return Coalesce(
        Subquery(
            StockProductoUbicacion.objects.filter(producto_id=OuterRef("producto_id"))
            .annotate(ultimo=ultimo_por_stock)
            .values("producto_id")
            .annotate(total=Sum("ultimo"))
            .values("total")[:1]
        ),
        Value(0),
    )


def annotate_productos_report(queryset, field_keys, ubicacion_ids, fecha_limite=None):
    if any(key.startswith("ultima_factura_") for key in field_keys):
        def _ultima(values_field):
            return Subquery(
                DetalleFactura.objects.filter(producto_id=OuterRef("producto_id"))
                .values(values_field)
                .order_by("-factura__fecha", "-factura_id")[:1]
            )

        queryset = queryset.annotate(
            ultima_factura_fecha=_ultima("factura__fecha"),
            ultima_factura_numero=_ultima("factura__numero_factura"),
            ultima_factura_proveedor=_ultima("factura__proveedor__nombre"),
        )

    for ubicacion_id in ubicacion_ids[:REPORT_MAX_UBICACION_COLUMNS]:
        key = f"{DYNAMIC_STOCK_FIELD_PREFIX}{ubicacion_id}"
        if key not in field_keys:
            continue
        if fecha_limite:
            stock_expr = _ultimo_stock_historico(ubicacion_id, fecha_limite)
        else:
            stock_expr = Coalesce(
                Subquery(
                    StockProductoUbicacion.objects.filter(
                        producto_id=OuterRef("producto_id"),
                        ubicacion_id=ubicacion_id,
                    ).values("cantidad")[:1]
                ),
                Value(0),
            )
        queryset = queryset.annotate(**{key: stock_expr})

    if fecha_limite:
        queryset = queryset.annotate(stock_actual=_stock_total_historico(fecha_limite))
    return queryset


PRODUCTOS_VALUES_ALIASES = {
    "codigo_producto": "codigo_producto",
    "nombre": "nombre",
    "oem": "oem",
    "marca": "marca",
    "descripcion": "descripcion",
    "codigo_proveedor": "codigo_proveedor",
    "proveedor_nombre": "proveedor__nombre",
    "precio_costo": "precio_costo",
    "precio": "precio",
    "margen_utilidad": "margen_utilidad",
    "stock_actual": "stock_actual",
    "stock_minimo": "stock_minimo",
    "stock_maximo": "stock_maximo",
}

VENTAS_VALUES_ALIASES = {
    "fecha_venta": "venta__fecha_venta",
    "tipo_documento": "venta__tipo_documento",
    "documento": "venta__documento",
    "cliente_nombre": "venta__cliente_nombre",
    "producto_codigo": "producto__codigo_producto",
    "producto_nombre": "producto__nombre",
    "producto_oem": "producto__oem",
    "producto_marca": "producto__marca",
    "ubicacion_nombre": "ubicacion__nombre",
    "cantidad": "cantidad",
    "precio_unitario": "precio_unitario",
    "subtotal": "subtotal",
}

VENTAS_HELPER_VALUES = {
    "vendedor_first": "venta__usuario__first_name",
    "vendedor_last": "venta__usuario__last_name",
    "vendedor_username": "venta__usuario__username",
}


def _report_values_spec(dataset_key, field_keys):
    positional = []
    aliases = {}
    if dataset_key == "productos":
        sources = PRODUCTOS_VALUES_ALIASES
        for key in field_keys:
            orm_path = sources.get(key, key)
            if orm_path == key:
                positional.append(key)
            else:
                aliases[key] = F(orm_path)
    else:
        for key in field_keys:
            orm_path = VENTAS_VALUES_ALIASES.get(key)
            if orm_path is None:
                continue
            if orm_path == key:
                positional.append(key)
            else:
                aliases[key] = F(orm_path)
        for alias, orm_path in VENTAS_HELPER_VALUES.items():
            aliases[alias] = F(orm_path)
    return positional, aliases


def serialize_report_rows(dataset_key, field_metas, raw_rows):
    filas = []
    for raw in raw_rows:
        fila = {}
        for meta in field_metas:
            fila[meta["key"]] = _resolve_report_value(dataset_key, meta["key"], raw)
        filas.append(fila)
    return filas


def _resolve_report_value(dataset_key, key, raw):
    if dataset_key == "ventas":
        if key == "vendedor":
            nombre = f"{raw['vendedor_first']} {raw['vendedor_last']}".strip()
            return nombre or raw["vendedor_username"]
        if key == "documento":
            return dict(Venta.Documento.choices).get(raw["documento"], "")
        if key == "tipo_documento":
            return dict(Venta.TipoDocumento.choices).get(raw["tipo_documento"], "")
    return raw.get(key)


def _csv_cell(value):
    if value is None:
        return ""
    if isinstance(value, datetime):
        return timezone.localtime(value).strftime("%d/%m/%Y %H:%M")
    return str(value)


class ReporteAccesoMixin:
    def _authorize(self, request):
        if not has_any_role(request.user, [ROLE_ENCARGADO, ROLE_GERENTE]):
            raise PermissionDenied("No tiene permisos para acceder a los reportes personalizados")

    def _prepare(self, request):
        dataset_key = request.query_params.get("dataset", "").strip()
        dataset = get_dataset(dataset_key)
        if not dataset:
            raise ValueError("Dataset inválido")
        try:
            fecha_desde = _parse_date_param(request, "fecha_desde")
            fecha_hasta = _parse_date_param(request, "fecha_hasta")
            stock_fecha = _parse_date_param(request, "stock_fecha")
        except ValueError as exc:
            raise ValueError(str(exc))
        filters = _collect_filters(request, fecha_desde, fecha_hasta, stock_fecha)
        requested_fields = _parse_str_list(request.query_params.get("fields"))
        ubicacion_labels = {
            str(u.id): u.nombre
            for u in Ubicacion.objects.filter(id__in=filters["ubicaciones"])
        }
        field_metas = resolve_field_metas(dataset_key, requested_fields, ubicacion_labels)
        queryset = build_productos_report(filters) if dataset_key == "productos" else build_ventas_report(filters)
        if dataset_key == "productos":
            dynamic_ids = {
                int(meta["key"][len(DYNAMIC_STOCK_FIELD_PREFIX):])
                for meta in field_metas
                if meta["key"].startswith(DYNAMIC_STOCK_FIELD_PREFIX)
            }
            fecha_limite = None
            if filters["stock_fecha"]:
                dia_siguiente = filters["stock_fecha"] + timedelta(days=1)
                fecha_limite = timezone.make_aware(
                    datetime.combine(dia_siguiente, datetime.min.time())
                )
            queryset = annotate_productos_report(
                queryset,
                {meta["key"] for meta in field_metas},
                sorted(set(filters["ubicaciones"]) | dynamic_ids),
                fecha_limite,
            )
            if filters["sin_stock"]:
                queryset = queryset.filter(stock_actual__lte=0)
            if filters["bajo_minimo"]:
                queryset = queryset.filter(
                    stock_actual__lt=F("stock_minimo"),
                    stock_minimo__gt=0,
                    ignorar_stock_permanente=False,
                ).filter(Q(recordar_stock_desde__isnull=True) | Q(recordar_stock_desde__lte=timezone.now()))
        spec = _report_values_spec(dataset_key, {meta["key"] for meta in field_metas})
        return {
            "dataset_key": dataset_key,
            "dataset": dataset,
            "filters": filters,
            "field_metas": field_metas,
            "queryset": queryset.values(*spec[0], **spec[1]),
        }


class ReporteSchemaView(ReporteAccesoMixin, APIView):
    permission_classes = [IsAuthenticated, HasKnownRole]

    def get(self, request):
        self._authorize(request)
        return Response(schema_payload(SCHEMA_OPTIONS_SOURCES))


class ReporteQueryView(ReporteAccesoMixin, APIView):
    permission_classes = [IsAuthenticated, HasKnownRole]

    def get(self, request):
        self._authorize(request)
        try:
            context = self._prepare(request)
        except ValueError as exc:
            return Response({"error": str(exc)}, status=400)

        total = context["queryset"].count()

        def _int_param(name, default, minimum):
            try:
                value = int(request.query_params.get(name, default))
            except (TypeError, ValueError):
                return default
            return max(minimum, value)

        page = _int_param("page", 1, 1)
        page_size = min(_int_param("page_size", REPORT_DEFAULT_PAGE_SIZE, 1), REPORT_MAX_PAGE_SIZE)
        offset = (page - 1) * page_size

        raw_rows = list(context["queryset"][offset:offset + page_size])
        rows = serialize_report_rows(context["dataset_key"], context["field_metas"], raw_rows)
        columns = [
            {"key": meta["key"], "label": meta["label"], "type": meta["type"]}
            for meta in context["field_metas"]
        ]
        return Response(
            {
                "dataset": context["dataset_key"],
                "columns": columns,
                "rows": rows,
                "total": total,
                "page": page,
                "page_size": page_size,
                "pages": math.ceil(total / page_size) if total else 0,
            }
        )


class ReporteExportView(ReporteAccesoMixin, APIView):
    permission_classes = [IsAuthenticated, HasKnownRole]

    def get(self, request):
        self._authorize(request)
        try:
            context = self._prepare(request)
        except ValueError as exc:
            return Response({"error": str(exc)}, status=400)

        response = HttpResponse(content_type="text/csv; charset=utf-8")
        filename = f"reporte-{context['dataset_key']}-{timezone.localdate().isoformat()}.csv"
        response["Content-Disposition"] = f'attachment; filename="{filename}"'
        response.write("\ufeff")
        writer = csv.writer(response, delimiter=";")
        writer.writerow([meta["label"] for meta in context["field_metas"]])
        for raw in context["queryset"][:REPORT_EXPORT_MAX_ROWS].iterator(chunk_size=1000):
            writer.writerow(
                [
                    _csv_cell(_resolve_report_value(context["dataset_key"], meta["key"], raw))
                    for meta in context["field_metas"]
                ]
            )
        return response
