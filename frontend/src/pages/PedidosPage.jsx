import { useEffect, useState } from "react";
import PageCard from "../components/PageCard";
import Shell from "../components/Shell";
import { apiRequest } from "../lib/api";

export default function PedidosPage() {
  const [ventas, setVentas] = useState([]);
  const [detalleVenta, setDetalleVenta] = useState(null);

  useEffect(() => {
    apiRequest("/ventas/").then(setVentas);
  }, []);

  async function verVenta(id) {
    const data = await apiRequest(`/ventas/${id}/`);
    setDetalleVenta(data);
  }

  return (
    <Shell title="Pedidos/Ventas registradas">
      <PageCard title="Historial de ventas">
        <table className="table table-sm table-bordered">
          <thead><tr><th>ID</th><th>Fecha</th><th>Usuario</th><th>Total</th><th>Tipo</th><th>Estado</th><th></th></tr></thead>
          <tbody>
            {ventas.map((v) => (
              <tr key={v.id}><td>{v.id}</td><td>{v.fecha_venta}</td><td>{v.usuario_nombre}</td><td>${v.monto_total}</td><td>{v.tipo_documento_display || v.tipo_documento}</td><td>{v.estado_display || v.estado}</td><td><button className="btn btn-sm btn-info" onClick={() => verVenta(v.id)}>Ver</button></td></tr>
            ))}
          </tbody>
        </table>
      </PageCard>

      {detalleVenta && (
        <div className="modal" style={{ display: "block", backgroundColor: "rgba(0, 0, 0, 0.45)" }} role="dialog" aria-modal="true">
          <div className="modal-dialog modal-lg modal-dialog-centered">
            <div className="modal-content">
              <div className="modal-header">
                <h5 className="modal-title">Detalle de venta #{detalleVenta.id}</h5>
                <button type="button" className="close" onClick={() => setDetalleVenta(null)}>
                  <span>&times;</span>
                </button>
              </div>
              <div className="modal-body">
                <div className="row mb-3">
                  <div className="col-md-4"><strong>Fecha:</strong> {detalleVenta.fecha_venta}</div>
                  <div className="col-md-4"><strong>Usuario:</strong> {detalleVenta.usuario_nombre}</div>
                  <div className="col-md-4"><strong>Tipo:</strong> {detalleVenta.tipo_documento_display || detalleVenta.tipo_documento}</div>
                </div>
                <div className="table-responsive">
                  <table className="table table-sm table-bordered mb-0">
                    <thead><tr><th>Codigo</th><th>Producto</th><th>Cantidad</th><th>Precio unitario</th><th>Subtotal</th></tr></thead>
                    <tbody>
                      {(detalleVenta.detalles || []).map((d) => (
                        <tr key={d.id}>
                          <td>{d.codigo_producto}</td>
                          <td>{d.producto_nombre}</td>
                          <td>{d.cantidad}</td>
                          <td>${d.precio_unitario}</td>
                          <td>${d.subtotal}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <div className="text-right mt-3"><strong>Total:</strong> ${detalleVenta.monto_total}</div>
              </div>
              <div className="modal-footer">
                <button type="button" className="btn btn-secondary" onClick={() => setDetalleVenta(null)}>Cerrar</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </Shell>
  );
}
