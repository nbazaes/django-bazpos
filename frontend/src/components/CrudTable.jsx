export default function CrudTable({ columns, rows, onEdit, onDelete, onView }) {
  if (!rows || rows.length === 0) {
    return (
      <div className="empty-state">
        <div className="empty-state-icon">&mdash;</div>
        <p>No hay registros disponibles</p>
      </div>
    );
  }

  return (
    <div className="table-responsive">
      <table className="table table-bordered table-sm">
        <thead>
          <tr>
            {columns.map((col) => (
              <th key={col.key} style={col.width ? { width: col.width } : undefined}>
                {col.label}
              </th>
            ))}
            {(onView || onEdit || onDelete) && <th>Acciones</th>}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr
              key={row.id || row.producto_id || row.proveedor_id || row.numero_factura || row.username}
            >
              {columns.map((col) => (
                <td key={col.key}>{col.render ? col.render(row) : (row[col.key] ?? "")}</td>
              ))}
              {(onView || onEdit || onDelete) && (
                <td>
                  <div className="btn-group">
                    {onView && (
                      <button className="btn btn-sm btn-info" onClick={() => onView(row)}>
                        Ver
                      </button>
                    )}
                    {onEdit && (
                      <button className="btn btn-sm btn-primary" onClick={() => onEdit(row)}>
                        Editar
                      </button>
                    )}
                    {onDelete && (
                      <button className="btn btn-sm btn-danger" onClick={() => onDelete(row)}>
                        Eliminar
                      </button>
                    )}
                  </div>
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
