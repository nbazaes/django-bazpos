from django.db import migrations


class Migration(migrations.Migration):

    dependencies = [
        ("vendedorApp", "0006_migrar_stock_ubicacion_default"),
    ]

    operations = [
        migrations.RemoveField(
            model_name="producto",
            name="stock_actual",
        ),
    ]
