import { useEffect, useState } from "react";
import PageCard from "../components/PageCard";
import { usePageTitle } from "../components/Shell";
import { apiRequest } from "../lib/api";
import { getUser, isGerente } from "../lib/auth";

export default function PedidosPage() {
  usePageTitle("Historial de ventas");
  const [transacciones, setTransacciones] = useState([]);
  const [detalleVenta, setDetalleVenta] = useState(null);
  const [detalleDevolucion, setDetalleDevolucion] = useState(null);
  const [ubicaciones, setUbicaciones] = useState([]);
  const [searchId, setSearchId] = useState("");
  const [tipoFilter, setTipoFilter] = useState("todos");

  const [anularVenta, setAnularVenta] = useState(null);
  const [anularMotivo, setAnularMotivo] = useState("");
  const [anularUbicaciones, setAnularUbicaciones] = useState({});
  const [anularCantidades, setAnularCantidades] = useState({});
  const [anularLoading, setAnularLoading] = useState(false);

  const [devolverVenta, setDevolverVenta] = useState(null);
  const [devolverMotivo, setDevolverMotivo] = useState("");
  const [devolverSeleccion, setDevolverSeleccion] = useState({});
  const [devolverCantidades, setDevolverCantidades] = useState({});
  const [devolverReponer, setDevolverReponer] = useState({});
  const [devolverUbicacion, setDevolverUbicacion] = useState({});
  const [devolverLoading, setDevolverLoading] = useState(false);

  const user = getUser();
  const esAdmin = isGerente(user);

  const filtradas = transacciones.filter((t) => {
    if (tipoFilter === "venta" && t._tipo !== "venta") return false;
    if (tipoFilter === "devolucion" && t._tipo !== "devolucion") return false;
    if (searchId && !String(t.id).includes(searchId.trim())) return false;
    return true;
  });

  useEffect(() => {
    cargarTransacciones();
    if (esAdmin) {
      apiRequest("/ubicaciones/").then(setUbicaciones);
    }
  }, [esAdmin]);

  async function cargarTransacciones() {
    const [ventas, devoluciones] = await Promise.all([
      apiRequest("/ventas/"),
      apiRequest("/devoluciones/"),
    ]);

    const filas = [
      ...ventas.map((v) => ({
        _tipo: "venta",
        _fecha: v.fecha_venta,
        id: v.id,
        usuario: v.usuario_nombre,
        monto: v.monto_total,
        tipo: v.tipo_documento_display || v.tipo_documento,
        estado: v.estado_display || v.estado,
        raw: v,
      })),
      ...devoluciones.map((d) => ({
        _tipo: "devolucion",
        _fecha: d.fecha_devolucion,
        id: d.id,
        usuario: d.usuario_nombre,
        monto: d.monto_devuelto,
        tipo: "Devolución",
        estado: "—",
        raw: d,
      })),
    ];

    filas.sort((a, b) => (b._fecha || "").localeCompare(a._fecha || ""));
    setTransacciones(filas);
  }

  async function verVenta(id) {
    const data = await apiRequest(`/ventas/${id}/`);
    setDetalleVenta(data);
  }

  async function verDevolucion(id) {
    const data = await apiRequest(`/devoluciones/${id}/`);
    setDetalleDevolucion(data);
  }

  async function abrirAnular(venta) {
    const data = await apiRequest(`/ventas/${venta.id}/`);
    setAnularVenta(data);
    setAnularMotivo("");

    const ubiMap = {};
    const cantMap = {};
    for (const d of data.detalles || []) {
      ubiMap[d.producto] = ubicaciones.length > 0 ? String(ubicaciones[0].id) : "";
      cantMap[d.producto] = d.cantidad;
    }
    setAnularUbicaciones(ubiMap);
    setAnularCantidades(cantMap);
  }

  async function confirmarAnular() {
    if (!anularMotivo.trim()) return;
    setAnularLoading(true);
    try {
      const restauraciones = (anularVenta.detalles || []).map((d) => ({
        producto_id: d.producto,
        ubicacion_id: parseInt(anularUbicaciones[d.producto]),
        cantidad: anularCantidades[d.producto],
      }));
      await apiRequest(`/ventas/${anularVenta.id}/anular/`, {
        method: "POST",
        body: { motivo: anularMotivo, restauraciones },
      });
      setAnularVenta(null);
      cargarTransacciones();
    } finally {
      setAnularLoading(false);
    }
  }

  async function abrirDevolver(venta) {
    const data = await apiRequest(`/ventas/${venta.id}/`);
    setDevolverVenta(data);
    setDevolverMotivo("");

    const prodDevueltos = data.productos_devueltos || {};
    const sel = {};
    const cant = {};
    const rep = {};
    const ubi = {};
    for (const d of data.detalles || []) {
      const devuelto = prodDevueltos[d.producto] || 0;
      const disponible = d.cantidad - devuelto;
      sel[d.producto] = false;
      cant[d.producto] = disponible > 0 ? disponible : 1;
      rep[d.producto] = true;
      ubi[d.producto] = ubicaciones.length > 0 ? String(ubicaciones[0].id) : "";
    }
    setDevolverSeleccion(sel);
    setDevolverCantidades(cant);
    setDevolverReponer(rep);
    setDevolverUbicacion(ubi);
  }

  async function confirmarDevolver() {
    if (!devolverMotivo.trim()) return;
    setDevolverLoading(true);
    try {
      const devueltosMap = devolverVenta.productos_devueltos || {};
      const productos = [];
      for (const d of devolverVenta.detalles || []) {
        if (!devolverSeleccion[d.producto]) continue;
        const devuelto = devueltosMap[d.producto] || 0;
        const maxDisp = d.cantidad - devuelto;
        const cantidad = Math.min(devolverCantidades[d.producto] || 0, maxDisp);
        if (cantidad <= 0) continue;

        const item = {
          producto_id: d.producto,
          cantidad,
          reponer_stock: devolverReponer[d.producto],
        };
        if (item.reponer_stock) {
          item.ubicacion_id = parseInt(devolverUbicacion[d.producto]);
        }
        productos.push(item);
      }
      if (productos.length === 0) return;

      await apiRequest(`/ventas/${devolverVenta.id}/devolver/`, {
        method: "POST",
        body: { motivo: devolverMotivo, productos },
      });
      setDevolverVenta(null);
      cargarTransacciones();
    } finally {
      setDevolverLoading(false);
    }
  }

  return (
    <>
      <PageCard title="Historial de ventas">
        <div className="page-actions">
          <select
            className="form-control"
            value={tipoFilter}
            onChange={(e) => setTipoFilter(e.target.value)}
          >
            <option value="todos">Todos</option>
            <option value="venta">Venta</option>
            <option value="devolucion">Devolución</option>
          </select>
          <input
            className="form-control"
            placeholder="Buscar por ID..."
            value={searchId}
            onChange={(e) => setSearchId(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && setSearchId(e.target.value)}
          />
        </div>
        <div className="table-responsive">
          <table className="table table-sm table-bordered">
            <thead>
              <tr><th>ID</th><th>Fecha</th><th>Usuario</th><th>Total</th><th>Tipo</th><th>Estado</th><th></th></tr>
            </thead>
            <tbody>
              {filtradas.map((t) => (
                <tr key={`${t._tipo}-${t.id}`} className={t._tipo === "devolucion" ? "table-warning" : ""}>
                  <td>
                    {t._tipo === "devolucion" ? `D#${t.id}` : t.id}
                  </td>
                  <td>{t._fecha}</td>
                  <td>{t.usuario}</td>
                  <td style={{ color: t._tipo === "devolucion" ? "var(--color-danger, #d32f2f)" : undefined }}>
                    {t._tipo === "devolucion" ? "-" : ""}${t.monto}
                  </td>
                  <td>
                    {t._tipo === "devolucion" ? (
                      <span className="badge badge-warning">Devolución</span>
                    ) : (
                      t.tipo
                    )}
                  </td>
                  <td>{t.estado}</td>
                  <td style={{ whiteSpace: "nowrap" }}>
                    {t._tipo === "venta" ? (
                      <>
                        <button className="btn btn-sm btn-info me-1" onClick={() => verVenta(t.id)}>Ver</button>
                        {esAdmin && t.raw.estado === "CO" && t.raw.tipo_documento === "VE" && (
                          <>
                            <button className="btn btn-sm btn-danger me-1" onClick={() => abrirAnular(t.raw)}>Anular</button>
                            <button className="btn btn-sm btn-warning" onClick={() => abrirDevolver(t.raw)}>Devolver</button>
                          </>
                        )}
                      </>
                    ) : (
                      <button className="btn btn-sm btn-info" onClick={() => verDevolucion(t.id)}>Ver</button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </PageCard>

      {detalleVenta && (
        <div className="modal" role="dialog" aria-modal="true" onClick={(e) => e.target === e.currentTarget && setDetalleVenta(null)}>
          <div className="modal-dialog modal-lg">
            <div className="modal-content">
              <div className="modal-header">
                <h5 className="modal-title">Detalle de venta #{detalleVenta.id}</h5>
                <button type="button" className="modal-close" onClick={() => setDetalleVenta(null)}>&times;</button>
              </div>
              <div className="modal-body">
                <div className="row mb-4">
                  <div className="col-md-4"><strong>Fecha:</strong> {detalleVenta.fecha_venta}</div>
                  <div className="col-md-4"><strong>Usuario:</strong> {detalleVenta.usuario_nombre}</div>
                  <div className="col-md-4"><strong>Tipo:</strong> {detalleVenta.tipo_documento_display || detalleVenta.tipo_documento}</div>
                </div>
                <div className="table-responsive">
                  <table className="table table-sm table-bordered">
                    <thead>
                      <tr><th>Código</th><th>Producto</th><th>Cantidad</th><th>Precio unitario</th><th>Subtotal</th></tr>
                    </thead>
                    <tbody>
                      {(detalleVenta.detalles || []).map((d) => (
                        <tr key={d.id}>
                          <td>{d.codigo_producto}</td><td>{d.producto_nombre}</td><td>{d.cantidad}</td>
                          <td>${d.precio_unitario}</td><td>${d.subtotal}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <div className="text-right mt-4 text-lg font-bold">Total: ${detalleVenta.monto_total}</div>
              </div>
              <div className="modal-footer">
                <button type="button" className="btn btn-secondary" onClick={() => setDetalleVenta(null)}>Cerrar</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {detalleDevolucion && (
        <div className="modal" role="dialog" aria-modal="true" onClick={(e) => e.target === e.currentTarget && setDetalleDevolucion(null)}>
          <div className="modal-dialog modal-lg">
            <div className="modal-content">
              <div className="modal-header">
                <h5 className="modal-title">Detalle de devolución #{detalleDevolucion.id}</h5>
                <button type="button" className="modal-close" onClick={() => setDetalleDevolucion(null)}>&times;</button>
              </div>
              <div className="modal-body">
                <div className="row mb-4">
                  <div className="col-md-4"><strong>Fecha:</strong> {detalleDevolucion.fecha_devolucion}</div>
                  <div className="col-md-4"><strong>Usuario:</strong> {detalleDevolucion.usuario_nombre}</div>
                  <div className="col-md-4"><strong>Venta original:</strong> #{detalleDevolucion.venta}</div>
                </div>
                <div className="table-responsive">
                  <table className="table table-sm table-bordered">
                    <thead>
                      <tr><th>Código</th><th>Producto</th><th>Cantidad</th><th>Repuso stock</th></tr>
                    </thead>
                    <tbody>
                      {(detalleDevolucion.detalles || []).map((d) => (
                        <tr key={d.id}>
                          <td>{d.codigo_producto}</td>
                          <td>{d.producto_nombre}</td>
                          <td>{d.cantidad}</td>
                          <td>{d.reponer_stock ? "Sí" : "No"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {detalleDevolucion.motivo && (
                  <div className="mt-3">
                    <strong>Motivo:</strong>
                    <p className="mb-0">{detalleDevolucion.motivo}</p>
                  </div>
                )}
                <div className="text-right mt-4 text-lg font-bold">Total devuelto: ${detalleDevolucion.monto_devuelto}</div>
              </div>
              <div className="modal-footer">
                <button type="button" className="btn btn-secondary" onClick={() => setDetalleDevolucion(null)}>Cerrar</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {anularVenta && (
        <div className="modal" role="dialog" aria-modal="true" onClick={(e) => e.target === e.currentTarget && setAnularVenta(null)}>
          <div className="modal-dialog modal-lg">
            <div className="modal-content">
              <div className="modal-header">
                <h5 className="modal-title">Anular venta #{anularVenta.id}</h5>
                <button type="button" className="modal-close" onClick={() => setAnularVenta(null)} disabled={anularLoading}>&times;</button>
              </div>
              <div className="modal-body">
                <p className="mb-3">Se repondrá el stock de los siguientes productos. Seleccione la ubicación de reposición:</p>
                <div className="table-responsive">
                  <table className="table table-sm table-bordered">
                    <thead>
                      <tr><th>Código</th><th>Producto</th><th>Cantidad vendida</th><th>Ubicación reposición</th></tr>
                    </thead>
                    <tbody>
                      {(anularVenta.detalles || []).map((d) => (
                        <tr key={d.producto}>
                          <td>{d.codigo_producto}</td>
                          <td>{d.producto_nombre}</td>
                          <td>{d.cantidad}</td>
                          <td>
                            <select
                              className="form-control form-control-sm"
                              value={anularUbicaciones[d.producto] || ""}
                              onChange={(e) => setAnularUbicaciones({ ...anularUbicaciones, [d.producto]: e.target.value })}
                              disabled={anularLoading}
                            >
                              {ubicaciones.map((u) => (
                                <option key={u.id} value={u.id}>{u.nombre}</option>
                              ))}
                            </select>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <div className="form-group mt-3">
                  <label className="font-weight-bold">Motivo de anulación:</label>
                  <textarea
                    className="form-control"
                    rows="3"
                    value={anularMotivo}
                    onChange={(e) => setAnularMotivo(e.target.value)}
                    placeholder="Describa el motivo de la anulación..."
                    disabled={anularLoading}
                  />
                </div>
              </div>
              <div className="modal-footer">
                <button type="button" className="btn btn-secondary" onClick={() => setAnularVenta(null)} disabled={anularLoading}>Cancelar</button>
                <button type="button" className="btn btn-danger" onClick={confirmarAnular} disabled={anularLoading || !anularMotivo.trim()}>
                  {anularLoading ? "Anulando..." : "Confirmar anulación"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {devolverVenta && (
        <div className="modal" role="dialog" aria-modal="true" onClick={(e) => e.target === e.currentTarget && setDevolverVenta(null)}>
          <div className="modal-dialog modal-lg">
            <div className="modal-content">
              <div className="modal-header">
                <h5 className="modal-title">Devolver productos — venta #{devolverVenta.id}</h5>
                <button type="button" className="modal-close" onClick={() => setDevolverVenta(null)} disabled={devolverLoading}>&times;</button>
              </div>
              <div className="modal-body">
                <p className="mb-3">Seleccione los productos a devolver y si se repone el stock:</p>
                <div className="table-responsive">
                  <table className="table table-sm table-bordered">
                    <thead>
                      <tr><th>Sel.</th><th>Código</th><th>Producto</th><th>Vendido</th><th>Disponible</th><th>Cant. a devolver</th><th>Reponer stock</th><th>Ubicación</th></tr>
                    </thead>
                    <tbody>
                      {(devolverVenta.detalles || []).map((d) => {
                        const devuelto = (devolverVenta.productos_devueltos || {})[d.producto] || 0;
                        const disponible = d.cantidad - devuelto;
                        if (disponible <= 0) return null;
                        const seleccionado = devolverSeleccion[d.producto] || false;
                        return (
                          <tr key={d.producto}>
                            <td>
                              <input
                                type="checkbox"
                                checked={seleccionado}
                                onChange={(e) => setDevolverSeleccion({ ...devolverSeleccion, [d.producto]: e.target.checked })}
                                disabled={devolverLoading}
                              />
                            </td>
                            <td>{d.codigo_producto}</td>
                            <td>{d.producto_nombre}</td>
                            <td>{d.cantidad}</td>
                            <td>{disponible}</td>
                            <td>
                              <input
                                type="number"
                                className="form-control form-control-sm"
                                style={{ width: 70 }}
                                min="1"
                                max={disponible}
                                value={devolverCantidades[d.producto] || 1}
                                onChange={(e) => setDevolverCantidades({ ...devolverCantidades, [d.producto]: parseInt(e.target.value) || 0 })}
                                disabled={!seleccionado || devolverLoading}
                              />
                            </td>
                            <td>
                              <input
                                type="checkbox"
                                checked={devolverReponer[d.producto] !== false}
                                onChange={(e) => setDevolverReponer({ ...devolverReponer, [d.producto]: e.target.checked })}
                                disabled={!seleccionado || devolverLoading}
                              />
                            </td>
                            <td>
                              <select
                                className="form-control form-control-sm"
                                value={devolverUbicacion[d.producto] || ""}
                                onChange={(e) => setDevolverUbicacion({ ...devolverUbicacion, [d.producto]: e.target.value })}
                                disabled={!seleccionado || devolverReponer[d.producto] === false || devolverLoading}
                              >
                                {ubicaciones.map((u) => (
                                  <option key={u.id} value={u.id}>{u.nombre}</option>
                                ))}
                              </select>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
                <div className="form-group mt-3">
                  <label className="font-weight-bold">Motivo de devolución:</label>
                  <textarea
                    className="form-control"
                    rows="3"
                    value={devolverMotivo}
                    onChange={(e) => setDevolverMotivo(e.target.value)}
                    placeholder="Describa el motivo de la devolución..."
                    disabled={devolverLoading}
                  />
                </div>
              </div>
              <div className="modal-footer">
                <button type="button" className="btn btn-secondary" onClick={() => setDevolverVenta(null)} disabled={devolverLoading}>Cancelar</button>
                <button type="button" className="btn btn-warning" onClick={confirmarDevolver} disabled={devolverLoading || !devolverMotivo.trim()}>
                  {devolverLoading ? "Procesando..." : "Confirmar devolución"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
