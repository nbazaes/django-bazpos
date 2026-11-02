from django.contrib.admin.apps import AdminConfig


class ConsoleAdminConfig(AdminConfig):
    default_site = 'bazpos.admin_site.TechnicalAdminSite'

    def ready(self):
        super().ready()
        from django.contrib import admin
        from rest_framework_simplejwt.token_blacklist import models
        from .admin_site import register_models
        for model in (models.OutstandingToken, models.BlacklistedToken):
            if admin.site.is_registered(model):
                admin.site.unregister(model)
        register_models(models)
