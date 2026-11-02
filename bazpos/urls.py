from django.conf import settings
from django.conf.urls.static import static
from django.contrib import admin
from django.urls import include, path

from .admin_views import admin_logs
from .views import health

urlpatterns = [
    path("admin/logs/", admin.site.admin_view(admin_logs), name="admin_logs"),
    path("admin/", admin.site.urls),
    path("api/", include("bazpos.api_urls")),
    path("health/", health, name="health"),
] + static(settings.MEDIA_URL, document_root=settings.MEDIA_ROOT)
