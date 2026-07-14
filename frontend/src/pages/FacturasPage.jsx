import { useEffect, useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import JsBarcode from "jsbarcode";
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

  function imprimirEtiquetas(factura) {
    const labels = [];
    for (const d of factura.detalles) {
      for (let i = 0; i < d.cantidad; i++) {
        const canvas = document.createElement("canvas");
        JsBarcode(canvas, d.codigo_producto, {
          format: "CODE128",
          width: 2,
          height: 40,
          displayValue: false,
          margin: 3,
        });
        labels.push({
          codigo: d.codigo_producto,
          nombre: d.nombre,
          dataUrl: canvas.toDataURL("image/png"),
        });
      }
    }

    const win = window.open("", "_blank", "width=800,height=600");
    if (!win) return;

    win.document.write(`
      <html>
        <head>
          <title>Etiquetas factura #${factura.numero_factura}</title>
          <style>
            @page { margin: 8mm; }
            body { font-family: monospace; margin: 0; padding: 0; }
            .labels { display: flex; flex-wrap: wrap; gap: 3mm; justify-content: flex-start; padding: 2mm; }
            .label {
              width: 30mm; min-height: 25mm;
              display: flex; flex-direction: column;
              align-items: center; justify-content: flex-end;
              border: 1px dashed #ccc; padding: 2mm; box-sizing: border-box;
            }
            .label img { max-width: 28mm; max-height: 12mm; }
            .label .nombre { font-size: 7px; margin-top: 1mm; text-align: center; line-height: 1.1; }
            .label .codigo { font-size: 6px; margin-top: 0.5mm; word-break: break-all; text-align: center; }
            @media print {
              .label { border-color: transparent; }
            }
          </style>
        </head>
        <body>
          <div class="labels">
            ${labels.map((l) => `
              <div class="label">
                <img src="${l.dataUrl}" alt="${l.codigo}" />
                <span class="nombre">${l.nombre}</span>
                <span class="codigo">${l.codigo}</span>
              </div>
            `).join("")}
          </div>
        </body>
      </html>
    `);
    win.document.close();
    win.focus();
    setTimeout(() => win.print(), 400);
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
                <button type="button" className="btn btn-primary" onClick={() => imprimirEtiquetas(detalle)}>Imprimir etiquetas</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {detalleError && <div className="alert alert-danger mt-4">{detalleError}</div>}
    </>
  );
}
