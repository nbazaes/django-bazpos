import { useState, createContext, useContext, useEffect } from "react";
import { Outlet, NavLink, useNavigate, useLocation, useSearchParams } from "react-router-dom";
import { getUser, isGerente, isBodeguero, clearTokens } from "../lib/auth";
import { toggleTheme, getStoredTheme } from "../lib/theme";
import { STORE_NAME } from "../lib/config";

const TitleContext = createContext(() => {});

export function usePageTitle(title) {
  const setTitle = useContext(TitleContext);
  useEffect(() => {
    setTitle(title);
    document.title = `${STORE_NAME} — ${title}`;
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
];

const bodegueroLinks = [
  { to: "/ventas/inventario", label: "Inventario" },
  { to: "/ubicaciones", label: "Ubicaciones" },
];

export default function Shell() {
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams] = useSearchParams();
  const user = getUser();
  const showGerente = isGerente(user);
  const showBodeguero = isBodeguero(user);
  const [theme, setTheme] = useState(() => getStoredTheme());
  const [title, setTitle] = useState("Dashboard");
  const [showLogoutModal, setShowLogoutModal] = useState(false);
  const embed = searchParams.get("embed") === "1";

  function handleToggleTheme() {
    const next = toggleTheme();
    setTheme(next);
  }

  function handleLogout() {
    clearTokens();
    setShowLogoutModal(false);
    navigate("/login");
  }

  if (embed) {
    return (
      <TitleContext.Provider value={setTitle}>
        <Outlet />
      </TitleContext.Provider>
    );
  }

  return (
    <TitleContext.Provider value={setTitle}>
      <div id="wrapper">
        <aside className="sidebar">
          <NavLink className="sidebar-brand" to="/">{STORE_NAME}</NavLink>

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

          {showBodeguero && (
            <>
              <hr className="sidebar-divider" />
              <div className="sidebar-heading">Bodeguero</div>
              <ul className="sidebar-nav">
                {bodegueroLinks.map((link) => (
                  <li className="nav-item" key={link.to}>
                    <NavLink className="nav-link" to={link.to}>
                      {link.label}
                    </NavLink>
                  </li>
                ))}
              </ul>
            </>
          )}

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

          <div className="sidebar-version">
            {STORE_NAME} &copy; {new Date().getFullYear()} v{import.meta.env.APP_VERSION}
          </div>
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
                onClick={() => setShowLogoutModal(true)}
              >
                Salir
              </button>
            </div>
          </nav>

          <main className="content-area">
            <div className="container-fluid" key={location.pathname}>
              <div className="page-transition">
                <Outlet />
              </div>
            </div>
          </main>
        </div>
      </div>

      {showLogoutModal && (
        <div className="modal" role="dialog" aria-modal="true">
          <div className="modal-dialog" style={{ maxWidth: 400 }}>
            <div className="modal-content">
              <div className="modal-header">
                <h5 className="modal-title">Cerrar sesión</h5>
                <button type="button" className="modal-close" onClick={() => setShowLogoutModal(false)}>&times;</button>
              </div>
              <div className="modal-body text-center py-4">
                <p className="mb-0 text-secondary">¿Estás seguro de que deseas cerrar sesión?</p>
              </div>
              <div className="modal-footer">
                <button type="button" className="btn btn-secondary" onClick={() => setShowLogoutModal(false)}>Cancelar</button>
                <button type="button" className="btn btn-danger" onClick={handleLogout}>Cerrar sesión</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </TitleContext.Provider>
  );
}
