import { useState, createContext, useContext, useEffect } from "react";
import { Outlet, NavLink, useNavigate } from "react-router-dom";
import { getUser, isGerente, clearTokens } from "../lib/auth";
import { toggleTheme, getStoredTheme } from "../lib/theme";

const TitleContext = createContext(() => {});

export function usePageTitle(title) {
  const setTitle = useContext(TitleContext);
  useEffect(() => {
    setTitle(title);
    document.title = `BAZPOS — ${title}`;
  }, [title, setTitle]);
}

const vendedorLinks = [
  { to: "/", label: "Dashboard", end: true },
  { to: "/ventas", label: "Ventas" },
  { to: "/ventas/historial", label: "Historial" },
  { to: "/ventas/inventario", label: "Inventario" },
];

const gerenteLinks = [
  { to: "/productos", label: "Productos" },
  { to: "/proveedores", label: "Proveedores" },
  { to: "/usuarios", label: "Usuarios" },
  { to: "/facturas", label: "Facturas" },
  { to: "/ubicaciones", label: "Ubicaciones" },
];

export default function Shell() {
  const navigate = useNavigate();
  const user = getUser();
  const showGerente = isGerente(user);
  const [theme, setTheme] = useState(() => getStoredTheme());
  const [title, setTitle] = useState("Dashboard");

  function handleToggleTheme() {
    const next = toggleTheme();
    setTheme(next);
  }

  function handleLogout() {
    clearTokens();
    navigate("/login");
  }

  return (
    <TitleContext.Provider value={setTitle}>
      <div id="wrapper">
        <aside className="sidebar">
          <NavLink className="sidebar-brand" to="/">Bazpos</NavLink>

          <ul className="sidebar-nav">
            {vendedorLinks.map((link) => (
              <li className="nav-item" key={link.to}>
                <NavLink
                  className="nav-link"
                  to={link.to}
                  end={link.end}
                >
                  {link.label}
                </NavLink>
              </li>
            ))}
          </ul>

          {showGerente && (
            <>
              <hr className="sidebar-divider" />
              <div className="sidebar-heading">Gerente</div>
              <ul className="sidebar-nav">
                {gerenteLinks.map((link) => (
                  <li className="nav-item" key={link.to}>
                    <NavLink className="nav-link" to={link.to}>
                      {link.label}
                    </NavLink>
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
                onClick={handleLogout}
              >
                Salir
              </button>
            </div>
          </nav>

          <main className="content-area">
            <div className="container-fluid">
              <Outlet />
            </div>
          </main>
        </div>
      </div>
    </TitleContext.Provider>
  );
}
