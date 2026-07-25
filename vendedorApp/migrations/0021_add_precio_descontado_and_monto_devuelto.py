from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('vendedorApp', '0011_venta_descuento_porcentaje_venta_monto_subtotal'),
    ]

    operations = [
        migrations.AddField(
            model_name='detalleventa',
            name='precio_descontado',
            field=models.IntegerField(default=0),
        ),
        migrations.AddField(
            model_name='devolucion',
            name='monto_devuelto',
            field=models.IntegerField(default=0),
        ),
    ]
