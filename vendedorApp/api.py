from datetime import timedelta

from django.db.models import Count, F, Q, Sum
from django.db import transaction
from django.utils import timezone
from rest_framework import mixins, serializers, status, viewsets
from rest_framework.decorators import action
from rest_framework.permissions import DjangoModelPermissions, IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from vendedorApp.models import AjusteStock, Anulacion, Devolucion, DetalleDevolucion, Pedido, Producto, StockProductoUbicacion, Ubicacion, Venta
from vendedorApp.serializers import (
    AjustarStockInputSerializer,
    AjusteStockSerializer,
    AnulacionInputSerializer,
    AnulacionSerializer,
    CrearPedidoSerializer,
    DevolucionInputSerializer,
    DevolucionSerializer,
    PedidoSerializer,
    ProductoSerializer,
    RegistrarVentaSerializer,
    VentaSerializer,
)
from vendedorApp.pagination import (
    DevolucionPagination,
    PedidoPagination,
    ProductoPagination,
    VentaPagination,
)
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

        ventas_hoy = Venta.objects.filter(fecha_venta__date=hoy, estado=Venta.Estado.COMPLETADA)

        if es_gerente:
            total_dia = ventas_hoy.aggregate(total=Sum("monto_total"))["total"] or 0
            cant_ventas_dia = ventas_hoy.count()
            ventas_por_vendedor = (
                ventas_hoy.values("usuario__first_name", "usuario__last_name", "usuario__username")
                .annotate(total=Sum("monto_total"), cantidad=Count("id"))
                .order_by("-total")
            )
            desglose = []
            for row in ventas_por_vendedor:
                nombre = f"{row['usuario__first_name']} {row['usuario__last_name']}".strip()
                desglose.append(
                    {
                        "vendedor": nombre if nombre else row["usuario__username"],
                        "total": row["total"],
                        "cantidad": row["cantidad"],
                    }
                )
        else:
            ventas_propias = ventas_hoy.filter(usuario=user)
            total_dia = ventas_propias.aggregate(total=Sum("monto_total"))["total"] or 0
            cant_ventas_dia = ventas_propias.count()
            nombre = f"{user.first_name} {user.last_name}".strip()
            desglose = [
                {
                    "vendedor": nombre if nombre else user.username,
                    "total": total_dia,
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
                            {"nombre": s.ubicacion.nombre, "cantidad": s.cantidad}
                            for s in p.stocks_ubicacion.all()
                            if s.cantidad > 0
                        ],
                    }
                )
            for p in bajo_minimo:
                p["proveedor_nombre"] = p.pop("proveedor__nombre")
                p["oem_productos"] = oem_map.get(p["oem"], [])

        return Response(
            {
                "es_gerente": es_gerente,
                "ventas_dia": {
                    "total": total_dia,
                    "cantidad": cant_ventas_dia,
                    "desglose": desglose,
                },
                "stock": {
                    "total_productos": Producto.objects.count(),
                    "sin_stock": Producto.objects.filter(stock_actual=0).count(),
                    "bajo_minimo": bajo_minimo,
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
    }

    def get_queryset(self):
        queryset = super().get_queryset()
        texto = self.request.query_params.get("texto", "").strip()
        proveedor = self.request.query_params.get("proveedor", "").strip()

        if texto:
            queryset = queryset.filter(Q(nombre__icontains=texto) | Q(oem__icontains=texto) | Q(codigo_producto__icontains=texto))
        if proveedor:
            queryset = queryset.filter(proveedor_id=proveedor)
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
    }

    def get_queryset(self):
        queryset = super().get_queryset()
        queryset = queryset.exclude(
            tipo_documento=Venta.TipoDocumento.PEDIDO,
            pedido__activo=False,
        )
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

        detalles_map = {
            d.producto_id: d.cantidad
            for d in venta.detalleventa_set.all()
        }

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

        return Response(DevolucionSerializer(devolucion).data, status=status.HTTP_201_CREATED)


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
        "desactivar": [ROLE_VENDEDOR, ROLE_ENCARGADO, ROLE_GERENTE, ROLE_BODEGUERO],
    }

    def get_queryset(self):
        return Pedido.objects.filter(activo=True).select_related("usuario", "venta").prefetch_related(
            "detalles__proveedor", "detalles__producto"
        ).order_by("-fecha_creacion")

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
            pedido.save(update_fields=["estado", "persona_retiro", "fecha_retiro", "stock_descontado"])

        return Response(PedidoSerializer(pedido, context={"request": request}).data)

    @action(detail=True, methods=["post"], url_path="desactivar")
    def desactivar(self, request, pk=None):
        pedido = self.get_object()
        pedido.activo = False
        pedido.save(update_fields=["activo"])
        return Response({"ok": True})
