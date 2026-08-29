from django.db.models import Q
from rest_framework import viewsets
from rest_framework.decorators import action
from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from rest_framework.throttling import ScopedRateThrottle

from vendedorApp.models import Producto
from vendedorApp.pagination import DefaultPagination
from vendedorApp.serializers import CatalogoProductoSerializer


class CatalogoPublicoViewSet(viewsets.ReadOnlyModelViewSet):
    serializer_class = CatalogoProductoSerializer
    permission_classes = [AllowAny]
    throttle_classes = [ScopedRateThrottle]
    throttle_scope = "publico"
    pagination_class = DefaultPagination
    queryset = Producto.objects.select_related("proveedor").prefetch_related(
        "stocks_ubicacion__ubicacion"
    ).all().order_by("producto_id")

    def get_queryset(self):
        queryset = super().get_queryset()
        texto = self.request.query_params.get("texto", "").strip()
        marca = self.request.query_params.get("marca", "").strip()
        oem = self.request.query_params.get("oem", "").strip()
        con_stock = self.request.query_params.get("con_stock", "").strip()

        if texto:
            queryset = queryset.filter(
                Q(nombre__icontains=texto)
                | Q(descripcion__icontains=texto)
                | Q(marca__icontains=texto)
                | Q(oem__icontains=texto)
                | Q(oem_alternativo__icontains=texto)
                | Q(codigo_producto__icontains=texto)
                | Q(codigo_proveedor__icontains=texto)
            )
        if marca:
            queryset = queryset.filter(marca__iexact=marca)
        if oem:
            queryset = queryset.filter(oem__iexact=oem)
        if con_stock.lower() == "true":
            queryset = queryset.filter(stock_actual__gt=0)
        return queryset

    @action(detail=False, methods=["get"], url_path="marcas")
    def marcas(self, request):
        marcas = (
            Producto.objects.exclude(marca="")
            .values_list("marca", flat=True)
            .distinct()
            .order_by("marca")
        )
        return Response({"marcas": list(marcas)})

    @action(detail=False, methods=["get"], url_path="oems")
    def oems(self, request):
        oems = (
            Producto.objects.exclude(oem="")
            .values_list("oem", flat=True)
            .distinct()
            .order_by("oem")
        )
        return Response({"oems": list(oems)})