from django.contrib.auth.models import Group, User
from django.db.models import Q
from rest_framework import status, viewsets
from rest_framework.decorators import action
from rest_framework.permissions import DjangoModelPermissions, IsAuthenticated
from rest_framework.response import Response

from gerenteApp.models import Factura, Proveedor, Tax
from gerenteApp.serializers import (
    FacturaDetalleSerializer,
    FacturaSerializer,
    FacturaUpsertSerializer,
    GroupSerializer,
    ProveedorSerializer,
    UserSerializer,
)
from vendedorApp.pagination import DefaultPagination
from vendedorApp.models import Producto, Ubicacion
from vendedorApp.serializers import UbicacionSerializer
from bazpos.permissions import ROLE_BODEGUERO, ROLE_ENCARGADO, ROLE_GERENTE, RoleActionPermission


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
        "impuesto": [ROLE_ENCARGADO, ROLE_GERENTE],
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
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        factura = serializer.save()
        out = FacturaDetalleSerializer(factura, context={"request": request})
        return Response(out.data, status=status.HTTP_201_CREATED)

    def update(self, request, *args, **kwargs):
        factura = self.get_object()
        serializer = self.get_serializer(factura, data=request.data)
        serializer.is_valid(raise_exception=True)
        factura = serializer.save()
        out = FacturaDetalleSerializer(factura, context={"request": request})
        return Response(out.data)

    @action(detail=False, methods=["get"], url_path="buscar-producto")
    def buscar_producto(self, request):
        codigo_producto = request.query_params.get("codigo_producto", "").strip()
        if not codigo_producto:
            return Response({"encontrado": False})
        try:
            producto = Producto.objects.get(codigo_producto=codigo_producto)
        except Producto.DoesNotExist:
            return Response({"encontrado": False})

        return Response(
            {
                "encontrado": True,
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

    @action(detail=False, methods=["get"], url_path="impuesto")
    def impuesto(self, request):
        return Response({"tax_percent": float(Tax.current_percent())})

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
        margen_utilidad = float(request.data.get("margen_utilidad", 30))
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
