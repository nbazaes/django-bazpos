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


def fecha_hoy():
    return timezone.now().date()


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
    ignorar_stock_permanente = models.BooleanField(default=False)
    recordar_stock_desde = models.DateTimeField(null=True, blank=True)

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
            precio_calculado = int(margen_total * Decimal(1.19))
            self.precio = ((precio_calculado + 99) // 100) * 100
        super(Producto, self).save(*args, **kwargs)

class Venta(models.Model):
    usuario = models.ForeignKey(User, on_delete=models.CASCADE)
    fecha_venta = models.DateTimeField(default=timezone.now)
    monto_total = models.IntegerField()
    monto_subtotal = models.IntegerField(default=0)
    descuento_porcentaje = models.IntegerField(default=0)

    class TipoDocumento(models.TextChoices):
        VENTA = 'VE', 'Venta'
        COTIZACION = 'CO', 'Cotizacion'
        PEDIDO = 'PE', 'Pedido'

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


class Anulacion(models.Model):
    venta = models.OneToOneField(Venta, on_delete=models.CASCADE, related_name='anulacion')
    usuario = models.ForeignKey(User, on_delete=models.PROTECT)
    motivo = models.TextField()
    fecha_anulacion = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = 'anulaciones'

    def __str__(self):
        return f'Anulación venta #{self.venta_id}'


class Devolucion(models.Model):
    venta = models.ForeignKey(Venta, on_delete=models.CASCADE, related_name='devoluciones')
    usuario = models.ForeignKey(User, on_delete=models.PROTECT)
    motivo = models.TextField()
    fecha_devolucion = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = 'devoluciones'

    def __str__(self):
        return f'Devolución venta #{self.venta_id}'


class DetalleDevolucion(models.Model):
    devolucion = models.ForeignKey(Devolucion, on_delete=models.CASCADE, related_name='detalles')
    producto = models.ForeignKey(Producto, on_delete=models.PROTECT)
    cantidad = models.PositiveIntegerField()
    reponer_stock = models.BooleanField(default=True)

    class Meta:
        db_table = 'detalle_devoluciones'

    def __str__(self):
        return f'{self.producto.nombre} x{self.cantidad}'


class AjusteStock(models.Model):
    producto = models.ForeignKey(Producto, on_delete=models.CASCADE, related_name="ajustes_stock")
    ubicacion = models.ForeignKey(Ubicacion, on_delete=models.CASCADE)
    usuario = models.ForeignKey(User, on_delete=models.PROTECT)
    cantidad_anterior = models.IntegerField()
    cantidad_nueva = models.IntegerField()
    motivo = models.TextField()
    fecha_ajuste = models.DateField(default=fecha_hoy)

    class Meta:
        db_table = "ajustes_stock"
        ordering = ["-fecha_ajuste", "-id"]

    def __str__(self):
        return f"Ajuste {self.producto.nombre} en {self.ubicacion.nombre}: {self.cantidad_anterior} → {self.cantidad_nueva}"


class Pedido(models.Model):
    usuario = models.ForeignKey(User, on_delete=models.CASCADE)
    nombre_cliente = models.CharField(max_length=200)
    telefono_cliente = models.CharField(max_length=50)
    monto_subtotal = models.IntegerField()
    monto_total = models.IntegerField()
    costo_envio = models.IntegerField(default=4500)
    metodo_pago = models.CharField(
        max_length=2,
        choices=[("EF", "Efectivo"), ("TJ", "Tarjeta")],
        default="EF",
    )
    facturado = models.BooleanField(default=False)
    venta = models.ForeignKey(
        Venta,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="pedido",
    )
    fecha_creacion = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = "pedidos"
        ordering = ["-fecha_creacion", "-id"]

    def __str__(self):
        return f"Pedido #{self.id} — {self.nombre_cliente}"


class PedidoDetalle(models.Model):
    pedido = models.ForeignKey(Pedido, on_delete=models.CASCADE, related_name="detalles")
    producto = models.ForeignKey(
        Producto,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
    )
    codigo_proveedor = models.CharField(max_length=50)
    proveedor = models.ForeignKey(Proveedor, on_delete=models.CASCADE)
    oem = models.CharField(max_length=50)
    nombre = models.CharField(max_length=200)
    precio_costo = models.IntegerField()
    porcentaje_utilidad = models.DecimalField(max_digits=5, decimal_places=2)
    precio_final = models.IntegerField()

    class Meta:
        db_table = "pedido_detalles"

    def __str__(self):
        return f"{self.nombre} x1"
