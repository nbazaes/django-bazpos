from django.db import migrations


def habilitar_order_pricing_rules(apps, schema_editor):
    StoreConfig = apps.get_model("gerenteApp", "StoreConfig")
    for config in StoreConfig.objects.all():
        flags = dict(config.feature_flags or {})
        if flags.get("order_pricing_rules") is None:
            flags["order_pricing_rules"] = True
            config.feature_flags = flags
            config.save(update_fields=["feature_flags"])


def deshabilitar_order_pricing_rules(apps, schema_editor):
    pass


class Migration(migrations.Migration):

    dependencies = [
        ("gerenteApp", "0013_storeconfig_document_types_and_more"),
    ]

    operations = [
        migrations.RunPython(habilitar_order_pricing_rules, deshabilitar_order_pricing_rules),
    ]