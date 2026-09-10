import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useLocation, useNavigate } from "react-router-dom";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import PageCard from "../components/PageCard";
import Pagination from "../components/Pagination";
import PageSizeSelector from "../components/PageSizeSelector";
import ProductoForm from "../components/ProductoForm";
import AjusteStockModal from "../components/AjusteStockModal";
import { usePageTitle } from "../lib/usePageTitle";
import { getUser, isBodeguero, isGerente } from "../lib/auth";
import { apiRequest } from "../lib/api";
import { queryKeys, useDashboardStats, queryKeysPedidoProveedor } from "../lib/queries";
import { useToast } from "../lib/useToast";

const fmtMoney = (n) => `$${Number(n || 0).toLocaleString()}`;

function StatCard({ title, value, variant, breakdown }) {
  return (
    <div className={`stat-card stat-card-${variant}`}>
      <div className="stat-label">{title}</div>
      <div className="stat-value">{value}</div>
      {breakdown && breakdown.length > 0 && (
        <div className="stat-breakdown">
          {breakdown.map((line, i) => (
            <div key={i}>{line}</div>
          ))}
        </div>
      )}
    </div>
  );
}

export default function DashboardPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const showToast = useToast();
  const user = getUser();
  const esGerenteOEncargado = isGerente(user);
  const puedeAjustar = isBodeguero(user);
  usePageTitle("Dashboard");
  const didToast = useRef(false);
  const { data, error } = useDashboardStats();
  const queryClient = useQueryClient();
  const [popoverAbierto, setPopoverAbierto] = useState(null);
  const [popoverPos, setPopoverPos] = useState({ top: 0, left: 0 });
  const [stockPage, setStockPage] = useState(1);
  const [stockPageSize, setStockPageSize] = useState(10);
  const [editarProductoId, setEditarProductoId] = useState(null);
  const [ajusteProducto, setAjusteProducto] = useState(null);
  const popoverRef = useRef(null);

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
    <>
      {error && <div className="alert alert-danger">{error.message}</div>}
      {data && (
        <>
          <div className="welcome-section">
            <h1>Bienvenido, {user?.first_name || user?.username}</h1>
            {data.es_gerente && (
              <button
                className="btn btn-primary"
                onClick={() => navigate("/cierre-caja")}
                style={{ marginTop: "0.5rem" }}
              >
                Cierre de caja
              </button>
            )}
          </div>
          <div className="row mb-4">
            <div className="col-md-4">
              <StatCard
                title="Total ventas hoy"
                value={fmtMoney(data.ventas_dia.total)}
                variant="success"
                breakdown={[
                  `${fmtMoney(data.ventas_dia.total_vendido)} vendido`,
                  data.ventas_dia.devoluciones
                    ? `- ${fmtMoney(data.ventas_dia.devoluciones)} devoluciones`
                    : null,
                ].filter(Boolean)}
              />
            </div>
            <div className="col-md-4">
              <StatCard
                title="Cantidad ventas"
                value={data.ventas_dia.cantidad}
                variant="info"
              />
            </div>
            <div className="col-md-4">
              <StatCard
                title="Total productos"
                value={data.stock.total_productos}
                variant="purple"
              />
            </div>
          </div>
          {data.ventas_dia.desglose && data.ventas_dia.desglose.length > 0 && (
            <div className="mb-4">
              <PageCard title={data.es_gerente ? "Ventas por vendedor" : "Mis ventas de hoy"}>
                <div className="table-responsive">
                  <table className="table table-sm table-bordered">
                    <thead>
                      <tr><th>Vendedor</th><th>Total ($)</th><th>Cantidad</th></tr>
                    </thead>
                    <tbody>
                      {data.ventas_dia.desglose.map((row, i) => (
                        <tr key={i}>
                          <td>{row.vendedor}</td>
                          <td>
                            <strong>{fmtMoney(row.total)}</strong>
                            <div className="stat-breakdown">
                              {fmtMoney(row.total_vendido)} vendido
                              {row.devoluciones
                                ? <> · - {fmtMoney(row.devoluciones)} dev.</>
                                : null}
                            </div>
                          </td>
                          <td>{row.cantidad}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </PageCard>
            </div>
          )}
          {data.stock.bajo_minimo && data.stock.bajo_minimo.length > 0 && (() => {
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
              <div className="mb-4">
                <PageCard title="Productos bajo stock mínimo">
                  <div className="table-responsive">
                    <table className="table table-sm table-bordered">
                      <thead>
                        <tr>
                          <th style={{ width: "40px" }}></th>
                          <th>Nombre</th>
                          <th>Código</th>
                          <th className="hide-mobile">OEM</th>
                          <th className="hide-mobile">Proveedor</th>
                          <th>Stock actual</th>
                          <th>Stock mínimo</th>
                          <th style={{ width: "1px" }}>Acciones</th>
                        </tr>
                      </thead>
                      <tbody>
                        {paginatedBajoMinimo.map((p) => {
                          const isIgnorarPending =
                            ignorarMutation.isPending &&
                            ignorarMutation.variables?.productoId === p.producto_id;
                          const isAgregarPending =
                            agregarPedidoMutation.isPending &&
                            agregarPedidoMutation.variables === p.producto_id;
                          const yaAgregado = (data.stock.productos_en_pedido || []).includes(p.producto_id);

                          return (
                            <tr key={p.producto_id}>
                              <td className="text-center">
                                {p.oem_productos && p.oem_productos.length > 0 && (
                                  <button
                                    type="button"
                                    className="stock-hover warning-icon popover-trigger"
                                    onClick={(e) => {
                                      if (popoverAbierto === p.producto_id) {
                                        setPopoverAbierto(null);
                                      } else {
                                        const rect = e.currentTarget.getBoundingClientRect();
                                        const approxHeight = 160;
                                        const popoverWidth = 300;
                                        const spaceBelow = window.innerHeight - rect.bottom;
                                        const showAbove =
                                          spaceBelow < approxHeight && rect.top > approxHeight;
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
                                    aria-label="Ver productos con mismo OEM que tienen stock"
                                    aria-expanded={popoverAbierto === p.producto_id}
                                  >
                                    <i className="bi bi-exclamation-triangle-fill"></i>
                                  </button>
                                )}
                              </td>
                              <td>{p.nombre}</td>
                              <td>{p.codigo_producto}</td>
                              <td className="hide-mobile">{p.oem}</td>
                              <td className="hide-mobile">{p.proveedor_nombre}</td>
                              <td>
                                {puedeAjustar ? (
                                  <button
                                    type="button"
                                    className="btn btn-link p-0"
                                    style={{
                                      color: "var(--danger)",
                                      textDecoration: "none",
                                      fontSize: "inherit",
                                      fontWeight: 600,
                                    }}
                                    onClick={() => setAjusteProducto(p)}
                                    title="Ajustar stock actual"
                                  >
                                    {p.stock_actual}
                                  </button>
                                ) : (
                                  <span style={{ color: "var(--danger)" }}>
                                    {p.stock_actual}
                                  </span>
                                )}
                              </td>
                              <td>{p.stock_minimo}</td>
                              <td>
                                <div className="btn-group" role="group" aria-label="Acciones de producto">
                                  <button
                                    type="button"
                                    className={`btn btn-sm btn-icon ${yaAgregado ? "btn-outline" : "btn-primary"}`}
                                    onClick={() => agregarPedidoMutation.mutate(p.producto_id)}
                                    disabled={isAgregarPending || yaAgregado}
                                    title={
                                      yaAgregado
                                        ? "En lista de pedidos"
                                        : isAgregarPending
                                          ? "Agregando a pedido..."
                                          : "Agregar a lista de pedidos"
                                    }
                                    aria-label={yaAgregado ? "En lista de pedidos" : "Agregar a pedido"}
                                  >
                                    <i
                                      className={`bi ${
                                        yaAgregado
                                          ? "bi-check2"
                                          : isAgregarPending
                                            ? "bi-hourglass-split"
                                            : "bi-cart-plus"
                                      }`}
                                    />
                                  </button>

                                  {esGerenteOEncargado && (
                                    <button
                                      type="button"
                                      className="btn btn-sm btn-outline btn-icon"
                                      onClick={() => setEditarProductoId(p.producto_id)}
                                      title="Editar información del producto"
                                      aria-label="Editar producto"
                                    >
                                      <i className="bi bi-pencil" />
                                    </button>
                                  )}

                                  {puedeAjustar && (
                                    <button
                                      type="button"
                                      className="btn btn-sm btn-outline btn-icon"
                                      onClick={() => setAjusteProducto(p)}
                                      title="Ajustar stock actual"
                                      aria-label="Ajustar stock"
                                    >
                                      <i className="bi bi-sliders" />
                                    </button>
                                  )}

                                  <button
                                    type="button"
                                    className="btn btn-sm btn-outline btn-icon"
                                    onClick={() =>
                                      ignorarMutation.mutate({
                                        productoId: p.producto_id,
                                        accion: "recordar_manana",
                                      })
                                    }
                                    disabled={isIgnorarPending}
                                    title={
                                      isIgnorarPending &&
                                      ignorarMutation.variables?.accion === "recordar_manana"
                                        ? "Guardando..."
                                        : "Recordar mañana (posponer alerta 1 día)"
                                    }
                                    aria-label="Recordar mañana"
                                  >
                                    <i
                                      className={`bi ${
                                        isIgnorarPending &&
                                        ignorarMutation.variables?.accion === "recordar_manana"
                                          ? "bi-hourglass-split"
                                          : "bi-clock-history"
                                      }`}
                                    />
                                  </button>

                                  <button
                                    type="button"
                                    className="btn btn-sm btn-outline btn-icon"
                                    onClick={() =>
                                      ignorarMutation.mutate({
                                        productoId: p.producto_id,
                                        accion: "ignorar_permanente",
                                      })
                                    }
                                    disabled={isIgnorarPending}
                                    title={
                                      isIgnorarPending &&
                                      ignorarMutation.variables?.accion === "ignorar_permanente"
                                        ? "Guardando..."
                                        : "Ignorar permanentemente"
                                    }
                                    aria-label="Ignorar permanentemente"
                                  >
                                    <i
                                      className={`bi ${
                                        isIgnorarPending &&
                                        ignorarMutation.variables?.accion === "ignorar_permanente"
                                          ? "bi-hourglass-split"
                                          : "bi-bell-slash"
                                      }`}
                                    />
                                  </button>
                                </div>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                  <div className="flex flex-wrap items-center justify-between gap-3 mt-4">
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
                </PageCard>
              </div>
            );
          })()}
          {(() => {
            const productoActivo = data.stock.bajo_minimo?.find(
              (p) => p.producto_id === popoverAbierto
            );
            return (
              productoActivo &&
              createPortal(
                <div
                  ref={popoverRef}
                  className="stock-popover is-open"
                  style={{ top: popoverPos.top, left: popoverPos.left }}
                  onClick={(e) => e.stopPropagation()}
                >
                  <div className="popover-header">
                    Productos con mismo OEM en stock
                  </div>
                  <ul className="popover-list">
                    {productoActivo.oem_productos.map((op) => (
                      <li key={op.producto_id} className="popover-row">
                        <div className="popover-row-main">
                          <span>{op.nombre}</span>
                          <strong>{op.stock_actual}</strong>
                        </div>
                        <div className="popover-row-meta">{op.codigo_producto}</div>
                        {op.ubicaciones && op.ubicaciones.length > 0 && (
                          <div className="popover-row-ubicaciones">
                            {op.ubicaciones.map((u) => (
                              <span key={u.nombre}>
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
        </>
      )}
      {!data && !error && (
        <div className="text-center text-muted mt-5">Cargando...</div>
      )}

      {editarProductoId && (
        <div className="modal" role="dialog" aria-modal="true">
          <div className="modal-dialog modal-xl" style={{ maxWidth: 1000 }}>
            <div className="modal-content">
              <div className="modal-header">
                <h5 className="modal-title">Editar producto</h5>
                <button
                  type="button"
                  className="modal-close"
                  onClick={() => setEditarProductoId(null)}
                >
                  &times;
                </button>
              </div>
              <div className="modal-body" style={{ maxHeight: "75vh", overflowY: "auto" }}>
                <ProductoForm
                  productoId={editarProductoId}
                  onSaved={() => {
                    setEditarProductoId(null);
                    showToast("Producto actualizado exitosamente", "success");
                  }}
                />
              </div>
            </div>
          </div>
        </div>
      )}

      {ajusteProducto && (
        <AjusteStockModal
          producto={ajusteProducto}
          onClose={() => setAjusteProducto(null)}
        />
      )}
    </>
  );
}
