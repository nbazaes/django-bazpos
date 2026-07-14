from django.db.models import Count, F, Q, Sum
from django.db import transaction
from django.utils import timezone
from rest_framework import mixins, serializers, status, viewsets
from rest_framework.decorators import action
from rest_framework.permissions import DjangoModelPermissions, IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from vendedorApp.models import Producto, StockProductoUbicacion, Venta
from vendedorApp.serializers import ProductoSerializer, RegistrarVentaSerializer, VentaSerializer
from bazpos.permissions import (
    HasKnownRole,
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

        bajo_minimo = list(
            Producto.objects.filter(stock_actual__lt=F("stock_minimo"), stock_minimo__gt=0)
            .values("producto_id", "nombre", "stock_actual", "stock_minimo")
            .order_by("stock_actual")[:10]
        )

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
    role_action_map = {
        "list": [ROLE_VENDEDOR, ROLE_ENCARGADO, ROLE_GERENTE],
        "retrieve": [ROLE_VENDEDOR, ROLE_ENCARGADO, ROLE_GERENTE],
        "create": [ROLE_ENCARGADO, ROLE_GERENTE],
        "update": [ROLE_ENCARGADO, ROLE_GERENTE],
        "partial_update": [ROLE_ENCARGADO, ROLE_GERENTE],
        "destroy": [ROLE_ENCARGADO, ROLE_GERENTE],
        "por_codigo": [ROLE_VENDEDOR, ROLE_ENCARGADO, ROLE_GERENTE],
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
    role_action_map = {
        "list": [ROLE_VENDEDOR, ROLE_ENCARGADO, ROLE_GERENTE],
        "retrieve": [ROLE_VENDEDOR, ROLE_ENCARGADO, ROLE_GERENTE],
        "create": [ROLE_VENDEDOR, ROLE_ENCARGADO, ROLE_GERENTE],
        "validar_stock": [ROLE_VENDEDOR, ROLE_ENCARGADO, ROLE_GERENTE],
        "ubicaciones_para_deducir": [ROLE_VENDEDOR, ROLE_ENCARGADO, ROLE_GERENTE],
        "deducir_stock": [ROLE_VENDEDOR, ROLE_ENCARGADO, ROLE_GERENTE],
    }

    def get_queryset(self):
        queryset = super().get_queryset()
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
