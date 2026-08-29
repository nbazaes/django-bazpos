from django.urls import include, path
from rest_framework.routers import DefaultRouter
from rest_framework_simplejwt.views import TokenObtainPairView, TokenRefreshView

from chatApp.api import ChatMessageCreateView, ChatStateView
from gerenteApp.api import FacturaViewSet, ProveedorViewSet, StoreConfigViewSet, UbicacionViewSet, UserViewSet
from vendedorApp.api import CierreCajaDetalleView, CierreCajaHistorialView, CierreCajaView, DashboardStatsView, DevolucionViewSet, PedidoProveedorViewSet, PedidoViewSet, ProductoViewSet, ReporteExportView, ReporteQueryView, ReporteSchemaView, ReportesStatsView, VentaViewSet
from vendedorApp.publico_api import CatalogoPublicoViewSet
from .api_views import MeView, StoreNameView

router = DefaultRouter()
router.register("productos", ProductoViewSet, basename="producto")
router.register("ventas", VentaViewSet, basename="venta")
router.register("proveedores", ProveedorViewSet, basename="proveedor")
router.register("facturas", FacturaViewSet, basename="factura")
router.register("usuarios", UserViewSet, basename="usuario")
router.register("devoluciones", DevolucionViewSet, basename="devolucion")
router.register("ubicaciones", UbicacionViewSet, basename="ubicacion")
router.register("pedidos", PedidoViewSet, basename="pedido")
router.register("configuracion", StoreConfigViewSet, basename="configuracion")
router.register("pedidos-proveedor", PedidoProveedorViewSet, basename="pedido-proveedor")
router.register("publico/catalogo", CatalogoPublicoViewSet, basename="publico-catalogo")

urlpatterns = [
    path("auth/token/", TokenObtainPairView.as_view(), name="token_obtain_pair"),
    path("auth/token/refresh/", TokenRefreshView.as_view(), name="token_refresh"),
    path("auth/me/", MeView.as_view(), name="auth_me"),
    path("store-name/", StoreNameView.as_view(), name="store_name"),
    path("dashboard/stats/", DashboardStatsView.as_view(), name="dashboard_stats"),
    path("reportes/stats/", ReportesStatsView.as_view(), name="reportes_stats"),
    path("reportes/custom/schema/", ReporteSchemaView.as_view(), name="reporte_custom_schema"),
    path("reportes/custom/query/", ReporteQueryView.as_view(), name="reporte_custom_query"),
    path("reportes/custom/export/", ReporteExportView.as_view(), name="reporte_custom_export"),
    path("cierre-caja/", CierreCajaView.as_view(), name="cierre_caja"),
    path("cierre-caja/historial/", CierreCajaHistorialView.as_view(), name="cierre_caja_historial"),
    path("cierre-caja/detalle/", CierreCajaDetalleView.as_view(), name="cierre_caja_detalle"),
    path("chat/state/", ChatStateView.as_view(), name="chat_state"),
    path("chat/messages/", ChatMessageCreateView.as_view(), name="chat_message_create"),
    path("", include(router.urls)),
]
