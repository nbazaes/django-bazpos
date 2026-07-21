import { useState } from "react";
import { useAjustarStock, useUbicaciones } from "../lib/queries";

function formatDate(date) {
  const d = new Date(date);
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export default function AjusteStockModal({ producto, onClose }) {
  const { data: ubicacionesData } = useUbicaciones();
  const todasUbicaciones = ubicacionesData?.results ?? [];

  const existingStocks = producto.ubicaciones_stock || [];

  const [adjustments, setAdjustments] = useState(() => {
    const map = {};
    for (const s of existingStocks) {
      map[s.ubicacion_id] = { nombre: s.nombre, cantidad_actual: s.cantidad, cantidad_nueva: s.cantidad };
    }
    return map;
  });

  const [motivo, setMotivo] = useState("");
  const [fecha, setFecha] = useState(() => formatDate(new Date()));
  const [error, setError] = useState("");
  const [newUbicacionId, setNewUbicacionId] = useState("");

  const mutation = useAjustarStock();

  const usedUbicacionIds = Object.keys(adjustments).map(Number);
  const availableUbicaciones = todasUbicaciones.filter(
    (u) => !usedUbicacionIds.includes(u.id)
  );

  function handleCantidadChange(ubicacionId, value) {
    setAdjustments((prev) => ({
      ...prev,
      [ubicacionId]: { ...prev[ubicacionId], cantidad_nueva: value === "" ? 0 : Number(value) },
    }));
  }

  function handleAddUbicacion() {
    if (!newUbicacionId) return;
    const u = todasUbicaciones.find((ub) => ub.id === Number(newUbicacionId));
    if (!u) return;
    setAdjustments((prev) => ({
      ...prev,
      [u.id]: { nombre: u.nombre, cantidad_actual: 0, cantidad_nueva: 0 },
    }));
    setNewUbicacionId("");
  }

  function handleRemoveUbicacion(ubicacionId, cantidad_actual) {
    if (cantidad_actual > 0) return;
    setAdjustments((prev) => {
      const next = { ...prev };
      delete next[ubicacionId];
      return next;
    });
  }

  function handleSubmit(e) {
    e.preventDefault();
    setError("");

    if (!motivo.trim()) {
      setError("El motivo es obligatorio");
      return;
    }

    const ajustes = [];
    for (const [id, a] of Object.entries(adjustments)) {
      if (a.cantidad_nueva !== a.cantidad_actual) {
        ajustes.push({ ubicacion_id: Number(id), cantidad: a.cantidad_nueva });
      }
    }

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

  const adjustmentEntries = Object.entries(adjustments);

  return (
    <div className="modal" role="dialog" aria-modal="true">
      <div className="modal-dialog" style={{ maxWidth: 600 }}>
        <div className="modal-content">
          <form onSubmit={handleSubmit}>
            <div className="modal-header">
              <h5 className="modal-title">
                Ajustar stock — {producto.nombre}
              </h5>
              <button type="button" className="modal-close" onClick={onClose}>&times;</button>
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
                    {adjustmentEntries.length === 0 ? (
                      <tr>
                        <td colSpan={4} className="text-center text-muted">
                          Sin ubicaciones
                        </td>
                      </tr>
                    ) : (
                      adjustmentEntries.map(([id, a]) => (
                        <tr key={id}>
                          <td>{a.nombre}</td>
                          <td className="text-center">{a.cantidad_actual}</td>
                          <td>
                            <input
                              type="number"
                              className="form-control form-control-sm"
                              min={0}
                              value={a.cantidad_nueva}
                              onChange={(e) => handleCantidadChange(id, e.target.value)}
                            />
                          </td>
                          <td className="text-center">
                            {a.cantidad_actual === 0 && (
                              <button
                                type="button"
                                className="btn btn-sm btn-danger"
                                title="Quitar ubicación"
                                onClick={() => handleRemoveUbicacion(Number(id), a.cantidad_actual)}
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

              {availableUbicaciones.length > 0 && (
                <div className="form-row align-items-end">
                  <div className="col form-group">
                    <select
                      className="form-control form-control-sm"
                      value={newUbicacionId}
                      onChange={(e) => setNewUbicacionId(e.target.value)}
                    >
                      <option value="">Agregar ubicación...</option>
                      {availableUbicaciones.map((u) => (
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
                      onClick={handleAddUbicacion}
                      disabled={!newUbicacionId}
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
