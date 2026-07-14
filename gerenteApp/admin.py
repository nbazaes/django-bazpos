from django.contrib import admin
from gerenteApp.models import Proveedor, Factura, DetalleFactura, PrecioHistorico, Tax


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


class DetalleFacturaInline(admin.TabularInline):
    model = DetalleFactura
    extra = 0
    fields = ('producto', 'cantidad', 'costo_compra')

    def has_add_permission(self, request, obj=None):
        return request.user.is_active and request.user.is_superuser

    def has_change_permission(self, request, obj=None):
        return request.user.is_active and request.user.is_superuser

    def has_delete_permission(self, request, obj=None):
        return request.user.is_active and request.user.is_superuser


@admin.register(Proveedor)
class ProveedorAdmin(SuperuserOnlyAdmin):
    list_display = ('proveedor_id', 'rut', 'nombre', 'persona_contacto', 'telefono', 'correo', 'fecha_creacion')
    search_fields = ('rut', 'nombre')


@admin.register(Factura)
class FacturaAdmin(SuperuserOnlyAdmin):
    list_display = ('id', 'numero_factura', 'proveedor', 'fecha', 'monto_total')
    list_filter = ('fecha', 'proveedor')
    search_fields = ('id', 'numero_factura',)
    inlines = [DetalleFacturaInline]


@admin.register(PrecioHistorico)
class PrecioHistoricoAdmin(SuperuserOnlyAdmin):
    list_display = ('producto', 'fecha', 'precio_costo_anterior', 'precio_costo_nuevo', 'precio_venta_anterior', 'precio_venta_nuevo')
    list_filter = ('fecha',)
    readonly_fields = ('producto', 'precio_costo_anterior', 'precio_costo_nuevo', 'precio_venta_anterior', 'precio_venta_nuevo', 'fecha', 'factura')


@admin.register(Tax)
class TaxAdmin(SuperuserOnlyAdmin):
    list_display = ("id", "tax_percent")
