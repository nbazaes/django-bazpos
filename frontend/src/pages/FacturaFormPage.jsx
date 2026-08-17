import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import PageCard from "../components/PageCard";
import StepperInput from "../components/StepperInput";
import { usePageTitle } from "../lib/usePageTitle";
import {
  useCheckFacturaExiste,
  useCreateFactura,
  useFactura,
  useImpuesto,
  useProveedores,
  useUpdateFactura,
  useUbicaciones,
} from "../lib/queries";
import { calcularPrecioVenta } from "../lib/tax";
import { useDebounce } from "../lib/hooks";
import { apiRequest } from "../lib/api";
import { getStoreConfig, fetchStoreConfig } from "../lib/store";

function todayLocal() {
  const now = new Date();
  const yyyy = now.getFullYear();
  const mm = String(now.getMonth() + 1).padStart(2, "0");
  const dd = String(now.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

const FACTURA_STORAGE_KEY = "bazpos_factura_pending";

function readStoredFactura() {
  try {
    const saved = localStorage.getItem(FACTURA_STORAGE_KEY);
    if (saved) {
      const parsed = JSON.parse(saved);
      return {
        step: parsed.step === "items" ? "items" : "header",
        header: parsed.header || { numero_factura: "", proveedor_id: "", fecha: todayLocal() },
        items: Array.isArray(parsed.items) ? parsed.items : [],
      };
    }
  } catch {
    localStorage.removeItem(FACTURA_STORAGE_KEY);
  }
  return null;
}

export default function FacturaFormPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const isEdit = Boolean(id);
  usePageTitle(isEdit ? "Editar factura" : "Crear factura");

  const [initialDraft] = useState(() => (isEdit ? null : readStoredFactura()));
  const [step, setStep] = useState(initialDraft ? initialDraft.step : isEdit ? "items" : "header");
  const [header, setHeader] = useState(
    initialDraft ? initialDraft.header : { numero_factura: "", proveedor_id: "", fecha: todayLocal() }
  );
  const [items, setItems] = useState(initialDraft ? initialDraft.items : []);
  const [showDraftBanner, setShowDraftBanner] = useState(Boolean(initialDraft));
  const [error, setError] = useState("");
  const [warning, setWarning] = useState("");
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showCreatedSuccess, setShowCreatedSuccess] = useState(false);
  const [createUrl, setCreateUrl] = useState("");
  const [searchText, setSearchText] = useState("");
  const [searchResults, setSearchResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const [ubicacionModalIdx, setUbicacionModalIdx] = useState(null);
  const searchRequestRef = useRef(0);

  const { data: proveedoresData } = useProveedores({ page_size: 200 });
  const { data: facturaData } = useFactura(id);
  const { data: impuestoData } = useImpuesto();
  const { data: ubicacionesData } = useUbicaciones({ page_size: 200 });
  const checkMutation = useCheckFacturaExiste();
  const createMutation = useCreateFactura();
  const updateMutation = useUpdateFactura();

  const ubicaciones = useMemo(() => ubicacionesData?.results ?? [], [ubicacionesData?.results]);

  useEffect(() => {
    fetchStoreConfig();
  }, []);

  useEffect(() => {
    if (isEdit) return;
    const hasContent = header.numero_factura || header.proveedor_id || items.length > 0;
    if (hasContent) {
      localStorage.setItem(FACTURA_STORAGE_KEY, JSON.stringify({ step, header, items }));
    } else {
      localStorage.removeItem(FACTURA_STORAGE_KEY);
    }
  }, [step, header, items, isEdit]);

  function descartarBorrador() {
    localStorage.removeItem(FACTURA_STORAGE_KEY);
    setStep("header");
    setHeader({ numero_factura: "", proveedor_id: "", fecha: todayLocal() });
    setItems([]);
    setShowDraftBanner(false);
    setError("");
    setWarning("");
  }

  const buscarProductos = useCallback(async (texto) => {
    if (!texto) {
      setSearchResults([]);
      setSearching(false);
      return;
    }
    setSearching(true);
    const reqId = ++searchRequestRef.current;
    try {
      const result = await apiRequest(`/productos/?texto=${encodeURIComponent(texto)}&sin_stock=true&page_size=50`);
      if (reqId !== searchRequestRef.current) return;
      const productos = Array.isArray(result) ? result : result.results || [];
      setSearchResults(productos);
      if (productos.length === 0) {
        setError("Producto no encontrado");
      } else {
        setError("");
      }
    } catch (err) {
      if (reqId !== searchRequestRef.current) return;
      setError(err.message);
      setSearchResults([]);
    } finally {
      if (reqId === searchRequestRef.current) setSearching(false);
    }
  }, []);

  const debouncedSearch = useDebounce(searchText.trim(), 250);

  useEffect(() => {
    let cancelled = false;
    Promise.resolve().then(() => {
      if (!cancelled) buscarProductos(debouncedSearch);
    });
    return () => { cancelled = true; };
  }, [debouncedSearch, buscarProductos]);

  function agregarDesdeBusqueda(producto) {
    setItems((prev) => {
      const exists = prev.find((it) => it.producto_id === producto.producto_id);
      if (exists) return prev;
      const defaultUbicacion = getStoreConfig().ubicacion_por_defecto;
      return [...prev, {
        producto_id: producto.producto_id,
        codigo_producto: producto.codigo_producto,
        codigo_proveedor: producto.codigo_proveedor || "",
        nombre: producto.nombre,
        proveedor_nombre: producto.proveedor_nombre || "",
        precio: producto.precio_costo,
        cantidad: 1,
        margen_utilidad: Number(producto.margen_utilidad) || 0,
        ubicaciones: defaultUbicacion
          ? [{ ubicacion_id: Number(defaultUbicacion), cantidad: 1 }]
          : [],
      }];
    });
    setSearchText("");
    setSearchResults([]);
    setError("");
  }

  const proveedores = useMemo(() => proveedoresData?.results ?? [], [proveedoresData?.results]);
  const taxPercent = impuestoData?.tax_percent ?? 0;
  const totalFactura = items.reduce((sum, it) => sum + Number(it.precio || 0) * Number(it.cantidad || 0), 0);
  const totalFacturaConIva = Math.round(totalFactura * (1 + taxPercent / 100));

  useEffect(() => {
    if (facturaData && id) {
      setHeader({
        numero_factura: facturaData.numero_factura,
        proveedor_id: facturaData.proveedor,
        fecha: facturaData.fecha,
      });
      const defaultUbicacion = getStoreConfig().ubicacion_por_defecto;
      setItems(
        (facturaData.detalles || []).map((d) => ({
          producto_id: d.producto,
          codigo_producto: d.codigo_producto,
          codigo_proveedor: d.codigo_proveedor || "",
          nombre: d.nombre,
          proveedor_nombre: d.proveedor_nombre || "",
          precio: d.costo_compra,
          cantidad: d.cantidad,
          margen_utilidad: Number(d.margen_utilidad) || 0,
          ubicaciones: defaultUbicacion
            ? [{ ubicacion_id: Number(defaultUbicacion), cantidad: d.cantidad }]
            : [],
        }))
      );
    }
  }, [facturaData, id]);

  const proveedorNombre = useMemo(() => {
    if (!header.proveedor_id) return "";
    const p = proveedores.find((p) => String(p.proveedor_id) === String(header.proveedor_id));
    return p ? p.nombre : "";
  }, [header.proveedor_id, proveedores]);

  const handleProductCreated = useCallback((event) => {
    const payload = event.data;
    if (!payload || payload.type !== "PRODUCT_CREATED" || !payload.producto) return;
    const p = payload.producto;
    setItems((prev) => {
      const exists = prev.find((it) => it.producto_id === p.producto_id);
      if (exists) return prev;
      const defaultUbicacion = getStoreConfig().ubicacion_por_defecto;
      return [...prev, {
        producto_id: p.producto_id,
        codigo_producto: p.codigo_producto,
        codigo_proveedor: p.codigo_proveedor || "",
        nombre: p.nombre,
        proveedor_nombre: p.proveedor_nombre || "",
        precio: p.precio_costo,
        cantidad: 1,
        margen_utilidad: Number(p.margen_utilidad) || 0,
        ubicaciones: defaultUbicacion
          ? [{ ubicacion_id: Number(defaultUbicacion), cantidad: 1 }]
          : [],
      }];
    });
    setError("");
    setShowCreatedSuccess(true);
    setTimeout(() => {
      setShowCreatedSuccess(false);
      setShowCreateModal(false);
    }, 1200);
  }, []);

  useEffect(() => {
    window.addEventListener("message", handleProductCreated);
    return () => window.removeEventListener("message", handleProductCreated);
  }, [handleProductCreated]);

  function abrirCrearProducto() {
    const params = new URLSearchParams();
    if (searchText) params.set("codigo_producto", searchText);
    if (header.proveedor_id) params.set("proveedor", String(header.proveedor_id));
    params.set("from_factura", "1");
    params.set("embed", "1");
    setCreateUrl(`/productos/crear?${params.toString()}`);
    setShowCreateModal(true);
  }

  function continuar() {
    setError("");
    setWarning("");
    checkMutation.mutate(
      { numero_factura: Number(header.numero_factura), proveedor_id: Number(header.proveedor_id) },
      {
        onSuccess: (data) => {
          if (data.exists) {
            localStorage.removeItem(FACTURA_STORAGE_KEY);
            setWarning("Factura ya ingresada.");
            setTimeout(() => {
              setWarning("");
              navigate(`/facturas/${data.id}/editar`);
            }, 1500);
          } else {
            setStep("items");
          }
        },
        onError: (err) => setError(err.message),
      }
    );
  }

  function volver() {
    setStep("header");
    setError("");
    setWarning("");
  }

  function guardar(event) {
    event.preventDefault();
    setError("");
    setWarning("");
    const payload = {
      numero_factura: Number(header.numero_factura),
      proveedor_id: Number(header.proveedor_id),
      fecha: header.fecha,
      productos: items.map((it) => ({
        producto_id: Number(it.producto_id),
        precio: Number(it.precio),
        cantidad: Number(it.cantidad),
        ubicaciones: (it.ubicaciones || []).filter((u) => u.ubicacion_id && u.cantidad > 0),
      })),
    };
    const mutation = id ? updateMutation : createMutation;
    mutation.mutate(id ? { id, data: payload } : payload, {
      onSuccess: (data) => {
        localStorage.removeItem(FACTURA_STORAGE_KEY);
        if (data?.existing) {
          setWarning("Factura ya ingresada.");
          setTimeout(() => {
            setWarning("");
            navigate(`/facturas/${data.id}/editar`);
          }, 1500);
        } else {
          navigate("/facturas");
        }
      },
      onError: (err) => setError(err.message),
    });
  }

  function getUbicacionSummary(item) {
    const ubs = item.ubicaciones || [];
    const valid = ubs.filter((u) => u.ubicacion_id);
    if (valid.length === 0) return "Sin ubicación";
    if (valid.length === 1) {
      const ub = ubicaciones.find((u) => u.id === valid[0].ubicacion_id);
      return ub ? ub.nombre : "—";
    }
    return `${valid.length} ubicaciones`;
  }

  const saving = createMutation.isPending || updateMutation.isPending;

  const esUbicacionInvalida = (it) => {
    const ubs = it.ubicaciones || [];
    if (ubs.length === 0) return false;
    if (ubs.some((u) => !u.ubicacion_id)) return true;
    const total = ubs.reduce((s, u) => s + (u.cantidad || 0), 0);
    return total !== (it.cantidad || 0);
  };

  const ubicacionesInvalidas = useMemo(() => items.some(esUbicacionInvalida), [items]);
  const productosInvalidos = useMemo(
    () => items.filter(esUbicacionInvalida).map((it) => it.nombre),
    [items]
  );

  const headerField = (label, disabled, value, onChange, type) => (
    <div className="col-md-4 form-group">
      <label>{label}</label>
      <input
        disabled={disabled}
        className="form-control"
        type={type || "text"}
        value={value}
        onChange={onChange}
        required
      />
    </div>
  );

  const proveedorSelect = (disabled) => (
    <div className="col-md-4 form-group">
      <label>Proveedor</label>
      {disabled ? (
        <div className="form-control" style={{ backgroundColor: "var(--gray-100)", opacity: 0.8 }}>{proveedorNombre}</div>
      ) : (
        <select
          className="form-control"
          value={header.proveedor_id}
          onChange={(e) => setHeader({ ...header, proveedor_id: e.target.value })}
          required
        >
          <option value="">Seleccione</option>
          {proveedores.map((p) => (
            <option key={p.proveedor_id} value={p.proveedor_id}>{p.nombre}</option>
          ))}
        </select>
      )}
    </div>
  );

  const headerReadonlyFields = (
    <div className="row">
      <div className="col-md-4 form-group">
        <label>Número factura</label>
        <div className="form-control" style={{ backgroundColor: "var(--gray-100)", opacity: 0.8 }}>{header.numero_factura}</div>
      </div>
      {proveedorSelect(true)}
      <div className="col-md-4 form-group">
        <label>Fecha</label>
        <input type="date" className="form-control" value={header.fecha} onChange={(e) => setHeader({ ...header, fecha: e.target.value })} required />
      </div>
    </div>
  );

  const renderStepHeader = () => (
    <PageCard title="Crear factura">
      {error && <div className="alert alert-danger">{error}</div>}
      {warning && <div className="alert alert-warning">{warning}</div>}
      <div className="row">
        <div className="col-md-4 form-group">
          <label>Número factura</label>
          <input
            className="form-control"
            value={header.numero_factura}
            onChange={(e) => setHeader({ ...header, numero_factura: e.target.value })}
            type="number"
            required
          />
        </div>
        {proveedorSelect(false)}
      </div>
      <div className="mt-3">
        <button
          type="button"
          className="btn btn-primary"
          onClick={continuar}
          disabled={checkMutation.isPending || !header.numero_factura || !header.proveedor_id}
        >
          {checkMutation.isPending ? "Verificando..." : "Continuar"}
        </button>
      </div>
    </PageCard>
  );

  const renderStepItems = () => (
    <PageCard title={isEdit ? "Editar factura" : "Crear factura"}>
      {error && <div className="alert alert-danger">{error}</div>}
      {warning && <div className="alert alert-warning">{warning}</div>}
      <form onSubmit={guardar}>
        {isEdit ? (
          <div className="row">
            {headerField("Número factura", true, header.numero_factura, (e) => setHeader({ ...header, numero_factura: e.target.value }), "number")}
            {proveedorSelect(false)}
            {headerField("Fecha", false, header.fecha, (e) => setHeader({ ...header, fecha: e.target.value }), "date")}
          </div>
        ) : (
          headerReadonlyFields
        )}

        <div className="page-actions mb-0">
          <input
            className="form-control"
            style={{ maxWidth: 400 }}
            placeholder="Buscar por código, OEM o nombre..."
            value={searchText}
            onChange={(e) => setSearchText(e.target.value)}
          />
        </div>

        {searching && (
          <div className="text-secondary mt-2" style={{ fontSize: "0.85rem" }}>Buscando...</div>
        )}

        {searchResults.length > 0 && (
          <div className="table-responsive mt-2 mb-3">
            <table className="table table-sm table-bordered">
              <thead>
                <tr>
                  <th>Código</th>
                  <th>Cód. Proveedor</th>
                  <th>Proveedor</th>
                  <th>Nombre</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {searchResults.map((p) => {
                  const alreadyAdded = items.some((it) => it.producto_id === p.producto_id);
                  return (
                    <tr key={p.producto_id}>
                      <td style={{ whiteSpace: "nowrap" }}>{p.codigo_producto}</td>
                      <td style={{ whiteSpace: "nowrap" }}>{p.codigo_proveedor || "—"}</td>
                      <td>{p.proveedor_nombre || "—"}</td>
                      <td>{p.nombre}</td>
                      <td style={{ whiteSpace: "nowrap" }}>
                        {alreadyAdded ? (
                          <span className="badge" style={{ background: "var(--gray-200)", color: "var(--gray-600)" }}>Agregado</span>
                        ) : (
                          <button
                            type="button"
                            className="btn btn-sm btn-primary"
                            onClick={() => agregarDesdeBusqueda(p)}
                          >
                            Agregar
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {!searching && searchText.trim() && searchResults.length === 0 && (
          <div className="mt-2 mb-3">
            <span className="text-secondary">Producto no encontrado. </span>
            <button type="button" className="btn btn-sm btn-primary" onClick={abrirCrearProducto}>
              Crear producto
            </button>
          </div>
        )}

        {items.length > 0 && (
          <div className="table-responsive mt-3">
            <table className="table table-sm table-bordered">
              <thead>
                <tr>
                  <th>Código</th>
                  <th>Cód. Proveedor</th>
                  <th>Proveedor</th>
                  <th>Nombre</th>
                  <th>Precio costo</th>
                  <th>Precio con IVA</th>
                  <th>Cantidad</th>
                  <th style={{ whiteSpace: "nowrap" }}>Margen utilidad (%)</th>
                  <th>Precio venta</th>
                  <th>Ubicación</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {items.map((it, idx) => {
                  const rowInvalida = esUbicacionInvalida(it);
                  return (
                  <tr key={`${it.producto_id}-${idx}`} style={rowInvalida ? { background: "var(--danger-soft)" } : undefined}>
                    <td style={{ whiteSpace: "nowrap" }}>{it.codigo_producto}</td>
                    <td style={{ whiteSpace: "nowrap" }}>{it.codigo_proveedor || "—"}</td>
                    <td>{it.proveedor_nombre || "—"}</td>
                    <td>{it.nombre}</td>
                    <td><input className="form-control form-control-sm" type="number" value={it.precio} onChange={(e) => { const next = [...items]; next[idx].precio = e.target.value; setItems(next); }} /></td>
                    <td>${Math.round(Number(it.precio || 0) * (1 + taxPercent / 100))}</td>
                    <td>
                      <StepperInput
                        value={it.cantidad}
                        onChange={(val) => {
                          setItems((prev) => {
                            const next = [...prev];
                            next[idx].cantidad = val;
                            return next;
                          });
                        }}
                        min={1}
                        inputStyle={{ width: 64, fontSize: "0.85rem" }}
                        decrementLabel={`Disminuir cantidad de ${it.nombre}`}
                        incrementLabel={`Aumentar cantidad de ${it.nombre}`}
                      />
                    </td>
                    <td><input className="form-control form-control-sm" type="number" step="0.01" style={{ width: 80 }} value={it.margen_utilidad} onChange={(e) => { const next = [...items]; next[idx].margen_utilidad = e.target.value; setItems(next); }} /></td>
                    <td style={{ fontFamily: "var(--font-mono)", fontWeight: 600, whiteSpace: "nowrap" }}>${calcularPrecioVenta(it.precio, it.margen_utilidad).toLocaleString()}</td>
                    <td>
                      <button
                        type="button"
                        className={`btn btn-sm ${rowInvalida ? "btn-outline-danger" : "btn-outline-secondary"}`}
                        onClick={() => setUbicacionModalIdx(idx)}
                        title="Repartir stock en ubicaciones"
                      >
                        {getUbicacionSummary(it)}
                        {rowInvalida && <i className="bi bi-exclamation-triangle-fill" style={{ marginLeft: 6 }} aria-label="Repartir stock incompleto"></i>}
                      </button>
                      {rowInvalida && (
                        <div className="text-danger" style={{ fontSize: "0.72rem", marginTop: 4 }}>
                          Repartir stock incompleto
                        </div>
                      )}
                    </td>
                    <td><i className="bi bi-trash" style={{ cursor: "pointer", color: "var(--danger)", fontSize: "1.1rem" }} onClick={() => setItems(items.filter((_, i) => i !== idx))}></i></td>
                  </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        <div className="flex justify-end mb-4 text-right">
          <div>
            <div className="text-sm text-secondary mb-1">Total neto: ${totalFactura}</div>
            <div className="text-xl font-display font-bold">Total con IVA ({taxPercent}%): ${totalFacturaConIva}</div>
          </div>
        </div>

        {ubicacionesInvalidas && (
          <div className="alert alert-danger">
            Debe repartir correctamente el stock de: {productosInvalidos.join(", ")}
          </div>
        )}

        <div className="flex gap-2">
          {!isEdit && (
            <button type="button" className="btn btn-secondary" onClick={volver}>
              Volver
            </button>
          )}
          <button className="btn btn-primary" type="submit" disabled={saving || ubicacionesInvalidas}>
            {saving ? "Guardando..." : "Guardar factura"}
          </button>
        </div>
      </form>
    </PageCard>
  );

  const renderUbicacionModal = () => {
    if (ubicacionModalIdx === null) return null;
    const item = items[ubicacionModalIdx];
    if (!item) return null;

    const itemUbicaciones = item.ubicaciones || [];
    const totalUbicado = itemUbicaciones.reduce((sum, u) => sum + (u.cantidad || 0), 0);
    const restante = (item.cantidad || 0) - totalUbicado;
    const hasEmptyUbicacion = itemUbicaciones.some((u) => !u.ubicacion_id);

    return (
      <div className="modal" role="dialog" aria-modal="true" onClick={(e) => { if (e.target === e.currentTarget) setUbicacionModalIdx(null); }}>
        <div className="modal-dialog" style={{ maxWidth: 520 }}>
          <div className="modal-content">
            <div className="modal-header">
              <h5 className="modal-title">Repartir stock — {item.nombre}</h5>
              <button type="button" className="modal-close" onClick={() => setUbicacionModalIdx(null)}>&times;</button>
            </div>
            <div className="modal-body">
              <div className="mb-3">
                <span className="text-secondary">Cantidad total a repartir: </span>
                <strong>{item.cantidad}</strong>
                {restante !== 0 && (
                  <span style={{ color: restante < 0 ? "var(--danger)" : "var(--warning)", marginLeft: 8 }}>
                    {restante < 0 ? `Excedente: ${Math.abs(restante)}` : `Restante por asignar: ${restante}`}
                  </span>
                )}
                {restante === 0 && (
                  <span className="text-success" style={{ marginLeft: 8 }}>Completo</span>
                )}
              </div>

              {itemUbicaciones.map((ub, ui) => (
                <div key={ui} className="row mb-2 align-items-center">
                  <div className="col">
                    <select
                      className="form-control form-control-sm"
                      value={ub.ubicacion_id || ""}
                      onChange={(e) => {
                        const next = [...items];
                        const ubs = [...next[ubicacionModalIdx].ubicaciones];
                        ubs[ui] = { ...ubs[ui], ubicacion_id: e.target.value ? Number(e.target.value) : null };
                        next[ubicacionModalIdx] = { ...next[ubicacionModalIdx], ubicaciones: ubs };
                        setItems(next);
                      }}
                    >
                      <option value="">Seleccione</option>
                      {ubicaciones.map((u) => (
                        <option key={u.id} value={u.id}>{u.nombre}</option>
                      ))}
                    </select>
                  </div>
                  <div className="col-auto" style={{ width: 100 }}>
                    <input
                      className="form-control form-control-sm"
                      type="number"
                      min={0}
                      value={ub.cantidad}
                      onChange={(e) => {
                        const next = [...items];
                        const ubs = [...next[ubicacionModalIdx].ubicaciones];
                        ubs[ui] = { ...ubs[ui], cantidad: Number(e.target.value) || 0 };
                        next[ubicacionModalIdx] = { ...next[ubicacionModalIdx], ubicaciones: ubs };
                        setItems(next);
                      }}
                    />
                  </div>
                  <div className="col-auto">
                    <button
                      type="button"
                      className="btn btn-sm"
                      style={{ color: "var(--danger)" }}
                      onClick={() => {
                        const next = [...items];
                        const ubs = next[ubicacionModalIdx].ubicaciones.filter((_, i) => i !== ui);
                        next[ubicacionModalIdx] = { ...next[ubicacionModalIdx], ubicaciones: ubs };
                        setItems(next);
                      }}
                    >
                      <i className="bi bi-trash" />
                    </button>
                  </div>
                </div>
              ))}

              <button
                type="button"
                className="btn btn-sm btn-secondary mt-2"
                onClick={() => {
                  const next = [...items];
                  const ubs = [...next[ubicacionModalIdx].ubicaciones, { ubicacion_id: null, cantidad: 0 }];
                  next[ubicacionModalIdx] = { ...next[ubicacionModalIdx], ubicaciones: ubs };
                  setItems(next);
                }}
              >
                + Agregar ubicación
              </button>

              {restante > 0 && (
                <div className="mt-3">
                  <button
                    type="button"
                    className="btn btn-sm btn-outline-primary"
                    onClick={() => {
                      const next = [...items];
                      const ubs = next[ubicacionModalIdx].ubicaciones.filter((u) => u.ubicacion_id);
                      if (ubs.length > 0) {
                        const perLocation = Math.floor(restante / ubs.length);
                        let extra = restante - perLocation * ubs.length;
                        const updated = ubs.map((u) => {
                          const add = perLocation + (extra > 0 ? 1 : 0);
                          if (extra > 0) extra--;
                          return { ...u, cantidad: (u.cantidad || 0) + add };
                        });
                        next[ubicacionModalIdx] = { ...next[ubicacionModalIdx], ubicaciones: updated };
                        setItems(next);
                      }
                    }}
                  >
                    Repartir restante equitativamente
                  </button>
                </div>
              )}
            </div>
            <div className="modal-footer">
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => {
                  const next = [...items];
                  const defaultUbicacion = getStoreConfig().ubicacion_por_defecto;
                  next[ubicacionModalIdx] = {
                    ...next[ubicacionModalIdx],
                    ubicaciones: defaultUbicacion
                      ? [{ ubicacion_id: Number(defaultUbicacion), cantidad: next[ubicacionModalIdx].cantidad }]
                      : [],
                  };
                  setItems(next);
                }}
              >
                Reset a ubicación por defecto
              </button>
              <button type="button" className="btn btn-primary" onClick={() => setUbicacionModalIdx(null)} disabled={restante !== 0 || hasEmptyUbicacion}>
                Aceptar
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  };

  return (
    <>
      {showDraftBanner && !isEdit && (
        <div className="alert alert-info d-flex justify-content-between align-items-center flex-wrap gap-2">
          <span>
            Borrador recuperado{header.numero_factura ? ` — factura N° ${header.numero_factura}` : ""} ({items.length} producto{items.length === 1 ? "" : "s"}).
          </span>
          <button type="button" className="btn btn-sm btn-secondary" onClick={descartarBorrador}>
            Descartar borrador
          </button>
        </div>
      )}
      {step === "header" && renderStepHeader()}
      {step === "items" && renderStepItems()}
      {renderUbicacionModal()}

      {showCreateModal && (
        <div className="modal" role="dialog" aria-modal="true">
          <div className="modal-dialog modal-xl" style={{ maxWidth: 1100 }}>
            <div className="modal-content">
              <div className="modal-header">
                <h5 className="modal-title">Crear producto</h5>
                <button type="button" className="modal-close" onClick={() => setShowCreateModal(false)}>&times;</button>
              </div>
              <div className="modal-body p-0" style={{ height: "75vh" }}>
                <iframe title="Crear producto" src={createUrl} style={{ width: "100%", height: "100%", border: 0 }} />
              </div>
            </div>
          </div>
        </div>
      )}

      {showCreatedSuccess && (
        <div className="modal" role="dialog" aria-modal="true">
          <div className="modal-dialog" style={{ maxWidth: 420 }}>
            <div className="modal-content">
              <div className="modal-body text-center py-5">
                <div className="text-success mb-3" style={{ fontSize: 36, lineHeight: 1 }}>&#10003;</div>
                <h5 className="mb-0">Producto creado con éxito</h5>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
