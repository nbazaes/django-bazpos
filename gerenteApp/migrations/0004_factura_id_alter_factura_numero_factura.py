from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):

    dependencies = [
        ("gerenteApp", "0003_tax"),
    ]

    operations = [
        migrations.RunSQL(
            sql=[
                "ALTER TABLE `facturas` ADD COLUMN `id` int NOT NULL DEFAULT 0",
                "UPDATE `facturas` SET `id` = `numero_factura`",
                (
                    "SET @fk_det = (SELECT CONSTRAINT_NAME FROM information_schema.KEY_COLUMN_USAGE"
                    " WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'detalle_facturas'"
                    " AND COLUMN_NAME = 'factura_id' AND REFERENCED_TABLE_NAME = 'facturas' LIMIT 1)"
                ),
                (
                    "SET @sql_det = CONCAT('ALTER TABLE `detalle_facturas` DROP FOREIGN KEY `', @fk_det, '`')"
                ),
                "PREPARE stmt_det FROM @sql_det",
                "EXECUTE stmt_det",
                "DEALLOCATE PREPARE stmt_det",
                (
                    "SET @fk_pre = (SELECT CONSTRAINT_NAME FROM information_schema.KEY_COLUMN_USAGE"
                    " WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'precios_historicos'"
                    " AND COLUMN_NAME = 'factura_id' AND REFERENCED_TABLE_NAME = 'facturas' LIMIT 1)"
                ),
                (
                    "SET @sql_pre = CONCAT('ALTER TABLE `precios_historicos` DROP FOREIGN KEY `', @fk_pre, '`')"
                ),
                "PREPARE stmt_pre FROM @sql_pre",
                "EXECUTE stmt_pre",
                "DEALLOCATE PREPARE stmt_pre",
                "ALTER TABLE `facturas` DROP PRIMARY KEY",
                "ALTER TABLE `facturas` MODIFY COLUMN `id` int NOT NULL AUTO_INCREMENT PRIMARY KEY",
                (
                    "ALTER TABLE `detalle_facturas` ADD CONSTRAINT `detalle_facturas_factura_id_2320f2e0_fk_facturas_id`"
                    " FOREIGN KEY (`factura_id`) REFERENCES `facturas` (`id`) ON DELETE CASCADE"
                ),
                (
                    "ALTER TABLE `precios_historicos` ADD CONSTRAINT `precios_historicos_factura_id_cc939a10_fk_facturas_id`"
                    " FOREIGN KEY (`factura_id`) REFERENCES `facturas` (`id`) ON DELETE SET NULL"
                ),
            ],
            reverse_sql=[
                "ALTER TABLE `detalle_facturas` DROP FOREIGN KEY `detalle_facturas_factura_id_2320f2e0_fk_facturas_id`",
                "ALTER TABLE `precios_historicos` DROP FOREIGN KEY `precios_historicos_factura_id_cc939a10_fk_facturas_id`",
                "ALTER TABLE `facturas` MODIFY COLUMN `id` int NOT NULL",
                "ALTER TABLE `facturas` DROP PRIMARY KEY",
                "ALTER TABLE `facturas` MODIFY COLUMN `numero_factura` int NOT NULL PRIMARY KEY",
                "ALTER TABLE `facturas` DROP COLUMN `id`",
                (
                    "ALTER TABLE `detalle_facturas` ADD CONSTRAINT `detalle_facturas_factura_id_2320f2e0_fk_facturas_id`"
                    " FOREIGN KEY (`factura_id`) REFERENCES `facturas` (`numero_factura`) ON DELETE CASCADE"
                ),
                (
                    "ALTER TABLE `precios_historicos` ADD CONSTRAINT `precios_historicos_factura_id_cc939a10_fk_facturas_id`"
                    " FOREIGN KEY (`factura_id`) REFERENCES `facturas` (`numero_factura`) ON DELETE SET NULL"
                ),
            ],
        ),
        migrations.SeparateDatabaseAndState(
            state_operations=[
                migrations.AddField(
                    model_name="factura",
                    name="id",
                    field=models.AutoField(primary_key=True, serialize=False),
                ),
                migrations.AlterField(
                    model_name="factura",
                    name="numero_factura",
                    field=models.IntegerField(verbose_name="Número de factura"),
                ),
            ],
        ),
    ]
