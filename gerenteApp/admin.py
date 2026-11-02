from bazpos.admin_site import inline, register_models
from . import models

register_models(models, {
    'Factura': {'inlines': [inline(models.DetalleFactura)], 'list_filter': ('fecha', 'proveedor')},
    'PrecioHistorico': {'list_display': ('id', 'producto', 'fecha', 'precio_costo_anterior', 'precio_costo_nuevo', 'precio_venta_anterior', 'precio_venta_nuevo'), 'list_filter': ('fecha',)},
    'StoreConfig': {'fieldsets': (
        ('Identidad', {'fields': ('id', 'nombre', 'locale', 'telefono', 'direccion'), 'description': 'Nombre y locale se sincronizan desde el entorno al reiniciar el servicio.'}),
        ('Precios y preferencias', {'fields': ('tax_percent', 'timezone', 'currency_code', 'price_round_to', 'total_round_to', 'total_round_threshold', 'default_shipping_cost', 'default_margin_percent', 'ubicacion_por_defecto')}),
        ('Configuración estructurada', {'fields': ('feature_flags', 'payment_methods', 'document_types', 'product_search_fields')}),
    )},
})
