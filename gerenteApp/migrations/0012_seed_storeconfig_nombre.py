from django.conf import settings
from django.db import migrations


def seed_nombre_from_env(apps, schema_editor):
    StoreConfig = apps.get_model("gerenteApp", "StoreConfig")
    nombre = getattr(settings, "STORE_NAME", "")
    if nombre:
        StoreConfig.objects.filter(nombre="").update(nombre=nombre)


def unseed_nombre(apps, schema_editor):
    pass


class Migration(migrations.Migration):

    dependencies = [
        ("gerenteApp", "0011_delete_tax_storeconfig_currency_code_and_more"),
    ]

    operations = [
        migrations.RunPython(seed_nombre_from_env, unseed_nombre),
    ]