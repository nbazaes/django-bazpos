import { useCallback, useEffect, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import PageCard from "../components/PageCard";
import { usePageTitle } from "../lib/usePageTitle";
import { apiRequest } from "../lib/api";
import { getTaxPercent } from "../lib/tax";
import { getStoreName } from "../lib/storeName";
import { getStoreConfig, fetchStoreConfig } from "../lib/store";
import { useDebounce } from "../lib/hooks";
import { getUser, isGerente } from "../lib/auth";
import StepperInput from "../components/StepperInput";
import QuickStockModal from "../components/QuickStockModal";
import QuickPrecioCostoModal from "../components/QuickPrecioCostoModal";

const VENTA_STORAGE_KEY = "bazpos_venta_pending";

function readStoredVenta() {
  try {
    const saved = localStorage.getItem(VENTA_STORAGE_KEY);
    if (saved) {
      const parsed = JSON.parse(saved);
      return {
        carro: Array.isArray(parsed.carro) ? parsed.carro : [],
        descuentoPorcentaje: parsed.descuentoPorcentaje != null ? parsed.descuentoPorcentaje : 0,
        oem: parsed.oem || "",
      };
    }
  } catch {
    localStorage.removeItem(VENTA_STORAGE_KEY);
  }
  return { carro: [], descuentoPorcentaje: 0, oem: "" };
}

function roundTotal(amount) {
  const remainder = amount % 1000;
  if (remainder >= 900) return (Math.floor(amount / 1000) + 1) * 1000;
  return Math.floor(amount / 1000) * 1000;
}

export default function VentaPage() {
  usePageTitle("Realizar venta");
  const [oem, setOem] = useState(() => readStoredVenta().oem);
  const [codigoBarra, setCodigoBarra] = useState("");
  const [barraFeedback, setBarraFeedback] = useState("");
  const [productosEncontrados, setProductosEncontrados] = useState([]);
  const [hayMasProductos, setHayMasProductos] = useState(false);
  const [carro, setCarro] = useState(() => readStoredVenta().carro);
  const [error, setError] = useState("");
  const [showConfirmVenta, setShowConfirmVenta] = useState(false);
  const [confirmMode, setConfirmMode] = useState("VE");
  const [clienteNombre, setClienteNombre] = useState("");
  const [ocultarTotales, setOcultarTotales] = useState(false);
  const [medioPago, setMedioPago] = useState("");
  const [documentoFiscal, setDocumentoFiscal] = useState("");
  const [esMixto, setEsMixto] = useState(false);
  const [pagosMixtos, setPagosMixtos] = useState({ EF: 0, TJ: 0, TR: 0, CH: 0 });
  const [showVentaSuccess, setShowVentaSuccess] = useState(false);
  const [showPreview, setShowPreview] = useState(false);
  const [lastDocumento, setLastDocumento] = useState(null);
  const [showUbicacionDialog, setShowUbicacionDialog] = useState(false);
  const [ubicacionItems, setUbicacionItems] = useState([]);
  const [selectedUbicaciones, setSelectedUbicaciones] = useState({});
  const [ubicacionError, setUbicacionError] = useState("");
  const [ubicacionMixto, setUbicacionMixto] = useState(false);
  const [cantidadesUbicacion, setCantidadesUbicacion] = useState({});
  const [descuentoPorcentaje, setDescuentoPorcentaje] = useState(() => readStoredVenta().descuentoPorcentaje);
  const barraRef = useRef(null);
  const processingRef = useRef(false);
  const savingRef = useRef(false);
  const [isSaving, setIsSaving] = useState(false);
  const deducirRef = useRef(false);
  const [isDeducing, setIsDeducing] = useState(false);
  const [mostrarSinStock, setMostrarSinStock] = useState(false);
  const [quickStockProducto, setQuickStockProducto] = useState(null);
  const [quickPrecioCostoProducto, setQuickPrecioCostoProducto] = useState(null);
  const [preciosModificados, setPreciosModificados] = useState({});
  const oemRequestRef = useRef(0);
  const taxPercent = getTaxPercent();
  const esGerente = isGerente(getUser());

  useEffect(() => {
    fetchStoreConfig();
  }, []);
  const factor = 1 + taxPercent / 100;
  const netoFromBruto = (monto) => Math.round(Number(monto || 0) / factor);
  const subtotalCarro = carro.reduce((sum, item) => sum + item.precio * item.cantidad, 0);
  const discount = descuentoPorcentaje > 0 ? descuentoPorcentaje : 0;
  const discountedTotal = Math.round(subtotalCarro * (1 - discount / 100));
  const totalConDescuento = discount > 0 ? roundTotal(discountedTotal) : subtotalCarro;

  const [searchParams, setSearchParams] = useSearchParams();
  const cotizacionParam = searchParams.get("cotizacion");
  const cotizacionOrigenId = cotizacionParam ? parseInt(cotizacionParam) : null;

  const totalPagosMixtos = Object.values(pagosMixtos).reduce((a, b) => a + (Number(b) || 0), 0);
  const diferenciaPagos = totalConDescuento - totalPagosMixtos;
  const pagosValidos = !esMixto || diferenciaPagos === 0;
  const medioPagoResuelto = esMixto || medioPago !== "";
  const documentoResuelto = documentoFiscal !== "";
  const conflictoSeleccion = confirmMode === "VE" && (!medioPagoResuelto || !documentoResuelto);

  const sumaUbicaciones = (productoId) =>
    Object.values(cantidadesUbicacion[productoId] || {}).reduce((a, b) => a + (Number(b) || 0), 0);
  const mixtoUbicacionesValido = !ubicacionMixto || ubicacionItems.every((item) => {
    const suma = sumaUbicaciones(item.producto_id);
    if (suma !== item.cantidad_vendida) return false;
    const cants = cantidadesUbicacion[item.producto_id] || {};
    return item.ubicaciones.every((u) => (Number(cants[u.id]) || 0) <= u.stock);
  });

  useEffect(() => {
    if (!cotizacionOrigenId) return;
    let cancelled = false;

    (async () => {
      try {
        const cot = await apiRequest(`/ventas/${cotizacionOrigenId}/`);
        if (cancelled) return;
        const items = (cot.detalles || []).map((d) => ({
          producto_id: d.producto,
          codigo_producto: d.codigo_producto,
          oem: d.producto_oem || "",
          nombre: d.producto_nombre,
          marca: d.producto_marca || "",
          precio: d.precio_descontado > 0 ? d.precio_descontado : d.precio_unitario,
          cantidad: d.cantidad,
          stock_actual: 99999,
        }));
        if (items.length > 0) {
          setCarro(items);
        }
      } catch (err) {
        setError("No se pudo cargar la cotización: " + (err.message || "error desconocido"));
      }
    })();

    return () => { cancelled = true; };
  }, [cotizacionOrigenId]);

  useEffect(() => {
    if (carro.length > 0 || descuentoPorcentaje > 0 || oem) {
      localStorage.setItem(VENTA_STORAGE_KEY, JSON.stringify({
        carro,
        descuentoPorcentaje,
        oem,
      }));
    } else {
      localStorage.removeItem(VENTA_STORAGE_KEY);
    }
  }, [carro, descuentoPorcentaje, oem]);

  const buscarProducto = useCallback(async (texto) => {
    if (!texto.trim()) {
      setProductosEncontrados([]);
      setHayMasProductos(false);
      setError("");
      return;
    }
    const requestId = ++oemRequestRef.current;
    try {
      const result = await apiRequest(`/productos/?texto=${encodeURIComponent(texto)}&sin_stock=${mostrarSinStock}`);
      if (requestId !== oemRequestRef.current) return;
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
      if (requestId !== oemRequestRef.current) return;
      setError(err.message);
      setProductosEncontrados([]);
      setHayMasProductos(false);
    }
  }, [mostrarSinStock]);

  const debouncedOem = useDebounce(oem.trim());

  useEffect(() => {
    let cancelled = false;
    Promise.resolve().then(() => {
      if (!cancelled) buscarProducto(debouncedOem);
    });
    return () => { cancelled = true; };
  }, [debouncedOem, buscarProducto]);

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
            marca: p.marca || "",
            precio: preciosModificados[p.producto_id]?.precio ?? p.precio,
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
        marca: producto.marca || "",
        precio: preciosModificados[producto.producto_id]?.precio ?? producto.precio,
        cantidad: 1,
        stock_actual: producto.stock_actual,
      },
    ]);
    setError("");
  }

  function buildDocumento(tipoDocumento) {
    const ahora = new Date();
    const total = totalConDescuento;
    const config = getStoreConfig();
    return {
      tienda: getStoreName(),
      telefono: config.telefono,
      direccion: config.direccion,
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
      ocultarTotales: tipoDocumento === "CO" && ocultarTotales,
    };
  }

  function imprimirDocumento(documento) {
    const win = window.open("", "_blank", "width=800,height=600");
    if (!win) return;

    const esCotizacion = documento.tipo_documento === "CO";

    const rows = documento.items.map((item) => {
      const label = esCotizacion
        ? `${item.cantidad} x ${item.marca ? item.marca + " - " : ""}${item.nombre}`
        : `${item.cantidad} x ${item.codigo_producto} - ${item.marca ? item.marca + " - " : ""}${item.nombre}`;
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
            .address { text-align: center; font-size: 0.7rem; color: #666; margin: 0 0 4px; }
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
          ${documento.direccion ? `<p class="address">${documento.direccion}</p>` : ""}
          ${documento.telefono ? `<p class="address">${documento.telefono}</p>` : ""}
          <p class="subtitle">${esCotizacion ? "COTIZACION" : "COMPROBANTE DE VENTA"}</p>
          <p class="doc-number">#${documento.ventaId}</p>
          <p class="date">${documento.fecha}</p>
          <hr />
          ${rows}
          ${documento.ocultarTotales ? "" : `
          <hr />
          <div class="totals-row"><span>Subtotal</span><span>$${documento.subtotal_original}</span></div>
          ${documento.descuento_porcentaje > 0 ? `<div class="totals-row"><span>Descuento (${documento.descuento_porcentaje}%)</span><span>-$${documento.subtotal_original - documento.total}</span></div>` : ""}
          <div class="totals-row"><span>Neto</span><span>$${documento.total_neto}</span></div>
          <div class="totals-row"><span>Impuesto</span><span>$${documento.impuesto}</span></div>
          <div class="totals-row"><span class="bold">Total</span><span class="bold">$${documento.total}</span></div>
          `}
          ${esCotizacion ? `<p class="disclaimer">Cotización válida hasta agotar stock</p>` : ""}
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
        setUbicacionError("");
        setUbicacionMixto(false);
        setCantidadesUbicacion({});
        setShowUbicacionDialog(true);
      }
    } catch (err) {
      console.error("Error checking ubicaciones:", err);
    }
  }

  function handleToggleUbicacionMixto(e) {
    const checked = e.target.checked;
    setUbicacionMixto(checked);
    if (checked) {
      const seed = {};
      ubicacionItems.forEach((item) => {
        const sel = selectedUbicaciones[item.producto_id];
        seed[item.producto_id] = {};
        item.ubicaciones.forEach((u) => {
          seed[item.producto_id][u.id] = u.id === sel ? item.cantidad_vendida : 0;
        });
      });
      setCantidadesUbicacion(seed);
    }
    setUbicacionError("");
  }

  async function handleDeducirStock() {
    if (!lastDocumento || deducirRef.current) return;
    deducirRef.current = true;
    setIsDeducing(true);
    try {
      const deducciones = ubicacionItems.flatMap((item) => {
        if (ubicacionMixto) {
          const cants = cantidadesUbicacion[item.producto_id] || {};
          return item.ubicaciones
            .filter((u) => Number(cants[u.id]) > 0)
            .map((u) => ({
              producto_id: item.producto_id,
              ubicacion_id: u.id,
              cantidad: Number(cants[u.id]),
            }));
        }
        return [{
          producto_id: item.producto_id,
          ubicacion_id: selectedUbicaciones[item.producto_id],
          cantidad: item.cantidad_vendida,
        }];
      });
      await apiRequest(`/ventas/${lastDocumento.ventaId}/deducir-stock/`, {
        method: "POST",
        body: { deducciones },
      });
      setShowUbicacionDialog(false);
    } catch (err) {
      setUbicacionError(err.message);
    } finally {
      deducirRef.current = false;
      setIsDeducing(false);
    }
  }

  function limpiarVenta() {
    setCarro([]);
    setDescuentoPorcentaje(0);
    setOem("");
    setProductosEncontrados([]);
    setHayMasProductos(false);
    setError("");
    setCodigoBarra("");
    localStorage.removeItem(VENTA_STORAGE_KEY);
    if (cotizacionOrigenId) {
      setSearchParams((prev) => { prev.delete("cotizacion"); return prev; }, { replace: true });
    }
  }

  async function guardar(tipoDocumento = "VE") {
    if (savingRef.current) return;
    savingRef.current = true;
    setIsSaving(true);
    try {
      const subtotal = subtotalCarro;
      const discounted = Math.round(subtotal * (1 - discount / 100));
      const total = discount > 0 ? roundTotal(discounted) : subtotal;
      await apiRequest("/ventas/validar-stock/", { method: "POST", body: { productos: carro } });
      const pagos = esMixto
        ? Object.entries(pagosMixtos)
            .filter(([, monto]) => Number(monto) > 0)
            .map(([metodo_pago, monto]) => ({ metodo_pago, monto: Number(monto) }))
        : [{ metodo_pago: medioPago, monto: total }];
      const result = await apiRequest("/ventas/", {
        method: "POST",
        body: {
          total,
          descuento_porcentaje: discount,
          monto_subtotal: subtotal,
          tipo_documento: tipoDocumento,
          productos: carro.map((item) => ({ producto_id: item.producto_id, cantidad: item.cantidad, precio: item.precio * item.cantidad })),
          ...(tipoDocumento === "VE" ? { pagos, documento: documentoFiscal } : {}),
          ...(clienteNombre.trim() ? { cliente_nombre: clienteNombre.trim() } : {}),
          ...(cotizacionOrigenId && tipoDocumento === "VE" ? { venta_origen: cotizacionOrigenId } : {}),
        },
      });
      await fetchStoreConfig();
      const documento = buildDocumento(tipoDocumento);
      setLastDocumento({ ...documento, ventaId: result.id, estado: result.estado_display, tipoDisplay: result.tipo_documento_display });
      setCarro([]);
      setDescuentoPorcentaje(0);
      setOem("");
      setProductosEncontrados([]);
      setHayMasProductos(false);
      localStorage.removeItem(VENTA_STORAGE_KEY);
      setShowConfirmVenta(false);
      setClienteNombre("");
      setOcultarTotales(false);
      setMedioPago("");
      setDocumentoFiscal("");
      setEsMixto(false);
      setPagosMixtos({ EF: 0, TJ: 0, TR: 0, CH: 0 });
      setShowPreview(true);
      setShowVentaSuccess(true);
      if (cotizacionOrigenId) {
        setSearchParams((prev) => { prev.delete("cotizacion"); return prev; }, { replace: true });
      }
      setTimeout(() => setShowVentaSuccess(false), 1300);
    } catch (err) {
      setError(err.message);
    } finally {
      savingRef.current = false;
      setIsSaving(false);
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
      {error && (
        <div className="alert alert-danger" style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <span>{error}</span>
          <button className="btn btn-sm btn-outline" onClick={() => setError("")} style={{ border: "none", fontSize: "1.2rem", lineHeight: 1, padding: "0 0.25rem" }}>
            ×
          </button>
        </div>
      )}
      {cotizacionOrigenId && (
        <div className="alert alert-info" style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <span>Convirtiendo cotización <strong>#{cotizacionOrigenId}</strong> a venta — los productos se han cargado en el carrito.</span>
          <button className="btn btn-sm btn-outline" onClick={() => {
            setSearchParams((prev) => { prev.delete("cotizacion"); return prev; }, { replace: true });
            setCarro([]);
          }}>Cancelar</button>
        </div>
      )}
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
            <div style={{ position: "relative" }}>
              <input
                className="form-control"
                placeholder="Ingrese código OEM"
                value={oem}
                onChange={(e) => setOem(e.target.value)}
                style={{ paddingRight: "2rem" }}
              />
              {oem && (
                <button
                  type="button"
                  className="btn btn-sm"
                  onClick={() => { setOem(""); setProductosEncontrados([]); setHayMasProductos(false); setError(""); }}
                  style={{
                    position: "absolute",
                    right: 4,
                    top: "50%",
                    transform: "translateY(-50%)",
                    background: "none",
                    border: "none",
                    fontSize: "1.1rem",
                    lineHeight: 1,
                    padding: "0.15rem 0.4rem",
                    color: "var(--text-muted)",
                    cursor: "pointer",
                  }}
                  title="Limpiar búsqueda"
                >
                  &times;
                </button>
              )}
            </div>
          </div>
          <div className="col-md-3" style={{ display: "flex", alignItems: "flex-end" }}>
            <button className="btn btn-primary" onClick={() => buscarProducto(oem)}>Buscar</button>
          </div>
        </div>
        <div className="mt-2">
          <label className="checkbox-custom">
            <input
              type="checkbox"
              checked={mostrarSinStock}
              onChange={(e) => setMostrarSinStock(e.target.checked)}
            />
            <span className="checkbox-custom__mark" />
            <span className="checkbox-custom__label">Buscar productos sin stock</span>
          </label>
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
                    <th style={{ width: "1px" }}>Última fecha de llegada</th>
                    <th style={{ width: "1px" }}>Precio</th>
                    {esGerente && <th style={{ width: "1px" }}>Precio costo</th>}
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
                        {esGerente ? (
                          <button
                            className="btn btn-link p-0 stock-clickable"
                            onClick={() => setQuickStockProducto(p)}
                            style={{ textDecoration: "none" }}
                          >
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
                          </button>
                        ) : (
                          <>
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
                          </>
                        )}
                      </td>
                      <td className="text-nowrap">{p.ultima_fecha_llegada || "—"}</td>
                      <td>
                        {preciosModificados[p.producto_id] ? (
                          <span
                            style={{ color: "var(--accent)", fontWeight: 700 }}
                            title="Precio modificado temporalmente"
                          >
                            ${preciosModificados[p.producto_id].precio}
                          </span>
                        ) : (
                          <>${p.precio}</>
                        )}
                        {preciosModificados[p.producto_id] && (
                          <span style={{ color: "var(--accent)", fontWeight: 700, fontSize: "0.8rem" }}>*</span>
                        )}
                      </td>
                      {esGerente && (
                        <td>
                          <button
                            className="btn btn-link p-0"
                            onClick={() => setQuickPrecioCostoProducto(p)}
                            style={{ textDecoration: "none" }}
                          >
                            {preciosModificados[p.producto_id] ? (
                              <span style={{ color: "var(--accent)", fontWeight: 700 }}>
                                ${preciosModificados[p.producto_id].precioCosto}
                              </span>
                            ) : (
                              <>${p.precio_costo != null ? p.precio_costo : "—"}</>
                            )}
                          </button>
                        </td>
                      )}
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
                <th style={{ width: "1px" }}>Marca</th>
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
                  <td className="text-nowrap">{i.marca}</td>
                  <td>
                    <StepperInput
                      value={i.cantidad}
                      onChange={(val) => {
                        setCarro((prev) => {
                          const idx = prev.findIndex((x) => x.producto_id === i.producto_id);
                          if (idx === -1 || prev[idx].cantidad === val) return prev;
                          const next = [...prev];
                          next[idx] = { ...next[idx], cantidad: val };
                          return next;
                        });
                        setError("");
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
            width: "100%",
            maxWidth: 400,
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
          <button className="btn btn-success" disabled={!carro.length} onClick={() => { setConfirmMode("VE"); setClienteNombre(""); setMedioPago(""); setDocumentoFiscal(""); setEsMixto(false); setPagosMixtos({ EF: 0, TJ: 0, TR: 0, CH: 0 }); setShowConfirmVenta(true); }}>
            Confirmar venta
          </button>
          <button className="btn btn-outline" disabled={!carro.length} onClick={() => { setConfirmMode("CO"); setClienteNombre(""); setShowConfirmVenta(true); }}>
            Generar cotización
          </button>
          <button className="btn btn-danger" disabled={!carro.length && !oem} onClick={limpiarVenta}>
            Limpiar venta
          </button>
        </div>
      </PageCard>

      {showConfirmVenta && (
        <div className="modal" role="dialog" aria-modal="true">
          <div className="modal-dialog modal-lg">
            <div className="modal-content">
              <div className="modal-header">
                <h5 className="modal-title">{confirmMode === "CO" ? "Generar cotización" : "Confirmar venta"}</h5>
                <button type="button" className="modal-close" onClick={() => { setShowConfirmVenta(false); setOcultarTotales(false); setEsMixto(false); setPagosMixtos({ EF: 0, TJ: 0, TR: 0, CH: 0 }); }}>
                  &times;
                </button>
              </div>
              <div className="modal-body">
                {confirmMode === "CO" && (
                  <div className="form-group mb-3">
                    <label className="font-weight-bold">Nombre del cliente:</label>
                    <input
                      type="text"
                      className="form-control"
                      placeholder="Ingrese el nombre del cliente (opcional)"
                      value={clienteNombre}
                      onChange={(e) => setClienteNombre(e.target.value)}
                    />
                    <label className="checkbox-custom mt-2" style={{ cursor: "pointer" }}>
                      <input
                        type="checkbox"
                        checked={ocultarTotales}
                        onChange={(e) => setOcultarTotales(e.target.checked)}
                      />
                      <span className="checkbox-custom__mark" />
                      <span className="checkbox-custom__label">Ocultar totales en la cotización</span>
                    </label>
                  </div>
                )}
                {confirmMode === "VE" && (
                  <div className="row mb-3">
                    <div className="col-md-6">
                      <label className="font-weight-bold">Documento:</label>
                      <select
                        className="form-control"
                        value={documentoFiscal}
                        onChange={(e) => setDocumentoFiscal(e.target.value)}
                      >
                        <option value="">Seleccione documento...</option>
                        <option value="BO">Boleta</option>
                        <option value="FA">Factura</option>
                        <option value="OT">Otros</option>
                      </select>
                    </div>
                    <div className="col-md-6">
                      <label className="font-weight-bold">Medio de pago:</label>
                      <select
                        className="form-control"
                        value={medioPago}
                        onChange={(e) => setMedioPago(e.target.value)}
                        disabled={esMixto}
                      >
                        <option value="">Seleccione medio de pago...</option>
                        <option value="EF">Efectivo</option>
                        <option value="TJ">Tarjeta</option>
                        <option value="TR">Transferencia</option>
                        <option value="CH">Cheque</option>
                      </select>
                    </div>
                  </div>
                )}
                {conflictoSeleccion && (
                  <div className="alert alert-warning">
                    Debe resolver el conflicto: seleccione el documento y el medio de pago para poder confirmar la venta.
                  </div>
                )}
                {confirmMode === "VE" && (
                  <div className="form-group mb-3">
                    <label className="checkbox-custom" style={{ cursor: "pointer" }}>
                      <input
                        type="checkbox"
                        checked={esMixto}
                        onChange={(e) => setEsMixto(e.target.checked)}
                      />
                      <span className="checkbox-custom__mark" />
                      <span className="checkbox-custom__label">Mixto (pagar con varios medios)</span>
                    </label>
                  </div>
                )}
                {confirmMode === "VE" && esMixto && (
                  <div className="row mb-3">
                    {[
                      ["EF", "Efectivo"],
                      ["TJ", "Tarjeta"],
                      ["TR", "Transferencia"],
                      ["CH", "Cheque"],
                    ].map(([code, label]) => (
                      <div className="col-md-3" key={code}>
                        <label className="font-weight-bold">{label}:</label>
                        <input
                          type="number"
                          className="form-control"
                          min={0}
                          step={1000}
                          value={pagosMixtos[code]}
                          onChange={(e) =>
                            setPagosMixtos((prev) => ({
                              ...prev,
                              [code]: e.target.value === "" ? 0 : Number(e.target.value),
                            }))
                          }
                        />
                      </div>
                    ))}
                    <div className="col-12 mt-2">
                      {diferenciaPagos === 0 ? (
                        <div className="text-success">
                          Suma de pagos: ${totalPagosMixtos.toLocaleString()} — coincide con el total.
                        </div>
                      ) : (
                        <div className="text-danger">
                          Suma de pagos: ${totalPagosMixtos.toLocaleString()} —{" "}
                          {diferenciaPagos > 0 ? "faltan" : "sobran"} ${Math.abs(diferenciaPagos).toLocaleString()}.
                        </div>
                      )}
                    </div>
                  </div>
                )}
                <p className="mb-3 text-secondary">Revise el detalle antes de confirmar:</p>
                <div className="table-responsive">
                  <table className="table table-sm table-bordered">
                    <thead>
                      <tr><th>Código</th><th>OEM</th><th>Nombre</th><th>Marca</th><th>Cantidad</th><th>Subtotal neto</th><th>Subtotal</th></tr>
                    </thead>
                    <tbody>
                      {carro.map((i) => (
                        <tr key={`confirm-${i.producto_id}`}>
                          <td>{i.codigo_producto}</td>
                          <td>{i.oem}</td>
                          <td>{i.nombre}</td>
                          <td>{i.marca}</td>
                          <td>{i.cantidad}</td>
                          <td>${netoFromBruto(i.precio * i.cantidad)}</td>
                          <td>${i.precio * i.cantidad}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {!(confirmMode === "CO" && ocultarTotales) && (
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
                    width: "100%",
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
                )}
              </div>
              <div className="modal-footer">
                <button type="button" className="btn btn-secondary" onClick={() => { setShowConfirmVenta(false); setOcultarTotales(false); setEsMixto(false); setPagosMixtos({ EF: 0, TJ: 0, TR: 0, CH: 0 }); }}>Cancelar</button>
                <button type="button" className={`btn ${confirmMode === "CO" ? "btn-outline" : "btn-success"}`} onClick={() => guardar(confirmMode)} disabled={isSaving || (confirmMode === "VE" && !pagosValidos) || conflictoSeleccion}>
                  {isSaving ? "Guardando..." : confirmMode === "CO" ? "Generar cotización" : "Confirmar y guardar"}
                </button>
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
                  {lastDocumento.direccion && (
                    <div className="text-center" style={{ color: "#666", fontSize: "0.7rem" }}>{lastDocumento.direccion}</div>
                  )}
                  {lastDocumento.telefono && (
                    <div className="text-center mb-2" style={{ color: "#666", fontSize: "0.7rem" }}>{lastDocumento.telefono}</div>
                  )}
                  <div className="text-center mb-2" style={{ color: "#1a1a1a" }}>
                    {lastDocumento.tipo_documento === "CO" ? "COTIZACION" : "COMPROBANTE DE VENTA"}
                  </div>
                  <div className="mb-2 text-center" style={{ color: "#666", fontSize: "0.75rem" }}>#{lastDocumento.ventaId}</div>
                  <div className="mb-2 text-center" style={{ color: "#666", fontSize: "0.75rem" }}>{lastDocumento.fecha}</div>
                  <hr />
                  {lastDocumento.items.map((item) => (
                    <div key={`${item.producto_id}-${item.cantidad}`} className="flex justify-between" style={{ color: "#333" }}>
                      <span>{item.cantidad} x {item.codigo_producto} - {item.marca ? item.marca + " - " : ""}{item.nombre}</span>
                      <span>${item.subtotal}</span>
                    </div>
                  ))}
                  {!lastDocumento.ocultarTotales && (
                  <>
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
                  </>
                  )}
                  {lastDocumento.tipo_documento === "CO" && (
                    <div className="text-center mt-2" style={{ color: "#999", fontSize: "0.7rem" }}>Cotización válida hasta agotar stock</div>
                  )}
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
              </div>
              <div className="modal-body">
                <p className="mb-3 text-secondary">Los siguientes productos tienen stock en múltiples ubicaciones. Seleccione de cuál descontar:</p>
                {ubicacionError && <div className="alert alert-danger">{ubicacionError}</div>}
                <label className="checkbox-custom mb-3" style={{ cursor: "pointer" }}>
                  <input
                    type="checkbox"
                    checked={ubicacionMixto}
                    onChange={handleToggleUbicacionMixto}
                  />
                  <span className="checkbox-custom__mark" />
                  <span className="checkbox-custom__label">Mixto (repartir la cantidad entre varias ubicaciones)</span>
                </label>
                <div className="table-responsive">
                  <table className="table table-sm table-bordered">
                    <thead>
                      <tr><th>Producto</th><th>Cantidad vendida</th><th>{ubicacionMixto ? "Reparto por ubicación" : "Ubicación"}</th></tr>
                    </thead>
                    <tbody>
                      {ubicacionItems.map((item) => (
                        <tr key={item.producto_id}>
                          <td>{item.codigo_producto} - {item.nombre}</td>
                          <td>{item.cantidad_vendida}</td>
                          <td>
                            {ubicacionMixto ? (
                              <>
                                {item.ubicaciones.map((u) => (
                                  <div key={u.id} className="d-flex align-items-center mb-2">
                                    <span className="mr-2 text-nowrap" style={{ width: 150 }}>{u.nombre} (máx {u.stock}):</span>
                                    <input
                                      type="number"
                                      className="form-control form-control-sm"
                                      style={{ width: 100 }}
                                      min={0}
                                      max={Math.min(u.stock, item.cantidad_vendida)}
                                      step={1}
                                      value={cantidadesUbicacion[item.producto_id]?.[u.id] ?? 0}
                                      onChange={(e) => {
                                        const val = e.target.value === "" ? 0 : Number(e.target.value);
                                        setCantidadesUbicacion((prev) => ({
                                          ...prev,
                                          [item.producto_id]: { ...(prev[item.producto_id] || {}), [u.id]: val },
                                        }));
                                        setUbicacionError("");
                                      }}
                                    />
                                  </div>
                                ))}
                                {(() => {
                                  const suma = sumaUbicaciones(item.producto_id);
                                  const faltante = item.cantidad_vendida - suma;
                                  if (faltante === 0) {
                                    return <div className="text-success">Suma: {suma} de {item.cantidad_vendida} — correcto</div>;
                                  }
                                  return (
                                    <div className="text-danger">
                                      Suma: {suma} de {item.cantidad_vendida} —{" "}
                                      {faltante > 0 ? `faltan ${faltante}` : `sobran ${Math.abs(faltante)}`}.
                                    </div>
                                  );
                                })()}
                              </>
                            ) : (
                              <select
                                className="form-control form-control-sm"
                                value={selectedUbicaciones[item.producto_id] || ""}
                                onChange={(e) => {
                                  setSelectedUbicaciones({
                                    ...selectedUbicaciones,
                                    [item.producto_id]: e.target.value === "" ? null : Number(e.target.value),
                                  });
                                  setUbicacionError("");
                                }}
                              >
                                {item.ubicaciones.map((u) => (
                                  <option key={u.id} value={u.id}>
                                    {u.nombre} (stock: {u.stock})
                                  </option>
                                ))}
                              </select>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
              <div className="modal-footer">
                <button type="button" className="btn btn-success" onClick={handleDeducirStock} disabled={isDeducing || !mixtoUbicacionesValido}>
                  {isDeducing ? "Deduciendo..." : "Confirmar"}
                </button>
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
      {quickStockProducto && (
        <QuickStockModal
          producto={quickStockProducto}
          onClose={(actualizado) => {
            setQuickStockProducto(null);
            if (actualizado) buscarProducto(debouncedOem);
          }}
        />
      )}
      {quickPrecioCostoProducto && (
        <QuickPrecioCostoModal
          producto={quickPrecioCostoProducto}
          initialPrecioCosto={preciosModificados[quickPrecioCostoProducto.producto_id]?.precioCosto}
          initialMargenUtilidad={preciosModificados[quickPrecioCostoProducto.producto_id]?.margenUtilidad}
          onClose={(result) => {
            setQuickPrecioCostoProducto(null);
            if (result) {
              setPreciosModificados((prev) => ({
                ...prev,
                [quickPrecioCostoProducto.producto_id]: result,
              }));
              if (result.saveProduct) buscarProducto(debouncedOem);
            }
          }}
        />
      )}
    </>
  );
}
