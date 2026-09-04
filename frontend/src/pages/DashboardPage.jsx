import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useLocation, useNavigate } from "react-router-dom";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import Pagination from "../components/Pagination";
import PageSizeSelector from "../components/PageSizeSelector";
import { usePageTitle } from "../lib/usePageTitle";
import { getUser } from "../lib/auth";
import { apiRequest } from "../lib/api";
import { queryKeys, useDashboardStats, queryKeysPedidoProveedor } from "../lib/queries";
import { useToast } from "../lib/useToast";
import { getStoreConfig, formatMoney } from "../lib/storeConfig";
import ChangelogModal from "../components/ChangelogModal";
import { getFullChangelog } from "../lib/changelog";

const fmtMoney = (n) => formatMoney(n);

export default function DashboardPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const showToast = useToast();
  const user = getUser();
  usePageTitle("Dashboard");
  const didToast = useRef(false);
  const { data, error, isLoading } = useDashboardStats();
  const queryClient = useQueryClient();
  const flags = getStoreConfig().feature_flags || {};
  const showPartsFields = flags.product_oem_fields === true;
  const showOemSubstitutes = flags.oem_stock_substitutes === true;
  const [popoverAbierto, setPopoverAbierto] = useState(null);
  const [popoverPos, setPopoverPos] = useState({ top: 0, left: 0 });
  const [stockPage, setStockPage] = useState(1);
  const [stockPageSize, setStockPageSize] = useState(10);
  const popoverRef = useRef(null);
  const [changelogModalOpen, setChangelogModalOpen] = useState(false);

  useEffect(() => {
    if (!popoverAbierto) return;
    const handleClickOutside = (e) => {
      if (popoverRef.current && !popoverRef.current.contains(e.target)) {
        setPopoverAbierto(null);
      }
    };
    const handleEscape = (e) => {
      if (e.key === "Escape") setPopoverAbierto(null);
    };
    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("keydown", handleEscape);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleEscape);
    };
  }, [popoverAbierto]);

  const ignorarMutation = useMutation({
    mutationFn: ({ productoId, accion }) =>
      apiRequest(`/productos/${productoId}/ignorar-stock/`, {
        method: "POST",
        body: { accion },
      }),
    onMutate: async ({ productoId }) => {
      await queryClient.cancelQueries({ queryKey: queryKeys.dashboard });
      const previousDashboard = queryClient.getQueryData(queryKeys.dashboard);

      if (popoverAbierto === productoId) {
        setPopoverAbierto(null);
      }

      queryClient.setQueryData(queryKeys.dashboard, (old) => {
        if (!old?.stock?.bajo_minimo) return old;
        return {
          ...old,
          stock: {
            ...old.stock,
            bajo_minimo: old.stock.bajo_minimo.filter(
              (p) => p.producto_id !== productoId
            ),
          },
        };
      });

      return { previousDashboard };
    },
    onError: (err, _, context) => {
      if (context?.previousDashboard) {
        queryClient.setQueryData(queryKeys.dashboard, context.previousDashboard);
      }
      showToast(err.message || "No se pudo actualizar el producto", "danger");
    },
    onSuccess: (_, variables) => {
      const mensaje =
        variables.accion === "recordar_manana"
          ? "Producto recordado para mañana"
          : "Producto ignorado permanentemente";
      showToast(mensaje, "success");
    },
  });

  const agregarPedidoMutation = useMutation({
    mutationFn: (productoId) =>
      apiRequest("/pedidos-proveedor/agregar-item/", {
        method: "POST",
        body: { producto_id: productoId },
      }),
    onMutate: async (productoId) => {
      await queryClient.cancelQueries({ queryKey: queryKeys.dashboard });
      const previousDashboard = queryClient.getQueryData(queryKeys.dashboard);

      queryClient.setQueryData(queryKeys.dashboard, (old) => {
        if (!old?.stock) return old;
        const currentList = old.stock.productos_en_pedido || [];
        if (currentList.includes(productoId)) return old;
        return {
          ...old,
          stock: {
            ...old.stock,
            productos_en_pedido: [...currentList, productoId],
          },
        };
      });

      return { previousDashboard };
    },
    onError: (err, _, context) => {
      if (context?.previousDashboard) {
        queryClient.setQueryData(queryKeys.dashboard, context.previousDashboard);
      }
      showToast(err.message || "No se pudo agregar el producto", "danger");
    },
    onSuccess: () => {
      showToast("Producto agregado a la lista de pedidos", "success");
      queryClient.invalidateQueries({ queryKey: queryKeysPedidoProveedor.all });
    },
  });

  useEffect(() => {
    if (!didToast.current && location.state?.welcome) {
      didToast.current = true;
      showToast(`Bienvenido, ${location.state.welcome}`, "success");
      navigate(".", { replace: true, state: {} });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="space-y-6 max-w-container-max mx-auto">
      {error && (
        <div className="flex items-center justify-between p-4 rounded-xl bg-danger/10 border border-danger/30 text-danger">
          <span>{error.message}</span>
        </div>
      )}

      {isLoading && !data && (
        <div className="py-20 text-center text-text-muted space-y-3">
          <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin mx-auto" />
          <p className="text-sm">Cargando métricas de la tienda...</p>
        </div>
      )}

      {data && (
        <>
          {/* Welcome Header */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-2">
            <div>
              <h2 className="font-display text-xl sm:text-2xl font-bold text-text-accent">
                Hola, {user?.first_name || user?.username} 👋
              </h2>
              <p className="text-xs sm:text-sm text-text-secondary mt-0.5">
                Resumen de actividad y estado operativo en tiempo real.
              </p>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => navigate("/ventas")}
                className="px-4 py-2 rounded-lg bg-primary text-on-primary font-bold text-xs hover:bg-primary-container shadow-md transition-all active:scale-95 flex items-center gap-1.5"
              >
                <span className="material-symbols-outlined text-base">point_of_sale</span>
                Nueva Venta
              </button>
              {data.es_gerente && (
                <button
                  onClick={() => navigate("/cierre-caja")}
                  className="px-3.5 py-2 rounded-lg border border-border-default text-text-secondary hover:text-text-accent hover:bg-surface-variant font-bold text-xs transition-colors flex items-center gap-1"
                >
                  <span className="material-symbols-outlined text-base">account_balance_wallet</span>
                  Cierre de Caja
                </button>
              )}
            </div>
          </div>

          {/* Stat Cards Grid */}
          <section className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {/* Card 1: Ventas Hoy */}
            <div className="stat-card bg-bg-surface border border-border-default rounded-xl p-4 shadow-sm hover:translate-y-[-1px] transition-transform">
              <div className="flex justify-between items-start mb-2">
                <span className="font-label-caps text-xs text-text-muted uppercase tracking-wider font-semibold">Ventas Hoy</span>
                <span className="material-symbols-outlined text-success text-lg">trending_up</span>
              </div>
              <div className="font-mono text-2xl font-bold text-text-accent mt-1">
                {fmtMoney(data.ventas_dia.total)}
              </div>
              <div className="text-xs text-text-secondary mt-1 flex items-center gap-1.5 flex-wrap">
                <span>{fmtMoney(data.ventas_dia.total_vendido)} vendido</span>
                {data.ventas_dia.devoluciones > 0 && (
                  <span className="text-danger">· -{fmtMoney(data.ventas_dia.devoluciones)} dev.</span>
                )}
                {data.ventas_dia.anulaciones > 0 && (
                  <span className="text-danger">· -{fmtMoney(data.ventas_dia.anulaciones)} anul.</span>
                )}
              </div>
            </div>

            {/* Card 2: Transacciones Hoy */}
            <div className="stat-card bg-bg-surface border border-border-default rounded-xl p-4 shadow-sm hover:translate-y-[-1px] transition-transform">
              <div className="flex justify-between items-start mb-2">
                <span className="font-label-caps text-xs text-text-muted uppercase tracking-wider font-semibold">Transacciones</span>
                <span className="material-symbols-outlined text-info text-lg">receipt</span>
              </div>
              <div className="font-mono text-2xl font-bold text-text-accent mt-1">
                {data.ventas_dia.cantidad}
              </div>
              <div className="text-xs text-text-secondary mt-1">
                {data.ventas_dia.desglose?.length || 1} vendedores activos
              </div>
            </div>

            {/* Card 3: Stock Bajo Mínimo */}
            <div className="stat-card bg-bg-surface border border-border-default rounded-xl p-4 shadow-sm hover:translate-y-[-1px] transition-transform">
              <div className="flex justify-between items-start mb-2">
                <span className="font-label-caps text-xs text-text-muted uppercase tracking-wider font-semibold">Stock Bajo</span>
                <span className="material-symbols-outlined text-warning text-lg">warning</span>
              </div>
              <div className="font-mono text-2xl font-bold text-text-accent mt-1">
                {data.stock.bajo_minimo?.length || 0}
              </div>
              <div className="text-xs text-text-secondary mt-1">
                {data.stock.bajo_minimo?.length > 0 ? (
                  <span className="text-warning font-medium">Requieren atención</span>
                ) : (
                  <span className="text-success font-medium">Niveles óptimos</span>
                )}
              </div>
            </div>

            {/* Card 4: Catálogo / Cierre */}
            <div className="stat-card bg-bg-surface border border-border-default rounded-xl p-4 shadow-sm hover:translate-y-[-1px] transition-transform">
              <div className="flex justify-between items-start mb-2">
                <span className="font-label-caps text-xs text-text-muted uppercase tracking-wider font-semibold">Total Productos</span>
                <span className="material-symbols-outlined text-accent text-lg">inventory_2</span>
              </div>
              <div className="font-mono text-2xl font-bold text-text-accent mt-1">
                {data.stock.total_productos}
              </div>
              <div className="text-xs text-text-secondary mt-1">
                En catálogo general
              </div>
            </div>
          </section>

          {/* Two-Column Section */}
          <section className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
            {/* Left Column: Ventas por Vendedor / Resumen (8 cols) */}
            <div className="lg:col-span-8 bg-bg-surface border border-border-default rounded-xl shadow-sm flex flex-col overflow-hidden">
              <div className="p-4 border-b border-border-default flex justify-between items-center bg-surface-container-low">
                <h3 className="font-display text-base font-bold text-text-accent flex items-center gap-2">
                  <span className="material-symbols-outlined text-accent text-lg">payments</span>
                  {data.es_gerente ? "Ventas por Vendedor" : "Mis Ventas de Hoy"}
                </h3>
                {data.es_gerente && (
                  <button
                    onClick={() => navigate("/reportes")}
                    className="text-xs text-accent hover:text-primary-container font-bold transition-colors"
                  >
                    Ver reportes &rarr;
                  </button>
                )}
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs pos-table">
                  <thead className="bg-surface-container-high border-b border-border-default text-text-muted">
                    <tr>
                      <th className="py-3 px-4 font-label-caps">Vendedor</th>
                      <th className="py-3 px-4 font-label-caps text-right">Total ($)</th>
                      <th className="py-3 px-4 font-label-caps text-center">Tickets</th>
                      <th className="py-3 px-4 font-label-caps text-center">Estado</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border-default font-body text-text-secondary">
                    {data.ventas_dia.desglose && data.ventas_dia.desglose.length > 0 ? (
                      data.ventas_dia.desglose.map((row, i) => (
                        <tr key={i} className="hover:bg-surface-container-low transition-colors">
                          <td className="py-3 px-4 font-bold text-text-accent">{row.vendedor}</td>
                          <td className="py-3 px-4 text-right">
                            <div className="font-mono font-bold text-text-accent text-sm">
                              {fmtMoney(row.total)}
                            </div>
                            <div className="text-[11px] text-text-muted">
                              {fmtMoney(row.total_vendido)} vendido
                              {row.devoluciones > 0 && <span> · -{fmtMoney(row.devoluciones)} dev.</span>}
                              {row.anulaciones > 0 && <span> · -{fmtMoney(row.anulaciones)} anul.</span>}
                            </div>
                          </td>
                          <td className="py-3 px-4 font-mono text-center text-text-accent">{row.cantidad}</td>
                          <td className="py-3 px-4 text-center">
                            <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold bg-success/10 text-success border border-success/20">
                              Activo
                            </span>
                          </td>
                        </tr>
                      ))
                    ) : (
                      <tr>
                        <td colSpan={4} className="py-8 text-center text-text-muted">
                          No se han registrado ventas hoy.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Right Column: Alertas & Novedades (4 cols) */}
            <div className="lg:col-span-4 flex flex-col gap-6">
              {/* Alertas de Stock */}
              <div className="bg-bg-surface border border-border-default rounded-xl shadow-sm flex flex-col overflow-hidden">
                <div className="p-4 border-b border-border-default flex justify-between items-center bg-surface-container-low">
                  <h3 className="font-display text-sm font-bold text-text-accent flex items-center gap-2">
                    <span className="material-symbols-outlined text-warning text-base">warning</span>
                    Alertas de Stock
                  </h3>
                  <span className="text-xs font-mono text-text-muted">
                    {data.stock.bajo_minimo?.length || 0} items
                  </span>
                </div>

                {data.stock.bajo_minimo && data.stock.bajo_minimo.length > 0 ? (() => {
                  const bajoMinimoList = data.stock.bajo_minimo;
                  const stockCount = bajoMinimoList.length;
                  const stockTotalPages = Math.max(1, Math.ceil(stockCount / stockPageSize));
                  const activeStockPage = Math.max(1, Math.min(stockPage, stockTotalPages));
                  const paginatedBajoMinimo = bajoMinimoList.slice(
                    (activeStockPage - 1) * stockPageSize,
                    activeStockPage * stockPageSize
                  );

                  const handleStockPageSizeChange = (newSize) => {
                    setStockPageSize(newSize);
                    setStockPage(1);
                  };

                  return (
                    <>
                      <div className="p-3 max-h-[320px] overflow-y-auto space-y-2.5">
                        {paginatedBajoMinimo.map((p) => {
                          const yaAgregado = (data.stock.productos_en_pedido || []).includes(p.producto_id);
                          const tieneAlternativas = showOemSubstitutes && p.oem_productos && p.oem_productos.length > 0;
                          return (
                            <div
                              key={p.producto_id}
                              className="p-3 rounded-lg bg-surface-container border border-border-default hover:bg-surface-container-high transition-colors space-y-2"
                            >
                              <div className="flex justify-between items-start gap-2">
                                <div className="min-w-0">
                                  <div className="text-xs font-bold text-text-accent truncate" title={p.nombre}>
                                    {p.nombre}
                                  </div>
                                  <div className="text-[10px] text-text-muted font-mono flex items-center gap-1">
                                    <span>{p.codigo_producto}</span>
                                    {showPartsFields && p.oem && <span>· OEM: {p.oem}</span>}
                                    {tieneAlternativas && (
                                      <button
                                        type="button"
                                        className="text-warning hover:text-white inline-flex items-center"
                                        onClick={(e) => {
                                          if (popoverAbierto === p.producto_id) {
                                            setPopoverAbierto(null);
                                          } else {
                                            const rect = e.currentTarget.getBoundingClientRect();
                                            const approxHeight = 160;
                                            const popoverWidth = 300;
                                            const spaceBelow = window.innerHeight - rect.bottom;
                                            const showAbove = spaceBelow < approxHeight && rect.top > approxHeight;
                                            const top = showAbove ? rect.top - 8 : rect.bottom + 8;
                                            const left = Math.max(
                                              8,
                                              Math.min(
                                                window.innerWidth - popoverWidth - 8,
                                                rect.left + rect.width / 2 - popoverWidth / 2
                                              )
                                            );
                                            setPopoverPos({ top, left });
                                            setPopoverAbierto(p.producto_id);
                                          }
                                        }}
                                        title="Ver productos con mismo OEM con stock"
                                        aria-expanded={popoverAbierto === p.producto_id}
                                      >
                                        <span className="material-symbols-outlined text-xs">info</span>
                                      </button>
                                    )}
                                  </div>
                                </div>
                                <div className="text-right shrink-0">
                                  <div className="text-danger font-mono text-xs font-bold">
                                    {p.stock_actual} uds
                                  </div>
                                  <div className="text-[9px] text-text-muted uppercase">
                                    Min: {p.stock_minimo}
                                  </div>
                                </div>
                              </div>

                              {/* Quick Action Pills */}
                              <div className="flex items-center gap-1.5 pt-1 border-t border-border-default/50 text-[10px]">
                                <button
                                  onClick={() => ignorarMutation.mutate({ productoId: p.producto_id, accion: "recordar_manana" })}
                                  disabled={ignorarMutation.isPending}
                                  className="px-2 py-0.5 rounded bg-bg-input text-text-secondary hover:text-text-accent border border-border-default transition-colors"
                                >
                                  Mañana
                                </button>
                                <button
                                  onClick={() => ignorarMutation.mutate({ productoId: p.producto_id, accion: "ignorar_permanente" })}
                                  disabled={ignorarMutation.isPending}
                                  className="px-2 py-0.5 rounded bg-bg-input text-text-secondary hover:text-text-accent border border-border-default transition-colors"
                                >
                                  Ignorar
                                </button>
                                <button
                                  onClick={() => agregarPedidoMutation.mutate(p.producto_id)}
                                  disabled={agregarPedidoMutation.isPending || yaAgregado}
                                  className={`ml-auto px-2 py-0.5 rounded font-bold transition-colors ${
                                    yaAgregado
                                      ? "bg-success/10 text-success border border-success/30"
                                      : "bg-primary text-on-primary hover:bg-primary-container"
                                  }`}
                                >
                                  {yaAgregado ? "En pedido" : "+ Pedir"}
                                </button>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                      <div className="flex flex-wrap items-center justify-between gap-3 p-3 border-t border-border-default">
                        <PageSizeSelector
                          value={stockPageSize}
                          onChange={handleStockPageSizeChange}
                          options={[10, 25, 50]}
                        />
                        <Pagination
                          page={activeStockPage}
                          totalPages={stockTotalPages}
                          onPageChange={setStockPage}
                          count={stockCount}
                          pageSize={stockPageSize}
                        />
                      </div>
                    </>
                  );
                })() : (
                  <div className="py-8 text-center text-text-muted text-xs">
                    No hay productos bajo stock mínimo.
                  </div>
                )}
              </div>

              {/* Novedades del Sistema */}
              <div className="bg-bg-elevated border border-border-default rounded-xl shadow-sm p-4 relative overflow-hidden space-y-2">
                <div className="absolute top-0 left-0 w-full h-1 gradient-strip"></div>
                <h4 className="font-display text-sm font-bold text-text-accent flex items-center gap-2">
                  <span className="material-symbols-outlined text-accent text-base">campaign</span>
                  Novedades del Sistema
                </h4>
                <p className="text-xs text-text-secondary leading-relaxed">
                  Actualización con rediseño Google Stitch y soporte para Tailwind CSS v4. Consulta el registro de cambios.
                </p>
                <button
                  onClick={() => setChangelogModalOpen(true)}
                  className="text-xs text-accent font-bold hover:underline inline-flex items-center gap-1 mt-1"
                >
                  Ver notas de versión &rarr;
                </button>
              </div>
            </div>
          </section>

          {/* OEM Stock Popover Portal */}
          {(() => {
            const productoActivo = data.stock.bajo_minimo?.find(
              (p) => p.producto_id === popoverAbierto
            );
            return (
              productoActivo &&
              createPortal(
                <div
                  ref={popoverRef}
                  className="stock-popover is-open fixed z-50 p-3 rounded-xl bg-bg-surface border border-border-default shadow-2xl text-xs space-y-2"
                  style={{ top: popoverPos.top, left: popoverPos.left, width: 300 }}
                  onClick={(e) => e.stopPropagation()}
                >
                  <div className="font-bold text-text-accent border-b border-border-default pb-1">
                    Productos con mismo OEM en stock
                  </div>
                  <ul className="space-y-1.5 max-h-40 overflow-y-auto">
                    {productoActivo.oem_productos.map((op) => (
                      <li key={op.producto_id} className="flex flex-col">
                        <div className="flex justify-between items-center">
                          <span className="truncate">{op.nombre}</span>
                          <strong className="font-mono text-success ml-2">{op.stock_actual}</strong>
                        </div>
                        <div className="text-[10px] text-text-muted font-mono">{op.codigo_producto}</div>
                        {op.ubicaciones && op.ubicaciones.length > 0 && (
                          <div className="text-[10px] text-text-muted flex flex-wrap gap-1 mt-0.5">
                            {op.ubicaciones.map((u) => (
                              <span key={u.nombre} className="bg-bg-input px-1 py-0.5 rounded">
                                {u.nombre}: {u.cantidad}
                              </span>
                            ))}
                          </div>
                        )}
                      </li>
                    ))}
                  </ul>
                </div>,
                document.body
              )
            );
          })()}

          {/* Changelog Modal */}
          {changelogModalOpen && (
            <ChangelogModal
              entries={getFullChangelog()}
              dismissable={true}
              onClose={() => setChangelogModalOpen(false)}
            />
          )}
        </>
      )}
    </div>
  );
}