import { useEffect, useRef, useState } from "react";
import PageCard from "../components/PageCard";
import { usePageTitle } from "../components/Shell";
import { apiRequest } from "../lib/api";
import { getTaxPercent } from "../lib/tax";
import { STORE_NAME } from "../lib/config";
import StepperInput from "../components/StepperInput";

function roundTotal(amount) {
  const remainder = amount % 1000;
  if (remainder >= 900) return (Math.floor(amount / 1000) + 1) * 1000;
  return Math.floor(amount / 1000) * 1000;
}

export default function VentaPage() {
  usePageTitle("Realizar venta");
  const [oem, setOem] = useState("");
  const [codigoBarra, setCodigoBarra] = useState("");
  const [barraFeedback, setBarraFeedback] = useState("");
  const [productosEncontrados, setProductosEncontrados] = useState([]);
  const [hayMasProductos, setHayMasProductos] = useState(false);
  const [carro, setCarro] = useState([]);
  const [error, setError] = useState("");
  const [showConfirmVenta, setShowConfirmVenta] = useState(false);
  const [showVentaSuccess, setShowVentaSuccess] = useState(false);
  const [showPreview, setShowPreview] = useState(false);
  const [lastDocumento, setLastDocumento] = useState(null);
  const [showUbicacionDialog, setShowUbicacionDialog] = useState(false);
  const [ubicacionItems, setUbicacionItems] = useState([]);
  const [selectedUbicaciones, setSelectedUbicaciones] = useState({});
  const [descuentoPorcentaje, setDescuentoPorcentaje] = useState(0);
  const barraRef = useRef(null);
  const processingRef = useRef(false);
  const taxPercent = getTaxPercent();
  const factor = 1 + taxPercent / 100;
  const netoFromBruto = (monto) => Math.round(Number(monto || 0) / factor);
  const subtotalCarro = carro.reduce((sum, item) => sum + item.precio * item.cantidad, 0);
  const discount = descuentoPorcentaje > 0 ? descuentoPorcentaje : 0;
  const discountedTotal = Math.round(subtotalCarro * (1 - discount / 100));
  const totalConDescuento = discount > 0 ? roundTotal(discountedTotal) : subtotalCarro;

  async function buscarProducto(texto) {
    if (!texto.trim()) {
      setProductosEncontrados([]);
      setHayMasProductos(false);
      setError("");
      return;
    }
    try {
      const result = await apiRequest(`/productos/?texto=${encodeURIComponent(texto)}`);
      const productos = Array.isArray(result) ? result : result.results || [];
      setHayMasProductos(!Array.isArray(result) && result.count > productos.length);
      if (productos.length === 0) {
        setError("Producto no encontrado");
        setProductosEncontrados([]);
      } else {
        setProductosEncontrados(productos);
        setError("");
      }
    } catch (err) {
      setError(err.message);
      setProductosEncontrados([]);
      setHayMasProductos(false);
    }
  }

  useEffect(() => {
    const query = oem.trim();
    const timeoutId = setTimeout(() => {
      buscarProducto(query);
    }, 250);
    return () => clearTimeout(timeoutId);
  }, [oem]);

  async function escanearCodigoBarra() {
    const codigo = codigoBarra.trim();
    if (!codigo || processingRef.current) return;
    processingRef.current = true;
    setCodigoBarra("");
    try {
      const result = await apiRequest(`/productos/por-codigo/?codigo=${encodeURIComponent(codigo)}`);
      if (!result.encontrado) {
        setBarraFeedback("error");
        setTimeout(() => setBarraFeedback(""), 1500);
        processingRef.current = false;
        return;
      }
      setBarraFeedback("success");
      setTimeout(() => setBarraFeedback(""), 600);

      const p = result.producto;
      const existing = carro.find((x) => x.producto_id === p.producto_id);
      if (existing) {
        if (existing.cantidad >= p.stock_actual) {
          setError(`No puedes agregar más de ${p.stock_actual} unidades para ${p.nombre}`);
          processingRef.current = false;
          return;
        }
        setCarro((prev) =>
          prev.map((x) => (x.producto_id === p.producto_id ? { ...x, cantidad: x.cantidad + 1 } : x))
        );
      } else {
        if ((p.stock_actual || 0) <= 0) {
          setError(`No hay stock disponible para ${p.nombre}`);
          processingRef.current = false;
          return;
        }
        setCarro((prev) => [
          ...prev,
          {
            producto_id: p.producto_id,
            codigo_producto: p.codigo_producto,
            oem: p.oem,
            nombre: p.nombre,
            precio: p.precio,
            cantidad: 1,
            stock_actual: p.stock_actual,
          },
        ]);
      }
      setError("");
      barraRef.current?.focus();
    } catch (err) {
      setError(err.message);
    }
    processingRef.current = false;
  }

  function handleBarraKeyDown(e) {
    if (e.key === "Enter") {
      e.preventDefault();
      escanearCodigoBarra();
    }
  }

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
    const total = totalConDescuento;
    return {
      tienda: STORE_NAME,
      tipo_documento: tipoDocumento,
      fecha: ahora.toLocaleString(),
      items: carro.map((item) => ({
        ...item,
        subtotal: item.precio * item.cantidad,
        subtotal_neto: netoFromBruto(item.precio * item.cantidad),
      })),
      total: total,
      total_neto: netoFromBruto(total),
      impuesto: total - netoFromBruto(total),
      descuento_porcentaje: discount,
      subtotal_original: subtotalCarro,
    };
  }

  function imprimirDocumento(documento) {
    const win = window.open("", "_blank", "width=800,height=600");
    if (!win) return;

    const esCotizacion = documento.tipo_documento === "CO";

    const rows = documento.items.map((item) => {
      const label = esCotizacion
        ? `${item.cantidad} x ${item.nombre}`
        : `${item.cantidad} x ${item.codigo_producto} - ${item.nombre}`;
      return `
        <div style="display:flex;justify-content:space-between;color:#333;margin-bottom:2px;">
          <span>${label}</span>
          <span>$${item.subtotal}</span>
        </div>
      `;
    }).join("");

    win.document.write(`
      <html>
        <head>
          <meta charset="utf-8" />
          <title>${esCotizacion ? "COTIZACION" : "COMPROBANTE DE VENTA"}</title>
          <style>
            @page { size: letter; margin: 12mm; }
            body {
              font-family: "JetBrains Mono", monospace;
              margin: 0;
              padding: 1.25rem;
              font-size: 0.8rem;
              line-height: 1.5;
              color: #1a1a1a;
              background: #faf9f6;
            }
            h1 { margin: 0 0 4px; text-align: center; font-size: 1rem; }
            .subtitle { text-align: center; margin: 0 0 4px; }
            .doc-number { text-align: center; font-size: 0.75rem; color: #666; margin-bottom: 4px; }
            .date { text-align: center; font-size: 0.75rem; color: #666; margin-bottom: 8px; }
            hr { border: none; border-top: 1px dashed #999; margin: 8px 0; }
            .totals-row { display: flex; justify-content: space-between; }
            .disclaimer { text-align: center; color: #999; font-size: 0.7rem; margin-top: 8px; }
            .bold { font-weight: bold; }
          </style>
        </head>
        <body>
          <h1>${documento.tienda}</h1>
          <p class="subtitle">${esCotizacion ? "COTIZACION" : "COMPROBANTE DE VENTA"}</p>
          <p class="doc-number">#${documento.ventaId}</p>
          <p class="date">${documento.fecha}</p>
          <hr />
          ${rows}
          <hr />
          <div class="totals-row"><span>Subtotal</span><span>$${documento.subtotal_original}</span></div>
          ${documento.descuento_porcentaje > 0 ? `<div class="totals-row"><span>Descuento (${documento.descuento_porcentaje}%)</span><span>-$${documento.subtotal_original - documento.total}</span></div>` : ""}
          <div class="totals-row"><span>Neto</span><span>$${documento.total_neto}</span></div>
          <div class="totals-row"><span>Impuesto</span><span>$${documento.impuesto}</span></div>
          <div class="totals-row"><span class="bold">Total</span><span class="bold">$${documento.total}</span></div>
          <p class="disclaimer">Documento carece de validez legal</p>
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
      const subtotal = subtotalCarro;
      const discounted = Math.round(subtotal * (1 - discount / 100));
      const total = discount > 0 ? roundTotal(discounted) : subtotal;
      await apiRequest("/ventas/validar-stock/", { method: "POST", body: { productos: carro } });
      const result = await apiRequest("/ventas/", {
        method: "POST",
        body: {
          total,
          descuento_porcentaje: discount,
          monto_subtotal: subtotal,
          tipo_documento: tipoDocumento,
          productos: carro.map((item) => ({ producto_id: item.producto_id, cantidad: item.cantidad, precio: item.precio * item.cantidad })),
        },
      });
      const documento = buildDocumento(tipoDocumento);
      setLastDocumento({ ...documento, ventaId: result.id, estado: result.estado_display, tipoDisplay: result.tipo_documento_display });
      setCarro([]);
      setOem("");
      setProductosEncontrados([]);
      setHayMasProductos(false);
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
    <>
      {error && <div className="alert alert-danger">{error}</div>}
      <PageCard title="Buscar producto">
        <div className="row mb-3">
          <div className="col-md-5">
            <input
              ref={barraRef}
              className={`form-control ${barraFeedback === "success" ? "is-valid" : barraFeedback === "error" ? "is-invalid" : ""}`}
              placeholder="Lector código de barra"
              value={codigoBarra}
              onChange={(e) => { setCodigoBarra(e.target.value); setBarraFeedback(""); }}
              onKeyDown={handleBarraKeyDown}
            />
          </div>
        </div>
        <div className="row">
          <div className="col-md-5">
            <input
              className="form-control"
              placeholder="Ingrese código OEM"
              value={oem}
              onChange={(e) => setOem(e.target.value)}
            />
          </div>
          <div className="col-md-3" style={{ display: "flex", alignItems: "flex-end" }}>
            <button className="btn btn-primary" onClick={() => buscarProducto(oem)}>Buscar</button>
          </div>
        </div>
        {productosEncontrados.length > 0 && (
          <div className="mt-4">
            {hayMasProductos && (
              <div className="alert alert-info mb-2">
                Se encontraron más de 50 productos. Refine la búsqueda para ver el resto.
              </div>
            )}
            <div className="table-responsive">
              <table className="table table-sm table-bordered">
                <thead>
                  <tr>
                    <th style={{ width: "1px" }}>Código</th>
                    <th style={{ width: "1px" }}>OEM</th>
                    <th>Nombre</th>
                    <th>Marca</th>
                    <th>Descripción</th>
                    <th style={{ width: "1px" }}>Stock</th>
                    <th style={{ width: "1px" }}>Precio</th>
                    <th style={{ width: "1px" }}></th>
                  </tr>
                </thead>
                <tbody>
                  {productosEncontrados.map((p) => (
                    <tr key={p.producto_id}>
                      <td className="text-nowrap">{p.codigo_producto}</td>
                      <td className="text-nowrap">{p.oem}</td>
                      <td>{p.nombre}</td>
                      <td>{p.marca}</td>
                      <td className="text-truncate" style={{ maxWidth: 200 }}>{p.descripcion}</td>
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
          </div>
        )}
      </PageCard>
      <PageCard title="Carrito">
        <div className="table-responsive">
          <table className="table table-sm table-bordered">
            <thead>
              <tr>
                <th style={{ width: "1px" }}>Código</th>
                <th style={{ width: "1px" }}>OEM</th>
                <th>Nombre</th>
                <th style={{ width: "1px" }}>Cantidad</th>
                <th style={{ width: "1px" }}>Subtotal neto</th>
                <th style={{ width: "1px" }}>Subtotal</th>
                <th style={{ width: "1px" }}></th>
              </tr>
            </thead>
            <tbody>
              {carro.map((i) => (
                <tr key={i.producto_id}>
                  <td className="text-nowrap">{i.codigo_producto}</td>
                  <td className="text-nowrap">{i.oem}</td>
                  <td>{i.nombre}</td>
                  <td>
                    <StepperInput
                      value={i.cantidad}
                      onChange={(val) => {
                        const maxStock = i.stock_actual || 1;
                        const next = [...carro];
                        const idx = next.findIndex((x) => x.producto_id === i.producto_id);
                        next[idx].cantidad = val;
                        setCarro(next);
                        if (val >= maxStock) {
                          setError(`Stock maximo para ${i.nombre}: ${maxStock}`);
                        } else {
                          setError("");
                        }
                      }}
                      min={1}
                      max={i.stock_actual || 1}
                      inputStyle={{ width: 64, fontSize: "0.9rem" }}
                      decrementLabel={`Disminuir cantidad de ${i.nombre}`}
                      incrementLabel={`Aumentar cantidad de ${i.nombre}`}
                    />
                  </td>
                  <td>${netoFromBruto(i.precio * i.cantidad)}</td>
                  <td>${i.precio * i.cantidad}</td>
                  <td>
                    <button
                      className="btn btn-sm btn-danger"
                      onClick={() => setCarro(carro.filter((x) => x.producto_id !== i.producto_id))}
                    >
                      X
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: "1.5rem" }}>
          <div style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "stretch",
            gap: "0.75rem",
            background: "var(--bg-elevated)",
            border: "1px solid var(--border-default)",
            borderRadius: "var(--radius-lg)",
            padding: "1.25rem 1.5rem",
            minWidth: 320,
            boxShadow: "var(--shadow)",
          }}>
            <div style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: "0.75rem",
            }}>
              <span style={{ fontSize: "0.85rem", color: "var(--text-muted)", fontWeight: 500 }}>Descuento</span>
              <div style={{
                display: "inline-flex",
                alignItems: "center",
                gap: "0.25rem",
                background: discount > 0 ? "var(--accent-soft)" : "var(--bg-input)",
                border: `2px solid ${discount > 0 ? "var(--accent)" : "var(--border-default)"}`,
                borderRadius: "var(--radius)",
                padding: "0.25rem 0.5rem",
                transition: "all var(--transition)",
                boxShadow: discount > 0 ? "0 0 0 3px var(--accent-glow)" : "none",
              }}>
                <StepperInput
                  value={descuentoPorcentaje || 0}
                  onChange={(val) => setDescuentoPorcentaje(val)}
                  min={0}
                  max={100}
                  active={discount > 0}
                  inputStyle={{
                    width: 52,
                    border: "none",
                    background: "transparent",
                    color: discount > 0 ? "var(--accent)" : "var(--text-primary)",
                    fontSize: "1.35rem",
                    fontWeight: 700,
                    padding: 0,
                  }}
                  decrementLabel="Disminuir descuento"
                  incrementLabel="Aumentar descuento"
                />
                <span style={{
                  fontSize: "0.95rem",
                  fontWeight: 600,
                  color: discount > 0 ? "var(--accent)" : "var(--text-secondary)",
                  userSelect: "none",
                  marginLeft: 2,
                }}>%</span>
              </div>
            </div>

            <div style={{ width: "100%", height: 1, background: "var(--border-default)" }} />

            <div style={{ display: "flex", flexDirection: "column", gap: "0.35rem", width: "100%" }}>
              {discount > 0 && (
                <div style={{
                  display: "flex",
                  justifyContent: "space-between",
                  fontSize: "0.85rem",
                  color: "var(--text-secondary)",
                }}>
                  <span>Subtotal</span>
                  <span style={{ fontFamily: "var(--font-mono)" }}>${subtotalCarro.toLocaleString()}</span>
                </div>
              )}
              {discount > 0 && (
                <div style={{
                  display: "flex",
                  justifyContent: "space-between",
                  fontSize: "0.85rem",
                  color: "var(--danger)",
                }}>
                  <span>Descuento ({discount}%)</span>
                  <span style={{ fontFamily: "var(--font-mono)" }}>-${(subtotalCarro - totalConDescuento).toLocaleString()}</span>
                </div>
              )}
              <div style={{
                display: "flex",
                justifyContent: "space-between",
                fontSize: "0.9rem",
                color: "var(--text-secondary)",
              }}>
                <span>Neto</span>
                <span style={{ fontFamily: "var(--font-mono)" }}>${netoFromBruto(totalConDescuento).toLocaleString()}</span>
              </div>
            </div>

            <div style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "baseline",
              width: "100%",
              paddingTop: "0.6rem",
              borderTop: `2px solid ${discount > 0 ? "var(--accent)" : "var(--border-default)"}`,
            }}>
              <span style={{ fontSize: "1.05rem", fontWeight: 600, color: "var(--text-primary)" }}>Total</span>
              <span style={{
                fontFamily: "var(--font-mono)",
                fontSize: "2.1rem",
                fontWeight: 800,
                color: discount > 0 ? "var(--accent)" : "var(--text-primary)",
                letterSpacing: "-0.02em",
              }}>
                ${totalConDescuento.toLocaleString()}
              </span>
            </div>
          </div>
        </div>
        <div className="btn-group">
          <button className="btn btn-success" disabled={!carro.length} onClick={() => setShowConfirmVenta(true)}>
            Confirmar venta
          </button>
          <button className="btn btn-outline" disabled={!carro.length} onClick={() => guardar("CO")}>
            Generar cotización
          </button>
        </div>
      </PageCard>

      {showConfirmVenta && (
        <div className="modal" role="dialog" aria-modal="true">
          <div className="modal-dialog modal-lg">
            <div className="modal-content">
              <div className="modal-header">
                <h5 className="modal-title">Confirmar venta</h5>
                <button type="button" className="modal-close" onClick={() => setShowConfirmVenta(false)}>
                  &times;
                </button>
              </div>
              <div className="modal-body">
                <p className="mb-3 text-secondary">Revise el detalle antes de confirmar:</p>
                <div className="table-responsive">
                  <table className="table table-sm table-bordered">
                    <thead>
                      <tr><th>Código</th><th>OEM</th><th>Nombre</th><th>Cantidad</th><th>Subtotal neto</th><th>Subtotal</th></tr>
                    </thead>
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
                <div style={{ display: "flex", justifyContent: "flex-end", marginTop: "1rem" }}>
                  <div style={{
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "stretch",
                    gap: "0.5rem",
                    background: "var(--bg-elevated)",
                    border: "1px solid var(--border-default)",
                    borderRadius: "var(--radius-lg)",
                    padding: "1rem 1.25rem",
                    minWidth: 260,
                    boxShadow: "var(--shadow)",
                  }}>
                    {discount > 0 && (
                      <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.85rem", color: "var(--text-secondary)" }}>
                        <span>Subtotal</span>
                        <span style={{ fontFamily: "var(--font-mono)" }}>${subtotalCarro.toLocaleString()}</span>
                      </div>
                    )}
                    {discount > 0 && (
                      <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.85rem", color: "var(--danger)" }}>
                        <span>Descuento ({discount}%)</span>
                        <span style={{ fontFamily: "var(--font-mono)" }}>-${(subtotalCarro - totalConDescuento).toLocaleString()}</span>
                      </div>
                    )}
                    <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.85rem", color: "var(--text-secondary)" }}>
                      <span>Neto</span>
                      <span style={{ fontFamily: "var(--font-mono)" }}>${netoFromBruto(totalConDescuento).toLocaleString()}</span>
                    </div>
                    <div style={{
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "baseline",
                      width: "100%",
                      paddingTop: "0.5rem",
                      borderTop: `2px solid ${discount > 0 ? "var(--accent)" : "var(--border-default)"}`,
                    }}>
                      <span style={{ fontSize: "0.95rem", fontWeight: 600, color: "var(--text-primary)" }}>Total</span>
                      <span style={{
                        fontFamily: "var(--font-mono)",
                        fontSize: "1.7rem",
                        fontWeight: 800,
                        color: discount > 0 ? "var(--accent)" : "var(--text-primary)",
                        letterSpacing: "-0.02em",
                      }}>
                        ${totalConDescuento.toLocaleString()}
                      </span>
                    </div>
                  </div>
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
        <div className="modal" role="dialog" aria-modal="true">
          <div className="modal-dialog modal-lg">
            <div className="modal-content">
              <div className="modal-header">
                <h5 className="modal-title">{lastDocumento.tipo_documento === "CO" ? "Cotización" : "Comprobante de venta"}</h5>
                <button type="button" className="modal-close" onClick={cerrarComprobante}>
                  &times;
                </button>
              </div>
              <div className="modal-body">
                <div className="receipt-preview">
                  <h6 className="text-center mb-1" style={{ color: "#1a1a1a", fontFamily: "var(--font-mono)" }}>
                    {lastDocumento.tienda}
                  </h6>
                  <div className="text-center mb-2" style={{ color: "#1a1a1a" }}>
                    {lastDocumento.tipo_documento === "CO" ? "COTIZACION" : "COMPROBANTE DE VENTA"}
                  </div>
                  <div className="mb-2 text-center" style={{ color: "#666", fontSize: "0.75rem" }}>#{lastDocumento.ventaId}</div>
                  <div className="mb-2 text-center" style={{ color: "#666", fontSize: "0.75rem" }}>{lastDocumento.fecha}</div>
                  <hr />
                  {lastDocumento.items.map((item) => (
                    <div key={`${item.producto_id}-${item.cantidad}`} className="flex justify-between" style={{ color: "#333" }}>
                      <span>{item.cantidad} x {item.codigo_producto} - {item.nombre}</span>
                      <span>${item.subtotal}</span>
                    </div>
                  ))}
                  <hr />
                  <div className="flex justify-between" style={{ color: "#333" }}><span>Subtotal</span><span>${lastDocumento.subtotal_original}</span></div>
                  {lastDocumento.descuento_porcentaje > 0 && (
                    <div className="flex justify-between" style={{ color: "var(--danger)" }}>
                      <span>Descuento ({lastDocumento.descuento_porcentaje}%)</span>
                      <span>-${lastDocumento.subtotal_original - lastDocumento.total}</span>
                    </div>
                  )}
                  <div className="flex justify-between" style={{ color: "#333" }}><span>Neto</span><span>${lastDocumento.total_neto}</span></div>
                  <div className="flex justify-between" style={{ color: "#333" }}><span>Impuesto</span><span>${lastDocumento.impuesto}</span></div>
                  <div className="flex justify-between font-bold" style={{ color: "#1a1a1a" }}><span>Total</span><span>${lastDocumento.total}</span></div>
                  <div className="text-center mt-2" style={{ color: "#999", fontSize: "0.7rem" }}>Documento carece de validez legal</div>
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
        <div className="modal" role="dialog" aria-modal="true">
          <div className="modal-dialog modal-lg">
            <div className="modal-content">
              <div className="modal-header">
                <h5 className="modal-title">Seleccionar ubicación de descuento</h5>
                <button type="button" className="modal-close" onClick={() => setShowUbicacionDialog(false)}>
                  &times;
                </button>
              </div>
              <div className="modal-body">
                <p className="mb-3 text-secondary">Los siguientes productos tienen stock en múltiples ubicaciones. Seleccione de cuál descontar:</p>
                <div className="table-responsive">
                  <table className="table table-sm table-bordered">
                    <thead>
                      <tr><th>Producto</th><th>Cantidad vendida</th><th>Ubicación</th></tr>
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
        <div className="modal" role="dialog" aria-modal="true">
          <div className="modal-dialog" style={{ maxWidth: 420 }}>
            <div className="modal-content">
              <div className="modal-body text-center py-5">
                <div className="text-success mb-3" style={{ fontSize: 36, lineHeight: 1 }}>&#10003;</div>
                <h5 className="mb-0">
                  {lastDocumento?.tipo_documento === "CO" ? "Cotización generada con éxito" : "Venta registrada con éxito"}
                </h5>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
