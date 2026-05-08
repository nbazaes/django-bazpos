import { useState } from "react";
import { clearTokens, getUser, isGerente } from "../lib/auth";

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
  const [user] = useState(() => getUser());

  const showGerente = isGerente(user);

  return (
    <div id="wrapper">
      <ul className="navbar-nav bg-gradient-primary sidebar sidebar-dark accordion" id="accordionSidebar">
        <a className="sidebar-brand d-flex align-items-center justify-content-center" href="/">
          <div className="sidebar-brand-text mx-3">BAZPOS</div>
        </a>
        <hr className="sidebar-divider my-0" />
        {vendedorLinks.map((link) => (
          <li className="nav-item" key={link.href}>
            <a className="nav-link" href={link.href}>
              <span>{link.label}</span>
            </a>
          </li>
        ))}
        {showGerente && (
          <>
            <hr className="sidebar-divider" />
            <div className="sidebar-heading">Gerente</div>
            {gerenteLinks.map((link) => (
              <li className="nav-item" key={link.href}>
                <a className="nav-link" href={link.href}>
                  <span>{link.label}</span>
                </a>
              </li>
            ))}
          </>
        )}
      </ul>

      <div id="content-wrapper" className="d-flex flex-column">
        <div id="content">
          <nav className="navbar navbar-expand navbar-light bg-white topbar mb-4 static-top shadow">
            <span className="h5 mb-0 text-gray-800">{title}</span>
            <button
              type="button"
              className="btn btn-sm btn-outline-danger ml-auto"
              onClick={() => {
                clearTokens();
                window.location.reload();
              }}
            >
              Cerrar sesion
            </button>
          </nav>

          <div className="container-fluid">{children}</div>
        </div>
      </div>
    </div>
  );
}
