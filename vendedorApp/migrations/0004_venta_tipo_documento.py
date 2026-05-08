from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("vendedorApp", "0003_rename_codigo_producto_oem_producto_codigo_producto"),
    ]

    operations = [
        migrations.AddField(
            model_name="venta",
            name="tipo_documento",
            field=models.CharField(
                choices=[("VE", "Venta"), ("CO", "Cotizacion")],
                default="VE",
                max_length=2,
            ),
        ),
    ]
