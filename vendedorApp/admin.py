from django.contrib import admin
from vendedorApp.models import Ubicacion, Producto, StockProductoUbicacion, Venta, DetalleVenta


class SuperuserOnlyAdmin(admin.ModelAdmin):
    def has_module_permission(self, request):
        return request.user.is_active and request.user.is_superuser

    def has_view_permission(self, request, obj=None):
        return request.user.is_active and request.user.is_superuser

    def has_add_permission(self, request):
        return request.user.is_active and request.user.is_superuser

    def has_change_permission(self, request, obj=None):
        return request.user.is_active and request.user.is_superuser

    def has_delete_permission(self, request, obj=None):
        return request.user.is_active and request.user.is_superuser


class StockProductoUbicacionInline(admin.TabularInline):
    model = StockProductoUbicacion
    extra = 0
    fields = ('ubicacion', 'cantidad')

    def has_add_permission(self, request, obj=None):
        return request.user.is_active and request.user.is_superuser

    def has_change_permission(self, request, obj=None):
        return request.user.is_active and request.user.is_superuser

    def has_delete_permission(self, request, obj=None):
        return request.user.is_active and request.user.is_superuser


class DetalleVentaInline(admin.TabularInline):
    model = DetalleVenta
    extra = 0
    fields = ('producto', 'cantidad', 'precio_unitario', 'subtotal')

    def has_add_permission(self, request, obj=None):
        return request.user.is_active and request.user.is_superuser

    def has_change_permission(self, request, obj=None):
        return request.user.is_active and request.user.is_superuser

    def has_delete_permission(self, request, obj=None):
        return request.user.is_active and request.user.is_superuser


@admin.register(Ubicacion)
class UbicacionAdmin(SuperuserOnlyAdmin):
    list_display = ('id', 'nombre', 'marca')
    search_fields = ('nombre',)


@admin.register(Producto)
class ProductoAdmin(SuperuserOnlyAdmin):
    list_display = ('producto_id', 'nombre', 'codigo_producto', 'marca', 'precio_costo', 'precio', 'stock_minimo', 'stock_maximo', 'proveedor')
    search_fields = ('nombre', 'codigo_producto')
    list_filter = ('proveedor', 'marca')
    inlines = [StockProductoUbicacionInline]


@admin.register(Venta)
class VentaAdmin(SuperuserOnlyAdmin):
    list_display = ('id', 'usuario', 'fecha_venta', 'monto_total', 'estado', 'tipo_documento')
    list_filter = ('estado', 'tipo_documento', 'fecha_venta')
    inlines = [DetalleVentaInline]
