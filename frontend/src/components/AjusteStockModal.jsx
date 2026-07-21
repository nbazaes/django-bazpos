import { useMemo, useState } from "react";
import { useAjustarStock, useUbicaciones } from "../lib/queries";

function todayInputValue() {
  const d = new Date();
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export default function AjusteStockModal({ producto, onClose }) {
  const { data: ubicacionesData } = useUbicaciones();
  const todasUbicaciones = ubicacionesData?.results ?? [];
  const mutation = useAjustarStock();

  const initialRows = useMemo(() => {
    return (producto.ubicaciones_stock || []).map((s) => ({
      ubicacion_id: s.ubicacion_id,
      nombre: s.nombre,
      cantidad_actual: s.cantidad,
      cantidad_nueva: String(s.cantidad),
    }));
  }, [producto.ubicaciones_stock]);

  const [rows, setRows] = useState(initialRows);
  const [fecha, setFecha] = useState(todayInputValue());
  const [motivo, setMotivo] = useState("");
  const [error, setError] = useState("");
  const [nuevaUbicacionId, setNuevaUbicacionId] = useState("");

  const ubicacionesUsadas = new Set(rows.map((r) => r.ubicacion_id));
  const ubicacionesDisponibles = todasUbicaciones.filter(
    (u) => !ubicacionesUsadas.has(u.id)
  );

  function updateCantidad(ubicacionId, value) {
    setRows((prev) =>
      prev.map((r) =>
        r.ubicacion_id === ubicacionId ? { ...r, cantidad_nueva: value } : r
      )
    );
  }

  function agregarUbicacion() {
    const id = Number(nuevaUbicacionId);
    const u = todasUbicaciones.find((x) => x.id === id);
    if (!u) return;
    setRows((prev) => [
      ...prev,
      { ubicacion_id: u.id, nombre: u.nombre, cantidad_actual: 0, cantidad_nueva: "0" },
    ]);
    setNuevaUbicacionId("");
  }

  function quitarUbicacion(ubicacionId, cantidadActual) {
    if (cantidadActual > 0) return;
    setRows((prev) => prev.filter((r) => r.ubicacion_id !== ubicacionId));
  }

  function handleSubmit(e) {
    e.preventDefault();
    setError("");

    if (!motivo.trim()) {
      setError("El motivo es obligatorio");
      return;
    }

    const ajustes = rows
      .map((r) => ({
        ubicacion_id: r.ubicacion_id,
        cantidad: r.cantidad_nueva === "" ? 0 : Number(r.cantidad_nueva),
      }))
      .filter((r, idx) => r.cantidad !== rows[idx].cantidad_actual);

    if (ajustes.length === 0) {
      setError("No se ha modificado ninguna cantidad");
      return;
    }

    mutation.mutate(
      { productoId: producto.producto_id, data: { ajustes, motivo, fecha } },
      {
        onSuccess: () => onClose(),
        onError: (err) => setError(err.message || "Error al ajustar stock"),
      }
    );
  }

  return (
    <div className="modal" role="dialog" aria-modal="true">
      <div className="modal-dialog" style={{ maxWidth: 600 }}>
        <div className="modal-content">
          <form onSubmit={handleSubmit}>
            <div className="modal-header">
              <h5 className="modal-title">Ajustar stock — {producto.nombre}</h5>
              <button type="button" className="modal-close" onClick={onClose}>
                &times;
              </button>
            </div>

            <div className="modal-body">
              {error && <div className="alert alert-danger">{error}</div>}

              <div className="form-row mb-3">
                <div className="col-md-6 form-group">
                  <label>Fecha</label>
                  <input
                    type="date"
                    className="form-control"
                    value={fecha}
                    onChange={(e) => setFecha(e.target.value)}
                    required
                  />
                </div>
                <div className="col-md-6 form-group">
                  <label>Código</label>
                  <input
                    type="text"
                    className="form-control"
                    value={producto.codigo_producto}
                    disabled
                  />
                </div>
              </div>

              <div className="form-group">
                <label>Motivo del ajuste</label>
                <textarea
                  className="form-control"
                  rows={2}
                  placeholder="Ej: Conteo de inventario, error de registro, merma..."
                  value={motivo}
                  onChange={(e) => setMotivo(e.target.value)}
                  required
                />
              </div>

              <div className="form-group mt-3">
                <label>Ubicaciones</label>
                <table className="table table-sm table-bordered">
                  <thead>
                    <tr>
                      <th>Ubicación</th>
                      <th style={{ width: 120 }}>Stock actual</th>
                      <th style={{ width: 120 }}>Nuevo stock</th>
                      <th style={{ width: 40 }}></th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.length === 0 ? (
                      <tr>
                        <td colSpan={4} className="text-center text-muted">
                          Sin ubicaciones
                        </td>
                      </tr>
                    ) : (
                      rows.map((r) => (
                        <tr key={r.ubicacion_id}>
                          <td>{r.nombre}</td>
                          <td className="text-center">{r.cantidad_actual}</td>
                          <td>
                            <input
                              type="number"
                              min={0}
                              className="form-control form-control-sm"
                              value={r.cantidad_nueva}
                              onChange={(e) => updateCantidad(r.ubicacion_id, e.target.value)}
                            />
                          </td>
                          <td className="text-center">
                            {r.cantidad_actual === 0 && (
                              <button
                                type="button"
                                className="btn btn-sm btn-danger"
                                title="Quitar ubicación"
                                onClick={() => quitarUbicacion(r.ubicacion_id, r.cantidad_actual)}
                              >
                                &times;
                              </button>
                            )}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>

              {ubicacionesDisponibles.length > 0 && (
                <div className="form-row align-items-end">
                  <div className="col form-group">
                    <select
                      className="form-control form-control-sm"
                      value={nuevaUbicacionId}
                      onChange={(e) => setNuevaUbicacionId(e.target.value)}
                    >
                      <option value="">Agregar ubicación...</option>
                      {ubicacionesDisponibles.map((u) => (
                        <option key={u.id} value={u.id}>
                          {u.nombre}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="col-auto form-group">
                    <button
                      type="button"
                      className="btn btn-sm btn-secondary"
                      onClick={agregarUbicacion}
                      disabled={!nuevaUbicacionId}
                    >
                      Agregar
                    </button>
                  </div>
                </div>
              )}
            </div>

            <div className="modal-footer">
              <button type="button" className="btn btn-secondary" onClick={onClose}>
                Cancelar
              </button>
              <button type="submit" className="btn btn-primary" disabled={mutation.isPending}>
                {mutation.isPending ? "Guardando..." : "Guardar ajuste"}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
