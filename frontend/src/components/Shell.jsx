import { useState } from "react";
import { getUser, isGerente, clearTokens } from "../lib/auth";
import { toggleTheme, getStoredTheme } from "../lib/theme";

const vendedorLinks = [
  { href: "/", label: "Dashboard" },
  { href: "/ventas/venta.html", label: "Ventas" },
  { href: "/ventas/pedidos.html", label: "Historial" },
  { href: "/ventas/inventario.html", label: "Inventario" },
];

const gerenteLinks = [
  { href: "/ventas/productos/producto.html", label: "Productos" },
  { href: "/gerencia/proveedores/lista_proveedores.html", label: "Proveedores" },
  { href: "/gerencia/usuarios/usuarios.html", label: "Usuarios" },
  { href: "/gerencia/facturas/facturas.html", label: "Facturas" },
  { href: "/gerencia/ubicaciones/ubicaciones.html", label: "Ubicaciones" },
];

export default function Shell({ title, children }) {
  const user = getUser();
  const showGerente = isGerente(user);
  const [theme, setTheme] = useState(() => getStoredTheme());

  function handleToggleTheme() {
    const next = toggleTheme();
    setTheme(next);
  }

  return (
    <div id="wrapper">
      <aside className="sidebar">
        <a className="sidebar-brand" href="/">Bazpos</a>

        <ul className="sidebar-nav">
          {vendedorLinks.map((link) => (
            <li className="nav-item" key={link.href}>
              <a className="nav-link" href={link.href}>{link.label}</a>
            </li>
          ))}
        </ul>

        {showGerente && (
          <>
            <hr className="sidebar-divider" />
            <div className="sidebar-heading">Gerente</div>
            <ul className="sidebar-nav">
              {gerenteLinks.map((link) => (
                <li className="nav-item" key={link.href}>
                  <a className="nav-link" href={link.href}>{link.label}</a>
                </li>
              ))}
            </ul>
          </>
        )}
      </aside>

      <div className="content-wrapper">
        <nav className="topbar">
          <span className="topbar-title">{title}</span>
          <div className="btn-group">
            <button
              type="button"
              className="btn btn-sm btn-outline"
              onClick={handleToggleTheme}
              title={theme === "dark" ? "Cambiar a modo claro" : "Cambiar a modo oscuro"}
            >
              {theme === "dark" ? "☀" : "☾"}
            </button>
            <button
              type="button"
              className="btn btn-sm btn-danger"
              onClick={() => {
                clearTokens();
                window.location.reload();
              }}
            >
              Salir
            </button>
          </div>
        </nav>

        <main className="content-area">
          <div className="container-fluid">{children}</div>
        </main>
      </div>
    </div>
  );
}
