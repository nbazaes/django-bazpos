import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { formatDateTime } from "../lib/format";
import {
  useCambiarEstadoPedido,
  useConvertirCotizacion,
  useCancelarPedido,
  useDevolverPedido,
  useMarcarRetiro,
  usePedido,
  usePedidos,
  useUbicaciones,
} from "../lib/queries";
import { getStoreName } from "../lib/storeName";
import { getStoreConfig, fetchStoreConfig } from "../lib/store";
import { useToast } from "../lib/useToast";
import { getUser, isGerente } from "../lib/auth";
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
  DE: { className: "badge badge-secondary", label: "Devuelto" },
  CA: { className: "badge badge-danger", label: "Cancelado" },
};

export default function PedidosHistorial() {
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(50);
  const [estadoFiltro, setEstadoFiltro] = useState("");
  const [search, setSearch] = useState("");
  const [fechaDesde, setFechaDesde] = useState("");
  const [fechaHasta, setFechaHasta] = useState("");
  const [detalleId, setDetalleId] = useState(null);
  const [retiroId, setRetiroId] = useState(null);
  const [retiroPersona, setRetiroPersona] = useState("");
  const [retiroMismoUsuario, setRetiroMismoUsuario] = useState(false);
  const [retiroDocumento, setRetiroDocumento] = useState("");
  const [cancelarId, setCancelarId] = useState(null);
  const [cancelarMotivo, setCancelarMotivo] = useState("");
  const [devolverId, setDevolverId] = useState(null);
  const [devolverMotivo, setDevolverMotivo] = useState("");
  const [devolverSeleccion, setDevolverSeleccion] = useState({});
  const [devolverMontos, setDevolverMontos] = useState({});
  const [devolverReponer, setDevolverReponer] = useState({});
  const [devolverUbicacion, setDevolverUbicacion] = useState({});
  const [convertirId, setConvertirId] = useState(null);
  const [convertirSeleccion, setConvertirSeleccion] = useState({});
  const [convertirNombre, setConvertirNombre] = useState("");
  const [convertirTelefono, setConvertirTelefono] = useState("");
  const [convertirMetodoPago, setConvertirMetodoPago] = useState("EF");
  const [convertirDocumento, setConvertirDocumento] = useState("SB");

  const addToast = useToast();
  const pedidosParams = { page, page_size: pageSize };
  if (estadoFiltro) pedidosParams.estado = estadoFiltro;
  if (search.trim()) pedidosParams.search = search.trim();
  if (fechaDesde) pedidosParams.fecha_desde = fechaDesde;
  if (fechaHasta) pedidosParams.fecha_hasta = fechaHasta;
  const { data: pedidosData } = usePedidos(pedidosParams);
  const { data: detalleData } = usePedido(detalleId);
  const { data: retiroData } = usePedido(retiroId);
  const { data: convertirData } = usePedido(convertirId);
  const { data: devolverData } = usePedido(devolverId);
  const { data: ubicacionesData } = useUbicaciones({ page_size: 200 });
  const cambiarDocumento = useCambiarEstadoPedido();
  const marcarRetiro = useMarcarRetiro();
  const cancelarPedido = useCancelarPedido();
  const devolverPedido = useDevolverPedido();
  const convertirCotizacion = useConvertirCotizacion();

  const ubicacionesList = useMemo(() => ubicacionesData?.results ?? [], [ubicacionesData]);
  const esAdmin = isGerente(getUser());

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

  function abrirRetiro(pedido) {
    setRetiroId(pedido.id);
    setRetiroPersona("");
    setRetiroMismoUsuario(false);
    setRetiroDocumento(pedido.estado_documento === "SB" ? "BO" : "");
  }

  function confirmarRetiro() {
    const persona = retiroPersona.trim() || (retiroMismoUsuario ? retiroData?.usuario_nombre : "");
    if (!persona) return;
    const body = { pedidoId: retiroId, persona_retiro: persona };
    if (retiroDocumento) {
      body.estado_documento = retiroDocumento;
    }
    marcarRetiro.mutate(
      body,
      { onSuccess: () => setRetiroId(null) },
    );
  }

  function confirmarCancelar() {
    if (!cancelarMotivo.trim()) return;
    cancelarPedido.mutate(
      { pedidoId: cancelarId, motivo: cancelarMotivo.trim() },
      { onSuccess: () => { setCancelarId(null); setCancelarMotivo(""); } },
    );
  }

  useEffect(() => {
    if (!devolverData?.detalles?.length) return;
    const sel = {};
    const montos = {};
    const rep = {};
    const ubi = {};
    for (const d of devolverData.detalles) {
      if (d.devuelto) {
        sel[d.id] = false;
        continue;
      }
      sel[d.id] = true;
      montos[d.id] = d.precio_final;
      rep[d.id] = true;
      ubi[d.id] = ubicacionesList.length > 0 ? String(ubicacionesList[0].id) : "";
    }
    let cancelled = false;
    Promise.resolve().then(() => {
      if (!cancelled) {
        setDevolverSeleccion(sel);
        setDevolverMontos(montos);
        setDevolverReponer(rep);
        setDevolverUbicacion(ubi);
      }
    });
    return () => { cancelled = true; };
  }, [devolverData, ubicacionesList]);

  const devolverTotalCalculado = useMemo(() => {
    if (!devolverData?.detalles?.length) return 0;
    let total = 0;
    for (const d of devolverData.detalles) {
      if (!devolverSeleccion[d.id]) continue;
      total += Math.max(0, Number(devolverMontos[d.id] || 0));
    }
    return total;
  }, [devolverData, devolverSeleccion, devolverMontos]);

  function abrirDevolver(pedido) {
    setDevolverId(pedido.id);
    setDevolverMotivo("");
  }

  function confirmarDevolver() {
    if (!devolverMotivo.trim()) return;
    const productos = [];
    for (const d of devolverData?.detalles || []) {
      if (!devolverSeleccion[d.id]) continue;
      const monto = Math.min(
        Math.max(0, Number(devolverMontos[d.id] || 0)),
        d.precio_final,
      );
      const item = {
        pedido_detalle_id: d.id,
        monto_devuelto: monto,
        reponer_stock: devolverReponer[d.id] !== false,
      };
      if (item.reponer_stock && devolverData.stock_descontado) {
        item.ubicacion_id = parseInt(devolverUbicacion[d.id] || 0, 10);
      }
      productos.push(item);
    }
    if (productos.length === 0) return;
    devolverPedido.mutate(
      { pedidoId: devolverId, motivo: devolverMotivo.trim(), productos },
      {
        onSuccess: () => {
          addToast("Devolución registrada", "success");
          setDevolverId(null);
          setDevolverMotivo("");
        },
        onError: (err) => {
          addToast(err.message || "Error al registrar la devolución", "danger");
        },
      },
    );
  }

  function abrirConvertir(pedido) {
    setConvertirId(pedido.id);
    setConvertirNombre(pedido.nombre_cliente || "");
    setConvertirTelefono(pedido.telefono_cliente || "");
    setConvertirMetodoPago(pedido.metodo_pago || "EF");
    setConvertirDocumento("SB");
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
      {
        pedidoId: convertirId,
        detalle_ids: ids,
        nombre_cliente: convertirNombre.trim(),
        telefono_cliente: convertirTelefono.trim(),
        metodo_pago: convertirMetodoPago,
        estado_documento: convertirDocumento,
      },
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
    const esCotizacion = pedido.es_cotizacion;

    const filas = (pedido.detalles || []).map((d) => `
      <tr>
        ${!esCotizacion ? `<td>${d.codigo_proveedor || "—"}</td><td>${d.oem || "—"}</td>` : ""}
        <td>${d.nombre}</td>
        <td style="text-align:right;">$${d.precio_final}</td>
      </tr>
    `).join("");

    const titulo = esCotizacion
      ? `Cotización #${pedido.id}`
      : `Pedido #${pedido.id}`;

    const disclaimer = esCotizacion
      ? `<div class="disclaimer">Cotización válida hasta 3 días o hasta agotar stock</div>`
      : `<div class="footer">El abono del producto constituye garantía por repuestos solicitados. Al desistir del producto el abono sera para saldar costos y gestión.</div>`;

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
          <div class="store">${getStoreName()}</div>
          ${storeConfig.direccion ? `<div class="address">${storeConfig.direccion}</div>` : ""}
          ${storeConfig.telefono ? `<div class="address">${storeConfig.telefono}</div>` : ""}
          <div class="title">${titulo}</div>
        </div>
        <div class="info">
          <strong>Fecha:</strong> ${fecha}<br />
          <strong>Cliente:</strong> ${pedido.nombre_cliente}<br />
          <strong>Teléfono:</strong> ${pedido.telefono_cliente}<br />
          ${!esCotizacion ? `<strong>Estado:</strong> ${estado}<br />` : ""}
          ${pedido.fecha_retiro ? `<strong>Fecha retiro:</strong> ${fechaRetiro}<br />` : ""}
          ${pedido.persona_retiro ? `<strong>Retiró:</strong> ${pedido.persona_retiro}<br />` : ""}
          ${!esCotizacion ? `<strong>Documento:</strong> ${estadoDoc}` : ""}
        </div>
        <table>
          <thead>
            <tr>${!esCotizacion ? "<th>Cód. Prov.</th><th>OEM</th>" : ""}<th>Producto</th><th style="text-align:right;">Total</th></tr>
          </thead>
          <tbody>${filas}</tbody>
        </table>
        <div class="total">Total: $${pedido.monto_total}</div>
        <div class="check-row">
          <strong>Método de pago:</strong> ${metodo}
        </div>
        ${disclaimer}
        <script>
          window.onload = function() { window.print(); };
        </script>
      </body>
      </html>
    `);
    win.document.close();
  }

  function handleFilterChange(field, value) {
    switch (field) {
      case "estado": setEstadoFiltro(value); break;
      case "search": setSearch(value); break;
      case "fecha_desde": setFechaDesde(value); break;
      case "fecha_hasta": setFechaHasta(value); break;
    }
    setPage(1);
  }

  return (
    <>
      <div className="filter-bar flex flex-wrap items-center gap-3 mb-3">
        <select
          className="form-control"
          style={{ maxWidth: 180 }}
          value={estadoFiltro}
          onChange={(e) => handleFilterChange("estado", e.target.value)}
        >
          <option value="">Todos los estados</option>
          <option value="PR">Pendiente por retirar</option>
          <option value="RE">Retirado</option>
          <option value="DE">Devuelto</option>
          <option value="CA">Cancelado</option>
          <option value="CO">Cotización</option>
        </select>
        <input
          type="text"
          className="form-control"
          style={{ maxWidth: 220 }}
          placeholder="Buscar por nombre o ID..."
          value={search}
          onChange={(e) => handleFilterChange("search", e.target.value)}
        />
        <div className="flex items-center gap-2">
          <span className="text-muted" style={{ fontSize: "0.875rem" }}>Desde:</span>
          <input
            type="date"
            className="form-control"
            style={{ maxWidth: 180 }}
            value={fechaDesde}
            onChange={(e) => handleFilterChange("fecha_desde", e.target.value)}
          />
          <span className="text-muted" style={{ fontSize: "0.875rem" }}>Hasta:</span>
          <input
            type="date"
            className="form-control"
            style={{ maxWidth: 180 }}
            value={fechaHasta}
            onChange={(e) => handleFilterChange("fecha_hasta", e.target.value)}
          />
        </div>
      </div>
      <div className="table-responsive">
        <table className="table table-sm table-bordered">
          <thead>
            <tr>
              <th>ID</th>
              <th>Fecha</th>
              <th>Cliente</th>
              <th className="hide-mobile">Teléfono</th>
              <th>Estado</th>
              <th className="hide-mobile">Documento</th>
              <th className="hide-mobile">Persona que retiró</th>
              <th className="hide-mobile">Fecha retiro</th>
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
                  <td className="hide-mobile">{p.telefono_cliente}</td>
                  <td>
                    {esCotizacion ? (
                      <span className="badge badge-info">Cotización</span>
                    ) : (
                      <>
                        <span className={estadoInfo.className}>{estadoInfo.label}</span>
                        {p.devuelto_parcial && (
                          <span
                            className="badge badge-warning ms-1"
                            title={`Devueltas ${p.lineas_devueltas} de ${p.lineas_total} líneas — $${p.monto_devuelto}`}
                          >
                            Dev. parcial
                          </span>
                        )}
                      </>
                    )}
                  </td>
                  <td className="hide-mobile">
                    {esCotizacion ? (
                      <span className="text-muted">—</span>
                    ) : (
                      <span className="badge badge-secondary">{p.estado_documento_display || p.estado_documento}</span>
                    )}
                  </td>
                  <td className="hide-mobile">{p.persona_retiro || (p.estado === "RE" ? "—" : "")}</td>
                  <td className="hide-mobile">{formatDateTime(p.fecha_retiro)}</td>
                  <td>${p.monto_total}</td>
                  <td style={{ whiteSpace: "nowrap" }}>
                    <button className="btn btn-sm btn-info me-1" onClick={() => setDetalleId(p.id)}>Ver</button>
                    {esCotizacion && !yaConvertido && (
                      <button className="btn btn-sm btn-warning me-1" onClick={() => abrirConvertir(p)}>Convertir a pedido</button>
                    )}
                    {!esCotizacion && p.estado === "PR" && (
                      <button className="btn btn-sm btn-success me-1" onClick={() => abrirRetiro(p)}>Retiro</button>
                    )}
                    {!esCotizacion && esAdmin && (p.estado === "RE" || p.estado === "PR") && (
                      <button className="btn btn-sm btn-warning me-1" onClick={() => abrirDevolver(p)}>Devolver</button>
                    )}
                    {(esCotizacion || (p.estado !== "DE" && p.estado !== "CA")) && (
                      <button className="btn btn-sm btn-danger" onClick={() => setCancelarId(p.id)}>Cancelar pedido</button>
                    )}
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

      {detalleId && detalleData && createPortal(
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
                  <div className="col-md-4">
                    <strong>Documento:</strong>{" "}
                    {isGerente(getUser()) && !detalleData.es_cotizacion ? (
                      <select
                        className="form-control form-control-sm d-inline-block"
                        style={{ width: "auto" }}
                        value={detalleData.estado_documento}
                        onChange={(e) => cambiarDocumento.mutate({ pedidoId: detalleData.id, estado_documento: e.target.value })}
                      >
                        {DOCUMENTO_OPCIONES.map((op) => (
                          <option key={op.value} value={op.value}>{op.label}</option>
                        ))}
                      </select>
                    ) : (
                      detalleData.estado_documento_display || detalleData.estado_documento
                    )}
                  </div>
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
      , document.body)}

      {retiroId && retiroData && createPortal(
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
                {retiroData.estado_documento === "SB" && (
                  <div className="form-group mt-3">
                    <label>Documento</label>
                    <select className="form-control" value={retiroDocumento} onChange={(e) => setRetiroDocumento(e.target.value)}>
                      <option value="BO">Boleteado</option>
                      <option value="FA">Facturado</option>
                    </select>
                  </div>
                )}
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
      , document.body)}

      {devolverId && devolverData && createPortal(
        <div className="modal" role="dialog" aria-modal="true" onClick={(e) => e.target === e.currentTarget && setDevolverId(null)}>
          <div className="modal-dialog modal-lg">
            <div className="modal-content">
              <div className="modal-header">
                <h5 className="modal-title">Devolver pedido #{devolverData.id}</h5>
                <button type="button" className="modal-close" onClick={() => setDevolverId(null)} disabled={devolverPedido.isPending}>&times;</button>
              </div>
              <div className="modal-body">
                <p className="mb-3">
                  Seleccione las líneas a devolver y el monto que se reintegrará. Cada línea se devuelve completa (cantidad 1).
                </p>
                <div className="table-responsive">
                  <table className="table table-sm table-bordered">
                    <thead>
                      <tr>
                        <th style={{ width: 40 }}>Sel.</th>
                        <th>Cód. Prov.</th>
                        <th>Producto</th>
                        <th>Precio</th>
                        <th>Monto a devolver</th>
                        {devolverData.stock_descontado && <th>Reponer</th>}
                        {devolverData.stock_descontado && <th>Ubicación</th>}
                      </tr>
                    </thead>
                    <tbody>
                      {(devolverData.detalles || []).map((d) => {
                        const sel = !!devolverSeleccion[d.id];
                        if (d.devuelto) {
                          return (
                            <tr key={d.id} className="table-secondary">
                              <td className="text-center">
                                <input type="checkbox" checked disabled />
                              </td>
                              <td>{d.codigo_proveedor || "—"}</td>
                              <td>
                                {d.nombre}
                                <div className="text-muted" style={{ fontSize: "0.8rem" }}>{d.oem || ""}</div>
                              </td>
                              <td className="text-right">${d.precio_final}</td>
                              <td colSpan={devolverData.stock_descontado ? 3 : 1}>
                                <span className="badge badge-secondary">
                                  Ya devuelto — ${d.monto_devuelto || 0}
                                </span>
                              </td>
                            </tr>
                          );
                        }
                        return (
                          <tr key={d.id}>
                            <td className="text-center">
                              <input
                                type="checkbox"
                                checked={sel}
                                onChange={(e) => setDevolverSeleccion({ ...devolverSeleccion, [d.id]: e.target.checked })}
                                disabled={devolverPedido.isPending}
                              />
                            </td>
                            <td>{d.codigo_proveedor || "—"}</td>
                            <td>
                              {d.nombre}
                              <div className="text-muted" style={{ fontSize: "0.8rem" }}>{d.oem || ""}</div>
                            </td>
                            <td className="text-right">${d.precio_final}</td>
                            <td>
                              <input
                                type="number"
                                className="form-control form-control-sm"
                                style={{ width: 130 }}
                                min={0}
                                max={d.precio_final}
                                step={100}
                                value={devolverMontos[d.id] ?? d.precio_final}
                                onChange={(e) => setDevolverMontos({ ...devolverMontos, [d.id]: e.target.value })}
                                disabled={!sel || devolverPedido.isPending}
                              />
                            </td>
                            {devolverData.stock_descontado && (
                              <td className="text-center">
                                <input
                                  type="checkbox"
                                  checked={devolverReponer[d.id] !== false}
                                  onChange={(e) => setDevolverReponer({ ...devolverReponer, [d.id]: e.target.checked })}
                                  disabled={!sel || devolverPedido.isPending}
                                />
                              </td>
                            )}
                            {devolverData.stock_descontado && (
                              <td>
                                <select
                                  className="form-control form-control-sm"
                                  value={devolverUbicacion[d.id] || ""}
                                  onChange={(e) => setDevolverUbicacion({ ...devolverUbicacion, [d.id]: e.target.value })}
                                  disabled={!sel || devolverReponer[d.id] === false || devolverPedido.isPending}
                                >
                                  {ubicacionesList.map((u) => (
                                    <option key={u.id} value={u.id}>{u.nombre}</option>
                                  ))}
                                </select>
                              </td>
                            )}
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                  {devolverTotalCalculado > 0 && (
                    <div className="text-right mt-2 mb-3">
                      <span className="font-weight-bold">Total a devolver: </span>
                      <span className="text-danger font-weight-bold" style={{ fontSize: "1.1rem" }}>${devolverTotalCalculado}</span>
                    </div>
                  )}
                </div>
                <div className="form-group mt-3">
                  <label className="font-weight-bold">Motivo de devolución:</label>
                  <textarea
                    className="form-control"
                    rows="3"
                    value={devolverMotivo}
                    onChange={(e) => setDevolverMotivo(e.target.value)}
                    placeholder="Describa el motivo de la devolución..."
                    disabled={devolverPedido.isPending}
                  />
                </div>
              </div>
              <div className="modal-footer">
                <button type="button" className="btn btn-secondary" onClick={() => setDevolverId(null)} disabled={devolverPedido.isPending}>Cancelar</button>
                <button
                  type="button"
                  className="btn btn-warning"
                  onClick={confirmarDevolver}
                  disabled={devolverPedido.isPending || !devolverMotivo.trim() || devolverTotalCalculado <= 0}
                >
                  {devolverPedido.isPending ? "Registrando..." : "Confirmar devolución"}
                </button>
              </div>
            </div>
          </div>
        </div>
      , document.body)}

      {cancelarId && createPortal(
        <div className="modal" role="dialog" aria-modal="true" onClick={(e) => e.target === e.currentTarget && setCancelarId(null)}>
          <div className="modal-dialog" style={{ maxWidth: 420 }}>
            <div className="modal-content">
              <div className="modal-header">
                <h5 className="modal-title">Cancelar pedido</h5>
                <button type="button" className="modal-close" onClick={() => setCancelarId(null)}>&times;</button>
              </div>
              <div className="modal-body">
                <p>¿Estás seguro de que deseas cancelar este pedido?</p>
                <div className="form-group">
                  <label>Motivo de cancelación</label>
                  <textarea
                    className="form-control"
                    value={cancelarMotivo}
                    onChange={(e) => setCancelarMotivo(e.target.value)}
                    placeholder="Indica el motivo..."
                    rows={3}
                  />
                </div>
              </div>
              <div className="modal-footer">
                <button type="button" className="btn btn-secondary" onClick={() => setCancelarId(null)}>Volver</button>
                <button
                  type="button"
                  className="btn btn-danger"
                  onClick={confirmarCancelar}
                  disabled={cancelarPedido.isPending || !cancelarMotivo.trim()}
                >
                  {cancelarPedido.isPending ? "Cancelando..." : "Cancelar pedido"}
                </button>
              </div>
            </div>
          </div>
        </div>
      , document.body)}

      {convertirId && convertirData && createPortal(
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
                <div className="row mt-3">
                  <div className="col-md-6">
                    <div className="form-group">
                      <label>Nombre del cliente</label>
                      <input
                        type="text"
                        className="form-control"
                        value={convertirNombre}
                        onChange={(e) => setConvertirNombre(e.target.value)}
                        placeholder="Nombre del cliente"
                      />
                    </div>
                  </div>
                  <div className="col-md-6">
                    <div className="form-group">
                      <label>Teléfono</label>
                      <input
                        type="text"
                        className="form-control"
                        value={convertirTelefono}
                        onChange={(e) => setConvertirTelefono(e.target.value)}
                        placeholder="Teléfono"
                      />
                    </div>
                  </div>
                </div>
                <div className="row mt-3">
                  <div className="col-md-6">
                    <div className="form-group">
                      <label>Medio de pago</label>
                      <select
                        className="form-control"
                        value={convertirMetodoPago}
                        onChange={(e) => setConvertirMetodoPago(e.target.value)}
                      >
                        <option value="EF">Efectivo</option>
                        <option value="TJ">Tarjeta</option>
                      </select>
                    </div>
                  </div>
                  <div className="col-md-6">
                    <div className="form-group">
                      <label>Documento</label>
                      <select
                        className="form-control"
                        value={convertirDocumento}
                        onChange={(e) => setConvertirDocumento(e.target.value)}
                      >
                        {DOCUMENTO_OPCIONES.map((op) => (
                          <option key={op.value} value={op.value}>{op.label}</option>
                        ))}
                      </select>
                    </div>
                  </div>
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
      , document.body)}

    </>
  );
}
