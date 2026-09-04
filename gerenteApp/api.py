from django.contrib.auth.models import Group, User
from django.db import transaction
from django.db.models import Q
from rest_framework import status, viewsets
from rest_framework.decorators import action
from rest_framework.permissions import DjangoModelPermissions, IsAuthenticated
from rest_framework.response import Response

from gerenteApp.models import Factura, Proveedor, StoreConfig
from gerenteApp.serializers import (
    FacturaDetalleSerializer,
    FacturaSerializer,
    FacturaUpsertSerializer,
    GroupSerializer,
    ProveedorSerializer,
    StoreConfigSerializer,
    UserSerializer,
)
from vendedorApp.pagination import DefaultPagination
from vendedorApp.models import Pedido, PedidoDetalle, Producto, StockProductoUbicacion, Ubicacion
from vendedorApp.serializers import UbicacionSerializer
from vendedorApp.stock_utils import descontar_stock_producto, resolver_producto_por_identidad
from bazpos.permissions import ROLE_BODEGUERO, ROLE_ENCARGADO, ROLE_GERENTE, ROLE_VENDEDOR, RoleActionPermission


class ProveedorViewSet(viewsets.ModelViewSet):
    serializer_class = ProveedorSerializer
    permission_classes = [IsAuthenticated, DjangoModelPermissions, RoleActionPermission]
    queryset = Proveedor.objects.all().order_by("proveedor_id")
    pagination_class = DefaultPagination
    role_action_map = {
        "list": [ROLE_ENCARGADO, ROLE_GERENTE],
        "retrieve": [ROLE_ENCARGADO, ROLE_GERENTE],
        "create": [ROLE_ENCARGADO, ROLE_GERENTE],
        "update": [ROLE_ENCARGADO, ROLE_GERENTE],
        "partial_update": [ROLE_ENCARGADO, ROLE_GERENTE],
        "destroy": [ROLE_ENCARGADO, ROLE_GERENTE],
    }

    def get_queryset(self):
        queryset = super().get_queryset()
        texto = self.request.query_params.get("texto", "").strip()
        if texto:
            queryset = queryset.filter(nombre__icontains=texto)
        return queryset


class UserViewSet(viewsets.ModelViewSet):
    serializer_class = UserSerializer
    permission_classes = [IsAuthenticated, DjangoModelPermissions, RoleActionPermission]
    queryset = User.objects.all().order_by("id")
    pagination_class = DefaultPagination
    role_action_map = {
        "list": [ROLE_ENCARGADO, ROLE_GERENTE],
        "retrieve": [ROLE_ENCARGADO, ROLE_GERENTE],
        "create": [ROLE_ENCARGADO, ROLE_GERENTE],
        "update": [ROLE_ENCARGADO, ROLE_GERENTE],
        "partial_update": [ROLE_ENCARGADO, ROLE_GERENTE],
        "destroy": [ROLE_ENCARGADO, ROLE_GERENTE],
        "grupos": [ROLE_ENCARGADO, ROLE_GERENTE],
    }

    def get_queryset(self):
        queryset = super().get_queryset()
        texto = self.request.query_params.get("texto", "").strip()
        if texto:
            queryset = queryset.filter(
                Q(first_name__icontains=texto)
                | Q(last_name__icontains=texto)
                | Q(username__icontains=texto)
            )
        return queryset

    @action(detail=False, methods=["get"], url_path="grupos")
    def grupos(self, request):
        groups = Group.objects.all().order_by("name")
        return Response(GroupSerializer(groups, many=True).data)


