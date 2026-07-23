import { createBrowserRouter, Navigate } from "react-router-dom";
import Shell from "./components/Shell";
import { ProtectedRoute, GerenteGuard, BodegueroGuard, RedirectIfLoggedIn } from "./guards";
import LoginPage from "./pages/LoginPage";
import DashboardPage from "./pages/DashboardPage";
import VentaPage from "./pages/VentaPage";
import PedidosPage from "./pages/PedidosPage";
import PedidosCrearPage from "./pages/PedidosCrearPage";
import InventarioPage from "./pages/InventarioPage";
import ProductosPage from "./pages/ProductosPage";
import ProductoFormPage from "./pages/ProductoFormPage";
import ProveedoresPage from "./pages/ProveedoresPage";
import ProveedorFormPage from "./pages/ProveedorFormPage";
import UsuariosPage from "./pages/UsuariosPage";
import UsuarioFormPage from "./pages/UsuarioFormPage";
import FacturasPage from "./pages/FacturasPage";
import FacturaFormPage from "./pages/FacturaFormPage";
import UbicacionPage from "./pages/UbicacionPage";
import StaticPage from "./pages/StaticPage";

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
            ],
          },
        ],
      },
    ],
  },
  { path: "*", element: <StaticPage title="404" message="Página no encontrada." /> },
]);
