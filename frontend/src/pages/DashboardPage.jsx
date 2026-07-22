import { useEffect, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import PageCard from "../components/PageCard";
import { usePageTitle } from "../components/Shell";
import { getUser } from "../lib/auth";
import { apiRequest } from "../lib/api";
import { queryKeys, useDashboardStats } from "../lib/queries";
import { useToast } from "../lib/toast";

function StatCard({ title, value, variant }) {
  return (
    <div className={`stat-card stat-card-${variant}`}>
      <div className="stat-label">{title}</div>
      <div className="stat-value">{value}</div>
    </div>
  );
}

export default function DashboardPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const showToast = useToast();
  const user = getUser();
  usePageTitle("Dashboard");
  const didToast = useRef(false);
  const { data, error } = useDashboardStats();
  const queryClient = useQueryClient();
  const [popoverAbierto, setPopoverAbierto] = useState(null);
  const [popoverPos, setPopoverPos] = useState({ top: 0, left: 0 });
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
    onSuccess: (_, variables) => {
      const mensaje =
        variables.accion === "recordar_manana"
          ? "Producto recordado para mañana"
          : "Producto ignorado permanentemente";
      showToast(mensaje, "success");
      queryClient.invalidateQueries({ queryKey: queryKeys.dashboard });
    },
    onError: (err) => {
      showToast(err.message || "No se pudo actualizar el producto", "danger");
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
          </div>
          <div className="row mb-4">
            <div className="col-md-4">
              <StatCard
                title={`${data.es_gerente ? "Total ventas hoy" : "Total ventas hoy"}`}
                value={`$${Number(data.ventas_dia.total || 0).toLocaleString()}`}
                variant="success"
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
                          <td>${Number(row.total || 0).toLocaleString()}</td>
                          <td>{row.cantidad}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </PageCard>
            </div>
          )}
          {data.stock.bajo_minimo && data.stock.bajo_minimo.length > 0 && (
            <div className="mb-4">
              <PageCard title="Productos bajo stock mínimo">
                <div className="table-responsive">
                  <table className="table table-sm table-bordered">
                    <thead>
                      <tr>
                        <th style={{ width: "40px" }}></th>
                        <th>Nombre</th>
                        <th>Código</th>
                        <th>OEM</th>
                        <th>Proveedor</th>
                        <th>Stock actual</th>
                        <th>Stock mínimo</th>
                        <th>Acciones</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.stock.bajo_minimo.map((p) => (
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
                                    const spaceBelow = window.innerHeight - rect.bottom;
                                    const showAbove =
                                      spaceBelow < approxHeight && rect.top > approxHeight;
                                    setPopoverPos({
                                      top: showAbove ? rect.top - 8 : rect.bottom + 8,
                                      left: rect.left + rect.width / 2,
                                    });
                                    setPopoverAbierto(p.producto_id);
                                  }
                                }}
                                aria-label="Ver productos con mismo OEM que tienen stock"
                                aria-expanded={popoverAbierto === p.producto_id}
                              >
                                <i className="bi bi-exclamation-triangle-fill"></i>
                                <span
                                  ref={popoverRef}
                                  className={`stock-popover ${
                                    popoverAbierto === p.producto_id ? "is-open" : ""
                                  }`}
                                  style={
                                    popoverAbierto === p.producto_id
                                      ? {
                                          "--popover-top": `${popoverPos.top}px`,
                                          "--popover-left": `${popoverPos.left}px`,
                                        }
                                      : undefined
                                  }
                                  onClick={(e) => e.stopPropagation()}
                                >
                                  <div className="popover-header">
                                    Productos con mismo OEM en stock
                                  </div>
                                  <ul className="popover-list">
                                    {p.oem_productos.map((op) => (
                                      <li key={op.producto_id} className="popover-row">
                                        <div className="popover-row-main">
                                          <span>{op.nombre}</span>
                                          <strong>{op.stock_actual}</strong>
                                        </div>
                                        <div className="popover-row-meta">
                                          {op.codigo_producto}
                                        </div>
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
                                </span>
                              </button>
                            )}
                          </td>
                          <td>{p.nombre}</td>
                          <td>{p.codigo_producto}</td>
                          <td>{p.oem}</td>
                          <td>{p.proveedor_nombre}</td>
                          <td style={{ color: "var(--danger)" }}>{p.stock_actual}</td>
                          <td>{p.stock_minimo}</td>
                          <td>
                            <div className="btn-group flex-wrap">
                              <button
                                className="btn btn-sm btn-outline"
                                onClick={() =>
                                  ignorarMutation.mutate({
                                    productoId: p.producto_id,
                                    accion: "recordar_manana",
                                  })
                                }
                                disabled={ignorarMutation.isPending}
                              >
                                Recordar mañana
                              </button>
                              <button
                                className="btn btn-sm btn-outline"
                                onClick={() =>
                                  ignorarMutation.mutate({
                                    productoId: p.producto_id,
                                    accion: "ignorar_permanente",
                                  })
                                }
                                disabled={ignorarMutation.isPending}
                              >
                                Ignorar permanentemente
                              </button>
                              <button
                                className="btn btn-sm btn-outline"
                                onClick={() => {
                                  // TODO: agregar a pedido
                                }}
                                disabled
                                title="Próximamente"
                              >
                                Agregar a pedido
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </PageCard>
            </div>
          )}
        </>
      )}
      {!data && !error && (
        <div className="text-center text-muted mt-5">Cargando...</div>
      )}
    </>
  );
}
