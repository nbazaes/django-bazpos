from django.db import migrations


def migrar_stock_a_ubicacion(apps, schema_editor):
    Ubicacion = apps.get_model("vendedorApp", "Ubicacion")
    Producto = apps.get_model("vendedorApp", "Producto")
    StockProductoUbicacion = apps.get_model("vendedorApp", "StockProductoUbicacion")

    ubicacion_default, _ = Ubicacion.objects.get_or_create(
        nombre="Depósito Principal",
        defaults={"descripcion": "Ubicación por defecto"},
    )

    for producto in Producto.objects.all():
        if producto.stock_actual > 0:
            StockProductoUbicacion.objects.create(
                producto=producto,
                ubicacion=ubicacion_default,
                cantidad=producto.stock_actual,
            )


def revertir_migracion(apps, schema_editor):
    StockProductoUbicacion = apps.get_model("vendedorApp", "StockProductoUbicacion")
    StockProductoUbicacion.objects.all().delete()
    Ubicacion = apps.get_model("vendedorApp", "Ubicacion")
    Ubicacion.objects.all().delete()


class Migration(migrations.Migration):

    dependencies = [
        ("vendedorApp", "0005_ubicacion_stockproductoubicacion"),
    ]

    operations = [
        migrations.RunPython(migrar_stock_a_ubicacion, revertir_migracion),
    ]
