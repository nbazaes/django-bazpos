from django.conf import settings
from django.conf.urls.static import static
from django.contrib import admin
from django.urls import include, path

from .admin_views import admin_logs
from .views import health

urlpatterns = [
    path("admin/", admin.site.urls),
    path("admin/logs/", admin_logs, name="admin_logs"),
    path("api/", include("bazpos.api_urls")),
    path("health/", health, name="health"),
] + static(settings.MEDIA_URL, document_root=settings.MEDIA_ROOT)