class FacturaViewSet(viewsets.ModelViewSet):
    permission_classes = [IsAuthenticated, DjangoModelPermissions, RoleActionPermission]
    queryset = Factura.objects.select_related("proveedor").prefetch_related("detalles").all().order_by(
        "-id"
    )
    pagination_class = DefaultPagination
    role_action_map = {
        "list": [ROLE_ENCARGADO, ROLE_GERENTE],
        "retrieve": [ROLE_ENCARGADO, ROLE_GERENTE],
        "create": [ROLE_ENCARGADO, ROLE_GERENTE],
        "update": [ROLE_ENCARGADO, ROLE_GERENTE],
        "partial_update": [ROLE_ENCARGADO, ROLE_GERENTE],
        "destroy": [ROLE_ENCARGADO, ROLE_GERENTE],
        "buscar_producto": [ROLE_ENCARGADO, ROLE_GERENTE],
        "crear_producto_rapido": [ROLE_ENCARGADO, ROLE_GERENTE],
        "check_exists": [ROLE_ENCARGADO, ROLE_GERENTE],
        "reconciliar_pedidos": [ROLE_ENCARGADO, ROLE_GERENTE],
    }

    def get_serializer_class(self):
        if self.action == "retrieve":
            return FacturaDetalleSerializer
        if self.action in ["create", "update", "partial_update"]:
            return FacturaUpsertSerializer
        return FacturaSerializer

    def get_queryset(self):
        queryset = super().get_queryset()
        texto = self.request.query_params.get("texto", "").strip()
        if texto:
            queryset = queryset.filter(proveedor__nombre__icontains=texto)
        return queryset

    def create(self, request, *args, **kwargs):
        numero_factura = request.data.get("numero_factura")
        proveedor_id = request.data.get("proveedor_id")
        if numero_factura is not None and proveedor_id is not None:
            existing = Factura.objects.filter(
                numero_factura=numero_factura, proveedor_id=proveedor_id
            ).first()
            if existing:
                out = FacturaDetalleSerializer(existing, context={"request": request})
                return Response({"existing": True, **out.data}, status=status.HTTP_200_OK)

        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        factura = serializer.save()
        out = FacturaDetalleSerializer(factura, context={"request": request})
        data = out.data
        data["coincidencias"] = self._coincidencias_factura(factura)
        return Response(data, status=status.HTTP_201_CREATED)

    def update(self, request, *args, **kwargs):
        factura = self.get_object()
        serializer = self.get_serializer(factura, data=request.data)
        serializer.is_valid(raise_exception=True)
        factura = serializer.save()
        out = FacturaDetalleSerializer(factura, context={"request": request})
        data = out.data
        data["coincidencias"] = self._coincidencias_factura(factura)
        return Response(data)

    def _coincidencias_factura(self, factura):
        """Detecta detalles de pedidos custom ya retirados que corresponden a los
        productos de esta factura (match por identidad). No descuenta nada."""
        coincidencias = []
        for df in factura.detalles.select_related("producto").all():
            producto = df.producto
            if producto is None:
                continue
            codigos = {c for c in (producto.codigo_producto, producto.codigo_proveedor) if c}
            query = Q(codigo_proveedor__in=codigos) if codigos else Q()
            if producto.oem:
                query = query | (Q(codigo_proveedor="") & Q(oem=producto.oem))
            if not query:
                continue
            candidatos = PedidoDetalle.objects.filter(
                query,
                producto__isnull=True,
                pedido__estado=Pedido.Estado.RETIRADO,
                pedido__stock_descontado=True,
                pedido__activo=True,
                pedido__es_cotizacion=False,
            ).select_related("pedido")
            for detalle in candidatos:
                if resolver_producto_por_identidad(detalle.codigo_proveedor, detalle.oem) != producto:
                    continue
                coincidencias.append({
                    "producto_id": producto.producto_id,
                    "producto_nombre": producto.nombre,
                    "pedido_detalle_id": detalle.id,
                    "pedido_id": detalle.pedido_id,
                    "cliente": detalle.pedido.nombre_cliente,
                    "codigo_proveedor": detalle.codigo_proveedor,
                    "oem": detalle.oem,
                    "fecha_retiro": detalle.pedido.fecha_retiro,
                })
        return coincidencias

    @action(detail=True, methods=["post"], url_path="reconciliar-pedidos")
    def reconciliar_pedidos(self, request, pk=None):
        factura = self.get_object()
        descontar_ids = request.data.get("descontar", [])
        if not isinstance(descontar_ids, list):
            return Response({"error": "Formato inválido"}, status=status.HTTP_400_BAD_REQUEST)

        productos_factura = set(factura.detalles.values_list("producto_id", flat=True))
        aplicados = []
        with transaction.atomic():
            for detalle_id in descontar_ids:
                try:
                    detalle = (
                        PedidoDetalle.objects.select_for_update()
                        .select_related("pedido")
                        .get(id=detalle_id)
                    )
                except PedidoDetalle.DoesNotExist:
                    continue
                if detalle.producto_id is not None:
                    continue
                pedido = detalle.pedido
                if (
                    pedido.estado != Pedido.Estado.RETIRADO
                    or not pedido.stock_descontado
                    or not pedido.activo
                    or pedido.es_cotizacion
                ):
                    continue
                producto = resolver_producto_por_identidad(
                    detalle.codigo_proveedor, detalle.oem
                )
                if producto is None or producto.producto_id not in productos_factura:
                    continue
                detalle.producto = producto
                detalle.save(update_fields=["producto"])
                descontar_stock_producto(producto)
                aplicados.append(detalle_id)
        return Response({"aplicados": aplicados})

    @action(detail=False, methods=["get"], url_path="check-exists")
    def check_exists(self, request):
        numero_factura = request.query_params.get("numero_factura")
        proveedor_id = request.query_params.get("proveedor_id")
        if not numero_factura or not proveedor_id:
            return Response({"exists": False})
        factura = Factura.objects.filter(
            numero_factura=numero_factura, proveedor_id=proveedor_id
        ).first()
        if factura:
            out = FacturaDetalleSerializer(factura, context={"request": request})
            return Response({"exists": True, **out.data})
        return Response({"exists": False})

    @action(detail=False, methods=["get"], url_path="buscar-producto")
    def buscar_producto(self, request):
        codigo_producto = request.query_params.get("codigo_producto", "").strip()
        if not codigo_producto:
            return Response({"encontrado": False})
        try:
            producto = Producto.objects.get(codigo_producto=codigo_producto)
        except Producto.DoesNotExist:
            return Response({"encontrado": False})

        proveedor_nombre = producto.proveedor.nombre if producto.proveedor else ""
        return Response(
            {
                "encontrado": True,
                "producto": {
                    "producto_id": producto.producto_id,
                    "codigo_producto": producto.codigo_producto,
                    "codigo_proveedor": producto.codigo_proveedor,
                    "oem": producto.oem,
                    "nombre": producto.nombre,
                    "marca": producto.marca,
                    "stock_actual": producto.stock_actual,
                    "precio_costo": producto.precio_costo,
                    "margen_utilidad": float(producto.margen_utilidad),
                    "precio_venta": producto.precio,
                    "proveedor": proveedor_nombre,
                },
            }
        )

    @action(detail=False, methods=["post"], url_path="crear-producto-rapido")
    def crear_producto_rapido(self, request):
        if not request.user.has_perm("vendedorApp.add_producto"):
            return Response({"detail": "No tiene permisos para crear productos."}, status=403)

        codigo_producto = str(request.data.get("codigo_producto", "")).strip()
        oem = str(request.data.get("oem", "")).strip()
        nombre = str(request.data.get("nombre", "")).strip()
        marca = str(request.data.get("marca", "")).strip()
        descripcion = str(request.data.get("descripcion", "")).strip() or nombre
        precio_costo = int(request.data.get("precio_costo", 0))
        stock_minimo = int(request.data.get("stock_minimo", 0))
        stock_maximo = int(request.data.get("stock_maximo", 0))
        margen_utilidad = float(request.data.get("margen_utilidad", StoreConfig.current().default_margin_percent))
        proveedor_id = request.data.get("proveedor_id")

        if not codigo_producto or not nombre or not precio_costo:
            return Response(
                {"ok": False, "error": "Complete código producto, nombre y precio costo"},
                status=400,
            )

        if Producto.objects.filter(codigo_producto=codigo_producto).exists():
            return Response(
                {"ok": False, "error": f"Ya existe un producto con código {codigo_producto}"},
                status=400,
            )

        try:
            proveedor = Proveedor.objects.get(pk=proveedor_id)
        except Proveedor.DoesNotExist:
            return Response({"ok": False, "error": "Proveedor no encontrado"}, status=400)

        producto = Producto.objects.create(
            codigo_producto=codigo_producto,
            oem=oem,
            nombre=nombre,
            marca=marca,
            descripcion=descripcion,
            precio_costo=precio_costo,
            stock_minimo=stock_minimo,
            stock_maximo=stock_maximo,
            margen_utilidad=margen_utilidad,
            proveedor=proveedor,
        )

        return Response(
            {
                "ok": True,
                "producto": {
                    "producto_id": producto.producto_id,
                    "codigo_producto": producto.codigo_producto,
                    "oem": producto.oem,
                    "nombre": producto.nombre,
                    "marca": producto.marca,
                    "stock_actual": producto.stock_actual,
                    "precio_costo": producto.precio_costo,
                    "precio_venta": producto.precio,
                },
            }
        )


