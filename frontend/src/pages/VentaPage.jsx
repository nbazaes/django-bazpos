import { useEffect, useState } from "react";
import PageCard from "../components/PageCard";
import Shell from "../components/Shell";
import { apiRequest } from "../lib/api";
import { getTaxPercent } from "../lib/tax";
import { STORE_NAME } from "../lib/config";

export default function VentaPage() {
  const [oem, setOem] = useState("");
  const [productosEncontrados, setProductosEncontrados] = useState([]);
  const [carro, setCarro] = useState([]);
  const [error, setError] = useState("");
  const [showConfirmVenta, setShowConfirmVenta] = useState(false);
  const [showVentaSuccess, setShowVentaSuccess] = useState(false);
  const [showPreview, setShowPreview] = useState(false);
  const [lastDocumento, setLastDocumento] = useState(null);
  const [showUbicacionDialog, setShowUbicacionDialog] = useState(false);
  const [ubicacionItems, setUbicacionItems] = useState([]);
  const [selectedUbicaciones, setSelectedUbicaciones] = useState({});
  const taxPercent = getTaxPercent();
  const factor = 1 + taxPercent / 100;
  const netoFromBruto = (monto) => Math.round(Number(monto || 0) / factor);
  const totalCarro = carro.reduce((sum, item) => sum + item.precio * item.cantidad, 0);
  const totalNetoCarro = carro.reduce((sum, item) => sum + netoFromBruto(item.precio * item.cantidad), 0);

  async function buscarProducto(texto) {
    if (!texto.trim()) {
      setProductosEncontrados([]);
      setError("");
      return;
    }
    try {
      const result = await apiRequest(`/productos/?texto=${encodeURIComponent(texto)}`);
      if (result.length === 0) {
        setError("Producto no encontrado");
        setProductosEncontrados([]);
      } else {
        setProductosEncontrados(result);
        setError("");
      }
    } catch (err) {
      setError(err.message);
      setProductosEncontrados([]);
    }
  }

  useEffect(() => {
    const query = oem.trim();
    const timeoutId = setTimeout(() => {
      buscarProducto(query);
    }, 250);
    return () => clearTimeout(timeoutId);
  }, [oem]);

  function agregar(producto) {
    if ((producto.stock_actual || 0) <= 0) {
      setError(`No hay stock disponible para ${producto.nombre}`);
      return;
    }

    const existing = carro.find((x) => x.producto_id === producto.producto_id);
    if (existing) {
      if (existing.cantidad >= producto.stock_actual) {
        setError(`No puedes agregar mas de ${producto.stock_actual} unidades para ${producto.nombre}`);
        return;
      }
      setCarro(carro.map((x) => (x.producto_id === producto.producto_id ? { ...x, cantidad: x.cantidad + 1 } : x)));
      setError("");
      return;
    }
    setCarro([
      ...carro,
      {
        producto_id: producto.producto_id,
        codigo_producto: producto.codigo_producto,
        oem: producto.oem,
        nombre: producto.nombre,
        precio: producto.precio,
        cantidad: 1,
        stock_actual: producto.stock_actual,
      },
    ]);
    setError("");
  }

  function buildDocumento(tipoDocumento) {
    const ahora = new Date();
    return {
      tienda: STORE_NAME,
      tipo_documento: tipoDocumento,
      fecha: ahora.toLocaleString(),
      items: carro.map((item) => ({
        ...item,
        subtotal: item.precio * item.cantidad,
        subtotal_neto: netoFromBruto(item.precio * item.cantidad),
      })),
      total: totalCarro,
      total_neto: totalNetoCarro,
      impuesto: totalCarro - totalNetoCarro,
    };
  }

  function imprimirDocumento(documento) {
    const win = window.open("", "_blank", "width=420,height=700");
    if (!win) return;

    const rows = documento.items.map((item) => `
      <tr>
        <td>${item.cantidad}</td>
        <td>${item.codigo_producto}</td>
        <td>${item.nombre}</td>
        <td style="text-align:right;">$${item.subtotal}</td>
      </tr>
    `).join("");

    win.document.write(`
      <html>
        <head>
          <title>${documento.tipo_documento}</title>
          <style>
            body { font-family: monospace; width: 58mm; margin: 0; padding: 8px; font-size: 11px; }
            h1, h2, p { margin: 0; text-align: center; }
            .line { border-top: 1px dashed #000; margin: 6px 0; }
            table { width: 100%; border-collapse: collapse; }
            td { vertical-align: top; padding: 2px 0; }
            .right { text-align: right; }
            .small { font-size: 10px; }
          </style>
        </head>
        <body>
          <h1>${documento.tienda}</h1>
          <p>${documento.tipo_documento === "CO" ? "COTIZACION" : "COMPROBANTE DE VENTA"}</p>
          <p class="small">${documento.fecha}</p>
          <div class="line"></div>
          <table>
            <tbody>
              ${rows}
            </tbody>
          </table>
          <div class="line"></div>
          <p class="right">Neto: $${documento.total_neto}</p>
          <p class="right">Impuesto: $${documento.impuesto}</p>
          <p class="right"><strong>Total: $${documento.total}</strong></p>
          <p class="small" style="text-align:center;margin-top:10px;">Documento carece de validez legal</p>
        </body>
      </html>
    `);
    win.document.close();
    win.focus();
    win.print();
  }

  async function checkUbicaciones(ventaId) {
    try {
      const result = await apiRequest(`/ventas/${ventaId}/ubicaciones-para-deducir/`);
      if (result.length > 0) {
        setUbicacionItems(result);
        const defaults = {};
        result.forEach((item) => {
          defaults[item.producto_id] = item.ubicaciones[0]?.id || null;
        });
        setSelectedUbicaciones(defaults);
        setShowUbicacionDialog(true);
      } else {
        await apiRequest(`/ventas/${ventaId}/deducir-stock/`, {
          method: "POST",
          body: { deducciones: [] },
        });
      }
    } catch (err) {
      console.error("Error checking ubicaciones:", err);
    }
  }

  async function handleDeducirStock() {
    if (!lastDocumento) return;
    const deducciones = ubicacionItems.map((item) => ({
      producto_id: item.producto_id,
      ubicacion_id: selectedUbicaciones[item.producto_id],
      cantidad: item.cantidad_vendida,
    }));
    try {
      await apiRequest(`/ventas/${lastDocumento.ventaId}/deducir-stock/`, {
        method: "POST",
        body: { deducciones },
      });
      setShowUbicacionDialog(false);
    } catch (err) {
      setError(err.message);
    }
  }

  async function guardar(tipoDocumento = "VE") {
    try {
      const total = carro.reduce((sum, item) => sum + item.precio * item.cantidad, 0);
      await apiRequest("/ventas/validar-stock/", { method: "POST", body: { productos: carro } });
      const result = await apiRequest("/ventas/", {
        method: "POST",
        body: {
          total,
          tipo_documento: tipoDocumento,
          productos: carro.map((item) => ({ producto_id: item.producto_id, cantidad: item.cantidad, precio: item.precio * item.cantidad })),
        },
      });
      const documento = buildDocumento(tipoDocumento);
      setLastDocumento({ ...documento, ventaId: result.id, estado: result.estado_display, tipoDisplay: result.tipo_documento_display });
      setCarro([]);
      setOem("");
      setProductosEncontrados([]);
      setShowConfirmVenta(false);
      setShowPreview(true);
      setShowVentaSuccess(true);
      setTimeout(() => setShowVentaSuccess(false), 1300);
    } catch (err) {
      setError(err.message);
    }
  }

  async function cerrarComprobante() {
    setShowPreview(false);
    if (lastDocumento && lastDocumento.tipo_documento === "VE") {
      await checkUbicaciones(lastDocumento.ventaId);
    }
  }

  return (
    <Shell title="Realizar venta">
      {error && <div className="alert alert-danger">{error}</div>}
      <PageCard title="Buscar producto por OEM">
        <div className="row">
          <div className="col-md-6">
            <input
              className="form-control"
              placeholder="Ingrese codigo OEM"
              value={oem}
              onChange={(e) => setOem(e.target.value)}
            />
          </div>
          <div className="col-md-3">
            <button className="btn btn-primary btn-block" onClick={() => buscarProducto(oem)}>Buscar</button>
          </div>
        </div>
        {productosEncontrados.length > 0 && (
          <div className="mt-3">
            <table className="table table-sm table-bordered">
              <thead><tr><th>Codigo Producto</th><th>OEM</th><th>Nombre</th><th>Stock</th><th>Precio</th><th></th></tr></thead>
              <tbody>
                {productosEncontrados.map((p) => (
                  <tr key={p.producto_id}>
                    <td>{p.codigo_producto}</td>
                    <td>{p.oem}</td>
                    <td>{p.nombre}</td>
                    <td>
                      {(p.ubicaciones_stock || []).length > 0 ? (
                        <span className="stock-hover">
                          {p.stock_actual}
                          <span className="stock-popover">
                            {(p.ubicaciones_stock || []).map((u) => (
                              <div key={u.nombre} className="popover-row">
                                <span>{u.nombre}</span>
                                <strong>{u.cantidad}</strong>
                              </div>
                            ))}
                          </span>
                        </span>
                      ) : (
                        p.stock_actual
                      )}
                    </td>
                    <td>${p.precio}</td>
                    <td>
                      <button
                        className="btn btn-sm btn-success"
                        onClick={() => agregar(p)}
                        disabled={(p.stock_actual || 0) <= 0}
                      >
                        Agregar
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </PageCard>
      <PageCard title="Carrito">
        <table className="table table-sm table-bordered">
          <thead><tr><th>Código</th><th>OEM</th><th>Nombre</th><th>Cantidad</th><th>Subtotal neto</th><th>Subtotal</th><th></th></tr></thead>
          <tbody>
            {carro.map((i) => (
              <tr key={i.producto_id}>
                <td>{i.codigo_producto}</td>
                <td>{i.oem}</td>
                <td>{i.nombre}</td>
                <td>
                  <input
                    type="number"
                    className="form-control form-control-sm"
                    style={{ width: 80 }}
                    min="1"
                    max={i.stock_actual}
                    value={i.cantidad}
                    onChange={(e) => {
                      const maxStock = i.stock_actual || 1;
                      const requested = parseInt(e.target.value, 10) || 1;
                      const safeCantidad = Math.max(1, Math.min(requested, maxStock));
                      const next = [...carro];
                      const idx = next.findIndex((x) => x.producto_id === i.producto_id);
                      next[idx].cantidad = safeCantidad;
                      setCarro(next);
                      if (requested > maxStock) {
                        setError(`Stock maximo para ${i.nombre}: ${maxStock}`);
                      } else {
                        setError("");
                      }
                    }}
                  />
                </td>
                <td>${netoFromBruto(i.precio * i.cantidad)}</td>
                <td>${i.precio * i.cantidad}</td>
                <td><button className="btn btn-sm btn-danger" onClick={() => setCarro(carro.filter((x) => x.producto_id !== i.producto_id))}>X</button></td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="d-flex justify-content-end mb-3 text-right">
          <div>
            <h6 className="mb-1">Total neto: ${totalNetoCarro}</h6>
            <h5 className="mb-0">Total: ${totalCarro}</h5>
          </div>
        </div>
        <div className="d-flex gap-2">
          <button className="btn btn-success mr-2" disabled={!carro.length} onClick={() => setShowConfirmVenta(true)}>Confirmar venta</button>
          <button className="btn btn-outline-primary" disabled={!carro.length} onClick={() => guardar("CO")}>Generar cotizacion</button>
        </div>
      </PageCard>

      {showConfirmVenta && (
        <div className="modal" style={{ display: "block", backgroundColor: "rgba(0, 0, 0, 0.45)" }} role="dialog" aria-modal="true">
          <div className="modal-dialog modal-lg modal-dialog-centered">
            <div className="modal-content">
              <div className="modal-header">
                <h5 className="modal-title">Confirmar venta</h5>
                <button type="button" className="close" onClick={() => setShowConfirmVenta(false)}>
                  <span>&times;</span>
                </button>
              </div>
              <div className="modal-body">
                <p className="mb-3">Revise el detalle antes de confirmar:</p>
                <div className="table-responsive">
                  <table className="table table-sm table-bordered mb-0">
                    <thead><tr><th>Codigo</th><th>OEM</th><th>Nombre</th><th>Cantidad</th><th>Subtotal neto</th><th>Subtotal</th></tr></thead>
                    <tbody>
                      {carro.map((i) => (
                        <tr key={`confirm-${i.producto_id}`}>
                          <td>{i.codigo_producto}</td>
                          <td>{i.oem}</td>
                          <td>{i.nombre}</td>
                          <td>{i.cantidad}</td>
                          <td>${netoFromBruto(i.precio * i.cantidad)}</td>
                          <td>${i.precio * i.cantidad}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <div className="text-right mt-3">
                  <h6 className="mb-1">Total neto: ${totalNetoCarro}</h6>
                  <h5 className="mb-0">Total: ${totalCarro}</h5>
                </div>
              </div>
              <div className="modal-footer">
                <button type="button" className="btn btn-secondary" onClick={() => setShowConfirmVenta(false)}>Cancelar</button>
                <button type="button" className="btn btn-success" onClick={() => guardar("VE")}>Confirmar y guardar</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {showPreview && lastDocumento && (
        <div className="modal" style={{ display: "block", backgroundColor: "rgba(0, 0, 0, 0.45)" }} role="dialog" aria-modal="true">
          <div className="modal-dialog modal-lg modal-dialog-centered">
            <div className="modal-content">
              <div className="modal-header">
                <h5 className="modal-title">{lastDocumento.tipo_documento === "CO" ? "Cotizacion" : "Comprobante de venta"}</h5>
                <button type="button" className="close" onClick={cerrarComprobante}>
                  <span>&times;</span>
                </button>
              </div>
              <div className="modal-body">
                <div className="border p-3 bg-white" style={{ fontFamily: "monospace", maxWidth: 420, margin: "0 auto" }}>
                  <h6 className="text-center mb-1">{lastDocumento.tienda}</h6>
                  <div className="text-center mb-2">{lastDocumento.tipo_documento === "CO" ? "COTIZACION" : "COMPROBANTE DE VENTA"}</div>
                  <div className="mb-2 small text-center">{lastDocumento.fecha}</div>
                  <hr />
                  {lastDocumento.items.map((item) => (
                    <div key={`${item.producto_id}-${item.cantidad}`} className="d-flex justify-content-between">
                      <span>{item.cantidad} x {item.codigo_producto} - {item.nombre}</span>
                      <span>${item.subtotal}</span>
                    </div>
                  ))}
                  <hr />
                  <div className="d-flex justify-content-between"><span>Neto</span><span>${lastDocumento.total_neto}</span></div>
                  <div className="d-flex justify-content-between"><span>Impuesto</span><span>${lastDocumento.impuesto}</span></div>
                  <div className="d-flex justify-content-between font-weight-bold"><span>Total</span><span>${lastDocumento.total}</span></div>
                  <div className="text-center small mt-2">Documento carece de validez legal</div>
                </div>
              </div>
              <div className="modal-footer">
                <button type="button" className="btn btn-secondary" onClick={cerrarComprobante}>Cerrar</button>
                <button type="button" className="btn btn-primary" onClick={() => imprimirDocumento(lastDocumento)}>Imprimir</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {showUbicacionDialog && (
        <div className="modal" style={{ display: "block", backgroundColor: "rgba(0, 0, 0, 0.45)" }} role="dialog" aria-modal="true">
          <div className="modal-dialog modal-lg modal-dialog-centered">
            <div className="modal-content">
              <div className="modal-header">
                <h5 className="modal-title">Seleccionar ubicacion de descuento</h5>
                <button type="button" className="close" onClick={() => setShowUbicacionDialog(false)}>
                  <span>&times;</span>
                </button>
              </div>
              <div className="modal-body">
                <p>Los siguientes productos tienen stock en multiples ubicaciones. Seleccione de cual descontar:</p>
                <table className="table table-sm table-bordered">
                  <thead>
                    <tr><th>Producto</th><th>Cantidad vendida</th><th>Ubicacion</th></tr>
                  </thead>
                  <tbody>
                    {ubicacionItems.map((item) => (
                      <tr key={item.producto_id}>
                        <td>{item.codigo_producto} - {item.nombre}</td>
                        <td>{item.cantidad_vendida}</td>
                        <td>
                          <select
                            className="form-control form-control-sm"
                            value={selectedUbicaciones[item.producto_id] || ""}
                            onChange={(e) => setSelectedUbicaciones({
                              ...selectedUbicaciones,
                              [item.producto_id]: Number(e.target.value),
                            })}
                          >
                            {item.ubicaciones.map((u) => (
                              <option key={u.id} value={u.id}>
                                {u.nombre} (stock: {u.stock})
                              </option>
                            ))}
                          </select>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="modal-footer">
                <button type="button" className="btn btn-secondary" onClick={() => setShowUbicacionDialog(false)}>Cancelar</button>
                <button type="button" className="btn btn-success" onClick={handleDeducirStock}>Confirmar</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {showVentaSuccess && (
        <div className="modal" style={{ display: "block", backgroundColor: "rgba(0, 0, 0, 0.35)" }} role="dialog" aria-modal="true">
          <div className="modal-dialog modal-dialog-centered" style={{ maxWidth: 420 }}>
            <div className="modal-content">
              <div className="modal-body text-center py-4">
                <div className="text-success mb-2" style={{ fontSize: 28 }}>&#10003;</div>
                <h5 className="mb-0">{lastDocumento?.tipo_documento === "CO" ? "Cotizacion generada con exito" : "Venta registrada con exito"}</h5>
              </div>
            </div>
          </div>
        </div>
      )}
      <style>{`
        .stock-hover {
          position: relative;
          display: inline-block;
          cursor: pointer;
          border-bottom: 1px dashed #999;
        }
        .stock-popover {
          visibility: hidden;
          opacity: 0;
          position: absolute;
          bottom: calc(100% + 8px);
          left: 50%;
          transform: translateX(-50%);
          background: #fff;
          border: 1px solid #d1d3e2;
          border-radius: 6px;
          padding: 8px 12px;
          white-space: nowrap;
          z-index: 100;
          box-shadow: 0 4px 12px rgba(0,0,0,0.15);
          transition: opacity 0.15s ease;
          min-width: 160px;
        }
        .stock-popover::after {
          content: "";
          position: absolute;
          top: 100%;
          left: 50%;
          transform: translateX(-50%);
          border: 6px solid transparent;
          border-top-color: #fff;
        }
        .stock-popover::before {
          content: "";
          position: absolute;
          top: 100%;
          left: 50%;
          transform: translateX(-50%);
          border: 7px solid transparent;
          border-top-color: #d1d3e2;
        }
        .stock-hover:hover .stock-popover {
          visibility: visible;
          opacity: 1;
        }
        .popover-row {
          display: flex;
          justify-content: space-between;
          gap: 16px;
          padding: 2px 0;
        }
        .popover-row + .popover-row {
          border-top: 1px solid #eaecf4;
        }
      `}</style>
    </Shell>
  );
}
