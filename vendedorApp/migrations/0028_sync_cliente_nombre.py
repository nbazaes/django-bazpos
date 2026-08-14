from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('vendedorApp', '0027_alter_itempedidoproveedor_unique_together_and_more'),
    ]

    operations = [
        migrations.SeparateDatabaseAndState(
            database_operations=[
                migrations.RunSQL(
                    sql=(
                        "ALTER TABLE ventas "
                        "ADD COLUMN IF NOT EXISTS cliente_nombre "
                        "VARCHAR(200) NULL"
                    ),
                    reverse_sql=(
                        "ALTER TABLE ventas "
                        "DROP COLUMN IF EXISTS cliente_nombre"
                    ),
                ),
            ],
            state_operations=[
                migrations.AddField(
                    model_name='venta',
                    name='cliente_nombre',
                    field=models.CharField(
                        blank=True,
                        max_length=200,
                        null=True,
                        verbose_name='Nombre del cliente',
                    ),
                ),
            ],
        ),
    ]
