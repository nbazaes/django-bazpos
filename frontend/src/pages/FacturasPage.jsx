import { useEffect, useState } from "react";
import CrudTable from "../components/CrudTable";
import PageCard from "../components/PageCard";
import Shell from "../components/Shell";
import { apiRequest } from "../lib/api";
import { applyTax, fetchTaxPercent, getTaxPercent } from "../lib/tax";

export default function FacturasPage() {
  const [rows, setRows] = useState([]);
  const [detalle, setDetalle] = useState(null);
  const [detalleError, setDetalleError] = useState("");
  const [taxPercent, setTaxPercent] = useState(getTaxPercent());

  async function load() {
    setRows(await apiRequest("/facturas/"));
  }

  useEffect(() => {
    fetchTaxPercent().then((p) => setTaxPercent(p));
    load();
  }, []);

  async function onDelete(row) {
    if (!window.confirm(`Eliminar factura ${row.numero_factura}?`)) return;
    await apiRequest(`/facturas/${row.numero_factura}/`, { method: "DELETE" });
    await load();
  }

  async function onView(row) {
    try {
      const data = await apiRequest(`/facturas/${row.numero_factura}/`);
      setDetalle(data);
      setDetalleError("");
    } catch (err) {
      setDetalleError(err.message);
    }
  }

  return (
    <Shell title="Facturas">
      <PageCard title="Listado de facturas">
        <div className="page-actions">
          <a className="btn btn-success" href="/gerencia/facturas/create.html">Nueva factura</a>
        </div>
        <CrudTable
          rows={rows}
          columns={[
            { key: "numero_factura", label: "Numero" },
            { key: "proveedor_nombre", label: "Proveedor" },
            { key: "fecha", label: "Fecha" },
            { key: "monto_total", label: "Total neto" },
            { key: "monto_total", label: "Total con IVA", render: (row) => applyTax(row.monto_total, taxPercent) },
          ]}
          onEdit={(row) => (window.location.href = `/gerencia/facturas/create.html?id=${row.numero_factura}`)}
          onDelete={onDelete}
          onView={onView}
        />
      </PageCard>

      {detalle && (
        <div className="modal" style={{ display: "block", backgroundColor: "rgba(0, 0, 0, 0.45)" }} role="dialog" aria-modal="true">
          <div className="modal-dialog modal-xl modal-dialog-centered" style={{ maxWidth: 1000 }}>
            <div className="modal-content">
              <div className="modal-header">
                <h5 className="modal-title">Detalle factura #{detalle.numero_factura}</h5>
                <button type="button" className="close" onClick={() => setDetalle(null)}>
                  <span>&times;</span>
                </button>
              </div>
              <div className="modal-body">
                <div className="row mb-3">
                  <div className="col-md-4"><strong>Proveedor:</strong> {detalle.proveedor_nombre}</div>
                  <div className="col-md-4"><strong>Fecha:</strong> {detalle.fecha}</div>
                  <div className="col-md-4 text-md-right">
                    <strong>Total neto:</strong> ${detalle.monto_total}<br />
                    <strong>Total con IVA ({taxPercent}%):</strong> ${applyTax(detalle.monto_total, taxPercent)}
                  </div>
                </div>
                <div className="table-responsive">
                  <table className="table table-sm table-bordered">
                    <thead><tr><th>Codigo Producto</th><th>Nombre</th><th>Marca</th><th>Cantidad</th><th>Costo neto</th><th>Costo con IVA</th><th>Subtotal neto</th><th>Subtotal con IVA</th></tr></thead>
                    <tbody>
                      {(detalle.detalles || []).map((d) => (
                        <tr key={d.id}>
                          <td>{d.codigo_producto}</td>
                          <td>{d.nombre}</td>
                          <td>{d.marca || ""}</td>
                          <td>{d.cantidad}</td>
                          <td>${d.costo_compra}</td>
                          <td>${applyTax(d.costo_compra, taxPercent)}</td>
                          <td>${Number(d.costo_compra || 0) * Number(d.cantidad || 0)}</td>
                          <td>${applyTax(Number(d.costo_compra || 0) * Number(d.cantidad || 0), taxPercent)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {detalleError && <div className="alert alert-danger mt-3">{detalleError}</div>}
    </Shell>
  );
}
