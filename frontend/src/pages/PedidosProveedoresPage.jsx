import { useState } from "react";
import { useNavigate } from "react-router-dom";
import PageCard from "../components/PageCard";
import { usePageTitle } from "../lib/usePageTitle";
import {
  usePedidoProveedorHoy,
  usePedidoProveedorHistorial,
  usePedidoProveedorDia,
  useToggleItemPedidoProveedor,
  useEliminarItemPedidoProveedor,
  useAgregarItemPedidoProveedor,
  useProveedores,
} from "../lib/queries";
import { apiRequest } from "../lib/api";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { queryKeysPedidoProveedor } from "../lib/queries";
import { formatMoney } from "../lib/storeConfig";

function formatFecha(fechaStr) {
  if (!fechaStr) return "";
  const d = new Date(fechaStr + "T12:00:00");
  return d.toLocaleDateString("es-CL", {
    year: "numeric",
    month: "long",
    day: "numeric",
    weekday: "long",
  });
}

function formatCLP(n) {
  return formatMoney(n);
}

function ProveedorTableDesktop({ proveedores, diaId, editable, onToggle, onDelete }) {
  const navigate = useNavigate();
  return proveedores.map((prov) => (
    <div key={prov.proveedor_id} className="proveedor-group" style={{ marginBottom: "2rem" }}>
      <h3 style={{ marginBottom: "0.5rem", fontSize: "1.1rem", fontWeight: 600 }}>
        {prov.proveedor_nombre}
      </h3>
      <div className="table-wrapper">
        <table className="table table-sm">
          <thead>
            <tr>
              <th>Cód. Prov.</th>
              <th>Cód. Producto</th>
              <th>OEM</th>
              <th>Nombre</th>
              <th>Precio Costo</th>
              <th>Stock Máx</th>
              <th>Pedido</th>
              {editable && <th className="no-print"></th>}
            </tr>
          </thead>
          <tbody>
            {prov.items.map((item) => (
              <tr key={item.id} className={item.pedido ? "row-pedido" : ""}>
                <td>
                  {item.codigo_proveedor || "—"}
                  {item.es_custom && <span className="badge badge-info" style={{ marginLeft: "0.3rem", fontSize: "0.7rem" }}>Custom</span>}
                </td>
                <td>{item.codigo_producto || "—"}</td>
                <td>{item.oem || "—"}</td>
                <td>{item.nombre}</td>
                <td>{item.precio_costo > 0 ? formatCLP(item.precio_costo) : "—"}</td>
                <td>{item.stock_maximo > 0 ? item.stock_maximo : "—"}</td>
                <td>
                  {editable ? (
                    <label className="checkbox-cell" style={{ display: "flex", justifyContent: "center" }}>
                      <input
                        type="checkbox"
                        checked={item.pedido}
                        onChange={() => onToggle(diaId, item.id)}
                      />
                    </label>
                  ) : (
                    item.pedido ? "Sí" : "No"
                  )}
                </td>
                {editable && (
                  <td className="no-print">
                    {item.producto_id && (
                      <button
                        className="btn btn-sm btn-outline"
                        onClick={() => navigate(`/productos/${item.producto_id}/editar`)}
                        title="Editar producto"
                      >
                        <i className="bi bi-pencil" />
                      </button>
                    )}
                    <button
                      className="btn btn-sm btn-danger"
                      onClick={() => onDelete(diaId, item.id, item.nombre)}
                      title="Eliminar de la lista"
                    >
                      &times;
                    </button>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  ));
}

function ProveedorCardsMobile({ proveedores, diaId, editable, onToggle, onDelete }) {
  const navigate = useNavigate();
  return proveedores.map((prov) => (
    <div key={prov.proveedor_id} className="proveedor-mobile-group">
      <h4 className="proveedor-mobile-title">{prov.proveedor_nombre} ({prov.items.length})</h4>
      {prov.items.map((item) => (
        <div key={item.id} className={`item-mobile-card ${item.pedido ? "row-pedido" : ""}`}>
          <div className="item-mobile-main">
            <span className="item-mobile-nombre">
              {item.nombre}
              {item.es_custom && <span className="badge badge-info" style={{ marginLeft: "0.3rem", fontSize: "0.65rem" }}>Custom</span>}
            </span>
            <div className="item-mobile-meta">
              <span>Cód: {item.codigo_producto || "—"}</span>
              <span>OEM: {item.oem || "—"}</span>
              {item.codigo_proveedor && <span>Prov: {item.codigo_proveedor}</span>}
            </div>
            <div className="item-mobile-meta">
              <span>Precio: {item.precio_costo > 0 ? formatCLP(item.precio_costo) : "—"}</span>
              <span>Stock máx: {item.stock_maximo > 0 ? item.stock_maximo : "—"}</span>
            </div>
          </div>
          <div className="item-mobile-actions">
            {editable ? (
              <label className="checkbox-cell">
                <input
                  type="checkbox"
                  checked={item.pedido}
                  onChange={() => onToggle(diaId, item.id)}
                />
                <span>Pedido</span>
              </label>
            ) : (
              <span className="item-mobile-pedido-label">
                {item.pedido ? "Pedido" : "Pendiente"}
              </span>
            )}
            {editable && (
              <>
                {item.producto_id && (
                  <button
                    className="btn btn-sm btn-outline item-mobile-delete"
                    onClick={() => navigate(`/productos/${item.producto_id}/editar`)}
                    title="Editar producto"
                  >
                    <i className="bi bi-pencil" />
                  </button>
                )}
                <button
                  className="btn btn-sm btn-danger item-mobile-delete"
                  onClick={() => onDelete(diaId, item.id, item.nombre)}
                >
                  &times;
                </button>
              </>
            )}
          </div>
        </div>
      ))}
    </div>
  ));
}

export default function PedidosProveedoresPage() {
  const queryClient = useQueryClient();
  const [view, setView] = useState("hoy");
  const [historialDiaId, setHistorialDiaId] = useState(null);
  const [showConfirmDelete, setShowConfirmDelete] = useState(null);
  const [showConfirmFinalizar, setShowConfirmFinalizar] = useState(false);
  const [showAddCustom, setShowAddCustom] = useState(false);
  const [addTab, setAddTab] = useState("existente");
  const [customForm, setCustomForm] = useState({ proveedor_id: "", nombre_custom: "", codigo_proveedor_custom: "" });
  const [searchCodigo, setSearchCodigo] = useState("");
  const { data: productosSearch } = useQuery({
    queryKey: ["productos", "lista", { texto: searchCodigo, page_size: 5 }],
    queryFn: () => apiRequest(`/productos/?texto=${encodeURIComponent(searchCodigo)}&page_size=5`),
    enabled: !!searchCodigo,
  });
  const productosEncontrados = productosSearch?.results || [];

  usePageTitle("Pedidos a proveedores");

  const { data: dataHoy, isLoading: loadingHoy } = usePedidoProveedorHoy();
  const { data: historialData } = usePedidoProveedorHistorial();
  const { data: dataDia, isLoading: loadingDia } = usePedidoProveedorDia(historialDiaId);
  const { data: proveedoresData } = useProveedores({ page_size: 200 });
  const toggleMutation = useToggleItemPedidoProveedor();
  const eliminarMutation = useEliminarItemPedidoProveedor();
  const agregarMutation = useAgregarItemPedidoProveedor();

  const finalizarMutation = useMutation({
    mutationFn: (diaId) =>
      apiRequest(`/pedidos-proveedor/${diaId}/finalizar/`, {
        method: "POST",
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeysPedidoProveedor.all });
    },
  });

  const esHoy = view === "hoy";
  const data = esHoy ? dataHoy : dataDia;
  const loading = esHoy ? loadingHoy : loadingDia;
  const finalized = data?.finalizado ?? false;
  const proveedoresList = proveedoresData?.results || [];

  function handleToggle(diaId, itemId) {
    toggleMutation.mutate({ diaId, itemId });
  }

  function handleEliminarConfirm(diaId, itemId, nombre) {
    setShowConfirmDelete({ diaId, itemId, nombre });
  }

  function handleEliminar() {
    if (!showConfirmDelete) return;
    eliminarMutation.mutate({ diaId: showConfirmDelete.diaId, itemId: showConfirmDelete.itemId });
    setShowConfirmDelete(null);
  }

  function handleFinalizar() {
    if (!data) return;
    finalizarMutation.mutate(data.id);
    setShowConfirmFinalizar(false);
  }

  function handleAgregarCustom() {
    agregarMutation.mutate(customForm, {
      onSuccess: () => {
        setShowAddCustom(false);
        setCustomForm({ proveedor_id: "", nombre_custom: "", codigo_proveedor_custom: "" });
        setSearchCodigo("");
        setAddTab("existente");
      },
    });
  }

  function handleAgregarExistente(productoId) {
    agregarMutation.mutate({ producto_id: productoId }, {
      onSuccess: () => {
        setShowAddCustom(false);
        setSearchCodigo("");
        setAddTab("existente");
      },
    });
  }

  function handlePrint() {
    window.print();
  }

  function verDetalleDia(id) {
    setHistorialDiaId(id);
    setView("detalle");
  }

  function volverAHoy() {
    setView("hoy");
    setHistorialDiaId(null);
  }

  function volverAHistorial() {
    setView("historial");
    setHistorialDiaId(null);
  }

  if (loading) {
    return <PageCard title="Pedidos a proveedores"><p>Cargando...</p></PageCard>;
  }

  if (view === "historial") {
    const dias = Array.isArray(historialData) ? historialData : (historialData?.results || []);
    return (
      <div className="pedidos-proveedores">
        <div className="pedidos-header-actions no-print">
          <button className="btn btn-sm btn-outline" onClick={volverAHoy}>
            Volver al día de hoy
          </button>
        </div>
        <PageCard title="Historial de pedidos">
          {dias.length === 0 ? (
            <p className="text-muted">No hay pedidos registrados.</p>
          ) : (
            <div className="table-wrapper">
              <table className="table">
                <thead>
                  <tr>
                    <th>Fecha</th>
                    <th>Items</th>
                    <th>Pedidos</th>
                    <th>Estado</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {dias.map((dia) => (
                    <tr key={dia.id}>
                      <td>{formatFecha(dia.fecha)}</td>
                      <td>{dia.total_items}</td>
                      <td>{dia.total_pedidos}/{dia.total_items}</td>
                      <td>
                        {dia.finalizado ? (
                          <span className="badge badge-success">Finalizado</span>
                        ) : (
                          <span className="badge badge-warning">Pendiente</span>
                        )}
                      </td>
                      <td>
                        <button
                          className="btn btn-sm btn-outline"
                          onClick={() => verDetalleDia(dia.id)}
                        >
                          Ver detalle
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </PageCard>
      </div>
    );
  }

  const proveedores = data?.proveedores || [];
  const totalItems = proveedores.reduce((acc, p) => acc + p.items.length, 0);
  const totalPedidos = proveedores.reduce((acc, p) => acc + p.items.filter((i) => i.pedido).length, 0);
  const editable = esHoy && !finalized;

  return (
    <div className="pedidos-proveedores">
      <div className="pedidos-header-actions no-print">
        {esHoy && !finalized && (
          <button
            className="btn btn-sm btn-outline"
            onClick={() => setShowAddCustom(true)}
          >
            + Agregar producto
          </button>
        )}
        {esHoy && proveedores.length > 0 && !finalized && (
          <>
            <button
              className="btn btn-sm btn-primary"
              onClick={() => setShowConfirmFinalizar(true)}
            >
              Terminar pedido
            </button>
            <button className="btn btn-sm btn-outline" onClick={handlePrint}>
              Imprimir
            </button>
          </>
        )}
        {esHoy && finalized && (
          <button className="btn btn-sm btn-outline" onClick={handlePrint}>
            Imprimir
          </button>
        )}
        <button
          className="btn btn-sm btn-outline"
          onClick={esHoy ? () => setView("historial") : volverAHistorial}
        >
          {esHoy ? "Ver historial" : "Volver al historial"}
        </button>
      </div>

      <PageCard
        title={
          esHoy
            ? `Pedidos a proveedores — ${data ? formatFecha(data.fecha) : "hoy"}${finalized ? " (Finalizado)" : ""}`
            : `Detalle — ${data ? formatFecha(data.fecha) : ""}${finalized ? " (Finalizado)" : ""}`
        }
      >
        {proveedores.length === 0 ? (
          <p className="text-muted">
            No hay productos en esta lista. Agregue productos desde el dashboard (Stock crítico → Agregar a pedido) o use el botón &quot;+ Agregar producto&quot; para productos personalizados.
          </p>
        ) : (
          <>
            <div className="pedidos-desktop">
              <ProveedorTableDesktop
                proveedores={proveedores}
                diaId={data?.id}
                editable={editable}
                onToggle={handleToggle}
                onDelete={handleEliminarConfirm}
              />
            </div>
            <div className="pedidos-mobile">
              <ProveedorCardsMobile
                proveedores={proveedores}
                diaId={data?.id}
                editable={editable}
                onToggle={handleToggle}
                onDelete={handleEliminarConfirm}
              />
            </div>
            <div className="no-print" style={{ marginTop: "1rem", color: "var(--text-secondary)", fontSize: "0.85rem" }}>
              Total: {totalItems} producto{totalItems !== 1 ? "s" : ""} | {totalPedidos} pedido(s)
            </div>
          </>
        )}
      </PageCard>

      {showAddCustom && (
        <div className="modal" role="dialog" aria-modal="true">
          <div className="modal-dialog" style={{ maxWidth: 450 }}>
            <div className="modal-content">
              <div className="modal-header">
                <h5 className="modal-title">Agregar producto</h5>
                <button type="button" className="modal-close" onClick={() => { setShowAddCustom(false); setSearchCodigo(""); }}>
                  &times;
                </button>
              </div>
              <div className="modal-body">
                <div className="btn-group" style={{ width: "100%", marginBottom: "1rem" }}>
                  <button
                    className={`btn btn-sm ${addTab === "existente" ? "btn-primary" : "btn-secondary"}`}
                    onClick={() => setAddTab("existente")}
                    style={{ flex: 1 }}
                  >
                    Producto existente
                  </button>
                  <button
                    className={`btn btn-sm ${addTab === "custom" ? "btn-primary" : "btn-secondary"}`}
                    onClick={() => setAddTab("custom")}
                    style={{ flex: 1 }}
                  >
                    Producto personalizado
                  </button>
                </div>

                {addTab === "existente" && (
                  <>
                    <div className="mb-3">
                      <label className="form-label">Buscar por código de proveedor</label>
                      <input
                        type="text"
                        className="form-control"
                        value={searchCodigo}
                        onChange={(e) => setSearchCodigo(e.target.value)}
                        placeholder="Código del proveedor..."
                        autoFocus
                      />
                    </div>
                    {productosEncontrados.length > 0 && (
                      <div style={{ maxHeight: "300px", overflowY: "auto" }}>
                        {productosEncontrados.map((p) => (
                          <div
                            key={p.producto_id}
                            style={{
                              display: "flex",
                              alignItems: "center",
                              justifyContent: "space-between",
                              background: "var(--bg-hover)",
                              borderRadius: "var(--radius)",
                              padding: "0.5rem 0.75rem",
                              marginBottom: "0.35rem",
                            }}
                          >
                            <div style={{ minWidth: 0, marginRight: "0.5rem" }}>
                              <p className="mb-0" style={{ fontWeight: 600, fontSize: "0.9rem" }}>{p.nombre}</p>
                              <p className="text-secondary mb-0" style={{ fontSize: "0.8rem" }}>
                                Cód: {p.codigo_proveedor || "—"} | OEM: {p.oem} | {p.proveedor_nombre}
                              </p>
                            </div>
                            <button
                              className="btn btn-sm btn-primary"
                              onClick={() => handleAgregarExistente(p.producto_id)}
                              disabled={agregarMutation.isPending}
                              style={{ flexShrink: 0 }}
                            >
                              Agregar
                            </button>
                          </div>
                        ))}
                      </div>
                    )}
                    {searchCodigo && productosEncontrados.length === 0 && (
                      <p className="text-muted" style={{ fontSize: "0.85rem" }}>No se encontraron productos</p>
                    )}
                  </>
                )}

                {addTab === "custom" && (
                  <>
                    <div className="mb-3">
                      <label className="form-label">Proveedor</label>
                      <select
                        className="form-control"
                        value={customForm.proveedor_id}
                        onChange={(e) => setCustomForm({ ...customForm, proveedor_id: e.target.value })}
                      >
                        <option value="">Seleccione...</option>
                        {proveedoresList.map((p) => (
                          <option key={p.proveedor_id} value={p.proveedor_id}>{p.nombre}</option>
                        ))}
                      </select>
                    </div>
                    <div className="mb-3">
                      <label className="form-label">Nombre del producto</label>
                      <input
                        type="text"
                        className="form-control"
                        value={customForm.nombre_custom}
                        onChange={(e) => setCustomForm({ ...customForm, nombre_custom: e.target.value })}
                        placeholder="Ej: Filtro de aceite"
                      />
                    </div>
                    <div className="mb-3">
                      <label className="form-label">Código del proveedor</label>
                      <input
                        type="text"
                        className="form-control"
                        value={customForm.codigo_proveedor_custom}
                        onChange={(e) => setCustomForm({ ...customForm, codigo_proveedor_custom: e.target.value })}
                        placeholder="Código del producto para el proveedor"
                      />
                    </div>
                    <div className="modal-footer" style={{ padding: 0, marginTop: "0.5rem" }}>
                      <button type="button" className="btn btn-secondary" onClick={() => { setShowAddCustom(false); setSearchCodigo(""); }}>
                        Cancelar
                      </button>
                      <button
                        type="button"
                        className="btn btn-primary"
                        onClick={handleAgregarCustom}
                        disabled={!customForm.proveedor_id || !customForm.nombre_custom || agregarMutation.isPending}
                      >
                        Agregar
                      </button>
                    </div>
                  </>
                )}
              </div>
              {addTab === "existente" && (
                <div className="modal-footer">
                  <button type="button" className="btn btn-secondary" onClick={() => { setShowAddCustom(false); setSearchCodigo(""); }}>
                    Cancelar
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {showConfirmDelete && (
        <div className="modal" role="dialog" aria-modal="true">
          <div className="modal-dialog" style={{ maxWidth: 400 }}>
            <div className="modal-content">
              <div className="modal-header">
                <h5 className="modal-title">Eliminar producto</h5>
                <button type="button" className="modal-close" onClick={() => setShowConfirmDelete(null)}>
                  &times;
                </button>
              </div>
              <div className="modal-body text-center py-4">
                <p className="mb-0 text-secondary">
                  ¿Eliminar <strong>{showConfirmDelete.nombre}</strong> de la lista de pedidos?
                </p>
              </div>
              <div className="modal-footer">
                <button type="button" className="btn btn-secondary" onClick={() => setShowConfirmDelete(null)}>
                  Cancelar
                </button>
                <button type="button" className="btn btn-danger" onClick={handleEliminar}>
                  Eliminar
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {showConfirmFinalizar && (
        <div className="modal" role="dialog" aria-modal="true">
          <div className="modal-dialog" style={{ maxWidth: 400 }}>
            <div className="modal-content">
              <div className="modal-header">
                <h5 className="modal-title">Terminar pedido</h5>
                <button type="button" className="modal-close" onClick={() => setShowConfirmFinalizar(false)}>
                  &times;
                </button>
              </div>
              <div className="modal-body text-center py-4">
                <p className="mb-0 text-secondary">
                  Los productos <strong>no marcados como pedidos</strong> serán transferidos automáticamente a la lista del día siguiente. El pedido de hoy quedará finalizado y no podrá ser modificado.
                </p>
              </div>
              <div className="modal-footer">
                <button type="button" className="btn btn-secondary" onClick={() => setShowConfirmFinalizar(false)}>
                  Cancelar
                </button>
                <button type="button" className="btn btn-primary" onClick={handleFinalizar}>
                  Finalizar pedido
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
