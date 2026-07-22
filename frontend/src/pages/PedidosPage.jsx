import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import PageCard from "../components/PageCard";
import Pagination from "../components/Pagination";
import PageSizeSelector from "../components/PageSizeSelector";
import StepperInput from "../components/StepperInput";
import { usePageTitle } from "../components/Shell";
import {
  useAnularVenta,
  useDevolucion,
  useDevoluciones,
  useDevolverProductos,
  useUbicaciones,
  useVenta,
  useVentas,
} from "../lib/queries";
import { getUser, isGerente } from "../lib/auth";

export default function PedidosPage() {
  usePageTitle("Historial de ventas");
  const [searchParams, setSearchParams] = useSearchParams();

  const [tab, setTab] = useState(searchParams.get("tab") || "ventas");
  const [page, setPage] = useState(parseInt(searchParams.get("page") || "1", 10));
  const [pageSize, setPageSize] = useState(parseInt(searchParams.get("page_size") || "50", 10));

  const [detalleVentaId, setDetalleVentaId] = useState(null);
  const [detalleDevolucionId, setDetalleDevolucionId] = useState(null);

  const [anularVentaId, setAnularVentaId] = useState(null);
  const [anularMotivo, setAnularMotivo] = useState("");
  const [anularUbicaciones, setAnularUbicaciones] = useState({});
  const [anularCantidades, setAnularCantidades] = useState({});

  const [devolverVentaId, setDevolverVentaId] = useState(null);
  const [devolverMotivo, setDevolverMotivo] = useState("");
  const [devolverSeleccion, setDevolverSeleccion] = useState({});
  const [devolverCantidades, setDevolverCantidades] = useState({});
  const [devolverReponer, setDevolverReponer] = useState({});
  const [devolverUbicacion, setDevolverUbicacion] = useState({});

  const user = getUser();
  const esAdmin = isGerente(user);

  const params = { page, page_size: pageSize };
  const { data: ventasData } = useVentas(params);
  const { data: devolucionesData } = useDevoluciones(params);
  const { data: detalleVentaData } = useVenta(detalleVentaId);
  const { data: detalleDevolucionData } = useDevolucion(detalleDevolucionId);
  const { data: anularVentaData } = useVenta(anularVentaId);
  const { data: devolverVentaData } = useVenta(devolverVentaId);
  const { data: ubicacionesData } = useUbicaciones({ page_size: 200 });

  const ubicacionesList = ubicacionesData?.results ?? [];
  const anularMutation = useAnularVenta();
  const devolverMutation = useDevolverProductos();

  const activeData = tab === "ventas" ? ventasData : devolucionesData;
  const rows = activeData?.results ?? [];
  const count = activeData?.count ?? 0;
  const totalPages = Math.max(1, Math.ceil(count / pageSize));

  useEffect(() => {
    if (!anularVentaData?.detalles?.length) return;
    const ubiMap = {};
    const cantMap = {};
    for (const d of anularVentaData.detalles) {
      ubiMap[d.producto] = ubicacionesList.length > 0 ? String(ubicacionesList[0].id) : "";
      cantMap[d.producto] = d.cantidad;
    }
    setAnularUbicaciones(ubiMap);
    setAnularCantidades(cantMap);
  }, [anularVentaData, ubicacionesList]);

  useEffect(() => {
    if (!devolverVentaData?.detalles?.length) return;
    const prodDevueltos = devolverVentaData.productos_devueltos || {};
    const sel = {};
    const cant = {};
    const rep = {};
    const ubi = {};
    for (const d of devolverVentaData.detalles) {
      const devuelto = prodDevueltos[d.producto] || 0;
      const disponible = d.cantidad - devuelto;
      sel[d.producto] = false;
      cant[d.producto] = disponible > 0 ? disponible : 1;
      rep[d.producto] = true;
      ubi[d.producto] = ubicacionesList.length > 0 ? String(ubicacionesList[0].id) : "";
    }
    setDevolverSeleccion(sel);
    setDevolverCantidades(cant);
    setDevolverReponer(rep);
    setDevolverUbicacion(ubi);
  }, [devolverVentaData, ubicacionesList]);

  const syncURL = (t, p, ps) => {
    setSearchParams({ tab: t, page: String(p), page_size: String(ps) }, { replace: true });
  };

  function handleTabChange(newTab) {
    setTab(newTab);
    setPage(1);
    syncURL(newTab, 1, pageSize);
  }

  function handlePageChange(newPage) {
    setPage(newPage);
    syncURL(tab, newPage, pageSize);
  }

  function handlePageSizeChange(newSize) {
    setPageSize(newSize);
    setPage(1);
    syncURL(tab, 1, newSize);
  }

  function abrirAnular(venta) {
    setAnularVentaId(venta.id);
    setAnularMotivo("");
  }

  function confirmarAnular() {
    if (!anularMotivo.trim()) return;
    const restauraciones = (anularVentaData?.detalles || []).map((d) => ({
      producto_id: d.producto,
      ubicacion_id: parseInt(anularUbicaciones[d.producto] || 0),
      cantidad: anularCantidades[d.producto],
    }));
    anularMutation.mutate(
      { ventaId: anularVentaId, motivo: anularMotivo, restauraciones },
      { onSuccess: () => setAnularVentaId(null) },
    );
  }

  function abrirDevolver(venta) {
    setDevolverVentaId(venta.id);
    setDevolverMotivo("");
  }

  function confirmarDevolver() {
    if (!devolverMotivo.trim()) return;
    const devueltosMap = devolverVentaData?.productos_devueltos || {};
    const productos = [];
    for (const d of devolverVentaData?.detalles || []) {
      if (!devolverSeleccion[d.producto]) continue;
      const devuelto = devueltosMap[d.producto] || 0;
      const maxDisp = d.cantidad - devuelto;
      const cantidad = Math.min(devolverCantidades[d.producto] || 0, maxDisp);
      if (cantidad <= 0) continue;
      const item = { producto_id: d.producto, cantidad, reponer_stock: devolverReponer[d.producto] };
      if (item.reponer_stock) {
        item.ubicacion_id = parseInt(devolverUbicacion[d.producto] || 0);
      }
      productos.push(item);
    }
    if (productos.length === 0) return;
    devolverMutation.mutate(
      { ventaId: devolverVentaId, motivo: devolverMotivo, productos },
      { onSuccess: () => setDevolverVentaId(null) },
    );
  }

  const closeAnularModal = () => setAnularVentaId(null);
  const closeDevolverModal = () => setDevolverVentaId(null);
  const anularDisabled = anularMutation.isPending;

  return (
    <>
      <PageCard title="Historial de ventas">
        <div className="page-actions">
          <div className="btn-group">
            <button
              className={`btn btn-sm ${tab === "ventas" ? "btn-primary" : "btn-secondary"}`}
              onClick={() => handleTabChange("ventas")}
            >
              Ventas
            </button>
            <button
              className={`btn btn-sm ${tab === "devoluciones" ? "btn-primary" : "btn-secondary"}`}
              onClick={() => handleTabChange("devoluciones")}
            >
              Devoluciones
            </button>
          </div>
        </div>
        <div className="table-responsive">
          <table className="table table-sm table-bordered">
            <thead>
              <tr><th>ID</th><th>Fecha</th><th>Usuario</th><th>Total</th><th>Tipo</th><th>Estado</th><th></th></tr>
            </thead>
            <tbody>
              {tab === "ventas"
                ? rows.map((v) => (
                    <tr key={v.id}>
                      <td>{v.id}</td>
                      <td>{v.fecha_venta}</td>
                      <td>{v.usuario_nombre}</td>
                      <td>${v.monto_total}</td>
                      <td>{v.tipo_documento_display || v.tipo_documento}</td>
                      <td>{v.estado_display || v.estado}</td>
                      <td style={{ whiteSpace: "nowrap" }}>
                        <button className="btn btn-sm btn-info me-1" onClick={() => setDetalleVentaId(v.id)}>Ver</button>
                        {esAdmin && v.estado === "CO" && v.tipo_documento === "VE" && (
                          <>
                            <button className="btn btn-sm btn-danger me-1" onClick={() => abrirAnular(v)}>Anular</button>
                            <button className="btn btn-sm btn-warning" onClick={() => abrirDevolver(v)}>Devolver</button>
                          </>
                        )}
                      </td>
                    </tr>
                  ))
                : rows.map((d) => (
                    <tr key={d.id} className="table-warning">
                      <td>D#{d.id}</td>
                      <td>{d.fecha_devolucion}</td>
                      <td>{d.usuario_nombre}</td>
                      <td style={{ color: "var(--danger)" }}>-${d.monto_devuelto}</td>
                      <td><span className="badge badge-warning">Devolución</span></td>
                      <td>—</td>
                      <td style={{ whiteSpace: "nowrap" }}>
                        <button className="btn btn-sm btn-info" onClick={() => setDetalleDevolucionId(d.id)}>Ver</button>
                      </td>
                    </tr>
                  ))}
              {rows.length === 0 && (
                <tr><td colSpan="7" className="text-center text-muted">No hay transacciones</td></tr>
              )}
            </tbody>
          </table>
        </div>
        <div className="flex flex-wrap items-center justify-between gap-3 mt-4">
          <PageSizeSelector value={pageSize} onChange={handlePageSizeChange} options={[25, 50, 100]} />
          <Pagination page={page} totalPages={totalPages} onPageChange={handlePageChange} count={count} pageSize={pageSize} />
        </div>
      </PageCard>

      {detalleVentaId && detalleVentaData && (
        <div className="modal" role="dialog" aria-modal="true" onClick={(e) => e.target === e.currentTarget && setDetalleVentaId(null)}>
          <div className="modal-dialog modal-lg">
            <div className="modal-content">
              <div className="modal-header">
                <h5 className="modal-title">Detalle de venta #{detalleVentaData.id}</h5>
                <button type="button" className="modal-close" onClick={() => setDetalleVentaId(null)}>&times;</button>
              </div>
              <div className="modal-body">
                <div className="row mb-4">
                  <div className="col-md-4"><strong>Fecha:</strong> {detalleVentaData.fecha_venta}</div>
                  <div className="col-md-4"><strong>Usuario:</strong> {detalleVentaData.usuario_nombre}</div>
                  <div className="col-md-4"><strong>Tipo:</strong> {detalleVentaData.tipo_documento_display || detalleVentaData.tipo_documento}</div>
                </div>
                <div className="table-responsive">
                  <table className="table table-sm table-bordered">
                    <thead><tr><th>Código</th><th>Producto</th><th>Cantidad</th><th>Precio unitario</th><th>Subtotal</th></tr></thead>
                    <tbody>
                      {(detalleVentaData.detalles || []).map((d) => (
                        <tr key={d.id}>
                          <td>{d.codigo_producto}</td><td>{d.producto_nombre}</td><td>{d.cantidad}</td>
                          <td>${d.precio_unitario}</td><td>${d.subtotal}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <div className="text-right mt-4">
                  {detalleVentaData.descuento_porcentaje > 0 && (
                    <div className="text-secondary">
                      Subtotal: ${detalleVentaData.monto_subtotal}<br />
                      Descuento ({detalleVentaData.descuento_porcentaje}%): -${detalleVentaData.monto_descuento}
                    </div>
                  )}
                  <div className="text-lg font-bold">Total: ${detalleVentaData.monto_total}</div>
                </div>
              </div>
              <div className="modal-footer">
                <button type="button" className="btn btn-secondary" onClick={() => setDetalleVentaId(null)}>Cerrar</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {detalleDevolucionId && detalleDevolucionData && (
        <div className="modal" role="dialog" aria-modal="true" onClick={(e) => e.target === e.currentTarget && setDetalleDevolucionId(null)}>
          <div className="modal-dialog modal-lg">
            <div className="modal-content">
              <div className="modal-header">
                <h5 className="modal-title">Detalle de devolución #{detalleDevolucionData.id}</h5>
                <button type="button" className="modal-close" onClick={() => setDetalleDevolucionId(null)}>&times;</button>
              </div>
              <div className="modal-body">
                <div className="row mb-4">
                  <div className="col-md-4"><strong>Fecha:</strong> {detalleDevolucionData.fecha_devolucion}</div>
                  <div className="col-md-4"><strong>Usuario:</strong> {detalleDevolucionData.usuario_nombre}</div>
                  <div className="col-md-4"><strong>Venta original:</strong> #{detalleDevolucionData.venta}</div>
                </div>
                <div className="table-responsive">
                  <table className="table table-sm table-bordered">
                    <thead><tr><th>Código</th><th>Producto</th><th>Cantidad</th><th>Repuso stock</th></tr></thead>
                    <tbody>
                      {(detalleDevolucionData.detalles || []).map((d) => (
                        <tr key={d.id}>
                          <td>{d.codigo_producto}</td><td>{d.producto_nombre}</td><td>{d.cantidad}</td>
                          <td>{d.reponer_stock ? "Sí" : "No"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {detalleDevolucionData.motivo && (
                  <div className="mt-3"><strong>Motivo:</strong><p className="mb-0">{detalleDevolucionData.motivo}</p></div>
                )}
                <div className="text-right mt-4 text-lg font-bold">Total devuelto: ${detalleDevolucionData.monto_devuelto}</div>
              </div>
              <div className="modal-footer">
                <button type="button" className="btn btn-secondary" onClick={() => setDetalleDevolucionId(null)}>Cerrar</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {anularVentaId && anularVentaData && (
        <div className="modal" role="dialog" aria-modal="true" onClick={(e) => e.target === e.currentTarget && closeAnularModal()}>
          <div className="modal-dialog modal-lg">
            <div className="modal-content">
              <div className="modal-header">
                <h5 className="modal-title">Anular venta #{anularVentaData.id}</h5>
                <button type="button" className="modal-close" onClick={closeAnularModal} disabled={anularDisabled}>&times;</button>
              </div>
              <div className="modal-body">
                <p className="mb-3">Se repondrá el stock de los siguientes productos. Seleccione la ubicación de reposición:</p>
                <div className="table-responsive">
                  <table className="table table-sm table-bordered">
                    <thead><tr><th>Código</th><th>Producto</th><th>Cantidad vendida</th><th>Ubicación reposición</th></tr></thead>
                    <tbody>
                      {(anularVentaData.detalles || []).map((d) => (
                        <tr key={d.producto}>
                          <td>{d.codigo_producto}</td>
                          <td>{d.producto_nombre}</td>
                          <td>{d.cantidad}</td>
                          <td>
                            <select
                              className="form-control form-control-sm"
                              value={anularUbicaciones[d.producto] || ""}
                              onChange={(e) => setAnularUbicaciones({ ...anularUbicaciones, [d.producto]: e.target.value })}
                              disabled={anularDisabled}
                            >
                              {ubicacionesList.map((u) => (
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
                  <textarea className="form-control" rows="3" value={anularMotivo}
                    onChange={(e) => setAnularMotivo(e.target.value)}
                    placeholder="Describa el motivo de la anulación..." disabled={anularDisabled} />
                </div>
              </div>
              <div className="modal-footer">
                <button type="button" className="btn btn-secondary" onClick={closeAnularModal} disabled={anularDisabled}>Cancelar</button>
                <button type="button" className="btn btn-danger" onClick={confirmarAnular} disabled={anularDisabled || !anularMotivo.trim()}>
                  {anularDisabled ? "Anulando..." : "Confirmar anulación"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {devolverVentaId && devolverVentaData && (
        <div className="modal" role="dialog" aria-modal="true" onClick={(e) => e.target === e.currentTarget && closeDevolverModal()}>
          <div className="modal-dialog modal-lg">
            <div className="modal-content">
              <div className="modal-header">
                <h5 className="modal-title">Devolver productos — venta #{devolverVentaData.id}</h5>
                <button type="button" className="modal-close" onClick={closeDevolverModal} disabled={devolverMutation.isPending}>&times;</button>
              </div>
              <div className="modal-body">
                <p className="mb-3">Seleccione los productos a devolver y si se repone el stock:</p>
                <div className="table-responsive">
                  <table className="table table-sm table-bordered">
                    <thead><tr><th>Sel.</th><th>Código</th><th>Producto</th><th>Vendido</th><th>Disponible</th><th>Cant. a devolver</th><th>Reponer stock</th><th>Ubicación</th></tr></thead>
                    <tbody>
                      {(devolverVentaData.detalles || []).map((d) => {
                        const devuelto = (devolverVentaData.productos_devueltos || {})[d.producto] || 0;
                        const disponible = d.cantidad - devuelto;
                        if (disponible <= 0) return null;
                        const sel = devolverSeleccion[d.producto] || false;
                        return (
                          <tr key={d.producto}>
                            <td><input type="checkbox" checked={sel} onChange={(e) => setDevolverSeleccion({ ...devolverSeleccion, [d.producto]: e.target.checked })} disabled={devolverMutation.isPending} /></td>
                            <td>{d.codigo_producto}</td>
                            <td>{d.producto_nombre}</td>
                            <td>{d.cantidad}</td>
                            <td>{disponible}</td>
                            <td>
                              <StepperInput
                                value={devolverCantidades[d.producto] || 1}
                                onChange={(val) => setDevolverCantidades({ ...devolverCantidades, [d.producto]: val })}
                                min={1}
                                max={disponible}
                                disabled={!sel || devolverMutation.isPending}
                                inputStyle={{ width: 56, fontSize: "0.85rem" }}
                                decrementLabel={`Disminuir cantidad a devolver de ${d.producto_nombre}`}
                                incrementLabel={`Aumentar cantidad a devolver de ${d.producto_nombre}`}
                              />
                            </td>
                            <td><input type="checkbox" checked={devolverReponer[d.producto] !== false} onChange={(e) => setDevolverReponer({ ...devolverReponer, [d.producto]: e.target.checked })} disabled={!sel || devolverMutation.isPending} /></td>
                            <td>
                              <select className="form-control form-control-sm" value={devolverUbicacion[d.producto] || ""} onChange={(e) => setDevolverUbicacion({ ...devolverUbicacion, [d.producto]: e.target.value })} disabled={!sel || devolverReponer[d.producto] === false || devolverMutation.isPending}>
                                {ubicacionesList.map((u) => (<option key={u.id} value={u.id}>{u.nombre}</option>))}
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
                  <textarea className="form-control" rows="3" value={devolverMotivo} onChange={(e) => setDevolverMotivo(e.target.value)} placeholder="Describa el motivo de la devolución..." disabled={devolverMutation.isPending} />
                </div>
              </div>
              <div className="modal-footer">
                <button type="button" className="btn btn-secondary" onClick={closeDevolverModal} disabled={devolverMutation.isPending}>Cancelar</button>
                <button type="button" className="btn btn-warning" onClick={confirmarDevolver} disabled={devolverMutation.isPending || !devolverMotivo.trim()}>
                  {devolverMutation.isPending ? "Procesando..." : "Confirmar devolución"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
