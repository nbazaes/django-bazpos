import { Suspense, useEffect, useState } from "react";
import { Outlet, NavLink, useNavigate, useLocation, useSearchParams } from "react-router-dom";
import { getUser, isGerente, isBodeguero, clearTokens } from "../lib/auth";
import { toggleTheme, getStoredTheme } from "../lib/theme";
import { useStoreName, getStoreConfig } from "../lib/storeConfig";
import TitleContext from "../lib/usePageTitle";
import ChangelogModal from "./ChangelogModal";
import ChatWidget from "./ChatWidget";
import PageLoader from "./PageLoader";
import { getUnseenChangelog, getFullChangelog, markChangelogSeen } from "../lib/changelog";

const SIDEBAR_COLLAPSED_STORAGE_KEY = "bazpos_sidebar_collapsed";
const desktopMediaQuery = "(min-width: 1024px)";

const vendedorLinks = [
  { to: "/", label: "Dashboard", icon: "bi-grid-1x2-fill", end: true },
  { to: "/ventas", label: "Ventas", icon: "bi-cart-fill", end: true, highlight: true },
  { to: "/ventas/pedidos", label: "Pedidos", icon: "bi-bag-check" },
  { to: "/ventas/historial", label: "Historial", icon: "bi-clock-history" },
  { to: "/ventas/inventario", label: "Inventario", icon: "bi-boxes" },
  { to: "/configuracion", label: "Configuración", icon: "bi-gear" },
];

const gerenteLinks = [
  { to: "/productos", label: "Productos", icon: "bi-box-seam" },
  { to: "/proveedores", label: "Proveedores", icon: "bi-truck" },
  { to: "/pedidos-proveedores", label: "Pedidos Prov.", icon: "bi-receipt-cutoff" },
  { to: "/usuarios", label: "Usuarios", icon: "bi-people" },
  { to: "/facturas", label: "Facturas", icon: "bi-file-earmark-text" },
  { to: "/reportes", label: "Reportes", icon: "bi-graph-up" },
  { to: "/cierre-caja", label: "Cierre de Caja", icon: "bi-cash-coin" },
];

const bodegueroLinks = [
  { to: "/ventas/inventario", label: "Inventario", icon: "bi-boxes" },
  { to: "/ubicaciones", label: "Ubicaciones", icon: "bi-geo-alt" },
];

