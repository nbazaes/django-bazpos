import { useHistorialAjustes } from "../lib/queries";

function formatDate(dateStr) {
  if (!dateStr) return "—";
  const parts = dateStr.split("-");
  return `${parts[2]}/${parts[1]}/${parts[0]}`;
}

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
              <table className="table table-sm table-bordered">
                <thead>
                  <tr>
                    <th>Fecha</th>
                    <th>Ubicación</th>
                    <th>Stock anterior</th>
                    <th>Stock nuevo</th>
                    <th>Diferencia</th>
                    <th>Usuario</th>
                    <th>Motivo</th>
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
                        <td className="text-nowrap">{formatDate(a.fecha_ajuste)}</td>
                        <td>{a.ubicacion_nombre}</td>
                        <td className="text-center">{a.cantidad_anterior}</td>
                        <td className="text-center">{a.cantidad_nueva}</td>
                        <td className="text-center">
                          {a.cantidad_nueva - a.cantidad_anterior > 0 ? "+" : ""}
                          {a.cantidad_nueva - a.cantidad_anterior}
                        </td>
                        <td>{a.usuario_nombre}</td>
                        <td>{a.motivo}</td>
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
