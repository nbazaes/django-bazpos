import { NavLink } from "react-router-dom";

export default function MobileBottomNav({ onOpenMenu, menuOpen }) {
  return (
    <nav className="mobile-bottom-nav" aria-label="Navegación rápida móvil">
      <NavLink
        to="/"
        end
        className={({ isActive }) => `mobile-bottom-nav__item${isActive ? " active" : ""}`}
      >
        <i className="bi bi-grid-1x2-fill" aria-hidden="true" />
        <span>Inicio</span>
      </NavLink>

      <NavLink
        to="/ventas"
        end
        className={({ isActive }) => `mobile-bottom-nav__item${isActive ? " active" : ""}`}
      >
        <i className="bi bi-cart-fill" aria-hidden="true" />
        <span>Ventas</span>
      </NavLink>

      <NavLink
        to="/ventas/inventario"
        className={({ isActive }) => `mobile-bottom-nav__item${isActive ? " active" : ""}`}
      >
        <i className="bi bi-boxes" aria-hidden="true" />
        <span>Inventario</span>
      </NavLink>

      <button
        type="button"
        className={`mobile-bottom-nav__item${menuOpen ? " active" : ""}`}
        onClick={onOpenMenu}
        aria-controls="sidebar-navigation"
        aria-expanded={menuOpen}
      >
        <i className={`bi ${menuOpen ? "bi-x-lg" : "bi-list"}`} aria-hidden="true" />
        <span>Menú</span>
      </button>
    </nav>
  );
}
