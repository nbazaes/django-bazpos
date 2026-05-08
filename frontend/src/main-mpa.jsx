import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./styles.css";
import "./index.css";

const sbAdminStyles = document.createElement("link");
sbAdminStyles.rel = "stylesheet";
sbAdminStyles.href = "/static/css/sb-admin-2.min.css";
document.head.appendChild(sbAdminStyles);

import { isLoggedIn, saveUser, getUser, isGerente } from "./lib/auth";
import { me } from "./lib/api";
import LoginPage from "./pages/LoginPage";
import DashboardPage from "./pages/DashboardPage";
import FacturaFormPage from "./pages/FacturaFormPage";
import FacturasPage from "./pages/FacturasPage";
import InventarioPage from "./pages/InventarioPage";
import PedidosPage from "./pages/PedidosPage";
import ProductoFormPage from "./pages/ProductoFormPage";
import ProductosPage from "./pages/ProductosPage";
import ProveedorFormPage from "./pages/ProveedorFormPage";
import ProveedoresPage from "./pages/ProveedoresPage";
import StaticPage from "./pages/StaticPage";
import UbicacionPage from "./pages/UbicacionPage";
import UsuarioFormPage from "./pages/UsuarioFormPage";
import UsuariosPage from "./pages/UsuariosPage";
import VentaPage from "./pages/VentaPage";

const GERENTE_PAGES = [
  "ventas_productos_lista",
  "ventas_productos_form",
  "gerencia_proveedores",
  "gerencia_proveedores_lista",
  "gerencia_proveedores_form",
  "gerencia_usuarios_lista",
  "gerencia_usuarios_form",
  "gerencia_usuarios_register",
  "gerencia_facturas_lista",
  "gerencia_facturas_form",
  "gerencia_ubicaciones",
];

const PAGE_MAP = {
  login: LoginPage,
  forgot_password: () => <StaticPage title="Recuperar clave" message="Esta pantalla ahora se maneja en React. Agrega flujo de recuperacion por email segun tu proveedor SMTP." />,
  dashboard: DashboardPage,
  administrador_pruebas: () => <StaticPage title="Administrador pruebas" message="Pagina migrada a React." />,
  not_found: () => <StaticPage title="404" message="Pagina no encontrada." />,
  ventas_pedidos: PedidosPage,
  ventas_venta: VentaPage,
  ventas_inventario: InventarioPage,
  ventas_productos_lista: ProductosPage,
  ventas_productos_form: ProductoFormPage,
  gerencia_proveedores: ProveedoresPage,
  gerencia_proveedores_lista: ProveedoresPage,
  gerencia_proveedores_form: ProveedorFormPage,
  gerencia_usuarios_lista: UsuariosPage,
  gerencia_usuarios_form: UsuarioFormPage,
  gerencia_usuarios_register: UsuarioFormPage,
  gerencia_facturas_lista: FacturasPage,
  gerencia_facturas_form: FacturaFormPage,
  gerencia_ubicaciones: UbicacionPage,
};

const pageId = window.__PAGE_ID__ || "dashboard";
const loggedIn = isLoggedIn();

// Fetch and cache user data on load
if (loggedIn) {
  me()
    .then((userData) => {
      saveUser(userData);
      const user = userData;

      if (GERENTE_PAGES.includes(pageId) && !isGerente(user)) {
        window.location.href = "/";
        return;
      }

      if (pageId === "login") {
        window.location.href = "/";
        return;
      }

      renderPage(pageId, userData);
    })
    .catch(() => {
      // Token expired or invalid, force login
      if (pageId !== "login") {
        window.location.href = "/registration/login.html";
        return;
      }
      renderPage("login", null);
    });
} else {
  if (pageId !== "login") {
    window.location.href = "/registration/login.html";
  } else {
    renderPage("login", null);
  }
}

function renderPage(pageId, user) {
  const isGerenteUser = isGerente(user);

  // Check if accessing gerente page without permission
  if (GERENTE_PAGES.includes(pageId) && !isGerenteUser) {
    window.location.href = "/";
    return;
  }

  const Component = PAGE_MAP[pageId] || PAGE_MAP.not_found;
  createRoot(document.getElementById("root")).render(
    <StrictMode>
      <Component />
    </StrictMode>
  );
}
