import { useState } from "react";
import { useNavigate, Link, useSearchParams } from "react-router-dom";
import JsBarcode from "jsbarcode";
import CrudTable from "../components/CrudTable";
import PageCard from "../components/PageCard";
import Pagination from "../components/Pagination";
import PageSizeSelector from "../components/PageSizeSelector";
import { usePageTitle } from "../lib/usePageTitle";
import { useDebounce } from "../lib/hooks";
import { useDeleteFactura, useFactura, useFacturas, useImpuesto } from "../lib/queries";
import { applyTax } from "../lib/tax";

function imprimirEtiquetas(factura) {
  const labels = [];
  for (const d of factura.detalles) {
    for (let i = 0; i < d.cantidad; i++) {
      const canvas = document.createElement("canvas");
      JsBarcode(canvas, d.codigo_producto, {
        format: "CODE128", width: 2, height: 40, displayValue: false, margin: 3,
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
    <html><head><title>Etiquetas factura #${factura.numero_factura}</title>
    <style>
      @page { margin: 8mm; }
      body { font-family: monospace; margin: 0; padding: 0; }
      .labels { display: flex; flex-wrap: wrap; gap: 3mm; justify-content: flex-start; padding: 2mm; }
      .label { width: 30mm; min-height: 25mm; display: flex; flex-direction: column; align-items: center; justify-content: flex-end; border: 1px dashed #ccc; padding: 2mm; box-sizing: border-box; }
      .label img { max-width: 28mm; max-height: 12mm; }
      .label .nombre { font-size: 7px; margin-top: 1mm; text-align: center; line-height: 1.1; }
      .label .codigo { font-size: 6px; margin-top: 0.5mm; word-break: break-all; text-align: center; }
      @media print { .label { border-color: transparent; } }
    </style></head><body>
    <div class="labels">
      ${labels.map((l) => `
        <div class="label">
          <img src="${l.dataUrl}" alt="${l.codigo}" />
          <span class="nombre">${l.nombre}</span>
          <span class="codigo">${l.codigo}</span>
        </div>
      `).join("")}
    </div>
    </body></html>
  `);
  win.document.close();
  win.focus();
  setTimeout(() => win.print(), 400);
}

export default function FacturasPage() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  usePageTitle("Facturas");

  const page = Math.max(1, parseInt(searchParams.get("page") || "1", 10) || 1);
  const pageSize = [25, 50, 100].includes(Number(searchParams.get("page_size")))
    ? Number(searchParams.get("page_size")) : 50;
  const texto = searchParams.get("texto") || "";
  const fechaDesde = searchParams.get("fecha_desde") || "";
  const fechaHasta = searchParams.get("fecha_hasta") || "";
  const debouncedTexto = useDebounce(texto.trim());
  const [detalleId, setDetalleId] = useState(null);

  const params = { page, page_size: pageSize, texto: debouncedTexto, fecha_desde: fechaDesde, fecha_hasta: fechaHasta };
  const { data, error } = useFacturas(params);
  const deleteMutation = useDeleteFactura();
  const { data: impuestoData } = useImpuesto();
  const { data: detalle } = useFactura(detalleId);

  const taxPercent = impuestoData?.tax_percent ?? 0;
  const rows = data?.results ?? [];
  const count = data?.count ?? 0;
  const totalPages = Math.max(1, Math.ceil(count / pageSize));

  const updateParams = (changes) => {
    setSearchParams((previous) => {
      const next = new URLSearchParams(previous);
      for (const [key, value] of Object.entries(changes)) {
        if (value) next.set(key, String(value));
        else next.delete(key);
      }
      return next;
    }, { replace: true });
  };

  function handlePageChange(newPage) {
    updateParams({ page: newPage, page_size: pageSize });
  }

  function handlePageSizeChange(newSize) {
    updateParams({ page: 1, page_size: newSize });
  }

  function onDelete(row) {
    if (!window.confirm(`Eliminar factura ${row.numero_factura}?`)) return;
    deleteMutation.mutate(row.id);
  }

  function onView(row) {
    setDetalleId(row.id);
  }

  return (
    <>
      <PageCard title="Listado de facturas">
        <div className="page-actions">
          <Link className="btn btn-success" to="/facturas/crear">Nueva factura</Link>
        </div>
        <div className="filter-bar flex flex-wrap items-end gap-3 mb-3">
          <label className="flex flex-col gap-1" style={{ flex: "1 1 240px" }}>
            Buscar factura o proveedor
            <input
              type="search"
              className="form-control"
              placeholder="Número de factura o nombre del proveedor"
              value={texto}
              onChange={(e) => updateParams({ texto: e.target.value, page: 1 })}
            />
          </label>
          <label className="flex flex-col gap-1">
            Desde
            <input type="date" className="form-control" value={fechaDesde}
              onChange={(e) => updateParams({ fecha_desde: e.target.value, page: 1 })} />
          </label>
          <label className="flex flex-col gap-1">
            Hasta
            <input type="date" className="form-control" value={fechaHasta}
              onChange={(e) => updateParams({ fecha_hasta: e.target.value, page: 1 })} />
          </label>
          <button type="button" className="btn btn-secondary"
            disabled={!texto && !fechaDesde && !fechaHasta}
            onClick={() => updateParams({ texto: "", fecha_desde: "", fecha_hasta: "", page: 1 })}>
            Limpiar filtros
          </button>
        </div>
        {error && <div className="alert alert-danger" role="alert">{error.message}</div>}
        <CrudTable
          rows={error ? [] : rows}
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
        <div className="flex flex-wrap items-center justify-between gap-3 mt-4">
          <PageSizeSelector value={pageSize} onChange={handlePageSizeChange} options={[25, 50, 100]} />
          <Pagination
            page={page}
            totalPages={totalPages}
            onPageChange={handlePageChange}
            count={count}
            pageSize={pageSize}
          />
        </div>
      </PageCard>

      {detalle && (
        <div className="modal" role="dialog" aria-modal="true">
          <div className="modal-dialog modal-xl" style={{ maxWidth: 1000 }}>
            <div className="modal-content">
              <div className="modal-header">
                <h5 className="modal-title">Detalle factura #{detalle.numero_factura}</h5>
                <button type="button" className="modal-close" onClick={() => setDetalleId(null)}>&times;</button>
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
                <button type="button" className="btn btn-secondary" onClick={() => setDetalleId(null)}>Cerrar</button>
                <button type="button" className="btn btn-primary" onClick={() => imprimirEtiquetas(detalle)}>Imprimir etiquetas</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
