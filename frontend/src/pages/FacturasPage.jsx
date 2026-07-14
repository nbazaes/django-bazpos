import { useEffect, useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import CrudTable from "../components/CrudTable";
import PageCard from "../components/PageCard";
import { usePageTitle } from "../components/Shell";
import { apiRequest } from "../lib/api";
import { applyTax, fetchTaxPercent, getTaxPercent } from "../lib/tax";

export default function FacturasPage() {
  const navigate = useNavigate();
  usePageTitle("Facturas");
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
    await apiRequest(`/facturas/${row.id}/`, { method: "DELETE" });
    await load();
  }

  async function onView(row) {
    try {
      const data = await apiRequest(`/facturas/${row.id}/`);
      setDetalle(data);
      setDetalleError("");
    } catch (err) {
      setDetalleError(err.message);
    }
  }

  return (
    <>
      <PageCard title="Listado de facturas">
        <div className="page-actions">
          <Link className="btn btn-success" to="/facturas/crear">Nueva factura</Link>
        </div>
        <CrudTable
          rows={rows}
          columns={[
            { key: "numero_factura", label: "Número" },
            { key: "proveedor_nombre", label: "Proveedor" },
            { key: "fecha", label: "Fecha" },
            { key: "monto_total", label: "Total neto" },
            { key: "monto_total", label: "Total con IVA", render: (row) => applyTax(row.monto_total, taxPercent) },
          ]}
          onEdit={(row) => navigate(`/facturas/${row.id}/editar`)}
          onDelete={onDelete}
          onView={onView}
        />
      </PageCard>

      {detalle && (
        <div className="modal" role="dialog" aria-modal="true">
          <div className="modal-dialog modal-xl" style={{ maxWidth: 1000 }}>
            <div className="modal-content">
              <div className="modal-header">
                <h5 className="modal-title">Detalle factura #{detalle.numero_factura}</h5>
                <button type="button" className="modal-close" onClick={() => setDetalle(null)}>&times;</button>
              </div>
              <div className="modal-body">
                <div className="row mb-4">
                  <div className="col-md-4"><strong>Proveedor:</strong> {detalle.proveedor_nombre}</div>
                  <div className="col-md-4"><strong>Fecha:</strong> {detalle.fecha}</div>
                  <div className="col-md-4 text-right">
                    <div><strong>Total neto:</strong> ${detalle.monto_total}</div>
                    <div><strong>Total con IVA ({taxPercent}%):</strong> ${applyTax(detalle.monto_total, taxPercent)}</div>
                  </div>
                </div>
                <div className="table-responsive">
                  <table className="table table-sm table-bordered">
                    <thead>
                      <tr><th>Código</th><th>Nombre</th><th>Marca</th><th>Cantidad</th><th>Costo neto</th><th>Costo con IVA</th><th>Subtotal neto</th><th>Subtotal con IVA</th></tr>
                    </thead>
                    <tbody>
                      {(detalle.detalles || []).map((d) => {
                        const costoConIva = applyTax(d.costo_compra, taxPercent);
                        const subtotalNeto = d.costo_compra * d.cantidad;
                        const subtotalConIva = applyTax(subtotalNeto, taxPercent);
                        return (
                          <tr key={d.id}>
                            <td>{d.codigo_producto}</td>
                            <td>{d.nombre}</td>
                            <td>{d.marca}</td>
                            <td>{d.cantidad}</td>
                            <td>${d.costo_compra}</td>
                            <td>${costoConIva}</td>
                            <td>${subtotalNeto}</td>
                            <td>${subtotalConIva}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
              <div className="modal-footer">
                <button type="button" className="btn btn-secondary" onClick={() => setDetalle(null)}>Cerrar</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {detalleError && <div className="alert alert-danger mt-4">{detalleError}</div>}
    </>
  );
}
