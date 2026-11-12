from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [("vendedorApp", "0041_pedidodetalle_cantidad")]

    operations = [
        migrations.AddField(
            model_name="venta",
            name="cliente_rut",
            field=models.CharField(blank=True, default="", max_length=20, verbose_name="RUT del cliente"),
        ),
        migrations.AddField(
            model_name="pedido",
            name="rut_cliente",
            field=models.CharField(blank=True, default="", max_length=20, verbose_name="RUT del cliente"),
        ),
    ]
