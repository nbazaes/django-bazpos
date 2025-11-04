from django.db import models
from decimal import Decimal
from django.contrib.auth.models import User
from django.utils import timezone
from gerenteApp.models import Proveedor

class Producto(models.Model):

    producto_id = models.AutoField(primary_key=True, verbose_name='producto_id')
    nombre = models.CharField(max_length=100)
    codigo = models.CharField(max_length=50)
    descripcion = models.TextField()
    precio = models.IntegerField(blank=True, null=True)  # Permitir nulo para el cálculo inicial
    precio_costo = models.IntegerField()
    stock_minimo = models.IntegerField()
    stock_maximo = models.IntegerField()
    stock_actual = models.IntegerField()
    margen_utilidad = models.DecimalField(max_digits=5, decimal_places=2)
    proveedor = models.ForeignKey(Proveedor, on_delete=models.CASCADE)

    class Meta:
        db_table = 'productos'

    def __str__(self):
        return f'{self.nombre}'

    def save(self, *args, **kwargs):
        if self.precio_costo and self.margen_utilidad: 
            # Convertir a Decimal para asegurar la compatibilidad 
            precio_costo_decimal = Decimal(self.precio_costo) 
            margen_utilidad_decimal = Decimal(self.margen_utilidad) / Decimal(100) 
            
            # Calcular precio: (precio_costo * margen_utilidad) + 19% de ese total 
            margen_total = precio_costo_decimal * (Decimal(1) + margen_utilidad_decimal) 
            self.precio = int(margen_total * Decimal(1.19))
        super(Producto, self).save(*args, **kwargs)

class Venta(models.Model):
    usuario = models.ForeignKey(User, on_delete=models.CASCADE)
    fecha_venta = models.DateTimeField(default=timezone.now)
    monto_total = models.IntegerField()
    class Estado(models.TextChoices):
        PENDIENTE = 'PE', 'Pendiente'
        COMPLETADA = 'CO', 'Completada'
        CANCELADA = 'CA', 'Cancelada'
    
    estado = models.CharField(
        max_length=2, 
        choices=Estado.choices, 
        default=Estado.PENDIENTE
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