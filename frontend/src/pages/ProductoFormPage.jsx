import { useEffect, useMemo, useState } from "react";
import PageCard from "../components/PageCard";
import Shell from "../components/Shell";
import { apiRequest } from "../lib/api";

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
  const id = useMemo(() => new URLSearchParams(window.location.search).get("id"), []);
  const initialCodigoProducto = useMemo(() => new URLSearchParams(window.location.search).get("codigo_producto") || "", []);
  const initialProveedor = useMemo(() => new URLSearchParams(window.location.search).get("proveedor") || "", []);
  const fromFactura = useMemo(() => new URLSearchParams(window.location.search).get("from_factura") === "1", []);
  const embed = useMemo(() => new URLSearchParams(window.location.search).get("embed") === "1", []);
  const [data, setData] = useState(initialState);
  const [proveedores, setProveedores] = useState([]);
  const [error, setError] = useState("");

  useEffect(() => {
    apiRequest("/proveedores/").then(setProveedores).catch((err) => setError(err.message));
    if (id) {
      apiRequest(`/productos/${id}/`)
        .then((row) => setData({ ...row, proveedor: String(row.proveedor) }))
        .catch((err) => setError(err.message));
    } else {
      setData((prev) => ({
        ...prev,
        codigo_producto: initialCodigoProducto || prev.codigo_producto,
        proveedor: initialProveedor || prev.proveedor,
      }));
    }
  }, [id, initialCodigoProducto, initialProveedor]);

  async function submit(event) {
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
    const endpoint = id ? `/productos/${id}/` : "/productos/";
    const method = id ? "PUT" : "POST";
    try {
      const saved = await apiRequest(endpoint, { method, body: payload });
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
      window.location.href = "/ventas/productos/producto.html";
    } catch (err) {
      setError(err.message);
    }
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
          <div className="col-md-3 form-group"><label>Stock mínimo</label><input type="number" className="form-control" value={data.stock_minimo} onChange={(e) => setData({ ...data, stock_minimo: e.target.value })} required /></div>
          <div className="col-md-3 form-group"><label>Stock máximo</label><input type="number" className="form-control" value={data.stock_maximo} onChange={(e) => setData({ ...data, stock_maximo: e.target.value })} required /></div>
          <div className="col-md-4 form-group"><label>Margen utilidad (%)</label><input type="number" step="0.01" className="form-control" value={data.margen_utilidad} onChange={(e) => setData({ ...data, margen_utilidad: e.target.value })} required /></div>
          <div className="col-md-8 form-group">
            <label>Proveedor</label>
            <select className="form-control" value={data.proveedor} onChange={(e) => setData({ ...data, proveedor: e.target.value })} required>
              <option value="">Seleccione proveedor</option>
              {proveedores.map((p) => <option key={p.proveedor_id} value={p.proveedor_id}>{p.nombre}</option>)}
            </select>
          </div>
        </div>
        <button className="btn btn-primary" type="submit">Guardar</button>
      </form>
    </PageCard>
  );

  if (embed) {
    return <div className="p-3">{content}</div>;
  }

  return (
    <Shell title={id ? "Editar producto" : "Crear producto"}>
      {content}
    </Shell>
  );
}
