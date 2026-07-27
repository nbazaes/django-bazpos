import { useState, useEffect } from "react";
import { formatDateTime } from "../lib/format";
import {
  useCambiarEstadoPedido,
  useConvertirCotizacion,
  useDesactivarPedido,
  useMarcarRetiro,
  usePedido,
  usePedidos,
} from "../lib/queries";
import { STORE_NAME } from "../lib/config";
import { getStoreConfig, fetchStoreConfig } from "../lib/store";
import { useToast } from "../lib/toast";
import Pagination from "./Pagination";
import PageSizeSelector from "./PageSizeSelector";

const DOCUMENTO_OPCIONES = [
  { value: "SB", label: "Sin boletear" },
  { value: "BO", label: "Boleteado" },
  { value: "FA", label: "Facturado" },
];

const ESTADO_BADGE = {
  PR: { className: "badge badge-warning", label: "Pendiente por retirar" },
  RE: { className: "badge badge-success", label: "Retirado" },
};

export default function PedidosHistorial() {
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(50);
  const [detalleId, setDetalleId] = useState(null);
  const [retiroId, setRetiroId] = useState(null);
  const [retiroPersona, setRetiroPersona] = useState("");
  const [retiroMismoUsuario, setRetiroMismoUsuario] = useState(false);
  const [desactivarId, setDesactivarId] = useState(null);
  const [convertirId, setConvertirId] = useState(null);
  const [convertirSeleccion, setConvertirSeleccion] = useState({});

  const addToast = useToast();
  const { data: pedidosData } = usePedidos({ page, page_size: pageSize });
  const { data: detalleData } = usePedido(detalleId);
  const { data: retiroData } = usePedido(retiroId);
  const { data: convertirData } = usePedido(convertirId);
  const cambiarDocumento = useCambiarEstadoPedido();
  const marcarRetiro = useMarcarRetiro();
  const desactivarPedido = useDesactivarPedido();
  const convertirCotizacion = useConvertirCotizacion();

  useEffect(() => {
    fetchStoreConfig();
  }, []);

  const rows = pedidosData?.results ?? [];
  const count = pedidosData?.count ?? 0;
  const totalPages = Math.max(1, Math.ceil(count / pageSize));

  function handlePageChange(newPage) {
    setPage(newPage);
  }

  function handlePageSizeChange(newSize) {
    setPageSize(newSize);
    setPage(1);
  }

  function handleDocumentoChange(pedido, nuevoDocumento) {
    cambiarDocumento.mutate({ pedidoId: pedido.id, estado_documento: nuevoDocumento });
  }

  function abrirRetiro(pedido) {
    setRetiroId(pedido.id);
    setRetiroPersona("");
    setRetiroMismoUsuario(false);
  }

  function confirmarRetiro() {
    const persona = retiroPersona.trim() || (retiroMismoUsuario ? retiroData?.usuario_nombre : "");
    if (!persona) return;
    marcarRetiro.mutate(
      { pedidoId: retiroId, persona_retiro: persona },
      { onSuccess: () => setRetiroId(null) },
    );
  }

  function confirmarDesactivar() {
    desactivarPedido.mutate(desactivarId, { onSuccess: () => setDesactivarId(null) });
  }

  function abrirConvertir(pedido) {
    setConvertirId(pedido.id);
    const sel = {};
    (pedido.detalles || []).forEach((d) => {
      sel[d.id] = true;
    });
    setConvertirSeleccion(sel);
  }

  function toggleItem(id) {
    setConvertirSeleccion((prev) => ({ ...prev, [id]: !prev[id] }));
  }

  function confirmarConvertir() {
    const ids = Object.entries(convertirSeleccion)
      .filter(([, v]) => v)
      .map(([k]) => Number(k));
    if (ids.length === 0) {
      addToast("Selecciona al menos un producto", "danger");
      return;
    }
    convertirCotizacion.mutate(
      { pedidoId: convertirId, detalle_ids: ids },
      {
        onSuccess: () => {
          addToast("Cotización convertida a pedido", "success");
          setConvertirId(null);
          setConvertirSeleccion({});
        },
        onError: (err) => {
          addToast(err.message || "Error al convertir cotización", "danger");
        },
      },
    );
  }

  const algunaSeleccionada = Object.values(convertirSeleccion).some(Boolean);

  function imprimirPedido(pedido) {
    const win = window.open("", "_blank", "width=420,height=700");
    if (!win) return;
    const storeConfig = getStoreConfig();

    const filas = (pedido.detalles || []).map((d) => `
      <tr>
        <td>${d.codigo_proveedor || "—"}</td>
        <td>${d.oem || "—"}</td>
        <td>${d.nombre}</td>
        <td style="text-align:right;">$${d.precio_final}</td>
      </tr>
    `).join("");

    const fecha = formatDateTime(pedido.fecha_creacion);
    const fechaRetiro = formatDateTime(pedido.fecha_retiro);
    const metodo = pedido.metodo_pago === "TJ" ? "Tarjeta" : "Efectivo";
    const estadoDoc = pedido.estado_documento_display || pedido.estado_documento;
    const estado = pedido.estado_display || pedido.estado;

    win.document.write(`
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8" />
        <title>Pedido #${pedido.id}</title>
        <style>
          @page { size: letter; }
          body { font-family: sans-serif; font-size: 12px; margin: 16px; color: #000; }
          .center { text-align: center; }
          .store { font-weight: bold; font-size: 16px; margin-bottom: 4px; }
          .address { font-size: 11px; color: #666; margin-bottom: 2px; }
          .title { font-size: 14px; margin-bottom: 8px; }
          .info { margin-bottom: 8px; }
          table { width: 100%; border-collapse: collapse; margin: 8px 0; }
          th, td { border-bottom: 1px solid #ccc; padding: 4px 2px; text-align: left; }
          th { font-weight: bold; }
          .total { text-align: right; font-weight: bold; font-size: 14px; margin-top: 8px; }
          .footer { margin-top: 16px; font-size: 10px; text-align: justify; }
          .check-row { margin-top: 8px; font-size: 12px; }
        </style>
      </head>
      <body>
        <div class="center">
          <div class="store">${STORE_NAME}</div>
          ${storeConfig.direccion ? `<div class="address">${storeConfig.direccion}</div>` : ""}
          ${storeConfig.telefono ? `<div class="address">${storeConfig.telefono}</div>` : ""}
          <div class="title">Pedido #${pedido.id}</div>
        </div>
        <div class="info">
          <strong>Fecha:</strong> ${fecha}<br />
          <strong>Cliente:</strong> ${pedido.nombre_cliente}<br />
          <strong>Teléfono:</strong> ${pedido.telefono_cliente}<br />
          <strong>Estado:</strong> ${estado}<br />
          ${pedido.fecha_retiro ? `<strong>Fecha retiro:</strong> ${fechaRetiro}<br />` : ""}
          ${pedido.persona_retiro ? `<strong>Retiró:</strong> ${pedido.persona_retiro}<br />` : ""}
          <strong>Documento:</strong> ${estadoDoc}
        </div>
        <table>
          <thead>
            <tr><th>Cód. Prov.</th><th>OEM</th><th>Producto</th><th style="text-align:right;">Total</th></tr>
          </thead>
          <tbody>${filas}</tbody>
        </table>
        <div class="total">Total: $${pedido.monto_total}</div>
        <div class="check-row">
          <strong>Método de pago:</strong> ${metodo}
        </div>
        <div class="footer">
          El abono del producto constituye garantía por repuestos solicitados.
          Al desistir del producto el abono sera para saldar costos y gestión.
        </div>
        <script>
          window.onload = function() { window.print(); };
        </script>
      </body>
      </html>
    `);
    win.document.close();
  }

  return (
    <>
      <div className="table-responsive">
        <table className="table table-sm table-bordered">
          <thead>
            <tr>
              <th>ID</th>
              <th>Fecha</th>
              <th>Cliente</th>
              <th>Teléfono</th>
              <th>Estado</th>
              <th>Documento</th>
              <th>Persona que retiró</th>
              <th>Fecha retiro</th>
              <th>Total</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {rows.map((p) => {
              const estadoInfo = ESTADO_BADGE[p.estado] || { className: "badge", label: p.estado };
              const esCotizacion = p.es_cotizacion;
              const yaConvertido = esCotizacion && p.convertido;
              return (
                <tr key={p.id}>
                  <td>P#{p.id}</td>
                  <td>{formatDateTime(p.fecha_creacion)}</td>
                  <td>{p.nombre_cliente}</td>
                  <td>{p.telefono_cliente}</td>
                  <td>
                    {esCotizacion ? (
                      <span className="badge badge-info">Cotización</span>
                    ) : (
                      <span className={estadoInfo.className}>{estadoInfo.label}</span>
                    )}
                  </td>
                  <td>
                    {esCotizacion ? (
                      <span className="text-muted">—</span>
                    ) : (
                      <select
                        className="form-control form-control-sm"
                        value={p.estado_documento}
                        onChange={(e) => handleDocumentoChange(p, e.target.value)}
                        disabled={cambiarDocumento.isPending}
                      >
                        {DOCUMENTO_OPCIONES.map((op) => (
                          <option key={op.value} value={op.value}>{op.label}</option>
                        ))}
                      </select>
                    )}
                  </td>
                  <td>{p.persona_retiro || (p.estado === "RE" ? "—" : "")}</td>
                  <td>{formatDateTime(p.fecha_retiro)}</td>
                  <td>${p.monto_total}</td>
                  <td style={{ whiteSpace: "nowrap" }}>
                    <button className="btn btn-sm btn-info me-1" onClick={() => setDetalleId(p.id)}>Ver</button>
                    {esCotizacion && !yaConvertido && (
                      <button className="btn btn-sm btn-warning me-1" onClick={() => abrirConvertir(p)}>Convertir a pedido</button>
                    )}
                    {!esCotizacion && p.estado === "PR" && (
                      <button className="btn btn-sm btn-success me-1" onClick={() => abrirRetiro(p)}>Retiro</button>
                    )}
                    <button className="btn btn-sm btn-danger" onClick={() => setDesactivarId(p.id)}>Eliminar pedido</button>
                  </td>
                </tr>
              );
            })}
            {rows.length === 0 && (
              <tr>
                <td colSpan="10" className="text-center text-muted">No hay pedidos</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 mt-4">
        <PageSizeSelector value={pageSize} onChange={handlePageSizeChange} options={[25, 50, 100]} />
        <Pagination page={page} totalPages={totalPages} onPageChange={handlePageChange} count={count} pageSize={pageSize} />
      </div>

      {detalleId && detalleData && (
        <div className="modal" role="dialog" aria-modal="true" onClick={(e) => e.target === e.currentTarget && setDetalleId(null)}>
          <div className="modal-dialog modal-lg">
            <div className="modal-content">
              <div className="modal-header">
                <h5 className="modal-title">Detalle de pedido #{detalleData.id}</h5>
                <button type="button" className="modal-close" onClick={() => setDetalleId(null)}>&times;</button>
              </div>
              <div className="modal-body">
                <div className="row mb-4">
                  <div className="col-md-4"><strong>Fecha:</strong> {formatDateTime(detalleData.fecha_creacion)}</div>
                  <div className="col-md-4"><strong>Cliente:</strong> {detalleData.nombre_cliente}</div>
                  <div className="col-md-4"><strong>Teléfono:</strong> {detalleData.telefono_cliente}</div>
                </div>
                <div className="row mb-4">
                  <div className="col-md-4"><strong>Estado:</strong> {detalleData.estado_display || detalleData.estado}</div>
                  <div className="col-md-4"><strong>Documento:</strong> {detalleData.estado_documento_display || detalleData.estado_documento}</div>
                  <div className="col-md-4"><strong>Usuario:</strong> {detalleData.usuario_nombre}</div>
                </div>
                {detalleData.fecha_retiro && (
                  <div className="row mb-4">
                    <div className="col-md-4"><strong>Fecha retiro:</strong> {formatDateTime(detalleData.fecha_retiro)}</div>
                    <div className="col-md-4"><strong>Retiró:</strong> {detalleData.persona_retiro || "—"}</div>
                  </div>
                )}
                <div className="table-responsive">
                  <table className="table table-sm table-bordered">
                    <thead>
                      <tr><th>Cód. Prov.</th><th>Proveedor</th><th>OEM</th><th>Nombre</th><th>Precio costo</th><th>% Utilidad</th><th>Envío</th><th>Stellantis</th><th>Total</th></tr>
                    </thead>
                    <tbody>
                      {(detalleData.detalles || []).map((d) => (
                        <tr key={d.id}>
                          <td>{d.codigo_proveedor}</td>
                          <td>{d.proveedor_nombre}</td>
                          <td>{d.oem}</td>
                          <td>{d.nombre}</td>
                          <td>${d.precio_costo}</td>
                          <td>{d.porcentaje_utilidad}%</td>
                          <td>{d.sumar_envio ? "Sí" : "No"}</td>
                          <td>{d.stellantis ? "Sí" : "No"}</td>
                          <td>${d.precio_final}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <div className="text-right mt-4 text-lg font-bold">Total: ${detalleData.monto_total}</div>
              </div>
              <div className="modal-footer">
                <button type="button" className="btn btn-secondary" onClick={() => setDetalleId(null)}>Cerrar</button>
                <button type="button" className="btn btn-primary" onClick={() => imprimirPedido(detalleData)}>Imprimir</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {retiroId && retiroData && (
        <div className="modal" role="dialog" aria-modal="true" onClick={(e) => e.target === e.currentTarget && setRetiroId(null)}>
          <div className="modal-dialog" style={{ maxWidth: 420 }}>
            <div className="modal-content">
              <div className="modal-header">
                <h5 className="modal-title">Retiro de pedido #{retiroData.id}</h5>
                <button type="button" className="modal-close" onClick={() => setRetiroId(null)}>&times;</button>
              </div>
              <div className="modal-body">
                <div className="form-group">
                  <label>Nombre de quien retira</label>
                  <input
                    type="text"
                    className="form-control"
                    value={retiroPersona}
                    onChange={(e) => {
                      setRetiroPersona(e.target.value);
                      setRetiroMismoUsuario(false);
                    }}
                    placeholder="Nombre completo"
                    disabled={retiroMismoUsuario}
                  />
                </div>
                <label className="flex items-center gap-2 mt-2" style={{ cursor: "pointer" }}>
                  <input
                    type="checkbox"
                    checked={retiroMismoUsuario}
                    onChange={(e) => {
                      setRetiroMismoUsuario(e.target.checked);
                      if (e.target.checked) {
                        setRetiroPersona(retiroData.nombre_cliente || "");
                      } else {
                        setRetiroPersona("");
                      }
                    }}
                  />
                  <span>Misma persona que pidió (cliente)</span>
                </label>
              </div>
              <div className="modal-footer">
                <button type="button" className="btn btn-secondary" onClick={() => setRetiroId(null)}>Cancelar</button>
                <button
                  type="button"
                  className="btn btn-success"
                  onClick={confirmarRetiro}
                  disabled={marcarRetiro.isPending || !retiroPersona.trim()}
                >
                  {marcarRetiro.isPending ? "Guardando..." : "Confirmar retiro"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {desactivarId && (
        <div className="modal" role="dialog" aria-modal="true" onClick={(e) => e.target === e.currentTarget && setDesactivarId(null)}>
          <div className="modal-dialog" style={{ maxWidth: 420 }}>
            <div className="modal-content">
              <div className="modal-header">
                <h5 className="modal-title">Eliminar retiro</h5>
                <button type="button" className="modal-close" onClick={() => setDesactivarId(null)}>&times;</button>
              </div>
              <div className="modal-body">
                <p>¿Estás seguro de que deseas eliminar este pedido de la lista?</p>
                <p className="text-sm text-muted">El pedido quedará oculto pero seguirá registrado en la base de datos.</p>
              </div>
              <div className="modal-footer">
                <button type="button" className="btn btn-secondary" onClick={() => setDesactivarId(null)}>Cancelar</button>
                <button
                  type="button"
                  className="btn btn-danger"
                  onClick={confirmarDesactivar}
                  disabled={desactivarPedido.isPending}
                >
                  {desactivarPedido.isPending ? "Eliminando..." : "Eliminar retiro"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {convertirId && convertirData && (
        <div className="modal" role="dialog" aria-modal="true" onClick={(e) => e.target === e.currentTarget && setConvertirId(null)}>
          <div className="modal-dialog modal-lg">
            <div className="modal-content">
              <div className="modal-header">
                <h5 className="modal-title">Convertir cotización #{convertirData.id} a pedido</h5>
                <button type="button" className="modal-close" onClick={() => setConvertirId(null)}>&times;</button>
              </div>
              <div className="modal-body">
                <p className="mb-3">Selecciona los productos que deseas incluir en el nuevo pedido:</p>
                <div className="table-responsive">
                  <table className="table table-sm table-bordered">
                    <thead>
                      <tr>
                        <th style={{ width: 40 }}>Incluir</th>
                        <th>Cód. Prov.</th>
                        <th>Proveedor</th>
                        <th>OEM</th>
                        <th>Nombre</th>
                        <th>Precio</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(convertirData.detalles || []).map((d) => (
                        <tr key={d.id}>
                          <td className="text-center">
                            <input
                              type="checkbox"
                              checked={!!convertirSeleccion[d.id]}
                              onChange={() => toggleItem(d.id)}
                            />
                          </td>
                          <td>{d.codigo_proveedor}</td>
                          <td>{d.proveedor_nombre}</td>
                          <td>{d.oem}</td>
                          <td>{d.nombre}</td>
                          <td>${d.precio_final}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
              <div className="modal-footer">
                <button type="button" className="btn btn-secondary" onClick={() => setConvertirId(null)}>Cancelar</button>
                <button
                  type="button"
                  className="btn btn-primary"
                  onClick={confirmarConvertir}
                  disabled={convertirCotizacion.isPending || !algunaSeleccionada}
                >
                  {convertirCotizacion.isPending ? "Convirtiendo..." : "Convertir a pedido"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

    </>
  );
}
