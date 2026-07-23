from django.db.models.signals import post_save, pre_save
from django.dispatch import receiver

from .models import Producto, StockProductoUbicacion


@receiver(pre_save, sender=StockProductoUbicacion)
def capturar_cantidad_anterior(sender, instance, **kwargs):
    """Guarda la cantidad previa de esta ubicación para comparar en post_save."""
    if instance.pk:
        try:
            anterior = StockProductoUbicacion.objects.get(pk=instance.pk)
            instance._cantidad_anterior = anterior.cantidad
        except StockProductoUbicacion.DoesNotExist:
            instance._cantidad_anterior = 0
    else:
        instance._cantidad_anterior = 0


@receiver(post_save, sender=StockProductoUbicacion)
def resetear_ignorar_stock(sender, instance, created, **kwargs):
    """Si un producto marcado como ignorado recibe stock, vuelve a ser recordatorio."""
    cantidad_anterior = getattr(instance, "_cantidad_anterior", 0)
    cantidad_actual = instance.cantidad

    if cantidad_actual <= cantidad_anterior:
        return

    producto = instance.producto
    if producto.ignorar_stock_permanente or producto.recordar_stock_desde:
        producto.ignorar_stock_permanente = False
        producto.recordar_stock_desde = None
        producto.save(update_fields=["ignorar_stock_permanente", "recordar_stock_desde"])
