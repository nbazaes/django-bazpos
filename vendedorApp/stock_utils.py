from gerenteApp.models import StoreConfig
from vendedorApp.models import Producto, StockProductoUbicacion, Ubicacion


def resolver_producto_por_identidad(codigo, oem):
    """Resuelve el Producto a partir del código del ítem.

    Precedencia: codigo_producto -> codigo_proveedor (usando el código del ítem).
    Solo si el código está vacío se intenta por OEM. Nunca por nombre, porque el
    nombre puede pertenecer a otro producto al copiar un caso existente.
    """
    codigo = (codigo or "").strip()
    oem = (oem or "").strip()

    if codigo:
        producto = Producto.objects.filter(codigo_producto=codigo).first()
        if producto:
            return producto
        producto = Producto.objects.filter(codigo_proveedor=codigo).first()
        if producto:
            return producto
        return None

    if oem:
        return Producto.objects.filter(oem=oem).first()

    return None


def _ubicacion_por_defecto():
    ubicacion = StoreConfig.current().ubicacion_por_defecto
    if ubicacion:
        return ubicacion
    return Ubicacion.objects.first()


def descontar_stock_producto(producto, cantidad=1):
    """Descuenta `cantidad` unidades del stock del producto.

    Consume primero los stocks con más cantidad. Si no alcanza, deja el resto en
    negativo en la ubicación por defecto (stock comprometido pendiente de llegada).
    Debe ejecutarse dentro de una transacción (usa select_for_update).
    """
    restante = cantidad
    stocks = StockProductoUbicacion.objects.select_for_update().filter(
        producto=producto, cantidad__gt=0
    ).order_by("-cantidad")

    for stock in stocks:
        if restante <= 0:
            break
        disponible = min(stock.cantidad, restante)
        stock.cantidad -= disponible
        stock.save()
        restante -= disponible

    if restante > 0:
        ubicacion = _ubicacion_por_defecto()
        stock, _ = StockProductoUbicacion.objects.select_for_update().get_or_create(
            producto=producto,
            ubicacion=ubicacion,
            defaults={"cantidad": 0},
        )
        stock.cantidad -= restante
        stock.save()

    return restante