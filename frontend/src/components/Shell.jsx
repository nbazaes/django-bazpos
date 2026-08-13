import { useEffect, useState } from "react";
import { Outlet, NavLink, useNavigate, useLocation, useSearchParams } from "react-router-dom";
import { getUser, isGerente, isBodeguero, clearTokens } from "../lib/auth";
import { toggleTheme, getStoredTheme } from "../lib/theme";
import { useStoreName } from "../lib/storeName";
import TitleContext from "../lib/usePageTitle";
import ChangelogModal from "./ChangelogModal";
import { getUnseenChangelog, getFullChangelog, markChangelogSeen } from "../lib/changelog";

const vendedorLinks = [
  { to: "/", label: "Dashboard", end: true },
  { to: "/ventas", label: "VENTAS", className: "nav-link--ventas", end: true },
  { to: "/ventas/pedidos", label: "Pedidos" },
  { to: "/ventas/historial", label: "Historial" },
  { to: "/ventas/inventario", label: "Inventario" },
];

const gerenteLinks = [
  { to: "/productos", label: "Productos" },
  { to: "/proveedores", label: "Proveedores" },
  { to: "/pedidos-proveedores", label: "Pedidos Prov." },
  { to: "/usuarios", label: "Usuarios" },
  { to: "/facturas", label: "Facturas" },
  { to: "/configuracion", label: "Configuración" },
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

  const filteredVendedorLinks = showBodeguero
    ? vendedorLinks.filter((link) => link.label !== "Inventario")
    : vendedorLinks;
  const [theme, setTheme] = useState(() => getStoredTheme());
  const [title, setTitle] = useState("Dashboard");
  const [showLogoutModal, setShowLogoutModal] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const embed = searchParams.get("embed") === "1";
  const [changelogModal, setChangelogModal] = useState(null);
  const unseenChangelog = getUnseenChangelog();
  const storeName = useStoreName();

  useEffect(() => {
    if (embed) return;
    if (unseenChangelog.length > 0) {
      setChangelogModal({ entries: unseenChangelog, dismissable: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [embed]);

  useEffect(() => {
    if (sidebarOpen) {
      document.body.style.overflow = "hidden";
      document.body.style.touchAction = "none";
    } else {
      document.body.style.overflow = "";
      document.body.style.touchAction = "";
    }
    return () => {
      document.body.style.overflow = "";
      document.body.style.touchAction = "";
    };
  }, [sidebarOpen]);

  function handleNav() {
    setSidebarOpen(false);
  }

  function handleToggleTheme() {
    const next = toggleTheme();
    setTheme(next);
  }

  function handleLogout() {
    clearTokens();
    setShowLogoutModal(false);
    navigate("/login");
  }

  function openChangelog() {
    setChangelogModal({ entries: getFullChangelog(), dismissable: false });
  }

  function closeChangelog() {
    markChangelogSeen();
    setChangelogModal(null);
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
      <div id="wrapper" className={sidebarOpen ? "sidebar-open" : ""}>
        <aside className={`sidebar${sidebarOpen ? " open" : ""}`}>
          <NavLink className="sidebar-brand" to="/" onClick={handleNav}>{storeName}</NavLink>

          <ul className="sidebar-nav">
            {filteredVendedorLinks.map((link) => (
              <li className="nav-item" key={link.to}>
                <NavLink
                  className={({ isActive }) => `nav-link${isActive ? " active" : ""}${link.className ? ` ${link.className}` : ""}`}
                  to={link.to}
                  end={link.end}
                  onClick={handleNav}
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
                    <NavLink className={({ isActive }) => `nav-link${isActive ? " active" : ""}${link.className ? ` ${link.className}` : ""}`} to={link.to} onClick={handleNav}>
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
                    <NavLink className={({ isActive }) => `nav-link${isActive ? " active" : ""}${link.className ? ` ${link.className}` : ""}`} to={link.to} onClick={handleNav}>
                      {link.label}
                    </NavLink>
                  </li>
                ))}
              </ul>
            </>
          )}

          <div className="sidebar-version">
            <button
              type="button"
              className="sidebar-changelog-btn"
              onClick={openChangelog}
              title="Ver novedades"
            >
              <i className="bi bi-megaphone" />
              <span>Novedades</span>
              {unseenChangelog.length > 0 && <span className="changelog-dot" aria-label="Hay novedades nuevas" />}
            </button>
            <div>
              {storeName} &copy; {new Date().getFullYear()} v{import.meta.env.APP_VERSION}
            </div>
          </div>
        </aside>

        <div className="sidebar-overlay" onClick={handleNav} />

        <div className="content-wrapper">
          <nav className="topbar">
            <div className="topbar-left">
              <button
                type="button"
                className={`hamburger${sidebarOpen ? " open" : ""}`}
                onClick={() => setSidebarOpen((v) => !v)}
                aria-label={sidebarOpen ? "Cerrar menú" : "Abrir menú"}
              >
                <span />
                <span />
                <span />
              </button>
              <span className="topbar-title">{title}</span>
            </div>
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

      {changelogModal && (
        <ChangelogModal
          entries={changelogModal.entries}
          dismissable={changelogModal.dismissable}
          onClose={closeChangelog}
        />
      )}
    </TitleContext.Provider>
  );
}
