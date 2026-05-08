from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):

    dependencies = [
        ('vendedorApp', '0004_venta_tipo_documento'),
    ]

    operations = [
        migrations.CreateModel(
            name='Ubicacion',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('nombre', models.CharField(max_length=100)),
                ('descripcion', models.TextField(blank=True, default='')),
            ],
            options={
                'db_table': 'ubicaciones',
            },
        ),
        migrations.CreateModel(
            name='StockProductoUbicacion',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('cantidad', models.IntegerField(default=0)),
                ('producto', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='stocks_ubicacion', to='vendedorApp.producto')),
                ('ubicacion', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, to='vendedorApp.ubicacion')),
            ],
            options={
                'db_table': 'stock_producto_ubicacion',
                'unique_together': {('producto', 'ubicacion')},
            },
        ),
    ]
