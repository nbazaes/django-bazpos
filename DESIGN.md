# BazPOS — Sistema de Diseño & Especificación de Rediseño (v2.0)

> **Estado actual**: rediseño activo e integrado en `staging` (rama `feat/redesign-v2`).
> Enfoque **híbrido-gradual**: las pantallas principales (Shell, POS, Dashboard) usan **Tailwind CSS v4** + tokens Stitch; el resto de módulos conserva su estructura y recibe el mismo lenguaje visual vía `design-system.css`.

---

## 1. Visión & Objetivos

1. **Modernización Visual & Ergonómica**: punto de venta y panel administrativo de alta gama, dark-mode nativo de alto contraste, acentos violetas/púrpura y tipografía distintiva.
2. **Alta Eficiencia para Cajeros & Operadores**: flujos rápidos para escaneo de código de barras, selección de productos, pagos mixtos y control de inventario sin fricción.
3. **Compatibilidad Híbrida Gradual**: convivencia transparente entre **Tailwind CSS v4** y el sistema previo de variables CSS (`design-system.css`).
4. **Consistencia sin cambiar el flujo**: el lenguaje nuevo se aplica a los módulos legacy solo a nivel de estilo (tablas, botones, encabezados, modales, alertas, inputs), sin mover posiciones ni alterar funcionalidades.

---

## 2. Fundamentos del Sistema de Diseño (Design Tokens)

### 2.1. Paleta de Colores

Los tokens de color de Tailwind (`@theme` en `frontend/src/index.css`) se **enlazan a las variables de `design-system.css`** para que el tema claro/oscuro y los esquemas de color seleccionables sigan funcionando en todo el sistema:

| Token Tailwind | Fuente | Uso |
| :--- | :--- | :--- |
| `--color-primary` / `--color-accent` | `var(--primary)` (= `--accent`) | Color de marca, botones principales, totales |
| `--color-primary-container` | `var(--accent-hover)` | Hover de botones primarios y acentos |
| `--color-on-primary` | `var(--on-accent)` | Texto sobre botones primarios |
| `--color-bg-base/surface/elevated/input` | `var(--bg-*)` | Fondos de app, tarjetas, paneles, inputs |
| `--color-border-default` | `var(--border-default)` | Bordes y divisores |
| `--color-text-primary/secondary/muted` | `var(--text-*)` | Jerarquía de texto |
| `--color-success/warning/danger/info` | `var(--success/warning/danger/info)` | Estados semánticos |
| `--color-secondary-container` | estático `#4f319c` | Chips/acentos (hoy solo en el POS/estados) |
| `--color-surface-container*` | `var(--bg-hover/bg-elevated)` | Fondo de filas, cabeceras y paneles |

### 2.2. Escala de Radios (más redondez)

Definida en `@theme` (única fuente de verdad; `design-system.css` ya no la redefine):

| Token | Valor |
| :--- | :--- |
| `--radius-sm` | `8px` |
| `--radius-md` | `12px` (botones `btn-sm`, inputs) |
| `--radius-lg` | `16px` (**botones** estándar) |
| `--radius-xl` | `20px` (tarjetas) |
| `--radius-2xl` | `24px` (modales) |
| `--radius-3xl` / `4xl` | `28px` / `32px` |

Regla de oro: **los botones comparten el mismo lenguaje en toda la app** (16px, bold 700, primario con sombra suave, efecto de presión `scale(0.96)`).

### 2.3. Tipografía

Integrada vía Google Fonts en `frontend/index.html`:

- **Display & Encabezados (`--font-display: 'Syne'`)**: marcas, títulos de módulo, `h1–h6`, títulos de tarjetas (`PageCard`).
- **Cuerpo & Formularios (`--font-body: 'DM Sans'`)**: navegación, etiquetas, tablas y controles.
- **Cifras & Datos Técnicos (`--font-mono: 'JetBrains Mono'`)**: precios (`$1.990`), OEM, SKUs, códigos de barra y comprobantes.

### 2.4. Iconografía

- **Pantallas rediseñadas (Shell, POS, Dashboard)**: **Google Material Symbols Outlined** (`<span className="material-symbols-outlined">…</span>`).
- **Sidebar + módulos legacy**: **Bootstrap Icons** (`bi bi-*`) — la navegación lateral conserva deliberadamente los iconos clásicos.

