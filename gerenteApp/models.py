from django.conf import settings
from django.core.validators import MinValueValidator, MaxValueValidator
from django.db import models
from django.utils import timezone
from datetime import timedelta
import uuid

# Create your models here.
class Proveedor(models.Model):
    proveedor_id = models.AutoField(primary_key=True, verbose_name='proveedor_id')
    tax_id = models.CharField(max_length=20, null=True, blank=True, unique=True, verbose_name='ID tributario')  
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
    product_search_fields = models.JSONField(default=list, blank=True)
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

    DEFAULT_PRODUCT_SEARCH_FIELDS = [
        "codigo_producto",
        "nombre",
        "oem",
        "oem_alternativo",
        "codigo_proveedor",
        "marca",
    ]

    def payment_methods_list(self):
        return self.payment_methods or self.DEFAULT_PAYMENT_METHODS

    def active_payment_methods(self):
        return [m for m in self.payment_methods_list() if m.get("active", True)]

    def document_types_list(self):
        return self.document_types or self.DEFAULT_DOCUMENT_TYPES

    def active_document_types(self):
        return [d for d in self.document_types_list() if d.get("active", True)]

    def effective_product_search_fields(self):
        return self.product_search_fields or self.DEFAULT_PRODUCT_SEARCH_FIELDS

    @classmethod
    def current_payment_methods(cls):
        return cls.current().active_payment_methods()

    @classmethod
    def current_document_types(cls):
        return cls.current().active_document_types()


class PoliticaDescuentoUsuario(models.Model):
    usuario = models.OneToOneField(
        settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="politica_descuento"
    )
    descuento_maximo_porcentaje = models.PositiveSmallIntegerField(
        default=0, validators=[MinValueValidator(0), MaxValueValidator(100)]
    )

    class Meta:
        constraints = [
            models.CheckConstraint(
                condition=models.Q(descuento_maximo_porcentaje__gte=0, descuento_maximo_porcentaje__lte=100),
                name="descuento_usuario_entre_0_y_100",
            )
        ]

    @classmethod
    def maximo_efectivo(cls, usuario):
        from bazpos.permissions import has_any_role, ROLE_ENCARGADO, ROLE_GERENTE

        if has_any_role(usuario, [ROLE_ENCARGADO, ROLE_GERENTE]):
            return 100
        return cls.objects.filter(usuario=usuario).values_list(
            "descuento_maximo_porcentaje", flat=True
        ).first() or 0


class FacturaBorrador(models.Model):
    """Private, incomplete input; never participates in stock or accounting."""
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    usuario = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE)
    datos = models.JSONField(default=dict)
    ocr = models.JSONField(default=dict)
    revision = models.PositiveIntegerField(default=1)
    actualizado = models.DateTimeField(auto_now=True)
    creado = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['-actualizado']


class FacturaBorradorDocumento(models.Model):
    borrador = models.ForeignKey(FacturaBorrador, on_delete=models.CASCADE, related_name='documentos')
    nombre = models.CharField(max_length=200)
    mime = models.CharField(max_length=30)
    paginas = models.PositiveSmallIntegerField()
    tamano = models.PositiveIntegerField()
    # Database storage is private, transactionally cleaned up and covered by DB backups.
    contenido = models.BinaryField()

    class Meta:
        ordering = ['id']


class FacturaBorradorConfirmacion(models.Model):
    """Minimal idempotency receipt; no document or draft payload is retained."""
    id = models.UUIDField(primary_key=True)
    usuario = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE)
    factura = models.ForeignKey(Factura, null=True, on_delete=models.SET_NULL)
