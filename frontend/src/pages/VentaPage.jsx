import { useCallback, useEffect, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { usePageTitle } from "../lib/usePageTitle";
import { apiRequest, ApiError } from "../lib/api";
import { getTaxPercent, getStoreName, getStoreConfig, fetchStoreConfig, roundSaleTotal, formatMoney } from "../lib/storeConfig";
import { useDebounce } from "../lib/hooks";
import { getUser, isGerente } from "../lib/auth";
import StepperInput from "../components/StepperInput";
import QuickStockModal from "../components/QuickStockModal";
import QuickPrecioCostoModal from "../components/QuickPrecioCostoModal";

const VENTA_STORAGE_KEY = "bazpos_venta_pending";
const VISTA_STORAGE_KEY = "bazpos_venta_vista";
const ESPERAS_REINTENTO = [1000, 2000, 4000];

function readStoredVista() {
  try {
    return localStorage.getItem(VISTA_STORAGE_KEY) === "grid" ? "grid" : "table";
  } catch {
    return "table";
  }
}

function readStoredVenta() {
  try {
    const saved = localStorage.getItem(VENTA_STORAGE_KEY);
    if (saved) {
      const parsed = JSON.parse(saved);
      return {
        carro: Array.isArray(parsed.carro) ? parsed.carro : [],
        descuentoPorcentaje: parsed.descuentoPorcentaje != null ? parsed.descuentoPorcentaje : 0,
        oem: parsed.oem || "",
        idempotenciaKey: parsed.idempotenciaKey || null,
      };
    }
  } catch {
    localStorage.removeItem(VENTA_STORAGE_KEY);
  }
  return { carro: [], descuentoPorcentaje: 0, oem: "", idempotenciaKey: null };
}

function generarClaveIdempotencia() {
  if (typeof crypto !== "undefined" && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return `idem-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

const fmtMoney = (n) => formatMoney(n);

export default function VentaPage() {
  usePageTitle("Punto de Venta");
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
  const [pagosMixtos, setPagosMixtos] = useState(() =>
    Object.fromEntries((getStoreConfig().effective_payment_methods || []).map((m) => [m.code, 0]))
  );
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
  const [vistaModo, setVistaModo] = useState(() => readStoredVista());

  function cambiarVistaModo(mode) {
    setVistaModo(mode);
    try {
      localStorage.setItem(VISTA_STORAGE_KEY, mode);
    } catch {
      // La preferencia de vista es opcional
    }
  }

  function cerrarResultados() {
    setProductosEncontrados([]);
    setHayMasProductos(false);
    setError("");
    barraRef.current?.focus();
  }

  const barraRef = useRef(null);
  const processingRef = useRef(false);
  const savingRef = useRef(false);
  const [isSaving, setIsSaving] = useState(false);
  const idempotenciaRef = useRef(readStoredVenta().idempotenciaKey || null);
  const [isOffline, setIsOffline] = useState(() => (typeof navigator !== "undefined" ? !navigator.onLine : false));
  const [retryInfo, setRetryInfo] = useState(null);
  const [pendienteVerificacion, setPendienteVerificacion] = useState(null);
  const [verificando, setVerificando] = useState(false);
  const deducirRef = useRef(false);
  const [isDeducing, setIsDeducing] = useState(false);
  const [mostrarSinStock, setMostrarSinStock] = useState(false);
  const [quickStockProducto, setQuickStockProducto] = useState(null);
  const [quickPrecioCostoProducto, setQuickPrecioCostoProducto] = useState(null);
  const [preciosModificados, setPreciosModificados] = useState({});
  const oemRequestRef = useRef(0);
  const taxPercent = getTaxPercent();
  const ventaConfig = getStoreConfig();
  const paymentMethods = ventaConfig.effective_payment_methods || [];
  const documentTypes = ventaConfig.effective_document_types || [];
  const showPartsFields = ventaConfig.feature_flags?.product_oem_fields === true;
  const searchPlaceholder = ventaConfig.feature_flags?.oem_primary_search === true
    ? "Ingrese código OEM"
    : "Buscar por código o nombre";
  const esGerente = isGerente(getUser());

  useEffect(() => {
    fetchStoreConfig();
  }, []);

  useEffect(() => {
    const irOnline = () => setIsOffline(false);
    const irOffline = () => setIsOffline(true);
    window.addEventListener("online", irOnline);
    window.addEventListener("offline", irOffline);
    return () => {
      window.removeEventListener("online", irOnline);
      window.removeEventListener("offline", irOffline);
    };
  }, []);

  function resetPagosMixtos() {
    return Object.fromEntries((getStoreConfig().effective_payment_methods || []).map((m) => [m.code, 0]));
  }

  const factor = 1 + taxPercent / 100;
  const netoFromBruto = (monto) => Math.round(Number(monto || 0) / factor);
  const subtotalCarro = carro.reduce((sum, item) => sum + item.precio * item.cantidad, 0);
  const discount = descuentoPorcentaje > 0 ? descuentoPorcentaje : 0;
  const discountedTotal = Math.round(subtotalCarro * (1 - discount / 100));
  const totalConDescuento = discount > 0 ? roundSaleTotal(discountedTotal) : subtotalCarro;

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
        idempotenciaKey: idempotenciaRef.current || null,
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
        setError(`No puedes agregar más de ${producto.stock_actual} unidades para ${producto.nombre}`);
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
    idempotenciaRef.current = null;
    localStorage.removeItem(VENTA_STORAGE_KEY);
    if (cotizacionOrigenId) {
      setSearchParams((prev) => { prev.delete("cotizacion"); return prev; }, { replace: true });
    }
  }

  function onVentaRegistrada(result, tipoDocumento) {
    fetchStoreConfig();
    const documento = buildDocumento(tipoDocumento);
    setLastDocumento({ ...documento, ventaId: result.id, estado: result.estado_display, tipoDisplay: result.tipo_documento_display });
    setCarro([]);
    setDescuentoPorcentaje(0);
    setOem("");
    setProductosEncontrados([]);
    setHayMasProductos(false);
    localStorage.removeItem(VENTA_STORAGE_KEY);
    idempotenciaRef.current = null;
    setShowConfirmVenta(false);
    setClienteNombre("");
    setOcultarTotales(false);
    setMedioPago("");
    setDocumentoFiscal("");
    setEsMixto(false);
    setPagosMixtos(resetPagosMixtos());
    setPendienteVerificacion(null);
    setShowPreview(true);
    setShowVentaSuccess(true);
    if (cotizacionOrigenId) {
      setSearchParams((prev) => { prev.delete("cotizacion"); return prev; }, { replace: true });
    }
    setTimeout(() => setShowVentaSuccess(false), 1300);
  }

  async function guardar(tipoDocumento = "VE") {
    if (savingRef.current) return;
    savingRef.current = true;
    setIsSaving(true);
    setRetryInfo(null);
    setPendienteVerificacion(null);
    if (!idempotenciaRef.current) {
      idempotenciaRef.current = generarClaveIdempotencia();
    }
    const clave = idempotenciaRef.current;
    localStorage.setItem(VENTA_STORAGE_KEY, JSON.stringify({
      carro,
      descuentoPorcentaje,
      oem,
      idempotenciaKey: clave,
    }));
    try {
      const subtotal = subtotalCarro;
      const discounted = Math.round(subtotal * (1 - discount / 100));
      const total = discount > 0 ? roundSaleTotal(discounted) : subtotal;
      const pagos = esMixto
        ? Object.entries(pagosMixtos)
            .filter(([, monto]) => Number(monto) > 0)
            .map(([metodo_pago, monto]) => ({ metodo_pago, monto: Number(monto) }))
        : [{ metodo_pago: medioPago, monto: total }];
      const body = {
        total,
        descuento_porcentaje: discount,
        monto_subtotal: subtotal,
        tipo_documento: tipoDocumento,
        productos: carro.map((item) => ({ producto_id: item.producto_id, cantidad: item.cantidad, precio: item.precio * item.cantidad })),
        idempotencia_key: clave,
        ...(tipoDocumento === "VE" ? { pagos, documento: documentoFiscal } : {}),
        ...(clienteNombre.trim() ? { cliente_nombre: clienteNombre.trim() } : {}),
        ...(cotizacionOrigenId && tipoDocumento === "VE" ? { venta_origen: cotizacionOrigenId } : {}),
      };

      const maxIntentos = 4;
      let ultimoError = null;

      for (let intento = 1; intento <= maxIntentos; intento++) {
        try {
          await apiRequest("/ventas/validar-stock/", { method: "POST", body: { productos: carro } });
          const result = await apiRequest("/ventas/", { method: "POST", body });
          onVentaRegistrada(result, tipoDocumento);
          return;
        } catch (err) {
          ultimoError = err;
          const esReintentable = err instanceof ApiError && err.retryable;
          if (!esReintentable) throw err;

          let registrada = null;
          try {
            registrada = await apiRequest(`/ventas/por-clave/${clave}/`);
          } catch (reconErr) {
            if (reconErr instanceof ApiError && reconErr.status === 404) {
              // la venta no se registró: es seguro reintentar
            } else {
              // no se pudo verificar; se reintenta igual (la idempotencia respalda)
            }
          }
          if (registrada) {
            onVentaRegistrada(registrada, tipoDocumento);
            return;
          }

          if (intento < maxIntentos) {
            setRetryInfo({ intento, total: maxIntentos - 1 });
            await new Promise((r) => setTimeout(r, ESPERAS_REINTENTO[intento - 1]));
          }
        }
      }

      throw ultimoError || new ApiError("No se pudo guardar la venta.", { retryable: true });
    } catch (err) {
      setError(err.message);
      if (err instanceof ApiError && err.retryable) {
        setPendienteVerificacion({ clave, tipo: tipoDocumento });
      }
    } finally {
      savingRef.current = false;
      setIsSaving(false);
      setRetryInfo(null);
    }
  }

  async function verificarVentaPendiente() {
    if (!pendienteVerificacion || verificando) return;
    setVerificando(true);
    try {
      const result = await apiRequest(`/ventas/por-clave/${pendienteVerificacion.clave}/`);
      onVentaRegistrada(result, pendienteVerificacion.tipo);
    } catch (err) {
      if (err instanceof ApiError && err.status === 404) {
        setError("La venta no se registró en el servidor. Revisa la conexión y reintenta guardar.");
        setPendienteVerificacion(null);
      } else {
        setError(err.message || "No se pudo verificar la venta. Intenta de nuevo.");
      }
    } finally {
      setVerificando(false);
    }
  }

  async function cerrarComprobante() {
    setShowPreview(false);
    if (lastDocumento && lastDocumento.tipo_documento === "VE") {
      await checkUbicaciones(lastDocumento.ventaId);
    }
  }

  function abrirConfirmacion(mode) {
    setConfirmMode(mode);
    setClienteNombre("");
    setOcultarTotales(false);
    setEsMixto(false);
    setPagosMixtos(resetPagosMixtos());
    if (mode === "VE") {
      setMedioPago("");
      setDocumentoFiscal("");
    }
    setShowConfirmVenta(true);
  }

  return (
    <div className="space-y-4 max-w-[1600px] mx-auto">
      {/* Offline banner */}
      {isOffline && (
        <div className="flex items-center gap-2 p-3 rounded-lg bg-warning/10 border border-warning/30 text-warning text-xs" role="status">
          <span className="material-symbols-outlined text-base">wifi_off</span>
          <span>Sin conexión: la venta se reintentará automáticamente cuando vuelva la señal. El carrito queda guardado.</span>
        </div>
      )}

      {/* Retry banner */}
      {retryInfo && (
        <div className="flex items-center gap-2 p-3 rounded-lg bg-info/10 border border-info/30 text-info text-xs" role="status">
          <span className="material-symbols-outlined text-base">sync</span>
          <span>Reintentando venta… (intento {retryInfo.intento} de {retryInfo.total}). No cierres esta página.</span>
        </div>
      )}

      {/* Pending verification banner */}
      {pendienteVerificacion && !isSaving && (
        <div className="flex items-center justify-between p-3 rounded-lg bg-warning/10 border border-warning/30 text-warning">
          <div className="flex items-center gap-2 text-xs">
            <span className="material-symbols-outlined text-base">help</span>
            <span>No pudimos confirmar la venta. Puede que se haya registrado sin respuesta.</span>
          </div>
          <button
            onClick={verificarVentaPendiente}
            disabled={verificando}
            className="px-3 py-1.5 rounded-lg bg-primary text-on-primary font-bold text-xs hover:bg-primary-container disabled:opacity-50"
          >
            {verificando ? "Verificando…" : "Verificar venta"}
          </button>
        </div>
      )}

      {/* Cotización notification banner */}
      {cotizacionOrigenId && (
        <div className="flex items-center justify-between p-3 rounded-lg bg-info/10 border border-info/30 text-info">
          <div className="flex items-center gap-2">
            <span className="material-symbols-outlined text-lg">receipt_long</span>
            <span className="text-sm">
              Convirtiendo cotización <strong>#{cotizacionOrigenId}</strong> a venta — productos cargados al carrito.
            </span>
          </div>
          <button
            className="px-3 py-1 text-xs rounded-md border border-info/40 hover:bg-info/20 transition-colors"
            onClick={() => {
              setSearchParams((prev) => { prev.delete("cotizacion"); return prev; }, { replace: true });
              setCarro([]);
            }}
          >
            Cancelar
          </button>
        </div>
      )}

      {/* Error Banner */}
      {error && (
        <div className="flex items-center justify-between p-3 rounded-lg bg-danger/10 border border-danger/30 text-danger animate-pulse">
          <div className="flex items-center gap-2">
            <span className="material-symbols-outlined text-lg">error</span>
            <span className="text-sm font-medium">{error}</span>
          </div>
          <button
            onClick={() => setError("")}
            className="text-danger hover:text-white text-lg leading-none px-2"
          >
            &times;
          </button>
        </div>
      )}

      {/* POS Layout */}
      <div className="space-y-4">
        {/* Barcode & Search Controls Card */}
          <div className="stat-card bg-bg-surface border border-border-default rounded-xl p-4 shadow-sm space-y-3">
            <div className="flex flex-col sm:flex-row gap-3">
              {/* Barcode Scanner Input */}
              <div className="flex-1 relative">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-text-muted">
                  <span className="material-symbols-outlined text-lg">barcode_scanner</span>
                </div>
                <input
                  ref={barraRef}
                  className={`w-full pl-10 pr-3 py-2.5 bg-bg-input border rounded-lg text-sm text-text-primary placeholder:text-text-muted transition-all focus:outline-none focus:ring-2 ${
                    barraFeedback === "success"
                      ? "border-success ring-2 ring-success/30"
                      : barraFeedback === "error"
                      ? "border-danger ring-2 ring-danger/30"
                      : "border-border-default focus:border-primary focus:ring-primary/20"
                  }`}
                  placeholder="Lector código de barra (Enter)"
                  value={codigoBarra}
                  onChange={(e) => { setCodigoBarra(e.target.value); setBarraFeedback(""); }}
                  onKeyDown={handleBarraKeyDown}
                  autoFocus
                />
              </div>

              {/* Text / OEM Search Input */}
              <div className="flex-1 relative">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-text-muted">
                  <span className="material-symbols-outlined text-lg">search</span>
                </div>
                <input
                  className="w-full pl-10 pr-9 py-2.5 bg-bg-input border border-border-default rounded-lg text-sm text-text-primary placeholder:text-text-muted transition-all focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
                  placeholder={searchPlaceholder}
                  value={oem}
                  onChange={(e) => setOem(e.target.value)}
                />
                {oem && (
                  <button
                    type="button"
                    onClick={() => { setOem(""); setProductosEncontrados([]); setHayMasProductos(false); setError(""); }}
                    className="absolute inset-y-0 right-0 pr-3 flex items-center text-text-muted hover:text-text-primary text-sm"
                    title="Limpiar búsqueda"
                  >
                    &times;
                  </button>
                )}
              </div>
            </div>

            {/* Filter and View Options */}
            <div className="flex flex-wrap items-center justify-between gap-3 pt-1 border-t border-border-default/60">
              <label className="inline-flex items-center gap-2 cursor-pointer text-xs text-text-secondary select-none">
                <input
                  type="checkbox"
                  className="rounded border-border-default bg-bg-input text-accent focus:ring-primary h-4 w-4"
                  checked={mostrarSinStock}
                  onChange={(e) => setMostrarSinStock(e.target.checked)}
                />
                <span>Mostrar productos sin stock</span>
              </label>

              {productosEncontrados.length > 0 && (
                <div className="flex items-center gap-2">
                  <div className="flex rounded border border-border-default overflow-hidden">
                    <button
                      className={`px-2 py-1 text-xs flex items-center ${vistaModo === "grid" ? "bg-primary text-on-primary font-bold" : "bg-bg-input text-text-secondary hover:text-text-primary"}`}
                      onClick={() => cambiarVistaModo("grid")}
                      title="Vista en tarjetas"
                    >
                      <span className="material-symbols-outlined text-sm">grid_view</span>
                    </button>
                    <button
                      className={`px-2 py-1 text-xs flex items-center ${vistaModo === "table" ? "bg-primary text-on-primary font-bold" : "bg-bg-input text-text-secondary hover:text-text-primary"}`}
                      onClick={() => cambiarVistaModo("table")}
                      title="Vista en tabla"
                    >
                      <span className="material-symbols-outlined text-sm">table_rows</span>
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>


        {/* Carrito (flujo normal) + resultados encima (eje z) */}
        <div className="relative">
          <div className="bg-bg-surface border border-border-default rounded-xl shadow-lg overflow-hidden flex flex-col">
            {/* Header */}
            <div className="p-4 border-b border-border-default flex items-center justify-between bg-surface-container-low">
              <div className="flex items-center gap-2">
                <span className="material-symbols-outlined text-accent text-xl">shopping_cart</span>
                <h3 className="font-display font-bold text-text-primary text-base">Carrito de Venta</h3>
                <span className="text-xs font-mono bg-primary/20 text-accent px-2 py-0.5 rounded-full font-bold">
                  {carro.reduce((acc, i) => acc + i.cantidad, 0)}
                </span>
              </div>
              {carro.length > 0 && (
                <button
                  onClick={limpiarVenta}
                  className="text-xs text-danger hover:underline transition-colors flex items-center gap-1"
                >
                  <span className="material-symbols-outlined text-sm">delete</span>
                  Vaciar
                </button>
              )}
            </div>

            {/* Cart Items List */}
            <div className="p-3 max-h-[380px] overflow-y-auto space-y-2 divide-y divide-border-default/40">
              {carro.length === 0 ? (
                <div className="py-12 text-center text-text-muted space-y-2">
                  <span className="material-symbols-outlined text-3xl opacity-40">remove_shopping_cart</span>
                  <p className="text-xs">El carrito está vacío</p>
                </div>
              ) : (
                carro.map((i) => (
                  <div key={i.producto_id} className="pt-2 first:pt-0 flex items-center justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="font-bold text-xs text-text-primary truncate" title={i.nombre}>
                        {i.nombre}
                      </div>
                      <div className="text-[11px] font-mono text-text-muted flex items-center gap-2">
                        <span>{i.codigo_producto}</span>
                        <span>· {fmtMoney(i.precio)} c/u</span>
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
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
                        inputStyle={{ width: 44, fontSize: "0.85rem", height: 28 }}
                        decrementLabel={`Disminuir ${i.nombre}`}
                        incrementLabel={`Aumentar ${i.nombre}`}
                      />

                      <div className="text-right min-w-[65px] font-mono font-bold text-xs text-text-primary">
                        {fmtMoney(i.precio * i.cantidad)}
                      </div>

                      <button
                        onClick={() => setCarro(carro.filter((x) => x.producto_id !== i.producto_id))}
                        className="text-text-muted hover:text-danger p-1 rounded-md transition-colors"
                        title="Quitar producto"
                      >
                        <span className="material-symbols-outlined text-sm">close</span>
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>

            {/* Financial Summary & Total Box */}
            <div className="p-4 bg-bg-elevated border-t border-border-default space-y-3">
              {/* Discount Stepper */}
              <div className="flex items-center justify-between text-xs text-text-secondary">
                <span>Descuento global</span>
                <div className="inline-flex items-center gap-1.5 bg-bg-input px-2 py-1 rounded-lg border border-border-default">
                  <StepperInput
                    value={descuentoPorcentaje || 0}
                    onChange={(val) => setDescuentoPorcentaje(val)}
                    min={0}
                    max={100}
                    active={discount > 0}
                    inputStyle={{
                      width: 36,
                      border: "none",
                      background: "transparent",
                      color: discount > 0 ? "var(--color-primary)" : "var(--color-text-primary)",
                      fontSize: "0.95rem",
                      fontWeight: 700,
                      padding: 0,
                    }}
                    decrementLabel="Menos descuento"
                    incrementLabel="Más descuento"
                  />
                  <span className="font-bold text-accent">%</span>
                </div>
              </div>

              {/* Breakdown */}
              <div className="space-y-1 text-xs border-t border-border-default/60 pt-2">
                {discount > 0 && (
                  <>
                    <div className="flex justify-between text-text-secondary">
                      <span>Subtotal bruto</span>
                      <span className="font-mono">{fmtMoney(subtotalCarro)}</span>
                    </div>
                    <div className="flex justify-between text-danger font-medium">
                      <span>Descuento ({discount}%)</span>
                      <span className="font-mono">-{fmtMoney(subtotalCarro - totalConDescuento)}</span>
                    </div>
                  </>
                )}
                <div className="flex justify-between text-text-secondary">
                  <span>Neto</span>
                  <span className="font-mono">{fmtMoney(netoFromBruto(totalConDescuento))}</span>
                </div>
                <div className="flex justify-between text-text-secondary">
                  <span>IVA ({taxPercent}%)</span>
                  <span className="font-mono">{fmtMoney(totalConDescuento - netoFromBruto(totalConDescuento))}</span>
                </div>
              </div>

              {/* Giant Total */}
              <div className="pt-3 border-t-2 border-primary/30 flex items-baseline justify-between">
                <span className="text-sm font-bold text-text-primary uppercase tracking-wider">Total</span>
                <div className="text-2xl sm:text-3xl font-extrabold font-mono text-accent tracking-tight">
                  {fmtMoney(totalConDescuento)}
                </div>
              </div>

              {/* Action Buttons */}
              <div className="grid grid-cols-2 gap-2 pt-2">
                <button
                  disabled={!carro.length}
                  onClick={() => abrirConfirmacion("CO")}
                  className="w-full py-2.5 px-3 rounded-lg border border-border-default text-text-secondary hover:text-text-primary hover:bg-surface-variant font-bold text-xs transition-all disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  Cotización
                </button>
                <button
                  disabled={!carro.length}
                  onClick={() => abrirConfirmacion("VE")}
                  className="w-full py-2.5 px-3 rounded-lg bg-primary text-on-primary hover:bg-primary-container font-bold text-xs shadow-md transition-all active:scale-95 disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-1.5"
                >
                  <span className="material-symbols-outlined text-base">payments</span>
                  Cobrar
                </button>
              </div>
            </div>
          </div>
          {/* Search Results Display — overlay sobre el carrito (eje z) */}
          {productosEncontrados.length > 0 && (
          <div className="absolute left-0 right-0 top-0 z-10 bg-bg-surface border border-border-default rounded-xl shadow-2xl overflow-hidden flex flex-col max-h-[70vh]">
            <div className="p-3 border-b border-border-default flex items-center justify-between bg-surface-container-low shrink-0">
              <span className="text-xs font-mono text-text-muted">
                {productosEncontrados.length} encontrados {hayMasProductos && "(+50)"}
              </span>
              <button
                onClick={cerrarResultados}
                className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-bold text-text-secondary hover:text-text-primary hover:bg-surface-variant transition-colors"
                title="Ocultar resultados de búsqueda"
              >
                <span className="material-symbols-outlined text-sm">close</span>
                Cerrar
              </button>
            </div>
            <div className="flex-1 overflow-y-auto">
            {vistaModo === "grid" ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3 p-3">
                {productosEncontrados.map((p) => {
                  const tieneStock = (p.stock_actual || 0) > 0;
                  const mod = preciosModificados[p.producto_id];
                  return (
                    <div
                      key={p.producto_id}
                      className={`p-3.5 rounded-xl border transition-all flex flex-col justify-between ${
                        tieneStock
                          ? "bg-bg-surface border-border-default hover:border-primary/50 hover:shadow-md"
                          : "bg-bg-surface/40 border-border-default/40 opacity-75"
                      }`}
                    >
                      <div>
                        {/* Top tags */}
                        <div className="flex items-center justify-between gap-1 mb-1.5">
                          <span className="text-[11px] font-mono text-text-muted bg-surface-container px-1.5 py-0.5 rounded">
                            {p.codigo_producto}
                          </span>
                          <span
                            className={`text-[11px] font-bold px-2 py-0.5 rounded-full inline-flex items-center gap-1 ${
                              tieneStock
                                ? "bg-success/10 text-success border border-success/20"
                                : "bg-danger/10 text-danger border border-danger/20"
                            }`}
                          >
                            <span className={`w-1.5 h-1.5 rounded-full ${tieneStock ? "bg-success" : "bg-danger"}`} />
                            {p.stock_actual} uds
                          </span>
                        </div>

                        {/* Name & OEM */}
                        <h4 className="text-sm font-bold text-text-primary leading-snug line-clamp-2" title={p.nombre}>
                          {p.nombre}
                        </h4>
                        <div className="flex items-center gap-2 mt-1 text-xs text-text-secondary">
                          {showPartsFields && p.oem && <span className="font-mono text-text-muted">OEM: {p.oem}</span>}
                          {showPartsFields && p.marca && <span>· {p.marca}</span>}
                        </div>
                      </div>

                      {/* Bottom Price & Actions */}
                      <div className="mt-3 pt-2.5 border-t border-border-default flex items-center justify-between">
                        <div>
                          <div className="text-base font-bold font-mono text-accent">
                            {fmtMoney(mod?.precio ?? p.precio)}
                            {mod && <span className="text-xs text-accent font-bold ml-1">*</span>}
                          </div>
                          {esGerente && p.precio_costo != null && (
                            <button
                              onClick={() => setQuickPrecioCostoProducto(p)}
                              className="text-[11px] text-text-muted hover:text-accent transition-colors block text-left"
                            >
                              Costo: {fmtMoney(mod?.precioCosto ?? p.precio_costo)}
                            </button>
                          )}
                        </div>

                        <div className="flex items-center gap-1">
                          {esGerente && (
                            <button
                              onClick={() => setQuickStockProducto(p)}
                              className="p-1.5 rounded-lg text-text-muted hover:text-text-primary hover:bg-surface-variant transition-colors"
                              title="Ajustar stock rápido"
                            >
                              <span className="material-symbols-outlined text-base">edit_note</span>
                            </button>
                          )}
                          <button
                            onClick={() => agregar(p)}
                            disabled={!tieneStock}
                            className={`px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1 transition-all active:scale-95 ${
                              tieneStock
                                ? "bg-primary text-on-primary hover:bg-primary-container shadow-sm cursor-pointer"
                                : "bg-surface-variant text-text-muted cursor-not-allowed"
                            }`}
                          >
                            <span className="material-symbols-outlined text-sm">add</span>
                            Agregar
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              /* Table View */
              <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs pos-table">
                    <thead className="bg-surface-container-high border-b border-border-default text-text-muted">
                      <tr>
                        <th className="py-2.5 px-3">Código</th>
                        {showPartsFields && <th className="py-2.5 px-3">OEM</th>}
                        <th className="py-2.5 px-3">Nombre</th>
                        {showPartsFields && <th className="py-2.5 px-3">Marca</th>}
                        <th className="py-2.5 px-3 text-center">Stock</th>
                        <th className="py-2.5 px-3 text-right">Precio</th>
                        {esGerente && <th className="py-2.5 px-3 text-right">Costo</th>}
                        <th className="py-2.5 px-3 text-right">Acción</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border-default font-body text-text-secondary">
                      {productosEncontrados.map((p) => {
                        const tieneStock = (p.stock_actual || 0) > 0;
                        const mod = preciosModificados[p.producto_id];
                        return (
                          <tr key={p.producto_id} className="hover:bg-surface-container-low transition-colors">
                            <td className="py-2 px-3 font-mono text-text-primary">{p.codigo_producto}</td>
                            {showPartsFields && <td className="py-2 px-3 font-mono">{p.oem || "—"}</td>}
                            <td className="py-2 px-3 font-bold text-text-primary">{p.nombre}</td>
                            {showPartsFields && <td className="py-2 px-3">{p.marca || "—"}</td>}
                            <td className="py-2 px-3 text-center">
                              <span className={`px-2 py-0.5 rounded-full font-bold text-[10px] ${tieneStock ? "bg-success/10 text-success" : "bg-danger/10 text-danger"}`}>
                                {p.stock_actual}
                              </span>
                            </td>
                            <td className="py-2 px-3 font-mono font-bold text-right text-accent">
                              {fmtMoney(mod?.precio ?? p.precio)}
                            </td>
                            {esGerente && (
                              <td className="py-2 px-3 font-mono text-right text-text-muted">
                                {p.precio_costo != null ? fmtMoney(mod?.precioCosto ?? p.precio_costo) : "—"}
                              </td>
                            )}
                            <td className="py-2 px-3 text-right">
                              <button
                                onClick={() => agregar(p)}
                                disabled={!tieneStock}
                                className={`px-2.5 py-1 rounded-md text-xs font-bold transition-all ${
                                  tieneStock
                                    ? "bg-primary text-on-primary hover:bg-primary-container cursor-pointer"
                                    : "bg-surface-variant text-text-muted cursor-not-allowed"
                                }`}
                              >
                                +
                              </button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
            )}
            </div>
          </div>
          )}
        </div>
      </div>

      {/* MODALS */}
      {/* 1. Confirmar Venta / Cotización Modal */}
      {showConfirmVenta && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm fade-animate">
          <div className="bg-bg-surface border border-border-default rounded-2xl shadow-2xl max-w-2xl w-full overflow-hidden modal-animate">
            <div className="p-5 border-b border-border-default flex items-center justify-between bg-surface-container-low">
              <h3 className="font-display text-lg font-bold text-text-primary flex items-center gap-2">
                <span className="material-symbols-outlined text-accent">
                  {confirmMode === "CO" ? "receipt_long" : "shopping_bag"}
                </span>
                {confirmMode === "CO" ? "Generar Cotización" : "Confirmar Venta y Cobro"}
              </h3>
              <button
                onClick={() => { setShowConfirmVenta(false); setOcultarTotales(false); setEsMixto(false); setPagosMixtos(resetPagosMixtos()); }}
                className="text-text-muted hover:text-text-primary text-2xl leading-none"
              >
                &times;
              </button>
            </div>

            <div className="p-6 space-y-4 max-h-[75vh] overflow-y-auto">
              {confirmMode === "CO" ? (
                <div className="space-y-3">
                  <div>
                    <label className="block text-xs font-bold text-text-secondary uppercase mb-1">Nombre del cliente (opcional):</label>
                    <input
                      type="text"
                      className="w-full px-3 py-2 bg-bg-input border border-border-default rounded-lg text-sm text-text-primary focus:outline-none focus:border-primary"
                      placeholder="Ej: Constructora San Martín / Juan Pérez"
                      value={clienteNombre}
                      onChange={(e) => setClienteNombre(e.target.value)}
                    />
                  </div>
                  <label className="flex items-center gap-2 text-xs text-text-secondary cursor-pointer">
                    <input
                      type="checkbox"
                      className="rounded border-border-default bg-bg-input text-accent h-4 w-4"
                      checked={ocultarTotales}
                      onChange={(e) => setOcultarTotales(e.target.checked)}
                    />
                    <span>Ocultar totales y precios en la cotización impresa</span>
                  </label>
                </div>
              ) : (
                <div className="space-y-4">
                  {/* Selects: Documento & Medio de Pago */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-bold text-text-secondary uppercase mb-1">Documento Fiscal:</label>
                      <select
                        className="w-full px-3 py-2 bg-bg-input border border-border-default rounded-lg text-sm text-text-primary focus:outline-none focus:border-primary"
                        value={documentoFiscal}
                        onChange={(e) => setDocumentoFiscal(e.target.value)}
                      >
                        <option value="">Seleccione documento...</option>
                        {documentTypes.map((d) => (
                          <option key={d.code} value={d.code}>{d.label}</option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <label className="block text-xs font-bold text-text-secondary uppercase mb-1">Medio de Pago:</label>
                      <select
                        className="w-full px-3 py-2 bg-bg-input border border-border-default rounded-lg text-sm text-text-primary focus:outline-none focus:border-primary disabled:opacity-50"
                        value={medioPago}
                        onChange={(e) => setMedioPago(e.target.value)}
                        disabled={esMixto}
                      >
                        <option value="">Seleccione medio...</option>
                        {paymentMethods.map((m) => (
                          <option key={m.code} value={m.code}>{m.label}</option>
                        ))}
                      </select>
                    </div>
                  </div>

                  {conflictoSeleccion && (
                    <div className="p-3 rounded-lg bg-warning/10 border border-warning/30 text-warning text-xs">
                      Seleccione el tipo de documento y el medio de pago para continuar.
                    </div>
                  )}

                  {/* Mixed Payment Toggle */}
                  <div>
                    <label className="inline-flex items-center gap-2 cursor-pointer text-xs text-text-secondary">
                      <input
                        type="checkbox"
                        className="rounded border-border-default bg-bg-input text-accent h-4 w-4"
                        checked={esMixto}
                        onChange={(e) => setEsMixto(e.target.checked)}
                      />
                      <span className="font-bold">Pago Mixto (Combinar varios medios de pago)</span>
                    </label>
                  </div>

                  {/* Mixed Payment Inputs */}
                  {esMixto && (
                    <div className="p-4 rounded-xl bg-surface-container border border-border-default space-y-3">
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                        {paymentMethods.map((m) => (
                          <div key={m.code}>
                            <label className="block text-[11px] font-bold text-text-muted mb-1">{m.label}</label>
                            <input
                              type="number"
                              className="w-full px-2.5 py-1.5 bg-bg-input border border-border-default rounded-lg text-xs font-mono text-text-primary"
                              min={0}
                              step={1000}
                              value={pagosMixtos[m.code]}
                              onChange={(e) =>
                                setPagosMixtos((prev) => ({
                                  ...prev,
                                  [m.code]: e.target.value === "" ? 0 : Number(e.target.value),
                                }))
                              }
                            />
                          </div>
                        ))}
                      </div>

                      <div className="text-xs font-mono pt-2 border-t border-border-default flex justify-between">
                        <span>Suma ingresada: <strong>{fmtMoney(totalPagosMixtos)}</strong></span>
                        {diferenciaPagos === 0 ? (
                          <span className="text-success font-bold">Cuadrado exacto</span>
                        ) : (
                          <span className="text-danger font-bold">
                            {diferenciaPagos > 0 ? `Faltan ${fmtMoney(diferenciaPagos)}` : `Sobran ${fmtMoney(Math.abs(diferenciaPagos))}`}
                          </span>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Items Detail Table */}
              <div className="border border-border-default rounded-lg overflow-hidden">
                <table className="w-full text-left text-xs">
                  <thead className="bg-surface-container-high text-text-muted border-b border-border-default">
                    <tr>
                      <th className="p-2">Código</th>
                      {showPartsFields && <th className="p-2">OEM</th>}
                      <th className="p-2">Nombre</th>
                      {showPartsFields && <th className="p-2">Marca</th>}
                      <th className="p-2 text-center">Cant.</th>
                      <th className="p-2 text-right">Subtotal</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border-default text-text-secondary">
                    {carro.map((i) => (
                      <tr key={`confirm-${i.producto_id}`}>
                        <td className="p-2 font-mono text-text-primary">{i.codigo_producto}</td>
                        {showPartsFields && <td className="p-2 font-mono">{i.oem || "—"}</td>}
                        <td className="p-2 font-medium text-text-primary">{i.nombre}</td>
                        {showPartsFields && <td className="p-2">{i.marca || "—"}</td>}
                        <td className="p-2 text-center font-mono">{i.cantidad}</td>
                        <td className="p-2 text-right font-mono font-bold text-text-primary">{fmtMoney(i.precio * i.cantidad)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Total Box */}
              {!(confirmMode === "CO" && ocultarTotales) && (
                <div className="p-3 rounded-xl bg-surface-container-high flex items-baseline justify-between">
                  <span className="font-bold text-text-primary text-sm">Total a pagar</span>
                  <span className="text-2xl font-extrabold font-mono text-accent">{fmtMoney(totalConDescuento)}</span>
                </div>
              )}
            </div>

            <div className="p-4 border-t border-border-default bg-surface-container-low flex justify-end gap-2">
              <button
                type="button"
                onClick={() => { setShowConfirmVenta(false); setOcultarTotales(false); setEsMixto(false); setPagosMixtos(resetPagosMixtos()); }}
                className="px-4 py-2 rounded-lg text-xs font-bold text-text-secondary hover:text-text-primary hover:bg-surface-variant transition-colors"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={() => guardar(confirmMode)}
                disabled={isSaving || (confirmMode === "VE" && !pagosValidos) || conflictoSeleccion}
                className="px-5 py-2 rounded-lg text-xs font-bold bg-primary text-on-primary hover:bg-primary-container transition-all active:scale-95 disabled:opacity-40 disabled:cursor-not-allowed shadow-md"
              >
                {isSaving ? (retryInfo ? `Reintentando… (${retryInfo.intento}/${retryInfo.total})` : "Guardando...") : confirmMode === "CO" ? "Generar Cotización" : "Confirmar y Cobrar"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 2. Receipt Preview Modal */}
      {showPreview && lastDocumento && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm fade-animate">
          <div className="bg-bg-surface border border-border-default rounded-2xl shadow-2xl max-w-md w-full overflow-hidden">
            <div className="p-4 border-b border-border-default flex items-center justify-between bg-surface-container-low">
              <h4 className="font-bold text-text-primary text-sm">
                {lastDocumento.tipo_documento === "CO" ? "Cotización" : "Comprobante de Venta"} #{lastDocumento.ventaId}
              </h4>
              <button onClick={cerrarComprobante} className="text-text-muted hover:text-text-primary text-2xl leading-none">
                &times;
              </button>
            </div>

            <div className="p-4 max-h-[70vh] overflow-y-auto">
              <div className="receipt-preview p-4 bg-white text-black rounded-lg text-xs font-mono space-y-2">
                <div className="text-center font-bold text-sm">{lastDocumento.tienda}</div>
                {lastDocumento.direccion && <div className="text-center text-[10px] text-gray-600">{lastDocumento.direccion}</div>}
                {lastDocumento.telefono && <div className="text-center text-[10px] text-gray-600">{lastDocumento.telefono}</div>}
                <div className="text-center font-bold border-t border-dashed border-gray-400 pt-1 mt-1">
                  {lastDocumento.tipo_documento === "CO" ? "COTIZACION" : "COMPROBANTE DE VENTA"}
                </div>
                <div className="text-center text-[11px] text-gray-600">#{lastDocumento.ventaId} · {lastDocumento.fecha}</div>
                <div className="border-t border-dashed border-gray-400 my-1"></div>

                {lastDocumento.items.map((item) => (
                  <div key={`${item.producto_id}-${item.cantidad}`} className="flex justify-between">
                    <span>{item.cantidad} x {item.nombre}</span>
                    <span>{fmtMoney(item.subtotal)}</span>
                  </div>
                ))}

                {!lastDocumento.ocultarTotales && (
                  <div className="border-t border-dashed border-gray-400 pt-1 space-y-0.5">
                    <div className="flex justify-between"><span>Subtotal:</span><span>{fmtMoney(lastDocumento.subtotal_original)}</span></div>
                    {lastDocumento.descuento_porcentaje > 0 && (
                      <div className="flex justify-between text-red-600">
                        <span>Descuento ({lastDocumento.descuento_porcentaje}%):</span>
                        <span>-{fmtMoney(lastDocumento.subtotal_original - lastDocumento.total)}</span>
                      </div>
                    )}
                    <div className="flex justify-between"><span>Neto:</span><span>{fmtMoney(lastDocumento.total_neto)}</span></div>
                    <div className="flex justify-between"><span>IVA:</span><span>{fmtMoney(lastDocumento.impuesto)}</span></div>
                    <div className="flex justify-between font-bold text-sm border-t border-gray-400 pt-0.5">
                      <span>Total:</span>
                      <span>{fmtMoney(lastDocumento.total)}</span>
                    </div>
                  </div>
                )}
                <div className="text-center text-[9px] text-gray-500 pt-2">Documento carece de validez legal</div>
              </div>
            </div>

            <div className="p-4 border-t border-border-default bg-surface-container-low flex justify-end gap-2">
              <button
                onClick={cerrarComprobante}
                className="px-4 py-2 rounded-lg text-xs font-bold text-text-secondary hover:text-text-primary"
              >
                Cerrar
              </button>
              <button
                onClick={() => imprimirDocumento(lastDocumento)}
                className="px-4 py-2 rounded-lg text-xs font-bold bg-primary text-on-primary hover:bg-primary-container flex items-center gap-1"
              >
                <span className="material-symbols-outlined text-sm">print</span>
                Imprimir
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 3. Deducción de Stock por Ubicación Modal */}
      {showUbicacionDialog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm fade-animate">
          <div className="bg-bg-surface border border-border-default rounded-2xl shadow-2xl max-w-2xl w-full overflow-hidden">
            <div className="p-4 border-b border-border-default flex items-center justify-between bg-surface-container-low">
              <h4 className="font-bold text-text-primary text-base flex items-center gap-2">
                <span className="material-symbols-outlined text-accent">inventory_2</span>
                Seleccionar Ubicación para Descontar
              </h4>
              <button onClick={() => setShowUbicacionDialog(false)} className="text-text-muted hover:text-text-primary text-2xl leading-none">
                &times;
              </button>
            </div>
            <div className="p-5 space-y-4">
              <p className="text-xs text-text-secondary">
                Los siguientes productos tienen stock en varias ubicaciones. Seleccione de cuál descontar:
              </p>
              {ubicacionError && (
                <div className="p-3 rounded-lg bg-danger/10 border border-danger/30 text-danger text-xs">
                  {ubicacionError}
                </div>
              )}
              <label className="inline-flex items-center gap-2 cursor-pointer text-xs text-text-secondary">
                <input
                  type="checkbox"
                  className="rounded border-border-default bg-bg-input text-accent h-4 w-4"
                  checked={ubicacionMixto}
                  onChange={handleToggleUbicacionMixto}
                />
                <span className="font-bold">Mixto (repartir la cantidad entre varias ubicaciones)</span>
              </label>

              <div className="space-y-3 max-h-80 overflow-y-auto">
                {ubicacionItems.map((item) => (
                  <div key={item.producto_id} className="p-3 rounded-lg bg-surface-container border border-border-default space-y-2">
                    <div className="text-xs font-bold text-text-primary flex items-center justify-between gap-2">
                      <span className="truncate">{item.codigo_producto} - {item.nombre}</span>
                      <span className="font-mono text-text-muted shrink-0">vendido: {item.cantidad_vendida}</span>
                    </div>

                    {ubicacionMixto ? (
                      <div className="space-y-1.5">
                        {item.ubicaciones.map((u) => (
                          <div key={u.id} className="flex items-center justify-between gap-2">
                            <span className="text-[11px] text-text-secondary truncate">{u.nombre} (máx {u.stock}):</span>
                            <input
                              type="number"
                              className="w-20 px-2 py-1 bg-bg-input border border-border-default rounded-lg text-xs font-mono text-text-primary"
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
                            return <div className="text-[11px] text-success font-mono">Suma: {suma} de {item.cantidad_vendida} — correcto</div>;
                          }
                          return (
                            <div className="text-[11px] text-danger font-mono">
                              Suma: {suma} de {item.cantidad_vendida} —{" "}
                              {faltante > 0 ? `faltan ${faltante}` : `sobran ${Math.abs(faltante)}`}.
                            </div>
                          );
                        })()}
                      </div>
                    ) : (
                      <select
                        className="w-full p-2 bg-bg-input border border-border-default rounded-md text-xs text-text-primary"
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
                            {u.nombre} (Stock: {u.stock})
                          </option>
                        ))}
                      </select>
                    )}
                  </div>
                ))}
              </div>
            </div>
            <div className="p-4 border-t border-border-default bg-surface-container-low flex justify-end gap-2">
              <button
                onClick={() => setShowUbicacionDialog(false)}
                className="px-4 py-2 rounded-lg text-xs font-bold text-text-secondary hover:text-text-primary hover:bg-surface-variant transition-colors"
              >
                Cancelar
              </button>
              <button
                onClick={handleDeducirStock}
                disabled={isDeducing || !mixtoUbicacionesValido}
                className="px-4 py-2 rounded-lg text-xs font-bold bg-primary text-on-primary hover:bg-primary-container disabled:opacity-40"
              >
                {isDeducing ? "Deduciendo..." : "Confirmar"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 4. Success Floating Toast */}
      {showVentaSuccess && (
        <div className="fixed bottom-8 right-8 z-50 bg-success text-white px-5 py-3 rounded-xl shadow-2xl flex items-center gap-3 toast-animate">
          <span className="material-symbols-outlined text-2xl">check_circle</span>
          <span className="font-bold text-sm">
            {lastDocumento?.tipo_documento === "CO" ? "Cotización generada exitosamente" : "Venta registrada exitosamente"}
          </span>
        </div>
      )}

      {/* Quick Modals */}
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
    </div>
  );
}