### 2.5. Clases Utilitarias Propias

```css
/* Tira con gradiente decorativo en tarjetas destacadas */
.gradient-strip { background: linear-gradient(90deg, #d0bcff 0%, #8b5cf6 100%); }

/* Tarjeta estadística con borde superior luminoso */
.stat-card { position: relative; }
.stat-card::before {
  content: ''; position: absolute; top: 0; left: 0; right: 0; height: 3px;
  background: linear-gradient(90deg, #d0bcff 0%, #a078ff 100%);
  border-top-left-radius: 0.5rem; border-top-right-radius: 0.5rem;
}

/* Encabezados compactos de tablas (POS y CRUDs) */
.pos-table th, .table thead th {
  text-transform: uppercase; font-size: 0.7rem; letter-spacing: 0.05em;
}

/* Sidebar: enlace de navegación con look clásico (raíl de acento) */
.sidebar-link { border-left: 3px solid transparent; ... }
.sidebar-link:hover, .sidebar-link.active { background: var(--bg-hover); color: var(--text-primary); border-left-color: var(--accent); }
.sidebar-link--collapsed { padding-left: 0; padding-right: 0; justify-content: center; }
```

---

## 3. Estado de la Implementación

### 3.1. Infraestructura de Estilos
- [x] `tailwindcss` + `@tailwindcss/vite` (Tailwind v4) en `frontend/vite.config.js`.
- [x] Fuentes y Material Symbols en `frontend/index.html`.
- [x] Tokens `@theme` en `frontend/src/index.css` enlazados a `design-system.css`.
- [x] Escala de radios unificada en `@theme`.
- [x] Carpeta `frontend/src/stitch/` con prototipos.

### 3.2. Navegación Principal (`frontend/src/components/Shell.jsx`)
- [x] **Topbar**: sticky con *glassmorphism* (`backdrop-blur-md`), título dinámico por vista, campana de novedades, alternador de tema Claro/Oscuro y badge de usuario con rol (`Gerente`, `Vendedor`, `Bodeguero`).
- [x] **Sidebar**:
  - **Header**: logo + nombre de tienda.
  - Navegación agrupada por rol: *Operaciones* (Vendedor), *Bodega* (Bodeguero), *Administración* (Gerente).
  - **Botones de navegación con look clásico** (decisión de producto): iconos Bootstrap, raíl izquierdo de acento de 3px y fondo `bg-hover` en hover/activo.
  - **Colapsable 250px ↔ 72px** (en colapso se siguen mostrando los iconos) y menú lateral en móviles.
  - **Footer**: botón **"Nueva Venta"**, nombre de tienda + versión (`BAZPOS v2.0.0`) y lanzador de novedades con punto de notificación.
  - Gateo por feature flags (`daily_supplier_orders`) y `Suspense`/`PageLoader` (rutas lazy).

### 3.3. Punto de Venta (`frontend/src/pages/VentaPage.jsx`)
- [x] **Layout single-column** (decisión de producto): tarjeta de búsqueda → **carrito en su posición original** (tarjeta full-width).
- [x] **Resultados de búsqueda como overlay sobre el carrito (eje z)**: panel `absolute left-0 right-0 top-0 z-10`, altura máxima `70vh` con scroll, contador de resultados y botón **Cerrar**; al limpiar la búsqueda el carrito reaparece con los ítems acumulados.
- [x] **Vista de resultados por defecto en lista (tabla)**, con conmutador Grid/Lista; la preferencia se conserva **por terminal** (`localStorage["bazpos_venta_vista"]`).
- [x] Buscador con debounce (OEM/texto), escáner de código de barra con feedback verde/rojo, filtro "mostrar sin stock".
- [x] **Carrito**: ítems con steppers `+`/`-`, descuento porcentual interactivo, desglose financiero (Subtotal, Descuento, Neto, IVA configurable, Total con redondeo chileno `roundSaleTotal`) y acciones **Cobrar** / **Generar Cotización**.
- [x] **Pago configurable**: documentos fiscales y medios de pago desde `effective_document_types` / `effective_payment_methods`; soporte de **pagos mixtos** con validación de saldo.
- [x] Modal de deducción de stock por ubicación (simple o **reparto mixto**), comprobante con vista previa/impresión, banner de cotización origen.
- [x] **Ventas resilientes**: idempotencia (`idempotencia_key`), reintentos automáticos con espera progresiva, verificación manual y aviso offline (carrito persistente).

