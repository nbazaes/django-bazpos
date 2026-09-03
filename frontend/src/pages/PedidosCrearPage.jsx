import { useEffect, useMemo, useRef, useState } from "react";
import PageCard from "../components/PageCard";
import PedidosHistorial from "../components/PedidosHistorial";
import { usePageTitle } from "../lib/usePageTitle";
import { useCreatePedido, useProductos, useProveedores } from "../lib/queries";
import { formatDateTime } from "../lib/format";
import { getStoreName, getStoreConfig, fetchStoreConfig, applyTax, roundPrice } from "../lib/storeConfig";
import { useToast } from "../lib/useToast";

const COST_MODIFIER_LABELS = { stellantis: "Stellantis (descuento 20%)" };
const COST_MODIFIER_FACTORS = { stellantis: 0.8 };

function aplicarModificadores(costo, costModifiers) {
  return (costModifiers || []).reduce((acc, key) => acc * (COST_MODIFIER_FACTORS[key] ?? 1), costo);
}

function calcularItemSubtotal(precioCosto, porcentajeUtilidad, costModifiers = []) {
  const costo = Number(precioCosto) || 0;
  const pct = Number(porcentajeUtilidad) || 0;
  const costoBase = aplicarModificadores(costo, costModifiers);
  const base = costoBase * (1 + pct / 100);
  return applyTax(base);
}

function calcularItemTotal(precioCosto, porcentajeUtilidad, sumarEnvio = true, costModifiers = []) {
  const subtotal = calcularItemSubtotal(precioCosto, porcentajeUtilidad, costModifiers);
  const conEnvio = sumarEnvio ? subtotal + Number(getStoreConfig().default_shipping_cost || 0) : subtotal;
  return roundPrice(conEnvio);
}

const productoVacio = {
  producto_id: null,
  codigo_proveedor: "",
  proveedor_id: "",
  oem: "",
  nombre: "",
  precio_costo: "",
  porcentaje_utilidad: "",
  sumar_envio: true,
  cost_modifiers: [],
};

