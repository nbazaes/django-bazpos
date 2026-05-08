from django.db import models
from django.db.models import Sum, Value
from django.db.models.functions import Coalesce
from decimal import Decimal
from django.contrib.auth.models import User
from django.utils import timezone
from gerenteApp.models import Proveedor


class Ubicacion(models.Model):
    nombre = models.CharField(max_length=100, unique=True)
    marca = models.CharField(max_length=100, blank=True, default="")
    descripcion = models.TextField(blank=True, default="")

    class Meta:
        db_table = "ubicaciones"

    def __str__(self):
        return self.nombre


class StockProductoUbicacion(models.Model):
    producto = models.ForeignKey("Producto", on_delete=models.CASCADE, related_name="stocks_ubicacion")
    ubicacion = models.ForeignKey(Ubicacion, on_delete=models.CASCADE)
    cantidad = models.IntegerField(default=0)

    class Meta:
        db_table = "stock_producto_ubicacion"
        unique_together = ("producto", "ubicacion")

    def __str__(self):
        return f"{self.producto.nombre} en {self.ubicacion.nombre}: {self.cantidad}"


class ProductoQuerySet(models.QuerySet):
    def with_stock_actual(self):
        return self.annotate(
            stock_actual=Coalesce(Sum("stocks_ubicacion__cantidad"), Value(0))
        )


class ProductoManager(models.Manager):
    def get_queryset(self):
        return ProductoQuerySet(self.model, using=self._db).with_stock_actual()


class Producto(models.Model):
    producto_id = models.AutoField(primary_key=True, verbose_name='producto_id')
    nombre = models.CharField(max_length=100)
    codigo_producto = models.CharField(max_length=50, unique=True)
    oem = models.CharField(max_length=50)
    marca = models.CharField(max_length=100, blank=True, default='')
    descripcion = models.TextField()
    precio = models.IntegerField(blank=True, null=True)
    precio_costo = models.IntegerField()
    stock_minimo = models.IntegerField()
    stock_maximo = models.IntegerField()
    margen_utilidad = models.DecimalField(max_digits=5, decimal_places=2)
    proveedor = models.ForeignKey(Proveedor, on_delete=models.CASCADE)

    objects = ProductoManager()

    class Meta:
        db_table = 'productos'

    def __str__(self):
        return f'{self.nombre}'

    @property
    def stock_actual(self):
        if 'stock_actual' in self.__dict__:
            return self.__dict__['stock_actual']
        if not self.pk:
            return 0
        return self.stocks_ubicacion.aggregate(
            total=Coalesce(Sum('cantidad'), Value(0))
        )['total']

    @stock_actual.setter
    def stock_actual(self, value):
        self.__dict__['stock_actual'] = value

    def save(self, *args, **kwargs):
        if self.precio_costo and self.margen_utilidad: 
            precio_costo_decimal = Decimal(self.precio_costo) 
            margen_utilidad_decimal = Decimal(self.margen_utilidad) / Decimal(100) 
            margen_total = precio_costo_decimal * (Decimal(1) + margen_utilidad_decimal) 
            self.precio = int(margen_total * Decimal(1.19))
        super(Producto, self).save(*args, **kwargs)

class Venta(models.Model):
    usuario = models.ForeignKey(User, on_delete=models.CASCADE)
    fecha_venta = models.DateTimeField(default=timezone.now)
    monto_total = models.IntegerField()
    class TipoDocumento(models.TextChoices):
        VENTA = 'VE', 'Venta'
        COTIZACION = 'CO', 'Cotizacion'

    class Estado(models.TextChoices):
        PENDIENTE = 'PE', 'Pendiente'
        COMPLETADA = 'CO', 'Completada'
        CANCELADA = 'CA', 'Cancelada'
    
    estado = models.CharField(
        max_length=2, 
        choices=Estado.choices, 
        default=Estado.PENDIENTE
    )
    tipo_documento = models.CharField(
        max_length=2,
        choices=TipoDocumento.choices,
        default=TipoDocumento.VENTA,
    )

    class Meta:
        db_table = 'ventas'

    def __str__(self):
        return f'{self.fecha_venta}'

class DetalleVenta(models.Model):
    venta = models.ForeignKey(Venta, on_delete=models.CASCADE)
    producto = models.ForeignKey(Producto, on_delete=models.CASCADE)
    cantidad = models.IntegerField()
    precio_unitario = models.IntegerField()
    subtotal = models.IntegerField()

    class Meta:
        db_table = 'detalle_ventas'

    def __str__(self):
        return f'{self.producto.nombre}'
