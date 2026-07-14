from django.db import models
from django.utils import timezone
from datetime import timedelta
from decimal import Decimal, ROUND_HALF_UP

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
    numero_factura = models.IntegerField(verbose_name='Número de factura')
    proveedor = models.ForeignKey(Proveedor, on_delete=models.CASCADE)
    fecha = models.DateField(default=fecha_ayer, verbose_name='Fecha')
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

    def __str__(self):
        return f'{self.producto.nombre} - {self.fecha.strftime("%d/%m/%Y")}'


class Tax(models.Model):
    tax_percent = models.DecimalField(max_digits=5, decimal_places=2, default=19)

    class Meta:
        db_table = "taxes"

    def __str__(self):
        return f"IVA {self.tax_percent}%"

    @classmethod
    def current_percent(cls):
        tax = cls.objects.order_by("id").first()
        if not tax:
            return Decimal("19")
        return Decimal(str(tax.tax_percent))

    @classmethod
    def apply_to_amount(cls, amount):
        percent = cls.current_percent()
        total = Decimal(str(amount)) * (Decimal("1") + (percent / Decimal("100")))
        return int(total.quantize(Decimal("1"), rounding=ROUND_HALF_UP))
