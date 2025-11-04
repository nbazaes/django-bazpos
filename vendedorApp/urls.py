from django.urls import path
from .views import ver_pedido, ventas, datos_api, listar_inventario, validar_stock, registrar_venta, listarProductos, editarProducto, crearProducto, eliminarProducto

urlpatterns = [
    path("pedidos/", ver_pedido, name="pedidos"),
    path("ventas/", ventas, name="ventas"),
    path("inventario/", listar_inventario, name="inventario"),
    path("api/data/", datos_api, name="datos_api"),
    path('validar-stock/', validar_stock, name='validar_stock'),
    path('registrar/', registrar_venta, name='registrar_venta'),
    path("productos/crearproducto/", crearProducto, name="crearproducto"),
    path("productos/editarproducto/<int:id>", editarProducto, name="editarproducto"),
    path("productos/eliminarproducto/<int:id>", eliminarProducto, name="eliminarproducto"),
    path("productos/productos/", listarProductos, name="listarProductos")
]
