from django.db import migrations, models


def seed_default_tax(apps, schema_editor):
    Tax = apps.get_model("gerenteApp", "Tax")
    if not Tax.objects.exists():
        Tax.objects.create(tax_percent=19)


class Migration(migrations.Migration):
    dependencies = [
        ("gerenteApp", "0002_initial"),
    ]

    operations = [
        migrations.CreateModel(
            name="Tax",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("tax_percent", models.DecimalField(decimal_places=2, default=19, max_digits=5)),
            ],
            options={"db_table": "taxes"},
        ),
        migrations.RunPython(seed_default_tax, migrations.RunPython.noop),
    ]
