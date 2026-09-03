from django.db import migrations

AUTOPARTS_FLAGS = {
    "product_oem_fields": True,
    "oem_primary_search": True,
    "order_shipping_toggle": True,
    "order_pricing_rules": True,
    "daily_supplier_orders": True,
    "oem_stock_substitutes": True,
    "supplier_rut_field": True,
}


def habilitar_feature_flags_autopartes(apps, schema_editor):
    StoreConfig = apps.get_model("gerenteApp", "StoreConfig")
    for config in StoreConfig.objects.all():
        flags = dict(config.feature_flags or {})
        for key, value in AUTOPARTS_FLAGS.items():
            flags.setdefault(key, value)
        config.feature_flags = flags
        config.save(update_fields=["feature_flags"])


def deshabilitar_feature_flags_autopartes(apps, schema_editor):
    pass


class Migration(migrations.Migration):

    dependencies = [
        ("gerenteApp", "0015_remove_proveedor_rut_proveedor_tax_id_and_more"),
    ]

    operations = [
        migrations.RunPython(habilitar_feature_flags_autopartes, deshabilitar_feature_flags_autopartes),
    ]