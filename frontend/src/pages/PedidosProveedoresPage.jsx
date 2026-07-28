import { useState } from "react";
import PageCard from "../components/PageCard";
import { usePageTitle } from "../components/Shell";
import {
  usePedidoProveedorHoy,
  usePedidoProveedorHistorial,
  usePedidoProveedorDia,
  useToggleItemPedidoProveedor,
  useEliminarItemPedidoProveedor,
  useTransferirPedidoProveedor,
} from "../lib/queries";

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
  return new Intl.NumberFormat("es-CL", {
    style: "currency",
    currency: "CLP",
    maximumFractionDigits: 0,
  }).format(n);
}

function ProveedorTable({ proveedores, diaId, editable, onToggle, onDelete }) {
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
                <td>{item.codigo_proveedor || "—"}</td>
                <td>{item.codigo_producto}</td>
                <td>{item.oem}</td>
                <td>{item.nombre}</td>
                <td>{formatCLP(item.precio_costo)}</td>
                <td>{item.stock_maximo}</td>
                <td>
                  <label className="checkbox-cell" style={{ display: "flex", justifyContent: "center" }}>
                    {editable ? (
                      <input
                        type="checkbox"
                        checked={item.pedido}
                        onChange={() => onToggle(diaId, item.id)}
                        className="no-print"
                        style={{ width: 18, height: 18, cursor: "pointer", accentColor: "var(--primary)" }}
                      />
                    ) : (
                      <span className="only-print" style={{ display: "none" }}>
                        {item.pedido ? "Sí" : "No"}
                      </span>
                    )}
                    {!editable && (item.pedido ? "Sí" : "No")}
                  </label>
                </td>
                {editable && (
                  <td className="no-print">
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

export default function PedidosProveedoresPage() {
  const [view, setView] = useState("hoy");
  const [historialDiaId, setHistorialDiaId] = useState(null);
  const [showConfirmDelete, setShowConfirmDelete] = useState(null);
  const [showConfirmTransfer, setShowConfirmTransfer] = useState(false);

  usePageTitle("Pedidos a proveedores");

  const { data: dataHoy, isLoading: loadingHoy } = usePedidoProveedorHoy();
  const { data: historialData } = usePedidoProveedorHistorial();
  const { data: dataDia, isLoading: loadingDia } = usePedidoProveedorDia(historialDiaId);
  const toggleMutation = useToggleItemPedidoProveedor();
  const eliminarMutation = useEliminarItemPedidoProveedor();
  const transferirMutation = useTransferirPedidoProveedor();

  const esHoy = view === "hoy";
  const data = esHoy ? dataHoy : dataDia;
  const loading = esHoy ? loadingHoy : loadingDia;

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

  function handleTransferir() {
    if (!data) return;
    transferirMutation.mutate(data.id);
    setShowConfirmTransfer(false);
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
    const dias = historialData?.results || [];
    return (
      <div className="pedidos-proveedores">
        <div className="pedidos-header-actions">
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

  return (
    <div className="pedidos-proveedores">
      <div className="pedidos-header-actions">
        {esHoy && proveedores.length > 0 && (
          <>
            <button
              className="btn btn-sm btn-outline"
              onClick={() => setShowConfirmTransfer(true)}
            >
              Transferir pendientes al día siguiente
            </button>
            <button className="btn btn-sm btn-outline" onClick={handlePrint}>
              Imprimir
            </button>
          </>
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
            ? `Pedidos a proveedores — ${data ? formatFecha(data.fecha) : "hoy"}`
            : `Detalle — ${data ? formatFecha(data.fecha) : ""}`
        }
      >
        {proveedores.length === 0 ? (
          <p className="text-muted">
            No hay productos en esta lista. Agregue productos desde el dashboard (Stock crítico → Agregar a pedido).
          </p>
        ) : (
          <>
            <ProveedorTable
              proveedores={proveedores}
              diaId={data?.id}
              editable={esHoy}
              onToggle={handleToggle}
              onDelete={handleEliminarConfirm}
            />
            <div className="no-print" style={{ marginTop: "1rem", color: "var(--text-secondary)", fontSize: "0.85rem" }}>
              Total: {totalItems} producto{totalItems !== 1 ? "s" : ""} | {totalPedidos} pedido(s)
            </div>
          </>
        )}
      </PageCard>

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

      {showConfirmTransfer && (
        <div className="modal" role="dialog" aria-modal="true">
          <div className="modal-dialog" style={{ maxWidth: 400 }}>
            <div className="modal-content">
              <div className="modal-header">
                <h5 className="modal-title">Transferir pendientes</h5>
                <button type="button" className="modal-close" onClick={() => setShowConfirmTransfer(false)}>
                  &times;
                </button>
              </div>
              <div className="modal-body text-center py-4">
                <p className="mb-0 text-secondary">
                  Los productos <strong>no pedidos</strong> serán transferidos a la lista del día siguiente.
                </p>
              </div>
              <div className="modal-footer">
                <button type="button" className="btn btn-secondary" onClick={() => setShowConfirmTransfer(false)}>
                  Cancelar
                </button>
                <button type="button" className="btn btn-primary" onClick={handleTransferir}>
                  Transferir
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
