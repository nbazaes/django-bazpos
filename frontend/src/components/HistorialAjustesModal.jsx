import { useHistorialAjustes } from "../lib/queries";
import { formatDateTime } from "../lib/format";

export default function HistorialAjustesModal({ producto, onClose }) {
  const { data: ajustes, isLoading } = useHistorialAjustes(producto.producto_id);

  return (
    <div className="modal" role="dialog" aria-modal="true">
      <div className="modal-dialog" style={{ maxWidth: 800 }}>
        <div className="modal-content">
          <div className="modal-header">
            <h5 className="modal-title">
              Historial de ajustes — {producto.nombre}
            </h5>
            <button type="button" className="modal-close" onClick={onClose}>&times;</button>
          </div>
          <div className="modal-body">
            <div className="table-responsive">
              <table className="table table-sm table-bordered table-mobile-cards">
                <thead>
                  <tr>
                    <th>Fecha</th>
                    <th>Ubicación</th>
                    <th>Stock anterior</th>
                    <th>Stock nuevo</th>
                    <th>Diferencia</th>
                    <th className="hide-mobile">Usuario</th>
                    <th className="hide-mobile">Motivo</th>
                  </tr>
                </thead>
                <tbody>
                  {isLoading ? (
                    <tr>
                      <td colSpan={7} className="text-center text-muted">Cargando...</td>
                    </tr>
                  ) : !ajustes || ajustes.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="text-center text-muted">
                        No hay ajustes registrados
                      </td>
                    </tr>
                  ) : (
                    ajustes.map((a) => (
                      <tr key={a.id}>
                        <td className="text-nowrap" data-label="Fecha" data-cell="primary">{formatDateTime(a.fecha_ajuste)}</td>
                        <td data-label="Ubicación">{a.ubicacion_nombre}</td>
                        <td className="text-center" data-label="Stock anterior">{a.cantidad_anterior}</td>
                        <td className="text-center" data-label="Stock nuevo">{a.cantidad_nueva}</td>
                        <td className="text-center" data-label="Diferencia">
                          {a.cantidad_nueva - a.cantidad_anterior > 0 ? "+" : ""}
                          {a.cantidad_nueva - a.cantidad_anterior}
                        </td>
                        <td className="hide-mobile" data-label="Usuario">{a.usuario_nombre}</td>
                        <td className="hide-mobile" data-label="Motivo">{a.motivo}</td>
                      </tr>
                    ))
                  )}
                </tbody>
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