function navLinkClass(isActive, highlight, collapsed) {
  return `sidebar-link${isActive ? " active" : ""}${highlight ? " sidebar-link--ventas" : ""}${collapsed ? " sidebar-link--collapsed" : ""}`;
}

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

  const showSupplierOrders = getStoreConfig().feature_flags?.daily_supplier_orders === true;
  const filteredGerenteLinks = showSupplierOrders
    ? gerenteLinks
    : gerenteLinks.filter((link) => link.label !== "Pedidos Prov.");

  const [theme, setTheme] = useState(() => getStoredTheme());
  const [title, setTitle] = useState("Dashboard");
  const [showLogoutModal, setShowLogoutModal] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => {
    try {
      return localStorage.getItem(SIDEBAR_COLLAPSED_STORAGE_KEY) === "true";
    } catch {
      return false;
    }
  });
  const [isDesktop, setIsDesktop] = useState(() => window.matchMedia(desktopMediaQuery).matches);
  const embed = searchParams.get("embed") === "1";
  const [changelogModal, setChangelogModal] = useState(null);
  const unseenChangelog = getUnseenChangelog();
  const storeName = useStoreName();

  useEffect(() => {
    const mediaQuery = window.matchMedia(desktopMediaQuery);
    const updateViewport = () => setIsDesktop(mediaQuery.matches);

    updateViewport();
    mediaQuery.addEventListener("change", updateViewport);
    return () => mediaQuery.removeEventListener("change", updateViewport);
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem(SIDEBAR_COLLAPSED_STORAGE_KEY, String(sidebarCollapsed));
    } catch {
      // The navigation remains usable when browser storage is unavailable.
    }
  }, [sidebarCollapsed]);

  useEffect(() => {
    if (isDesktop) setSidebarOpen(false);
  }, [isDesktop]);

  useEffect(() => {
    if (embed) return;
    if (unseenChangelog.length > 0) {
      markChangelogSeen();
      setChangelogModal({ entries: unseenChangelog, dismissable: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [embed]);

  useEffect(() => {
    if (sidebarOpen && !isDesktop) {
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
  }, [isDesktop, sidebarOpen]);

  function handleNav() {
    setSidebarOpen(false);
  }

  function handleToggleSidebar() {
    if (isDesktop) {
      setSidebarCollapsed((value) => !value);
      return;
    }
    setSidebarOpen((value) => !value);
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
        <Suspense fallback={<PageLoader />}>
          <Outlet />
        </Suspense>
      </TitleContext.Provider>
    );
  }

  const roleName = showGerente ? "Gerente" : showBodeguero ? "Bodeguero" : "Vendedor";
  const sidebarHidden = isDesktop && sidebarCollapsed;

  return (
    <TitleContext.Provider value={setTitle}>
      <div className="flex h-screen overflow-hidden bg-bg-base text-text-primary font-body antialiased">
        {/* Mobile Backdrop */}
        {sidebarOpen && !isDesktop && (
          <div
            className="fixed inset-0 z-40 bg-black/70 backdrop-blur-xs transition-opacity"
            onClick={() => setSidebarOpen(false)}
            aria-hidden="true"
          />
        )}

        {/* SIDEBAR */}
        <aside
          className={`fixed top-0 bottom-0 left-0 z-50 flex flex-col bg-bg-surface border-r border-border-default transition-all duration-200 ease-in-out ${
            isDesktop
              ? sidebarCollapsed
                ? "w-[72px]"
                : "w-[250px]"
              : sidebarOpen
              ? "translate-x-0 w-[260px] shadow-2xl"
              : "-translate-x-full w-[260px]"
          }`}
          inert={sidebarHidden ? "" : undefined}
        >
          {/* Brand / Logo Header */}
          <div className="h-[60px] px-4 border-b border-border-default flex items-center justify-between">
            <NavLink
              to="/"
              onClick={handleNav}
              className="flex items-center gap-3 overflow-hidden text-decoration-none group"
            >
              <div className="w-9 h-9 rounded-xl bg-primary-container/20 border border-primary/30 flex items-center justify-center shrink-0 text-accent group-hover:scale-105 transition-transform">
                <span className="material-symbols-outlined text-xl">storefront</span>
              </div>
              {(!isDesktop || !sidebarCollapsed) && (
                <div className="min-w-0">
                  <h1 className="font-display font-bold text-sm tracking-wide text-text-primary truncate">
                    {storeName || "BazPos"}
                  </h1>
                  <span className="text-[10px] font-mono text-text-muted flex items-center gap-1">
                    <span className="w-1.5 h-1.5 rounded-full bg-success"></span>
                    Terminal Activo
                  </span>
                </div>
              )}
            </NavLink>

            {!isDesktop && (
              <button
                onClick={() => setSidebarOpen(false)}
                className="text-text-muted hover:text-text-primary p-1"
                aria-label="Cerrar menú"
              >
                <span className="material-symbols-outlined text-lg">close</span>
              </button>
            )}
          </div>

          {/* Nav Links List */}
          <div className="flex-1 overflow-y-auto px-3 py-4 space-y-6">
            {/* Main Links */}
            <div>
              {(!isDesktop || !sidebarCollapsed) && (
                <div className="px-3 pb-2 text-[10px] font-bold uppercase tracking-wider text-text-muted font-label-caps">
                  Operaciones
                </div>
              )}
              <ul className="space-y-1">
                {filteredVendedorLinks.map((link) => (
                  <li key={link.to}>
                    <NavLink
                      to={link.to}
                      end={link.end}
                      onClick={handleNav}
                      title={sidebarCollapsed ? link.label : undefined}
                      className={({ isActive }) =>
                        navLinkClass(isActive, link.highlight, sidebarCollapsed && isDesktop)
                      }
                    >
                      <i className={`bi ${link.icon} sidebar-link-icon`} aria-hidden="true" />
                      {(!isDesktop || !sidebarCollapsed) && <span className="truncate">{link.label}</span>}
                    </NavLink>
                  </li>
                ))}
              </ul>
            </div>

            {/* Bodeguero Links */}
            {showBodeguero && (
              <div>
                {(!isDesktop || !sidebarCollapsed) && (
                  <div className="px-3 pb-2 text-[10px] font-bold uppercase tracking-wider text-text-muted font-label-caps border-t border-border-default/60 pt-3">
                    Bodega
                  </div>
                )}
                <ul className="space-y-1">
                  {bodegueroLinks.map((link) => (
                    <li key={link.to}>
                      <NavLink
                        to={link.to}
                        onClick={handleNav}
                        title={sidebarCollapsed ? link.label : undefined}
                        className={({ isActive }) =>
                          navLinkClass(isActive, false, sidebarCollapsed && isDesktop)
                        }
                      >
                        <i className={`bi ${link.icon} sidebar-link-icon`} aria-hidden="true" />
                        {(!isDesktop || !sidebarCollapsed) && <span className="truncate">{link.label}</span>}
                      </NavLink>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* Gerente Links */}
            {showGerente && (
              <div>
                {(!isDesktop || !sidebarCollapsed) && (
                  <div className="px-3 pb-2 text-[10px] font-bold uppercase tracking-wider text-text-muted font-label-caps border-t border-border-default/60 pt-3">
                    Administración
                  </div>
                )}
                <ul className="space-y-1">
                  {filteredGerenteLinks.map((link) => (
                    <li key={link.to}>
                      <NavLink
                        to={link.to}
                        onClick={handleNav}
                        title={sidebarCollapsed ? link.label : undefined}
                        className={({ isActive }) =>
                          navLinkClass(isActive, false, sidebarCollapsed && isDesktop)
                        }
                      >
                        <i className={`bi ${link.icon} sidebar-link-icon`} aria-hidden="true" />
                        {(!isDesktop || !sidebarCollapsed) && <span className="truncate">{link.label}</span>}
                      </NavLink>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>

          {/* Sidebar Footer */}
          <div className="p-3 border-t border-border-default bg-surface-container-low space-y-2">
            {/* Quick POS Button */}
            {(!isDesktop || !sidebarCollapsed) ? (
              <button
                onClick={() => { navigate("/ventas"); handleNav(); }}
                className="w-full py-2 px-3 rounded-xl bg-primary text-on-primary font-bold text-xs hover:bg-primary-container shadow-sm transition-all active:scale-95 flex items-center justify-center gap-2"
              >
                <span className="material-symbols-outlined text-base">add_shopping_cart</span>
                Nueva Venta
              </button>
            ) : (
              <button
                onClick={() => navigate("/ventas")}
                title="Nueva Venta"
                className="w-full h-10 rounded-xl bg-primary text-on-primary flex items-center justify-center shadow-sm hover:bg-primary-container"
              >
                <span className="material-symbols-outlined text-lg">add_shopping_cart</span>
              </button>
            )}

            {/* Bottom Actions */}
            <div className="flex items-center justify-between pt-1 text-xs text-text-muted">
              {(!isDesktop || !sidebarCollapsed) ? (
                <>
                  <button
                    onClick={openChangelog}
                    className="hover:text-accent transition-colors flex items-center gap-1.5 text-[11px] relative"
                    title="Novedades del sistema"
                  >
                    <span className="material-symbols-outlined text-sm">campaign</span>
                    <span>{storeName} v{import.meta.env.APP_VERSION}</span>
                    {unseenChangelog.length > 0 && (
                      <span className="w-2 h-2 rounded-full bg-danger animate-pulse" />
                    )}
                  </button>

                  <button
                    onClick={() => setShowLogoutModal(true)}
                    className="hover:text-danger transition-colors p-1"
                    title="Cerrar sesión"
                  >
                    <span className="material-symbols-outlined text-base">logout</span>
                  </button>
                </>
              ) : (
                <button
                  onClick={() => setShowLogoutModal(true)}
                  className="w-full flex justify-center text-text-muted hover:text-danger p-1"
                  title="Cerrar sesión"
                >
                  <span className="material-symbols-outlined text-base">logout</span>
                </button>
              )}
            </div>
          </div>
        </aside>

        {/* MAIN WRAPPER (TopBar + Content Area) */}
        <div
          className={`flex-1 flex flex-col min-w-0 transition-all duration-200 ease-in-out ${
            isDesktop ? (sidebarCollapsed ? "ml-[72px]" : "ml-[250px]") : "ml-0"
          }`}
        >
          {/* TOPBAR */}
          <header className="h-[60px] sticky top-0 z-30 bg-bg-surface/80 backdrop-blur-md border-b border-border-default flex items-center justify-between px-4 sm:px-6 shadow-xs">
            {/* Left Title & Mobile Menu Toggle */}
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={handleToggleSidebar}
                className="p-1.5 rounded-lg text-text-secondary hover:text-text-primary hover:bg-surface-variant transition-colors"
                aria-label={isDesktop ? (sidebarCollapsed ? "Expandir menú" : "Colapsar menú") : "Abrir menú"}
                title={isDesktop ? (sidebarCollapsed ? "Expandir menú" : "Colapsar menú") : undefined}
              >
                <span className="material-symbols-outlined text-xl">
                  {isDesktop ? (sidebarCollapsed ? "menu_open" : "menu") : "menu"}
                </span>
              </button>
              <h2 className="font-display font-bold text-base sm:text-lg text-text-primary tracking-tight truncate">
                {title}
              </h2>
            </div>

            {/* Right Quick Controls & Profile */}
            <div className="flex items-center gap-2 sm:gap-3">
              {/* Novedades Button */}
              <button
                type="button"
                onClick={openChangelog}
                className="relative p-2 rounded-full text-text-secondary hover:text-accent hover:bg-surface-variant transition-colors"
                title="Novedades"
              >
                <span className="material-symbols-outlined text-xl">notifications</span>
                {unseenChangelog.length > 0 && (
                  <span className="absolute top-1.5 right-1.5 w-2 h-2 rounded-full bg-danger ring-2 ring-bg-surface" />
                )}
              </button>

              {/* Dark/Light Theme Toggle */}
              <button
                type="button"
                onClick={handleToggleTheme}
                className="p-2 rounded-full text-text-secondary hover:text-accent hover:bg-surface-variant transition-colors"
                title={theme === "dark" ? "Cambiar a modo claro" : "Cambiar a modo oscuro"}
              >
                <span className="material-symbols-outlined text-xl">
                  {theme === "dark" ? "light_mode" : "dark_mode"}
                </span>
              </button>

              <div className="h-5 w-px bg-border-default mx-1 hidden sm:block" />

              {/* User Profile Pill */}
              <div className="flex items-center gap-2 pl-1 sm:pl-2">
                <div className="w-8 h-8 rounded-full bg-secondary-container/40 border border-border-default flex items-center justify-center text-accent font-mono text-xs font-bold">
                  {user?.first_name ? user.first_name[0].toUpperCase() : user?.username ? user.username[0].toUpperCase() : "U"}
                </div>
                <div className="hidden sm:block text-left">
                  <div className="text-xs font-bold text-text-primary leading-none">
                    {user?.first_name || user?.username}
                  </div>
                  <div className="text-[10px] text-text-muted mt-0.5 leading-none">
                    {roleName}
                  </div>
                </div>
              </div>

              {/* Logout Button */}
              <button
                type="button"
                onClick={() => setShowLogoutModal(true)}
                className="p-2 rounded-full text-text-muted hover:text-danger hover:bg-danger/10 transition-colors ml-1"
                title="Cerrar sesión"
              >
                <span className="material-symbols-outlined text-xl">logout</span>
              </button>
            </div>
          </header>

          {/* SCROLLABLE MAIN CONTENT */}
          <main className="flex-1 overflow-y-auto p-4 sm:p-6 bg-background">
            <div className="max-w-container-max mx-auto" key={location.pathname}>
              <Suspense fallback={<PageLoader />}>
                <Outlet />
              </Suspense>
            </div>
          </main>
        </div>
      </div>

      {/* Logout Confirmation Dialog */}
      {showLogoutModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-in fade-in duration-150">
          <div className="bg-bg-surface border border-border-default rounded-2xl shadow-2xl max-w-sm w-full p-5 space-y-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-danger/10 text-danger flex items-center justify-center shrink-0">
                <span className="material-symbols-outlined text-xl">logout</span>
              </div>
              <div>
                <h4 className="font-display font-bold text-sm text-text-primary">Cerrar Sesión</h4>
                <p className="text-xs text-text-secondary mt-0.5">¿Estás seguro de que deseas salir del sistema?</p>
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-2 border-t border-border-default">
              <button
                type="button"
                onClick={() => setShowLogoutModal(false)}
                className="px-3.5 py-1.5 rounded-lg text-xs font-bold text-text-secondary hover:text-text-primary hover:bg-surface-variant transition-colors"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleLogout}
                className="px-4 py-1.5 rounded-lg text-xs font-bold bg-danger text-white hover:bg-danger/80 transition-colors shadow-xs"
              >
                Cerrar sesión
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Changelog Modal */}
      {changelogModal && (
        <ChangelogModal
          entries={changelogModal.entries}
          dismissable={changelogModal.dismissable}
          onClose={closeChangelog}
        />
      )}

      <ChatWidget />
    </TitleContext.Provider>
  );
}