from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('vendedorApp', '0020_remove_stockproductoubicacion_unique_producto_ubicacion_and_more'),
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
