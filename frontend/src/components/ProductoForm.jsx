import { useEffect, useMemo, useState } from "react";
import StepperInput from "./StepperInput";
import {
  useCreateProducto,
  useProducto,
  useProductoPorCodigo,
  useProveedores,
  useUpdateProducto,
} from "../lib/queries";
import { useDebounce } from "../lib/hooks";
import { calcularPrecioVenta, getStoreConfig } from "../lib/storeConfig";

const initialState = {
  codigo_producto: "",
  oem: "",
  oem_alternativo: "",
  codigo_proveedor: "",
  nombre: "",
  marca: "",
  descripcion: "",
  precio_costo: 0,
  stock_minimo: 0,
  stock_maximo: 0,
  margen_utilidad: 30,
  proveedor: "",
};

export default function ProductoForm({
  productoId,
  initialCodigoProducto = "",
  initialProveedor = "",
  onSaved,
}) {
  const id = productoId;
  const [data, setData] = useState(() => ({
    ...initialState,
    margen_utilidad: Number(getStoreConfig().default_margin_percent ?? 30),
  }));
  const [error, setError] = useState("");

  const { data: proveedoresData } = useProveedores({ page_size: 200 });
  const { data: productoData } = useProducto(id);
  const createMutation = useCreateProducto();
  const updateMutation = useUpdateProducto();

  const debouncedCodigo = useDebounce(data.codigo_producto.trim(), 300);
  const { data: codigoCheck } = useProductoPorCodigo(debouncedCodigo, { enabled: !id });
  const existeCodigo = !id && codigoCheck?.encontrado === true;
  const codigoExistente = existeCodigo ? codigoCheck.producto : null;

  const proveedores = proveedoresData?.results ?? [];
  const showPartsFields = getStoreConfig().feature_flags?.product_oem_fields === true;

  const precioVenta = useMemo(
    () => calcularPrecioVenta(data.precio_costo, data.margen_utilidad),
    [data.precio_costo, data.margen_utilidad],
  );

  useEffect(() => {
    if (productoData && id) {
      let cancelled = false;
      Promise.resolve().then(() => {
        if (!cancelled) setData({ ...productoData, proveedor: String(productoData.proveedor) });
      });
      return () => { cancelled = true; };
    } else if (!id && (initialCodigoProducto || initialProveedor)) {
      let cancelled = false;
      Promise.resolve().then(() => {
        if (!cancelled) setData((prev) => ({
          ...prev,
          codigo_producto: initialCodigoProducto || prev.codigo_producto,
          proveedor: initialProveedor || prev.proveedor,
        }));
      });
      return () => { cancelled = true; };
    }
  }, [productoData, id, initialCodigoProducto, initialProveedor]);

  function submit(event) {
    event.preventDefault();
    if (existeCodigo) return;
    setError("");
    const payload = {
      ...data,
      precio_costo: Number(data.precio_costo),
      stock_minimo: Number(data.stock_minimo),
      stock_maximo: Number(data.stock_maximo),
      margen_utilidad: Number(data.margen_utilidad),
      proveedor: Number(data.proveedor),
    };
    const mutation = id ? updateMutation : createMutation;
    mutation.mutate(id ? { id, data: payload } : payload, {
      onSuccess: (saved) => {
        if (onSaved) onSaved(saved);
      },
      onError: (err) => setError(err.message),
    });
  }

  return (
    <>
      {error && <div className="alert alert-danger">{error}</div>}
      <form onSubmit={submit}>
        <div className="row">
          <div className="col-md-4 form-group">
            <label>Código Producto</label>
            <input
              className={`form-control${existeCodigo ? " is-invalid" : ""}`}
              value={data.codigo_producto}
              onChange={(e) => setData({ ...data, codigo_producto: e.target.value })}
              required
            />
            {existeCodigo && codigoExistente && (
              <div className="alert alert-warning mt-2 mb-0" role="alert">
                El código "<strong>{codigoExistente.codigo_producto}</strong>" ya existe para
                el producto "<strong>{codigoExistente.nombre}</strong>"
                {codigoExistente.marca ? ` (${codigoExistente.marca})` : ""}.
              </div>
            )}
          </div>
          <div className="col-md-4 form-group"><label>Nombre</label><input className="form-control" value={data.nombre} onChange={(e) => setData({ ...data, nombre: e.target.value })} required /></div>
          {showPartsFields && (
            <>
              <div className="col-md-4 form-group"><label>Código OEM</label><input className="form-control" value={data.oem} onChange={(e) => setData({ ...data, oem: e.target.value })} /></div>
              <div className="col-12 form-group"><label>OEM alternativos</label><textarea className="form-control" value={data.oem_alternativo} onChange={(e) => setData({ ...data, oem_alternativo: e.target.value })} rows={2} /></div>
              <div className="col-md-4 form-group"><label>Código proveedor</label><input className="form-control" value={data.codigo_proveedor} onChange={(e) => setData({ ...data, codigo_proveedor: e.target.value })} /></div>
              <div className="col-md-4 form-group"><label>Marca</label><input className="form-control" value={data.marca} onChange={(e) => setData({ ...data, marca: e.target.value })} /></div>
            </>
          )}
          <div className="col-12 form-group"><label>Descripción</label><textarea className="form-control" value={data.descripcion} onChange={(e) => setData({ ...data, descripcion: e.target.value })} /></div>
          <div className="col-md-3 form-group"><label>Precio costo</label><input type="number" className="form-control" value={data.precio_costo} onChange={(e) => setData({ ...data, precio_costo: e.target.value })} required /></div>
          <div className="col-md-3 form-group">
            <label>Stock actual</label>
            <input type="number" className="form-control" value={data.stock_actual ?? 0} disabled />
            {(data.ubicaciones_stock || []).length > 0 && (
              <div className="mt-2">
                <table className="table table-sm table-borderless" style={{ fontSize: "0.85em" }}>
                  <tbody>
                    {(data.ubicaciones_stock || []).map((u) => (
                      <tr key={u.nombre}>
                        <td className="text-muted pl-0">{u.nombre}</td>
                        <td className="text-right pr-0"><strong>{u.cantidad}</strong></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
          <div className="col-md-3 form-group"><label>Stock mínimo</label>
            <StepperInput
              value={data.stock_minimo}
              onChange={(val) => setData({ ...data, stock_minimo: val })}
              min={0}
              style={{ width: "100%" }}
              inputStyle={{ width: "100%" }}
              decrementLabel="Disminuir stock mínimo"
              incrementLabel="Aumentar stock mínimo"
            />
          </div>
          <div className="col-md-3 form-group"><label>Stock máximo</label>
            <StepperInput
              value={data.stock_maximo}
              onChange={(val) => setData({ ...data, stock_maximo: val })}
              min={0}
              style={{ width: "100%" }}
              inputStyle={{ width: "100%" }}
              decrementLabel="Disminuir stock máximo"
              incrementLabel="Aumentar stock máximo"
            />
          </div>
          <div className="col-md-4 form-group"><label>Margen utilidad (%)</label>
            <StepperInput
              value={data.margen_utilidad}
              onChange={(val) => setData({ ...data, margen_utilidad: val })}
              min={0}
              step={1}
              style={{ width: "100%" }}
              inputStyle={{ width: "100%" }}
              decrementLabel="Disminuir margen de utilidad"
              incrementLabel="Aumentar margen de utilidad"
            />
          </div>
          <div className="col-md-8 form-group">
            <label>Proveedor</label>
            <select className="form-control" value={data.proveedor} onChange={(e) => setData({ ...data, proveedor: e.target.value })} required>
              <option value="">Seleccione proveedor</option>
              {proveedores.map((p) => <option key={p.proveedor_id} value={p.proveedor_id}>{p.nombre}</option>)}
            </select>
          </div>
        </div>

        <div style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "baseline",
          width: "100%",
          marginTop: "1.2rem",
          paddingTop: "0.6rem",
          borderTop: "2px solid var(--border-default)",
        }}>
          <span style={{ fontSize: "1.05rem", fontWeight: 600, color: "var(--text-primary)" }}>Precio de venta</span>
          <span style={{
            fontFamily: "var(--font-mono)",
            fontSize: "2.1rem",
            fontWeight: 800,
            color: "var(--text-primary)",
            letterSpacing: "-0.02em",
          }}>
            ${precioVenta.toLocaleString()}
          </span>
        </div>

        <button className="btn btn-primary" type="submit" disabled={existeCodigo || createMutation.isPending || updateMutation.isPending}>
          {createMutation.isPending || updateMutation.isPending ? "Guardando..." : "Guardar"}
        </button>
      </form>
    </>
  );
}