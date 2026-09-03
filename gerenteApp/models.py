from django.db import models
from django.utils import timezone
from datetime import timedelta

# Create your models here.
class Proveedor(models.Model):
    proveedor_id = models.AutoField(primary_key=True, verbose_name='proveedor_id')
    rut = models.CharField(max_length=10, unique=True)  
    nombre = models.CharField(max_length=100)
    persona_contacto = models.CharField(max_length=100, null=True)
    telefono = models.CharField(max_length=20, null=True)
    correo = models.CharField(max_length=100, null=True)
    direccion = models.TextField(null=True)
    fecha_creacion = models.DateTimeField(default=timezone.now)

    class Meta:
        db_table = 'proveedores'

    def __str__(self):
        return f'{self.nombre}'
    

def fecha_ayer():
    return timezone.now().date() - timedelta(days=1)


class Factura(models.Model):
    id = models.AutoField(primary_key=True)
    numero_factura = models.BigIntegerField(verbose_name='Número de factura')
    proveedor = models.ForeignKey(Proveedor, on_delete=models.CASCADE)
    fecha = models.DateField(default=fecha_ayer, verbose_name='Fecha', db_index=True)
    monto_total = models.IntegerField(default=0)

    class Meta:
        db_table = 'facturas'

    def __str__(self):
        return f'Factura {self.numero_factura} - {self.proveedor.nombre}'

class DetalleFactura(models.Model):
    factura = models.ForeignKey(Factura, on_delete=models.CASCADE, related_name='detalles')
    producto = models.ForeignKey('vendedorApp.Producto', on_delete=models.CASCADE)
    cantidad = models.IntegerField()
    costo_compra = models.IntegerField()

    class Meta:
        db_table = 'detalle_facturas'
        indexes = [
            models.Index(fields=['producto', 'factura']),
        ]

    def __str__(self):
        return f'Detalle Factura {self.factura.numero_factura} - Producto {self.producto.nombre}'


class PrecioHistorico(models.Model):
    producto = models.ForeignKey('vendedorApp.Producto', on_delete=models.CASCADE, related_name='precios_historicos')
    precio_costo_anterior = models.IntegerField()
    precio_costo_nuevo = models.IntegerField()
    precio_venta_anterior = models.IntegerField(null=True, blank=True)
    precio_venta_nuevo = models.IntegerField(null=True, blank=True)
    fecha = models.DateTimeField(default=timezone.now)
    factura = models.ForeignKey(Factura, on_delete=models.SET_NULL, null=True, blank=True)

    class Meta:
        db_table = 'precios_historicos'
        ordering = ['-fecha']
        indexes = [
            models.Index(fields=['producto', '-fecha'], name='precio_hist_prod_fecha_idx'),
        ]

    def __str__(self):
        return f'{self.producto.nombre} - {self.fecha.strftime("%d/%m/%Y")}'


class StoreConfig(models.Model):
    nombre = models.CharField(max_length=100, blank=True, default="")
    telefono = models.CharField(max_length=20, blank=True, default="")
    direccion = models.TextField(blank=True, default="")
    tax_percent = models.DecimalField(max_digits=5, decimal_places=2, default=19)
    timezone = models.CharField(max_length=100, blank=True, default="America/Santiago")
    currency_code = models.CharField(max_length=3, blank=True, default="CLP")
    locale = models.CharField(max_length=20, blank=True, default="es-CL")
    price_round_to = models.IntegerField(default=100)
    total_round_to = models.IntegerField(default=1000)
    total_round_threshold = models.IntegerField(default=900)
    default_shipping_cost = models.IntegerField(default=4500)
    default_margin_percent = models.DecimalField(max_digits=5, decimal_places=2, default=30)
    feature_flags = models.JSONField(default=dict, blank=True)
    payment_methods = models.JSONField(default=list, blank=True)
    document_types = models.JSONField(default=list, blank=True)
    ubicacion_por_defecto = models.ForeignKey(
        "vendedorApp.Ubicacion",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        default=None,
    )

    class Meta:
        db_table = "store_config"

    def __str__(self):
        return "Configuración de la tienda"

    @classmethod
    def current(cls):
        config = cls.objects.order_by("id").first()
        if not config:
            config = cls.objects.create()
        return config

    @classmethod
    def current_percent(cls):
        return cls.current().tax_percent

    @classmethod
    def apply_to_amount(cls, amount):
        from .pricing import apply_tax

        return apply_tax(amount)

    # ── Payment methods & document types (configurable lists) ──

    DEFAULT_PAYMENT_METHODS = [
        {"code": "EF", "label": "Efectivo", "active": True},
        {"code": "TJ", "label": "Tarjeta", "active": True},
        {"code": "TR", "label": "Transferencia", "active": True},
        {"code": "CH", "label": "Cheque", "active": True},
    ]

    DEFAULT_DOCUMENT_TYPES = [
        {"code": "BO", "label": "Boleta", "active": True},
        {"code": "FA", "label": "Factura", "active": True},
        {"code": "OT", "label": "Otros", "active": True},
    ]

    def payment_methods_list(self):
        return self.payment_methods or self.DEFAULT_PAYMENT_METHODS

    def active_payment_methods(self):
        return [m for m in self.payment_methods_list() if m.get("active", True)]

    def document_types_list(self):
        return self.document_types or self.DEFAULT_DOCUMENT_TYPES

    def active_document_types(self):
        return [d for d in self.document_types_list() if d.get("active", True)]

    @classmethod
    def current_payment_methods(cls):
        return cls.current().active_payment_methods()

    @classmethod
    def current_document_types(cls):
        return cls.current().active_document_types()
