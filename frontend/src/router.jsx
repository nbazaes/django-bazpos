import { createBrowserRouter, Navigate } from "react-router-dom";
import Shell from "./components/Shell";
import { ProtectedRoute, GerenteGuard, BodegueroGuard, RedirectIfLoggedIn } from "./guards";
import LoginPage from "./pages/LoginPage";
import StaticPage from "./pages/StaticPage";
import {
  DashboardPage,
  VentaPage,
  PedidosPage,
  PedidosCrearPage,
  InventarioPage,
  ProductosPage,
  ProductoFormPage,
  ProveedoresPage,
  ProveedorFormPage,
  UsuariosPage,
  UsuarioFormPage,
  FacturasPage,
  FacturaFormPage,
  PedidosProveedoresPage,
  UbicacionPage,
  ConfiguracionPage,
  ReportesPage,
  CierreCajaPage,
} from "./lazyRoutes";

export const router = createBrowserRouter([
  {
    element: <RedirectIfLoggedIn />,
    children: [
      { path: "/login", element: <LoginPage /> },
    ],
  },
  {
    element: <ProtectedRoute />,
    children: [
      {
        element: <Shell />,
        children: [
          { index: true, element: <DashboardPage /> },
          { path: "ventas", element: <VentaPage /> },
          { path: "ventas/pedidos", element: <PedidosCrearPage /> },
          { path: "ventas/historial", element: <PedidosPage /> },
          { path: "ventas/inventario", element: <InventarioPage /> },
          { path: "configuracion", element: <ConfiguracionPage /> },
          {
            element: <BodegueroGuard />,
            children: [
              { path: "ubicaciones", element: <UbicacionPage /> },
            ],
          },
          {
            element: <GerenteGuard />,
            children: [
              { path: "productos", element: <ProductosPage /> },
              { path: "productos/crear", element: <ProductoFormPage /> },
              { path: "productos/:id/editar", element: <ProductoFormPage /> },
              { path: "proveedores", element: <ProveedoresPage /> },
              { path: "proveedores/crear", element: <ProveedorFormPage /> },
              { path: "proveedores/:id/editar", element: <ProveedorFormPage /> },
              { path: "usuarios", element: <UsuariosPage /> },
              { path: "usuarios/crear", element: <UsuarioFormPage /> },
              { path: "usuarios/:id/editar", element: <UsuarioFormPage /> },
              { path: "facturas", element: <FacturasPage /> },
              { path: "facturas/crear", element: <FacturaFormPage /> },
              { path: "facturas/:id/editar", element: <FacturaFormPage /> },
              { path: "pedidos-proveedores", element: <PedidosProveedoresPage /> },
              { path: "reportes", element: <ReportesPage /> },
              { path: "cierre-caja", element: <CierreCajaPage /> },
            ],
          },
        ],
      },
    ],
  },
  { path: "*", element: <StaticPage title="404" message="Página no encontrada." /> },
]);