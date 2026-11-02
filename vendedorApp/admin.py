from bazpos.admin_site import inline, register_models
from . import models

register_models(models, {
    'Producto': {
        'readonly_fields': ('stock_actual',),
        'search_fields': ('nombre', 'codigo_producto', 'oem', 'marca'),
        'list_display': ('producto_id', 'nombre', 'codigo_producto', 'marca', 'precio_costo', 'precio', 'stock_actual', 'proveedor'),
        'list_filter': ('marca', 'proveedor'),
        'inlines': [inline(models.StockProductoUbicacion, fields=('ubicacion', 'cantidad'))],
        'fieldsets': (
            ('Identificación', {'fields': ('producto_id', 'nombre', 'codigo_producto', 'marca', 'proveedor', 'oem', 'oem_alternativo', 'codigo_proveedor', 'descripcion')}),
            ('Precios', {'fields': ('precio_costo', 'margen_utilidad', 'precio'), 'description': 'El precio ingresado se conserva como corrección directa.'}),
            ('Inventario y recordatorios', {'fields': ('stock_actual', 'stock_minimo', 'stock_maximo', 'ignorar_stock_permanente', 'recordar_stock_desde')}),
        ),
    },
    'Venta': {'list_display': ('id', 'usuario', 'fecha_venta', 'monto_total', 'estado', 'tipo_documento'), 'inlines': [inline(models.DetalleVenta), inline(models.PagoVenta)], 'list_filter': ('estado', 'tipo_documento', 'fecha_venta')},
    'Devolucion': {'list_display': ('id', 'venta', 'usuario', 'fecha_devolucion', 'monto_devuelto'), 'inlines': [inline(models.DetalleDevolucion)]},
    'Pedido': {'list_display': ('id', 'nombre_cliente', 'fecha_creacion', 'estado', 'monto_total', 'activo'), 'inlines': [inline(models.PedidoDetalle)], 'list_filter': ('estado', 'activo', 'es_cotizacion')},
    'PedidoProveedorDia': {'inlines': [inline(models.ItemPedidoProveedor)]},
    'AjusteStock': {'list_display': ('id', 'producto', 'ubicacion', 'cantidad_anterior', 'cantidad_nueva', 'usuario', 'fecha_ajuste'), 'list_filter': ('fecha_ajuste', 'ubicacion')},
    'StockHistorico': {'list_display': ('id', 'stock', 'cantidad', 'fecha'), 'list_filter': ('fecha',), 'list_select_related': ('stock__producto', 'stock__ubicacion')},
    'StockProductoUbicacion': {'list_select_related': ('producto', 'ubicacion')},
    'DetalleDevolucion': {'list_select_related': ('producto', 'devolucion', 'pedido_detalle')},
    'CierreCaja': {'list_display': ('id', 'fecha', 'usuario', 'total_final', 'cantidad_ventas', 'created_at'), 'list_filter': ('fecha',)},
})
