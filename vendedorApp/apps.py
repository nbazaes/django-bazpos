from django.apps import AppConfig


class VendedorappConfig(AppConfig):
    default_auto_field = 'django.db.models.BigAutoField'
    name = 'vendedorApp'

    def ready(self):
        import vendedorApp.signals  # noqa: F401
