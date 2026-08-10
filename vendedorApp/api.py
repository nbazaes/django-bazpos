from datetime import date, timedelta
from decimal import Decimal

from django.db.models import Count, F, Max, OuterRef, Q, Subquery, Sum
from django.db import transaction
from django.conf import settings
from django.http import HttpResponse
from django.utils import timezone
from rest_framework import mixins, serializers, status, viewsets
from rest_framework.decorators import action
from rest_framework.permissions import DjangoModelPermissions, IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from vendedorApp.models import AjusteStock, Anulacion, Devolucion, DetalleDevolucion, ItemPedidoProveedor, Pedido, PedidoDetalle, PedidoProveedorDia, Producto, StockProductoUbicacion, Ubicacion, Venta
from vendedorApp.serializers import (
    AgregarItemPedidoProveedorSerializer,
    AjustarStockInputSerializer,
    AjusteStockSerializer,
    AnulacionInputSerializer,
    AnulacionSerializer,
    CrearPedidoSerializer,
    DevolucionInputSerializer,
    DevolucionSerializer,
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
from gerenteApp.models import DetalleFactura, StoreConfig
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
    queryset = Venta.objects.select_related("usuario").all().order_by("-fecha_venta")
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
                producto=producto, cantidad__gt=0
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

        detalles_map = {
            d.producto_id: d.cantidad
            for d in venta.detalleventa_set.all()
        }

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

        with transaction.atomic():
            for producto_id, cantidad_vendida in detalles_map.items():
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

        detalles_venta = {d.producto_id: d for d in venta.detalleventa_set.all()}
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
                monto_devuelto += cantidad * price

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
    queryset = Devolucion.objects.select_related("venta__usuario", "usuario").prefetch_related("detalles__producto").all().order_by("-fecha_devolucion")
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
    }

    def get_queryset(self):
        queryset = Pedido.objects.filter(activo=True).select_related("usuario", "venta").prefetch_related(
            "detalles__proveedor", "detalles__producto"
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