### 3.4. Dashboard Ejecutivo (`frontend/src/pages/DashboardPage.jsx`)
- [x] **Conservado íntegro** (decisión de producto):
  - 4 Stat Cards (Ventas Hoy, Transacciones, Stock Bajo, Total Productos) con tira de gradiente.
  - Tabla de ventas por vendedor en tiempo real.
  - Panel de alertas de stock bajo mínimo con **paginación**, acciones rápidas (*Mañana*, *Ignorar*, *+ Pedir*) y actualización optimista.
  - Popover de alternativas del mismo OEM con stock.
  - Tarjeta de Novedades conectada al `ChangelogModal`.
  - Formato monetario configurable (`formatMoney`) y feature flags (`product_oem_fields`, `oem_stock_substitutes`).

### 3.5. Módulos Legacy (nuevo lenguaje vía `design-system.css`)
- [x] **Tablas** (`table`/`table-bordered`): banda de encabezado (`bg-hover`, uppercase, letter-spacing) + **divisores de fila** (sin rejilla vertical), idénticas al lenguaje del POS.
- [x] **Botones** (`.btn`/`.btn-sm`/`.btn-lg`): radio 16px (12px en chico), bold 700, primario con sombra, `:active { scale(0.96) }`.
- [x] **Encabezados**: `h1–h6` y títulos de `PageCard` en Syne 700.
- [x] **Login** (`.auth-card`): radio 20px con banda de gradiente superior.
- [x] **Inputs** (`.form-control`): radio 12px y focus con anillo de acento.
- [x] **Modales** (`.modal-content`): radio 24px con header/footer de superficie y banda de gradiente.
- [x] **Empty states**: contenedor de borde punteado.

---

## 4. Decisiones de Diseño Tomadas (Conservar / Revertir)

Durante la integración se tomaron decisiones de producto que **modificaron el rediseño original**:

| Área | Decisión |
| :--- | :--- |
| Sidebar (botones de navegación) | **Revertidos** al look clásico: iconos Bootstrap, raíl de acento, sin chip redondeado. Se conservan header, footer y topbar nuevos. |
| Sidebar (colapso) | El colapso **mantiene los iconos visibles** (72px). |
| Sidebar (footer) | Nombre de la tienda a la izquierda de la versión. |
| POS (layout) | **Revertido** a single-column; el carrito vuelve a su posición original. |
| POS (resultados) | Los resultados **cubren el carrito en el eje z** en lugar de empujarlo. |
| POS (vista) | Por defecto **lista** (no tarjetas), preferencia por terminal. |
| Botones (toda la app) | **Más redondez** (16px) — el nuevo lenguaje, no el antiguo. |
| Dashboard | **Conservado al completo**. |
| Módulos legacy | Conservan posiciones/layout/flujo; adoptan el lenguaje nuevo (tablas, botones, encabezados, etc.) solo a nivel CSS. |
| Iconos | Material Symbols en pantallas rediseñadas; Bootstrap en sidebar y legacy. |

---

## 5. Hoja de Ruta Restante

Con la adaptación CSS ya aplicada a toda la app, queda pendiente (opcional, por prioridad):

1. **Auditoría de accesibilidad & QA final**: foco visible, `prefers-reduced-motion`, contraste y navegación por teclado.
2. **Pulido fino** (micro-interacciones y animaciones de modales).
3. **Migración Tailwind pantalla por pantalla** (profundizar el lenguaje en módulos legacy, opcional).
4. **Merge a `main` & Release Mayor (v2.0.0)**.

---

## 6. Comandos de Verificación & Build

```bash
cd frontend
npm run lint       # ESLint
npm run build      # Vite + Tailwind v4
npm run dev        # servidor de desarrollo
```

---

*Documento de referencia del sistema de diseño de BazPOS v2.0 — sincronizado con `staging`.*