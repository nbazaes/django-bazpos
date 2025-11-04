from django.db import models
from django.utils import timezone

# Create your models here.
class Proveedor(models.Model):
    proveedor_id = models.AutoField(primary_key=True, verbose_name='proveedor_id')
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