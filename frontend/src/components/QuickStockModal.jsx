import { useMemo, useRef, useState } from "react";
import StepperInput from "./StepperInput";
import { useAjustarStock, useUbicaciones } from "../lib/queries";
import { getStoreConfig } from "../lib/storeConfig";

function todayInputValue() {
  const d = new Date();
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export default function QuickStockModal({ producto, onClose }) {
  const { data: ubicacionesData } = useUbicaciones({ page_size: 200 });
  const todasUbicaciones = useMemo(() => ubicacionesData?.results ?? [], [ubicacionesData]);
  const mutation = useAjustarStock();
  const storeConfig = getStoreConfig();

  const defaultUbicacionId = storeConfig.ubicacion_por_defecto ?? null;

  const initialRows = useMemo(() => {
    const stocks = producto.ubicaciones_stock || [];
    if (stocks.length === 0) {
      if (defaultUbicacionId) {
        const u = todasUbicaciones.find((x) => x.id === defaultUbicacionId);
        return u ? [{
          rowKey: "default-0",
          ubicacion_id: u.id,
          nombre: u.nombre,
          cantidad_actual: 0,
          cantidad_nueva: "0",
        }] : [];
      }
      return [];
    }

    let hasDefault = false;
    const rows = stocks.map((s, i) => {
      if (s.ubicacion_id === defaultUbicacionId) hasDefault = true;
      let ubicacion_id = s.ubicacion_id;
      let nombre = s.nombre;

      if (ubicacion_id === null && defaultUbicacionId && !stocks.some((x) => x.ubicacion_id === defaultUbicacionId)) {
        const u = todasUbicaciones.find((x) => x.id === defaultUbicacionId);
        if (u) {
          ubicacion_id = u.id;
          nombre = u.nombre;
          hasDefault = true;
        }
      }

      return {
        rowKey: `row-${i}`,
        ubicacion_id,
        nombre,
        cantidad_actual: s.cantidad,
        cantidad_nueva: String(s.cantidad),
      };
    });

    if (!hasDefault && defaultUbicacionId && rows.length === 0) {
      const u = todasUbicaciones.find((x) => x.id === defaultUbicacionId);
      if (u) {
        rows.push({
          rowKey: "default-0",
          ubicacion_id: u.id,
          nombre: u.nombre,
          cantidad_actual: 0,
          cantidad_nueva: "0",
        });
      }
    }

    return rows;
  }, [producto.ubicaciones_stock, todasUbicaciones, defaultUbicacionId]);

  const nextKeyRef = useRef(initialRows.length);

  const [rows, setRows] = useState(initialRows);
  const [error, setError] = useState("");
  const [nuevaUbicacionId, setNuevaUbicacionId] = useState("");

  const ubicacionesUsadas = new Set(rows.map((r) => r.ubicacion_id));
  const ubicacionesDisponibles = todasUbicaciones.filter(
    (u) => !ubicacionesUsadas.has(u.id)
  );

  function updateCantidad(rowKey, value) {
    setRows((prev) =>
      prev.map((r) =>
        r.rowKey === rowKey ? { ...r, cantidad_nueva: value } : r
      )
    );
  }

  function agregarUbicacion() {
    const id = Number(nuevaUbicacionId);
    const u = todasUbicaciones.find((x) => x.id === id);
    if (!u) return;
    setRows((prev) => [
      ...prev,
      { rowKey: `new-${nextKeyRef.current++}`, ubicacion_id: u.id, nombre: u.nombre, cantidad_actual: 0, cantidad_nueva: "0" },
    ]);
    setNuevaUbicacionId("");
  }

  function handleSubmit(e) {
    e.preventDefault();
    setError("");

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
      {
        productoId: producto.producto_id,
        data: {
          ajustes,
          motivo: "Ajuste rápido desde ventas",
          fecha: todayInputValue(),
        },
      },
      {
        onSuccess: () => onClose(true),
        onError: (err) => setError(err.message || "Error al ajustar stock"),
      }
    );
  }

  return (
    <div className="modal" role="dialog" aria-modal="true">
      <div className="modal-dialog" style={{ maxWidth: 520 }}>
        <div className="modal-content">
          <form onSubmit={handleSubmit}>
            <div className="modal-header">
              <h5 className="modal-title">Ajuste rápido — {producto.nombre}</h5>
              <button type="button" className="modal-close" onClick={() => onClose(false)}>
                &times;
              </button>
            </div>

            <div className="modal-body">
              {error && <div className="alert alert-danger">{error}</div>}

              <table className="table table-sm table-bordered">
                <thead>
                  <tr>
                    <th>Ubicación</th>
                    <th style={{ width: 130 }}>Stock</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.length === 0 ? (
                    <tr>
                      <td colSpan={2} className="text-center text-muted">
                        Sin ubicaciones
                      </td>
                    </tr>
                  ) : (
                    rows.map((r) => (
                      <tr key={r.rowKey}>
                        <td>{r.nombre}</td>
                        <td>
                          <StepperInput
                            value={r.cantidad_nueva}
                            onChange={(val) => updateCantidad(r.rowKey, val)}
                            min={0}
                            inputStyle={{ width: 70, fontSize: "0.85rem" }}
                            decrementLabel={`Disminuir stock en ${r.nombre}`}
                            incrementLabel={`Aumentar stock en ${r.nombre}`}
                          />
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>

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
              <button type="button" className="btn btn-secondary" onClick={() => onClose(false)}>
                Cancelar
              </button>
              <button type="submit" className="btn btn-primary" disabled={mutation.isPending}>
                {mutation.isPending ? "Guardando..." : "Guardar"}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