class UbicacionViewSet(viewsets.ModelViewSet):
    serializer_class = UbicacionSerializer
    permission_classes = [IsAuthenticated, DjangoModelPermissions, RoleActionPermission]
    queryset = Ubicacion.objects.all().order_by("nombre")
    pagination_class = DefaultPagination
    role_action_map = {
        "list": [ROLE_ENCARGADO, ROLE_GERENTE, ROLE_BODEGUERO],
        "retrieve": [ROLE_ENCARGADO, ROLE_GERENTE, ROLE_BODEGUERO],
        "create": [ROLE_ENCARGADO, ROLE_GERENTE, ROLE_BODEGUERO],
        "update": [ROLE_ENCARGADO, ROLE_GERENTE, ROLE_BODEGUERO],
        "partial_update": [ROLE_ENCARGADO, ROLE_GERENTE, ROLE_BODEGUERO],
        "destroy": [ROLE_ENCARGADO, ROLE_GERENTE, ROLE_BODEGUERO],
    }

    def destroy(self, request, *args, **kwargs):
        ubicacion = self.get_object()
        with transaction.atomic():
            filas = StockProductoUbicacion.objects.select_for_update().filter(ubicacion=ubicacion)
            for fila in filas:
                sin_ubicacion, _ = StockProductoUbicacion.objects.select_for_update().get_or_create(
                    producto=fila.producto,
                    ubicacion=None,
                    defaults={"cantidad": 0},
                )
                sin_ubicacion.cantidad += fila.cantidad
                sin_ubicacion.save(update_fields=["cantidad"])
            filas.delete()
        return super().destroy(request, *args, **kwargs)


class StoreConfigViewSet(viewsets.ModelViewSet):
    serializer_class = StoreConfigSerializer
    permission_classes = [IsAuthenticated, DjangoModelPermissions, RoleActionPermission]
    pagination_class = None
    role_action_map = {
        "create": [ROLE_ENCARGADO, ROLE_GERENTE],
        "update": [ROLE_ENCARGADO, ROLE_GERENTE],
        "partial_update": [ROLE_ENCARGADO, ROLE_GERENTE],
        "destroy": [ROLE_ENCARGADO, ROLE_GERENTE],
        "*": [ROLE_VENDEDOR, ROLE_ENCARGADO, ROLE_GERENTE, ROLE_BODEGUERO],
    }

    def get_queryset(self):
        StoreConfig.current()
        return StoreConfig.objects.all()[:1]

    def get_object(self):
        return StoreConfig.current()
