import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import PageCard from "../components/PageCard";
import StepperInput from "../components/StepperInput";
import { usePageTitle } from "../components/Shell";
import {
  useCreateProducto,
  useProducto,
  useProveedores,
  useUpdateProducto,
} from "../lib/queries";

function calcularPrecioVenta(precioCosto, margenUtilidad) {
  const costo = Number(precioCosto) || 0;
  const pct = Number(margenUtilidad) || 0;
  const base = costo * (1 + pct / 100);
  const baseIva = Math.trunc(base * 1.19);
  return Math.ceil(baseIva / 100) * 100;
}

const initialState = {
  codigo_producto: "",
  oem: "",
  nombre: "",
  marca: "",
  descripcion: "",
  precio_costo: 0,
  stock_minimo: 0,
  stock_maximo: 0,
  margen_utilidad: 30,
  proveedor: "",
};

export default function ProductoFormPage() {
  const navigate = useNavigate();
  const { id } = useParams();
  const [searchParams] = useSearchParams();
  const codigo_producto = searchParams.get("codigo_producto") || "";
  const proveedor = searchParams.get("proveedor") || "";
  const fromFactura = searchParams.get("from_factura") === "1";
  const embed = searchParams.get("embed") === "1";
  usePageTitle(id ? "Editar producto" : "Crear producto");

  const [data, setData] = useState(initialState);
  const [error, setError] = useState("");

  const { data: proveedoresData } = useProveedores({ page_size: 200 });
  const { data: productoData } = useProducto(id);
  const createMutation = useCreateProducto();
  const updateMutation = useUpdateProducto();

  const proveedores = proveedoresData?.results ?? [];

  const precioVenta = useMemo(
    () => calcularPrecioVenta(data.precio_costo, data.margen_utilidad),
    [data.precio_costo, data.margen_utilidad],
  );

  useEffect(() => {
    if (productoData && id) {
      setData({ ...productoData, proveedor: String(productoData.proveedor) });
    } else if (!id && (codigo_producto || proveedor)) {
      setData((prev) => ({
        ...prev,
        codigo_producto: codigo_producto || prev.codigo_producto,
        proveedor: proveedor || prev.proveedor,
      }));
    }
  }, [productoData, id, codigo_producto, proveedor]);

  function submit(event) {
    event.preventDefault();
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
        if (fromFactura && !id) {
          const message = { type: "PRODUCT_CREATED", producto: saved };
          if (window.opener && !window.opener.closed) {
            window.opener.postMessage(message, window.location.origin);
            window.close();
            return;
          }
          if (window.parent && window.parent !== window) {
            window.parent.postMessage(message, window.location.origin);
            return;
          }
          return;
        }
        navigate("/productos");
      },
      onError: (err) => setError(err.message),
    });
  }

  const content = (
    <PageCard title={id ? "Editar producto" : "Crear producto"}>
      {error && <div className="alert alert-danger">{error}</div>}
      <form onSubmit={submit}>
        <div className="row">
          <div className="col-md-4 form-group"><label>Código Producto</label><input className="form-control" value={data.codigo_producto} onChange={(e) => setData({ ...data, codigo_producto: e.target.value })} required /></div>
          <div className="col-md-4 form-group"><label>Código OEM</label><input className="form-control" value={data.oem} onChange={(e) => setData({ ...data, oem: e.target.value })} /></div>
          <div className="col-md-4 form-group"><label>Nombre</label><input className="form-control" value={data.nombre} onChange={(e) => setData({ ...data, nombre: e.target.value })} required /></div>
          <div className="col-md-4 form-group"><label>Marca</label><input className="form-control" value={data.marca} onChange={(e) => setData({ ...data, marca: e.target.value })} /></div>
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
              step={0.01}
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

        <button className="btn btn-primary" type="submit" disabled={createMutation.isPending || updateMutation.isPending}>
          {createMutation.isPending || updateMutation.isPending ? "Guardando..." : "Guardar"}
        </button>
      </form>
    </PageCard>
  );

  if (embed) {
    return <div className="p-3">{content}</div>;
  }

  return content;
}
