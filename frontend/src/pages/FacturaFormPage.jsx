import { useEffect, useMemo, useState } from "react";
import PageCard from "../components/PageCard";
import Shell from "../components/Shell";
import { apiRequest } from "../lib/api";
import { fetchTaxPercent, getTaxPercent } from "../lib/tax";

function todayLocal() {
  const now = new Date();
  const yyyy = now.getFullYear();
  const mm = String(now.getMonth() + 1).padStart(2, "0");
  const dd = String(now.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

export default function FacturaFormPage() {
  const id = useMemo(() => new URLSearchParams(window.location.search).get("id"), []);
  const [proveedores, setProveedores] = useState([]);
  const [header, setHeader] = useState({ numero_factura: "", proveedor_id: "", fecha: todayLocal() });
  const [productoId, setProductoId] = useState("");
  const [items, setItems] = useState([]);
  const [error, setError] = useState("");
  const [showCreatePrompt, setShowCreatePrompt] = useState(false);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showCreatedSuccess, setShowCreatedSuccess] = useState(false);
  const [createUrl, setCreateUrl] = useState("");
  const [taxPercent, setTaxPercent] = useState(getTaxPercent());
  const totalFactura = items.reduce((sum, it) => sum + Number(it.precio || 0) * Number(it.cantidad || 0), 0);
  const totalFacturaConIva = Math.round(totalFactura * (1 + taxPercent / 100));

  useEffect(() => {
    fetchTaxPercent().then((p) => setTaxPercent(p));
    function handleProductCreated(event) {
      const payload = event.data;
      if (!payload || payload.type !== "PRODUCT_CREATED" || !payload.producto) return;
      const p = payload.producto;
      setItems((prev) => {
        const exists = prev.find((it) => it.producto_id === p.producto_id);
        if (exists) return prev;
        return [
          ...prev,
          {
            producto_id: p.producto_id,
            codigo_producto: p.codigo_producto,
            nombre: p.nombre,
            precio: p.precio_costo,
            cantidad: 1,
          },
        ];
      });
      setProductoId("");
      setError("");
      setShowCreatedSuccess(true);
      setTimeout(() => {
        setShowCreatedSuccess(false);
        setShowCreateModal(false);
      }, 1200);
    }

    window.addEventListener("message", handleProductCreated);
    return () => window.removeEventListener("message", handleProductCreated);
  }, []);

  useEffect(() => {
    apiRequest("/proveedores/").then(setProveedores).catch((err) => setError(err.message));
    if (id) {
      apiRequest(`/facturas/${id}/`).then((data) => {
        setHeader({
          numero_factura: data.numero_factura,
          proveedor_id: data.proveedor,
          fecha: data.fecha,
        });
        setItems(
          (data.detalles || []).map((d) => ({
            producto_id: d.producto,
            codigo_producto: d.codigo_producto,
            nombre: d.nombre,
            precio: d.costo_compra,
            cantidad: d.cantidad,
          }))
        );
      });
    }
  }, [id]);

  async function buscarProducto() {
    try {
      const result = await apiRequest(`/facturas/buscar-producto/?codigo_producto=${encodeURIComponent(productoId)}`);
      if (!result.encontrado) {
        setShowCreatePrompt(true);
        setError("Producto no encontrado");
        return;
      }
      setItems([...items, { producto_id: result.producto.producto_id, codigo_producto: result.producto.codigo_producto, nombre: result.producto.nombre, precio: result.producto.precio_costo, cantidad: 1 }]);
      setProductoId("");
      setError("");
    } catch (err) {
      setError(err.message);
    }
  }

  function abrirCrearProducto() {
    const params = new URLSearchParams();
    if (productoId) params.set("codigo_producto", productoId);
    if (header.proveedor_id) params.set("proveedor", String(header.proveedor_id));
    params.set("from_factura", "1");
    params.set("embed", "1");
    setCreateUrl(`/ventas/productos/create.html?${params.toString()}`);
    setShowCreatePrompt(false);
    setShowCreateModal(true);
  }

  async function guardar(event) {
    event.preventDefault();
    const payload = {
      numero_factura: Number(header.numero_factura),
      proveedor_id: Number(header.proveedor_id),
      fecha: header.fecha,
      productos: items.map((it) => ({ producto_id: Number(it.producto_id), precio: Number(it.precio), cantidad: Number(it.cantidad) })),
    };
    try {
      await apiRequest(id ? `/facturas/${id}/` : "/facturas/", { method: id ? "PUT" : "POST", body: payload });
      window.location.href = "/gerencia/facturas/facturas.html";
    } catch (err) {
      setError(err.message);
    }
  }

  return (
    <Shell title={id ? "Editar factura" : "Crear factura"}>
      <PageCard title={id ? "Editar factura" : "Crear factura"}>
        {error && <div className="alert alert-danger">{error}</div>}
        <form onSubmit={guardar}>
          <div className="row">
            <div className="col-md-4 form-group"><label>Número factura</label><input disabled={Boolean(id)} className="form-control" value={header.numero_factura} onChange={(e) => setHeader({ ...header, numero_factura: e.target.value })} required /></div>
            <div className="col-md-4 form-group"><label>Proveedor</label><select className="form-control" value={header.proveedor_id} onChange={(e) => setHeader({ ...header, proveedor_id: e.target.value })} required><option value="">Seleccione</option>{proveedores.map((p) => <option key={p.proveedor_id} value={p.proveedor_id}>{p.nombre}</option>)}</select></div>
            <div className="col-md-4 form-group"><label>Fecha</label><input type="date" className="form-control" value={header.fecha} onChange={(e) => setHeader({ ...header, fecha: e.target.value })} required /></div>
          </div>

          <div className="page-actions">
            <input className="form-control" style={{ maxWidth: 260 }} placeholder="Código producto" value={productoId} onChange={(e) => setProductoId(e.target.value)} />
            <button type="button" className="btn btn-secondary" onClick={buscarProducto}>Agregar producto</button>
          </div>

          <div className="table-responsive">
            <table className="table table-sm table-bordered">
              <thead><tr><th>Código</th><th>Nombre</th><th>Precio costo</th><th>Precio con IVA</th><th>Cantidad</th><th></th></tr></thead>
              <tbody>
                {items.map((it, idx) => (
                  <tr key={`${it.producto_id}-${idx}`}>
                    <td>{it.codigo_producto}</td>
                    <td>{it.nombre}</td>
                    <td><input className="form-control form-control-sm" type="number" value={it.precio} onChange={(e) => { const next = [...items]; next[idx].precio = e.target.value; setItems(next); }} /></td>
                    <td>${Math.round(Number(it.precio || 0) * (1 + taxPercent / 100))}</td>
                    <td><input className="form-control form-control-sm" type="number" value={it.cantidad} onChange={(e) => { const next = [...items]; next[idx].cantidad = e.target.value; setItems(next); }} /></td>
                    <td><button type="button" className="btn btn-sm btn-danger" onClick={() => setItems(items.filter((_, i) => i !== idx))}>X</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="flex justify-end mb-4 text-right">
            <div>
              <div className="text-sm text-secondary mb-1">Total neto: ${totalFactura}</div>
              <div className="text-xl font-display font-bold">Total con IVA ({taxPercent}%): ${totalFacturaConIva}</div>
            </div>
          </div>

          <button className="btn btn-primary" type="submit">Guardar factura</button>
        </form>
      </PageCard>

      {showCreatePrompt && (
        <div className="modal" role="dialog" aria-modal="true">
          <div className="modal-dialog">
            <div className="modal-content">
              <div className="modal-header">
                <h5 className="modal-title">Producto no encontrado</h5>
                <button type="button" className="modal-close" onClick={() => setShowCreatePrompt(false)}>&times;</button>
              </div>
              <div className="modal-body">
                <p className="mb-0 text-secondary">No existe ese código. ¿Desea crear un producto ahora?</p>
              </div>
              <div className="modal-footer">
                <button type="button" className="btn btn-secondary" onClick={() => setShowCreatePrompt(false)}>Cancelar</button>
                <button type="button" className="btn btn-primary" onClick={abrirCrearProducto}>Crear producto</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {showCreateModal && (
        <div className="modal" role="dialog" aria-modal="true">
          <div className="modal-dialog modal-xl" style={{ maxWidth: 1100 }}>
            <div className="modal-content">
              <div className="modal-header">
                <h5 className="modal-title">Crear producto</h5>
                <button type="button" className="modal-close" onClick={() => setShowCreateModal(false)}>&times;</button>
              </div>
              <div className="modal-body p-0" style={{ height: "75vh" }}>
                <iframe title="Crear producto" src={createUrl} style={{ width: "100%", height: "100%", border: 0 }} />
              </div>
            </div>
          </div>
        </div>
      )}

      {showCreatedSuccess && (
        <div className="modal" role="dialog" aria-modal="true">
          <div className="modal-dialog" style={{ maxWidth: 420 }}>
            <div className="modal-content">
              <div className="modal-body text-center py-5">
                <div className="text-success mb-3" style={{ fontSize: 36, lineHeight: 1 }}>✓</div>
                <h5 className="mb-0">Producto creado con éxito</h5>
              </div>
            </div>
          </div>
        </div>
      )}
    </Shell>
  );
}