export default function PedidosCrearPage() {
  const [tab, setTab] = useState("nuevo");
  usePageTitle(tab === "nuevo" ? "Nuevo pedido" : "Historial de pedidos");
  const addToast = useToast();
  const { data: proveedoresData } = useProveedores({ page_size: 200 });

  useEffect(() => {
    fetchStoreConfig();
  }, []);
  const createPedido = useCreatePedido();
  const proveedores = proveedoresData?.results ?? [];

  const config = getStoreConfig();
  const paymentMethods = config.effective_payment_methods || [];
  const documentTypes = config.effective_document_types || [];
  const METODO_PAGO_OPCIONES = paymentMethods.map((m) => ({ value: m.code, label: m.label }));
  const DOCUMENTO_OPCIONES = [
    { value: "SB", label: "Sin boletear" },
    ...documentTypes.map((d) => ({ value: d.code, label: d.label })),
  ];
  const showOrderPricingRules = config.feature_flags?.order_pricing_rules === true;
  const shippingCost = Number(config.default_shipping_cost || 0);
  const shippingLabel = shippingCost > 0 ? `(+$${shippingCost.toLocaleString("es-CL")})` : "";

  function toggleCostModifier(key) {
    setProducto((prev) => {
      const has = (prev.cost_modifiers || []).includes(key);
      return {
        ...prev,
        cost_modifiers: has ? prev.cost_modifiers.filter((k) => k !== key) : [...(prev.cost_modifiers || []), key],
      };
    });
  }

  const [cliente, setCliente] = useState({ nombre: "", telefono: "" });
  const [producto, setProducto] = useState({ ...productoVacio });
  const [items, setItems] = useState([]);
  const [metodoPago, setMetodoPago] = useState("EF");
  const [estadoDocumento, setEstadoDocumento] = useState("SB");
  const [productoTexto, setProductoTexto] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [mostrarProductos, setMostrarProductos] = useState(false);
  const productosRef = useRef(null);

  useEffect(() => {
    const timer = setTimeout(() => {
      setSearchQuery(productoTexto.trim());
    }, 250);
    return () => clearTimeout(timer);
  }, [productoTexto]);

  const { data: productosData } = useProductos(
    searchQuery ? { texto: searchQuery, page_size: 10 } : { page_size: 10 },
  );

  const itemTotalPreview = useMemo(() => {
    return calcularItemTotal(
      producto.precio_costo,
      producto.porcentaje_utilidad,
      producto.sumar_envio,
      producto.cost_modifiers,
    );
  }, [producto.precio_costo, producto.porcentaje_utilidad, producto.sumar_envio, producto.cost_modifiers]);

  const totales = useMemo(() => {
    const subtotal = items.reduce((sum, it) => {
      return sum + calcularItemSubtotal(it.precio_costo, it.porcentaje_utilidad, it.cost_modifiers);
    }, 0);
    const total = items.reduce((sum, it) => sum + it.precio_final, 0);
    return { subtotal, total };
  }, [items]);

  useEffect(() => {
    function handleClickOutside(e) {
      if (productosRef.current && !productosRef.current.contains(e.target)) {
        setMostrarProductos(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const productosFiltrados = useMemo(() => {
    if (!productoTexto.trim()) return [];
    return productosData?.results ?? [];
  }, [productoTexto, productosData]);

  function seleccionarProductoExistente(p) {
    setProducto((prev) => ({
      ...prev,
      producto_id: p.producto_id,
      codigo_proveedor: p.codigo_producto || "",
      proveedor_id: String(p.proveedor ?? ""),
      oem: p.oem || "",
      nombre: p.nombre || "",
      precio_costo: p.precio_costo ?? "",
      porcentaje_utilidad: p.margen_utilidad ?? "",
    }));
    setProductoTexto(`${p.codigo_producto} — ${p.nombre}`);
    setMostrarProductos(false);
  }

  function handleProductoChange(field, value) {
    setProducto((prev) => {
      const next = { ...prev, [field]: value };
      if (field === "codigo_proveedor") {
        const codigo = String(value || "").trim();
        const match = (productosData?.results ?? []).find(
          (p) => p.codigo_producto === codigo || p.codigo_proveedor === codigo
        );
        next.producto_id = match ? match.producto_id : null;
        if (match) {
          next.oem = match.oem || "";
          next.nombre = match.nombre || "";
          next.proveedor_id = String(match.proveedor ?? "");
          next.precio_costo = match.precio_costo ?? "";
          next.porcentaje_utilidad = match.margen_utilidad ?? "";
        }
      }
      return next;
    });
  }

  function limpiarProducto() {
    setProducto({ ...productoVacio });
    setProductoTexto("");
  }

  function agregarProducto() {
    if (!producto.nombre.trim() || !producto.proveedor_id || !producto.precio_costo || !producto.porcentaje_utilidad) {
      addToast("Completa los datos del producto antes de agregar", "danger");
      return;
    }
    const precioFinal = calcularItemTotal(
      producto.precio_costo,
      producto.porcentaje_utilidad,
      producto.sumar_envio,
      producto.cost_modifiers,
    );
    setItems((prev) => [
      ...prev,
      {
        ...producto,
        proveedor_id: Number(producto.proveedor_id),
        precio_costo: Number(producto.precio_costo),
        porcentaje_utilidad: Number(producto.porcentaje_utilidad),
        precio_final: precioFinal,
      },
    ]);
    limpiarProducto();
  }

  function eliminarItem(index) {
    setItems((prev) => prev.filter((_, i) => i !== index));
  }

  function generarPedido() {
    guardarPedido(false);
  }

  function generarCotizacion() {
    guardarPedido(true);
  }

  function guardarPedido(esCotizacion) {
    if (!cliente.nombre.trim() || !cliente.telefono.trim()) {
      addToast("Ingresa nombre y teléfono del cliente", "danger");
      return;
    }
    if (items.length === 0) {
      addToast("Agrega al menos un producto al pedido", "danger");
      return;
    }

    const payload = {
      nombre_cliente: cliente.nombre.trim(),
      telefono_cliente: cliente.telefono.trim(),
      metodo_pago: metodoPago,
      estado_documento: estadoDocumento,
      items: items.map((it) => ({
        producto_id: it.producto_id,
        codigo_proveedor: it.codigo_proveedor,
        proveedor_id: it.proveedor_id,
        oem: it.oem,
        nombre: it.nombre,
        precio_costo: it.precio_costo,
        porcentaje_utilidad: it.porcentaje_utilidad,
        sumar_envio: it.sumar_envio,
        cost_modifiers: it.cost_modifiers,
      })),
      es_cotizacion: esCotizacion,
    };

    createPedido.mutate(payload, {
      onSuccess: (data) => {
        addToast(esCotizacion ? "Cotización generada correctamente" : "Pedido generado correctamente", "success");
        imprimirDocumento(data, esCotizacion);
        setCliente({ nombre: "", telefono: "" });
        setItems([]);
        setMetodoPago("EF");
        limpiarProducto();
      },
      onError: (err) => {
        addToast(err.message || (esCotizacion ? "Error al generar la cotización" : "Error al generar el pedido"), "danger");
      },
    });
  }

  function imprimirDocumento(documento, esCotizacion) {
    const win = window.open("", "_blank", "width=420,height=700");
    if (!win) return;
    const storeConfig = getStoreConfig();

    const filas = (documento.detalles || []).map((d) => `
      <tr>
        ${!esCotizacion ? `<td>${d.codigo_proveedor || "—"}</td><td>${d.oem || "—"}</td>` : ""}
        <td>${d.nombre}</td>
        <td style="text-align:right;">$${d.precio_final}</td>
      </tr>
    `).join("");

    const fecha = formatDateTime(documento.fecha_creacion);
    const metodo = (METODO_PAGO_OPCIONES.find((m) => m.value === documento.metodo_pago) || {}).label || documento.metodo_pago;
    const estado = documento.estado_display || documento.estado;
    const documentoLabel = documento.estado_documento_display || documento.estado_documento;

    const titulo = esCotizacion
      ? `Cotización #${documento.id}`
      : `Pedido #${documento.id}`;

    const disclaimer = esCotizacion
      ? `<div class="disclaimer">Cotización válida hasta 3 días o hasta agotar stock</div>`
      : `<div class="footer">El abono del producto constituye garantía por repuestos solicitados. Al desistir del producto el abono sera para saldar costos y gestión.</div>`;

    win.document.write(`
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8" />
        <title>${titulo}</title>
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
          .disclaimer { margin-top: 16px; font-size: 12px; text-align: justify; font-weight: bold; color: #333; }
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
          <strong>Cliente:</strong> ${documento.nombre_cliente}<br />
          <strong>Teléfono:</strong> ${documento.telefono_cliente}<br />
          ${!esCotizacion ? `<strong>Estado:</strong> ${estado}<br />` : ""}
          ${!esCotizacion ? `<strong>Documento:</strong> ${documentoLabel}` : ""}
        </div>
        <table>
          <thead>
            <tr>${!esCotizacion ? "<th>Cód. Prov.</th><th>OEM</th>" : ""}<th>Producto</th><th style="text-align:right;">Total</th></tr>
          </thead>
          <tbody>${filas}</tbody>
        </table>
        <div class="total">Total: $${documento.monto_total}</div>
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

  return (
    <>
      <PageCard title={tab === "nuevo" ? "Nuevo pedido" : "Historial de pedidos"}>
        <div className="page-actions mb-4">
          <div className="btn-group">
            <button
              className={`btn btn-sm ${tab === "nuevo" ? "btn-primary" : "btn-secondary"}`}
              onClick={() => setTab("nuevo")}
            >
              Nuevo pedido
            </button>
            <button
              className={`btn btn-sm ${tab === "historial" ? "btn-primary" : "btn-secondary"}`}
              onClick={() => setTab("historial")}
            >
              Historial
            </button>
          </div>
        </div>

        {tab === "historial" ? (
          <PedidosHistorial />
        ) : (
          <>
            <div className="row mb-4">
              <div className="col-md-6">
                <div className="form-group">
                  <label>Nombre cliente</label>
              <input
                type="text"
                className="form-control"
                value={cliente.nombre}
                onChange={(e) => setCliente({ ...cliente, nombre: e.target.value })}
                placeholder="Nombre del cliente"
              />
            </div>
          </div>
          <div className="col-md-6">
            <div className="form-group">
              <label>Número teléfono cliente</label>
              <input
                type="text"
                className="form-control"
                value={cliente.telefono}
                onChange={(e) => setCliente({ ...cliente, telefono: e.target.value })}
                placeholder="Teléfono del cliente"
              />
            </div>
          </div>
        </div>

        <div className="card mb-4">
          <div className="card-header">Producto</div>
          <div className="card-body">
            <div className="form-group mb-3" ref={productosRef}>
              <label>Buscar producto existente (opcional)</label>
              <input
                type="text"
                className="form-control"
                value={productoTexto}
                onChange={(e) => {
                  setProductoTexto(e.target.value);
                  setMostrarProductos(true);
                }}
                onFocus={() => setMostrarProductos(true)}
                placeholder="Código, OEM o nombre..."
              />
              {mostrarProductos && productosFiltrados.length > 0 && (
                <div className="list-group" style={{ position: "absolute", zIndex: 10, width: "100%", maxHeight: 200, overflow: "auto", background: "var(--bg-elevated)", border: "1px solid var(--border-default)", borderRadius: "var(--radius-sm)" }}>
                  {productosFiltrados.map((p) => (
                    <button
                      key={p.producto_id}
                      type="button"
                      className="list-group-item"
                      style={{ padding: "8px 12px", textAlign: "left", width: "100%", background: "transparent", border: "none", borderBottom: "1px solid var(--border-default)", cursor: "pointer" }}
                      onClick={() => seleccionarProductoExistente(p)}
                    >
                      <div className="font-weight-bold">{p.codigo_producto} — {p.nombre}</div>
                      <div className="text-xs text-muted">OEM: {p.oem} | Costo: ${p.precio_costo}</div>
                    </button>
                  ))}
                </div>
              )}
            </div>

            <div className="row">
              <div className="col-md-6">
                <div className="form-group">
                  <label>Código proveedor</label>
                  <input
                    type="text"
                    className="form-control"
                    value={producto.codigo_proveedor}
                    onChange={(e) => handleProductoChange("codigo_proveedor", e.target.value)}
                    placeholder="Código proveedor"
                  />
                </div>
              </div>
              <div className="col-md-6">
                <div className="form-group">
                  <label>Proveedor</label>
                  <select
                    className="form-control"
                    value={producto.proveedor_id}
                    onChange={(e) => handleProductoChange("proveedor_id", e.target.value)}
                  >
                    <option value="">Seleccione...</option>
                    {proveedores.map((prov) => (
                      <option key={prov.proveedor_id} value={prov.proveedor_id}>{prov.nombre}</option>
                    ))}
                  </select>
                </div>
              </div>
            </div>

            <div className="row">
              <div className="col-md-6">
                <div className="form-group">
                  <label>OEM</label>
                  <input
                    type="text"
                    className="form-control"
                    value={producto.oem}
                    onChange={(e) => handleProductoChange("oem", e.target.value)}
                    placeholder="OEM"
                  />
                </div>
              </div>
              <div className="col-md-6">
                <div className="form-group">
                  <label>Nombre</label>
                  <input
                    type="text"
                    className="form-control"
                    value={producto.nombre}
                    onChange={(e) => handleProductoChange("nombre", e.target.value)}
                    placeholder="Nombre del producto"
                  />
                </div>
              </div>
            </div>

            <div className="row">
              <div className="col-md-6">
                <div className="form-group">
                  <label>Precio costo</label>
                  <input
                    type="number"
                    className="form-control"
                    value={producto.precio_costo}
                    onChange={(e) => handleProductoChange("precio_costo", e.target.value)}
                    placeholder="0"
                    min="0"
                  />
                </div>
              </div>
              <div className="col-md-6">
                <div className="form-group">
                  <label>Porcentaje utilidad</label>
                  <input
                    type="number"
                    className="form-control"
                    value={producto.porcentaje_utilidad}
                    onChange={(e) => handleProductoChange("porcentaje_utilidad", e.target.value)}
                    placeholder="0"
                    min="0"
                    step="0.01"
                  />
                </div>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-3 mt-3 mb-3">
              <label className="flex items-center gap-2" style={{ cursor: "pointer" }}>
                <input
                  type="checkbox"
                  checked={producto.sumar_envio}
                  onChange={(e) => handleProductoChange("sumar_envio", e.target.checked)}
                />
                <span>Sumar envío {shippingLabel}</span>
              </label>
              {showOrderPricingRules && (
                <label className="flex items-center gap-2" style={{ cursor: "pointer" }}>
                  <input
                    type="checkbox"
                    checked={(producto.cost_modifiers || []).includes("stellantis")}
                    onChange={() => toggleCostModifier("stellantis")}
                  />
                  <span>{COST_MODIFIER_LABELS.stellantis}</span>
                </label>
              )}
            </div>

            <div className="flex items-center justify-between flex-wrap gap-3 mt-3">
              <div className="text-right">
                <div className="text-secondary">Subtotal: ${calcularItemSubtotal(producto.precio_costo, producto.porcentaje_utilidad, producto.cost_modifiers)}</div>
                {producto.sumar_envio && shippingCost > 0 && <div className="text-secondary">Envío +${shippingCost.toLocaleString("es-CL")}</div>}
                <div className="text-lg font-bold mt-1">Total producto: ${itemTotalPreview}</div>
              </div>
              <button
                type="button"
                className="btn btn-primary"
                onClick={agregarProducto}
              >
                Agregar
              </button>
            </div>
          </div>
        </div>

        <div className="table-responsive mb-4">
          <table className="table table-sm table-bordered">
            <thead>
              <tr>
                <th>Cód. Prov.</th>
                <th>Proveedor</th>
                <th>OEM</th>
                <th>Nombre</th>
                <th>Precio costo</th>
                <th>% Utilidad</th>
                <th>Total</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {items.map((it, idx) => (
                <tr key={idx}>
                  <td>{it.codigo_proveedor}</td>
                  <td>{proveedores.find((p) => p.proveedor_id === it.proveedor_id)?.nombre || "—"}</td>
                  <td>{it.oem}</td>
                  <td>{it.nombre}</td>
                  <td>${it.precio_costo}</td>
                  <td>{it.porcentaje_utilidad}%</td>
                  <td>${it.precio_final}</td>
                  <td>
                    <button className="btn btn-sm btn-danger" onClick={() => eliminarItem(idx)} title="Eliminar">
                      ✕
                    </button>
                  </td>
                </tr>
              ))}
              {items.length === 0 && (
                <tr>
                  <td colSpan="8" className="text-center text-muted">No hay productos agregados</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        <div className="card mb-4">
          <div className="card-body">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div className="text-right">
                <div className="text-secondary">Subtotal: ${totales.subtotal}</div>
                <div className="text-xl font-bold mt-1">Total: ${totales.total}</div>
              </div>
              <div className="form-group mb-0">
                <label>Método de pago</label>
                <select className="form-control" value={metodoPago} onChange={(e) => setMetodoPago(e.target.value)}>
                  {METODO_PAGO_OPCIONES.map((op) => (
                    <option key={op.value} value={op.value}>{op.label}</option>
                  ))}
                </select>
              </div>
              <div className="form-group mb-0">
                <label>Documento</label>
                <select className="form-control" value={estadoDocumento} onChange={(e) => setEstadoDocumento(e.target.value)}>
                  {DOCUMENTO_OPCIONES.map((op) => (
                    <option key={op.value} value={op.value}>{op.label}</option>
                  ))}
                </select>
              </div>
            </div>
          </div>
        </div>

        <div className="flex flex-wrap justify-end gap-3">
          <button
            type="button"
            className="btn btn-secondary btn-lg"
            onClick={generarCotizacion}
            disabled={createPedido.isPending || items.length === 0}
          >
            {createPedido.isPending ? "Generando..." : "Generar cotización"}
          </button>
          <button
            type="button"
            className="btn btn-success btn-lg"
            onClick={generarPedido}
            disabled={createPedido.isPending || items.length === 0}
          >
            {createPedido.isPending ? "Generando..." : "Generar pedido"}
          </button>
        </div>
            </>
          )}
      </PageCard>
    </>
  );
}
