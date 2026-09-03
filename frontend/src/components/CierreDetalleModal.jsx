import { useCierreDetalle } from "../lib/queries";
import { formatDateTime } from "../lib/format";
import { formatMoney } from "../lib/storeConfig";

const fmtMoney = (n) => formatMoney(n);

const COLUMNS = {
  pago: ["Venta", "Fecha", "Cliente", "Documento", "Monto", "Vendedor"],
  documento: ["Venta", "Fecha", "Cliente", "Medio de pago", "Monto", "Vendedor"],
  devolucion: ["Devolución", "Venta", "Fecha", "Cliente", "Motivo", "Monto", "Vendedor"],
  anulacion: ["Anulación", "Venta", "Fecha", "Cliente", "Motivo", "Monto", "Vendedor"],
};

function renderFila(tipo, r) {
  const base = {
    pago: {
      id: r.id,
      ref: r.id,
      fecha: r.fecha,
      extra: r.documento || "—",
      monto: r.monto,
      usuario: r.usuario,
    },
    documento: {
      id: r.id,
      ref: r.id,
      fecha: r.fecha,
      extra: r.medio_pago || "—",
      monto: r.monto,
      usuario: r.usuario,
    },
    devolucion: {
      id: r.id,
      ref: r.venta_id,
      fecha: r.fecha,
      extra: r.motivo || "—",
      monto: r.monto,
      usuario: r.usuario,
    },
    anulacion: {
      id: r.id,
      ref: r.venta_id,
      fecha: r.fecha,
      extra: r.motivo || "—",
      monto: r.monto,
      usuario: r.usuario,
    },
  }[tipo];

  return (
    <tr key={`${tipo}-${base.id}`}>
      {tipo === "devolucion" || tipo === "anulacion" ? (
        <>
          <td className="text-center">{base.id}</td>
          <td className="text-center">{base.ref}</td>
        </>
      ) : (
        <td className="text-center">{base.ref}</td>
      )}
      <td className="text-nowrap">{formatDateTime(base.fecha)}</td>
      <td>{r.cliente || "—"}</td>
      <td>{base.extra}</td>
      <td>{fmtMoney(base.monto)}</td>
      <td className="hide-mobile">{base.usuario || "—"}</td>
    </tr>
  );
}

export default function CierreDetalleModal({ fecha, tipo, clave, titulo, onClose }) {
  const { data, isLoading } = useCierreDetalle(fecha, tipo, clave, true);
  const columnas = COLUMNS[tipo] || [];
  const total = (data || []).reduce((acc, r) => acc + Number(r.monto || 0), 0);

  return (
    <div className="modal" role="dialog" aria-modal="true">
      <div className="modal-dialog" style={{ maxWidth: 900 }}>
        <div className="modal-content">
          <div className="modal-header">
            <h5 className="modal-title">{titulo}</h5>
            <button type="button" className="modal-close" onClick={onClose}>&times;</button>
          </div>
          <div className="modal-body">
            <div className="table-responsive">
              <table className="table table-sm">
                <thead>
                  <tr>
                    {columnas.map((c) => (
                      <th key={c} className={c === "Vendedor" ? "hide-mobile" : undefined}>
                        {c}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {isLoading ? (
                    <tr>
                      <td colSpan={columnas.length} className="text-center text-muted">
                        Cargando...
                      </td>
                    </tr>
                  ) : !data || data.length === 0 ? (
                    <tr>
                      <td colSpan={columnas.length} className="text-center text-muted">
                        Sin registros para esta fecha
                      </td>
                    </tr>
                  ) : (
                    data.map((r) => renderFila(tipo, r))
                  )}
                </tbody>
                {!isLoading && data && data.length > 0 && (
                  <tfoot>
                    <tr>
                      <td colSpan={columnas.length - 1}>
                        <strong>Total ({data.length} registros)</strong>
                      </td>
                      <td className="hide-mobile">
                        <strong>{fmtMoney(total)}</strong>
                      </td>
                    </tr>
                  </tfoot>
                )}
              </table>
            </div>
          </div>
          <div className="modal-footer">
            <button type="button" className="btn btn-secondary" onClick={onClose}>
              Cerrar
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}