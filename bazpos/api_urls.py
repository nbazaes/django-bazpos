from django.urls import include, path
from rest_framework.routers import DefaultRouter
from rest_framework_simplejwt.views import TokenObtainPairView, TokenRefreshView

from gerenteApp.api import FacturaViewSet, ProveedorViewSet, UbicacionViewSet, UserViewSet
from vendedorApp.api import DashboardStatsView, DevolucionViewSet, ProductoViewSet, VentaViewSet
from .api_views import MeView

router = DefaultRouter()
router.register("productos", ProductoViewSet, basename="producto")
router.register("ventas", VentaViewSet, basename="venta")
router.register("proveedores", ProveedorViewSet, basename="proveedor")
router.register("facturas", FacturaViewSet, basename="factura")
router.register("usuarios", UserViewSet, basename="usuario")
router.register("devoluciones", DevolucionViewSet, basename="devolucion")
router.register("ubicaciones", UbicacionViewSet, basename="ubicacion")

urlpatterns = [
    path("auth/token/", TokenObtainPairView.as_view(), name="token_obtain_pair"),
    path("auth/token/refresh/", TokenRefreshView.as_view(), name="token_refresh"),
    path("auth/me/", MeView.as_view(), name="auth_me"),
    path("dashboard/stats/", DashboardStatsView.as_view(), name="dashboard_stats"),
    path("", include(router.urls)),
]
