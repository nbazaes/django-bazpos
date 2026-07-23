from django.db import migrations


def ignorar_stock_todos(apps, schema_editor):
    Producto = apps.get_model("vendedorApp", "Producto")
    Producto.objects.update(ignorar_stock_permanente=True)


class Migration(migrations.Migration):
    dependencies = [
        ("vendedorApp", "0015_pedido_activo_pedido_fecha_retiro_and_more"),
    ]

    operations = [
        migrations.RunPython(
            ignorar_stock_todos,
            reverse_code=migrations.RunPython.noop,
        ),
    ]
