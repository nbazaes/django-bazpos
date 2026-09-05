import { useState } from "react";
import { useUpdateProducto } from "../lib/queries";

function autoFill(value, fallback) {
  if (value === undefined || value === null || value === "") return fallback;
  return value;
}

function roundPrecio(precioCosto, margen) {
  const costo = Number(precioCosto) || 0;
  const margin = Number(margen) || 0;
  const total = costo * (1 + margin / 100) * 1.19;
  return Math.round(total / 100) * 100;
}

export default function QuickPrecioCostoModal({ producto, initialPrecioCosto, initialMargenUtilidad, onClose }) {
  const [precioCosto, setPrecioCosto] = useState(
    String(initialPrecioCosto ?? producto.precio_costo ?? 0)
  );
  const [margenUtilidad, setMargenUtilidad] = useState(
    String(initialMargenUtilidad ?? producto.margen_utilidad ?? 0)
  );
  const [guardarModificacion, setGuardarModificacion] = useState(false);
  const [error, setError] = useState("");
  const mutation = useUpdateProducto();

  const precioCalculado = roundPrecio(precioCosto, margenUtilidad);

  function handleSubmit(e) {
    e.preventDefault();
    setError("");

    const newPrecioCosto = Number(precioCosto) || 0;
    const newMargen = Number(margenUtilidad) || 0;
    const newPrecio = roundPrecio(precioCosto, margenUtilidad);

    if (guardarModificacion) {
      const body = {
        nombre: autoFill(producto.nombre, "-"),
        codigo_producto: autoFill(producto.codigo_producto, "-"),
        oem: autoFill(producto.oem, "-"),
        oem_alternativo: autoFill(producto.oem_alternativo, ""),
        codigo_proveedor: autoFill(producto.codigo_proveedor, "-"),
        marca: autoFill(producto.marca, "-"),
        descripcion: autoFill(producto.descripcion, "-"),
        precio: 0,
        precio_costo: newPrecioCosto,
        stock_minimo: autoFill(producto.stock_minimo, 0),
        stock_maximo: autoFill(producto.stock_maximo, 0),
        margen_utilidad: String(newMargen),
        proveedor: producto.proveedor ?? null,
      };

      mutation.mutate(
        { id: producto.producto_id, data: body },
        {
          onSuccess: () => onClose({ precioCosto: newPrecioCosto, margenUtilidad: newMargen, precio: newPrecio, saveProduct: true }),
          onError: (err) => setError(err.message || "Error al actualizar precio costo"),
        }
      );
    } else {
      onClose({ precioCosto: newPrecioCosto, margenUtilidad: newMargen, precio: newPrecio, saveProduct: false });
    }
  }

  return (
    <div className="modal" role="dialog" aria-modal="true">
      <div className="modal-dialog" style={{ maxWidth: 420 }}>
        <div className="modal-content">
          <form onSubmit={handleSubmit}>
            <div className="modal-header">
              <h5 className="modal-title">Editar precio costo — {producto.nombre}</h5>
              <button type="button" className="modal-close" onClick={() => onClose(null)}>
                &times;
              </button>
            </div>

            <div className="modal-body">
              {error && <div className="alert alert-danger">{error}</div>}

              <div className="form-group">
                <label>Precio costo</label>
                <input
                  type="number"
                  className="form-control"
                  value={precioCosto}
                  onChange={(e) => setPrecioCosto(e.target.value)}
                  min={0}
                  inputMode="numeric"
                />
              </div>

              <div className="form-group mt-3">
                <label>Margen de utilidad (%)</label>
                <input
                  type="number"
                  className="form-control"
                  value={margenUtilidad}
                  onChange={(e) => setMargenUtilidad(e.target.value)}
                  min={0}
                  max={999}
                  step="0.01"
                  inputMode="decimal"
                />
              </div>

              <div className="form-group mt-3">
                <label>Precio venta calculado</label>
                <input
                  type="text"
                  className="form-control"
                  value={`$${precioCalculado.toLocaleString("es-CL")}`}
                  disabled
                  style={{ background: "var(--bg-input)", fontWeight: 700 }}
                />
              </div>

              <div className="mt-3">
                <label className="checkbox-custom">
                  <input
                    type="checkbox"
                    checked={guardarModificacion}
                    onChange={(e) => setGuardarModificacion(e.target.checked)}
                  />
                  <span className="checkbox-custom__mark" />
                  <span
                    className="checkbox-custom__label"
                    style={{ fontSize: "0.85rem", color: "var(--text-secondary)" }}
                  >
                    Guardar modificación en el producto
                  </span>
                </label>
              </div>
            </div>

            <div className="modal-footer">
              <button type="button" className="btn btn-secondary" onClick={() => onClose(null)}>
                Cancelar
              </button>
              <button type="submit" className="btn btn-primary" disabled={mutation.isPending}>
                {mutation.isPending ? "Guardando..." : !guardarModificacion ? "Aplicar" : "Guardar"}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
