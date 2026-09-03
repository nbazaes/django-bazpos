from django.conf import settings
from django.core.management.base import BaseCommand

from gerenteApp.models import StoreConfig


class Command(BaseCommand):
    help = "Sincroniza nombre y locale de la tienda desde las variables de entorno (STORE_NAME, STORE_LOCALE)."

    def handle(self, *args, **options):
        config = StoreConfig.current()
        changed = False
        if config.nombre != settings.STORE_NAME:
            config.nombre = settings.STORE_NAME
            changed = True
        if config.locale != settings.STORE_LOCALE:
            config.locale = settings.STORE_LOCALE
            changed = True
        if changed:
            config.save(update_fields=["nombre", "locale"])
            self.stdout.write(
                self.style.SUCCESS(
                    f"StoreConfig sincronizada: nombre={config.nombre}, locale={config.locale}"
                )
            )
        else:
            self.stdout.write("StoreConfig ya sincronizada (nombre/locale)")