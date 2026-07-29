from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('vendedorApp', '0027_alter_itempedidoproveedor_unique_together_and_more'),
    ]

    operations = [
        migrations.AddField(
            model_name='venta',
            name='cliente_nombre',
            field=models.CharField(blank=True, max_length=200, null=True, verbose_name='Nombre del cliente'),
        ),
    ]
