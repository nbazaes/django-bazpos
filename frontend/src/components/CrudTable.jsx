export default function CrudTable({ columns, rows, onEdit, onDelete, onView }) {
  return (
    <div className="table-responsive">
      <table className="table table-bordered table-sm">
        <thead>
          <tr>
            {columns.map((col) => (
              <th key={col.key}>{col.label}</th>
            ))}
            {(onView || onEdit || onDelete) && <th>Acciones</th>}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.id || row.producto_id || row.proveedor_id || row.numero_factura || row.username}>
              {columns.map((col) => (
                <td key={col.key}>{col.render ? col.render(row) : (row[col.key] ?? "")}</td>
              ))}
              {(onView || onEdit || onDelete) && (
                <td>
                  {onView && (
                    <button className="btn btn-sm btn-info mr-2" onClick={() => onView(row)}>
                      Ver
                    </button>
                  )}
                  {onEdit && (
                    <button className="btn btn-sm btn-primary mr-2" onClick={() => onEdit(row)}>
                      Editar
                    </button>
                  )}
                  {onDelete && (
                    <button className="btn btn-sm btn-danger" onClick={() => onDelete(row)}>
                      Eliminar
                    </button>
                  )}
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
