import { useEffect, useState } from "react";
import PageCard from "../components/PageCard";
import { usePageTitle } from "../lib/usePageTitle";
import { useStoreConfig, useUpdateStoreConfig, useUbicaciones } from "../lib/queries";
import { useToast } from "../lib/useToast";
import { fetchStoreConfig } from "../lib/storeConfig";

const TIMEZONE_OPTIONS = [
  "America/Santiago",
  "America/Punta_Arenas",
  "Pacific/Easter",
  "America/Argentina/Buenos_Aires",
  "America/Lima",
  "America/Bogota",
  "America/Mexico_City",
  "America/Sao_Paulo",
  "America/New_York",
  "America/Los_Angeles",
  "Europe/Madrid",
  "Europe/London",
  "Etc/GMT+4",
];

const CURRENCY_OPTIONS = ["CLP", "USD", "ARS", "COP", "PEN", "MXN", "BRL", "EUR"];

function ListEditor({ items, onChange, codePlaceholder }) {
  const update = (i, patch) => onChange(items.map((it, idx) => (idx === i ? { ...it, ...patch } : it)));
  const remove = (i) => onChange(items.filter((_, idx) => idx !== i));
  const add = () => onChange([...items, { code: "", label: "", active: true }]);
  return (
    <div>
      {items.map((it, i) => (
        <div key={i} className="row mb-2 align-items-center">
          <div className="col-md-2">
            <input
              className="form-control"
              placeholder={codePlaceholder}
              value={it.code || ""}
              onChange={(e) => update(i, { code: e.target.value.toUpperCase() })}
              maxLength={2}
            />
          </div>
          <div className="col-md-4">
            <input
              className="form-control"
              placeholder="Etiqueta"
              value={it.label || ""}
              onChange={(e) => update(i, { label: e.target.value })}
            />
          </div>
          <div className="col-md-3">
            <label className="form-check-label d-flex align-items-center gap-2 mb-0">
              <input
                type="checkbox"
                checked={!!it.active}
                onChange={(e) => update(i, { active: e.target.checked })}
                className="form-check-input"
              />
              Activo
            </label>
          </div>
          <div className="col-md-1">
            <button type="button" className="btn btn-sm btn-danger" onClick={() => remove(i)}>✕</button>
          </div>
        </div>
      ))}
      <button type="button" className="btn btn-sm btn-secondary" onClick={add}>+ Agregar</button>
    </div>
  );
}

export default function ConfiguracionPage() {
  usePageTitle("Configuración");

  const { data: configData, isLoading } = useStoreConfig();
  const { data: ubicacionesData } = useUbicaciones({ page_size: 200 });
  const updateMutation = useUpdateStoreConfig();
  const addToast = useToast();

  const [data, setData] = useState({
    id: null,
    telefono: "",
    direccion: "",
    tax_percent: "19",
    timezone: "America/Santiago",
    currency_code: "CLP",
    price_round_to: "100",
    total_round_to: "1000",
    total_round_threshold: "900",
    default_shipping_cost: "4500",
    default_margin_percent: "30",
    payment_methods: [],
    document_types: [],
    ubicacion_por_defecto: "",
  });

  useEffect(() => {
    if (configData?.length) {
      const cfg = configData[0];
      let cancelled = false;
      Promise.resolve().then(() => {
        if (!cancelled) setData({
          id: cfg.id,
          telefono: cfg.telefono || "",
          direccion: cfg.direccion || "",
          tax_percent: cfg.tax_percent != null ? String(cfg.tax_percent) : "19",
          timezone: cfg.timezone || "America/Santiago",
          currency_code: cfg.currency_code || "CLP",
          price_round_to: cfg.price_round_to != null ? String(cfg.price_round_to) : "100",
          total_round_to: cfg.total_round_to != null ? String(cfg.total_round_to) : "1000",
          total_round_threshold: cfg.total_round_threshold != null ? String(cfg.total_round_threshold) : "900",
          default_shipping_cost: cfg.default_shipping_cost != null ? String(cfg.default_shipping_cost) : "4500",
          default_margin_percent: cfg.default_margin_percent != null ? String(cfg.default_margin_percent) : "30",
          payment_methods: cfg.payment_methods || [],
          document_types: cfg.document_types || [],
          ubicacion_por_defecto: cfg.ubicacion_por_defecto != null ? String(cfg.ubicacion_por_defecto) : "",
        });
      });
      return () => { cancelled = true; };
    }
  }, [configData]);

  function submit(event) {
    event.preventDefault();
    if (!data.id) return;
    updateMutation.mutate(
      {
        id: data.id,
        data: {
          telefono: data.telefono,
          direccion: data.direccion,
          tax_percent: data.tax_percent,
          timezone: data.timezone,
          currency_code: data.currency_code,
          price_round_to: data.price_round_to,
          total_round_to: data.total_round_to,
          total_round_threshold: data.total_round_threshold,
          default_shipping_cost: data.default_shipping_cost,
          default_margin_percent: data.default_margin_percent,
          payment_methods: data.payment_methods,
          document_types: data.document_types,
          ubicacion_por_defecto: data.ubicacion_por_defecto || null,
        },
      },
      {
        onSuccess: () => {
          fetchStoreConfig();
          addToast("Guardado con éxito", "success");
        },
      }
    );
  }

  if (isLoading && !data.id) {
    return <PageCard title="Configuración"><p className="text-center text-muted">Cargando...</p></PageCard>;
  }

  const set = (field) => (e) => setData({ ...data, [field]: e.target.value });
  const ubicaciones = ubicacionesData?.results ?? [];

  return (
    <PageCard title="Configuración">
      <form onSubmit={submit}>
        <h5 className="mt-3 mb-2">Identidad</h5>
        <div className="row">
          <div className="col-md-6 form-group">
            <label>Teléfono</label>
            <input
              className="form-control"
              value={data.telefono}
              onChange={set("telefono")}
              placeholder="+56 9 1234 5678"
            />
          </div>
          <div className="col-md-6 form-group">
            <label>Dirección</label>
            <input
              className="form-control"
              value={data.direccion}
              onChange={set("direccion")}
              placeholder="Av. Principal 123, Comuna, Ciudad"
            />
          </div>
        </div>

        <h5 className="mt-4 mb-2">Moneda y formato</h5>
        <div className="row">
          <div className="col-md-6 form-group">
            <label>Moneda</label>
            <select
              className="form-control"
              value={data.currency_code}
              onChange={set("currency_code")}
            >
              {CURRENCY_OPTIONS.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
          <div className="col-md-6 form-group">
            <label>Zona horaria</label>
            <input
              className="form-control"
              value={data.timezone}
              onChange={set("timezone")}
              placeholder="America/Santiago"
              list="timezone-list"
            />
            <datalist id="timezone-list">
              {TIMEZONE_OPTIONS.map((tz) => <option key={tz} value={tz} />)}
            </datalist>
          </div>
        </div>

        <h5 className="mt-4 mb-2">Impuestos y redondeo</h5>
        <div className="row">
          <div className="col-md-3 form-group">
            <label>Impuesto (%)</label>
            <input
              className="form-control"
              type="number"
              step="0.01"
              min="0"
              max="100"
              value={data.tax_percent}
              onChange={set("tax_percent")}
              required
            />
          </div>
          <div className="col-md-3 form-group">
            <label>Redondear precio a</label>
            <input
              className="form-control"
              type="number"
              min="1"
              value={data.price_round_to}
              onChange={set("price_round_to")}
            />
          </div>
          <div className="col-md-3 form-group">
            <label>Redondear total a</label>
            <input
              className="form-control"
              type="number"
              min="1"
              value={data.total_round_to}
              onChange={set("total_round_to")}
            />
          </div>
          <div className="col-md-3 form-group">
            <label>Umbral de redondeo</label>
            <input
              className="form-control"
              type="number"
              min="0"
              value={data.total_round_threshold}
              onChange={set("total_round_threshold")}
            />
          </div>
        </div>

        <h5 className="mt-4 mb-2">Pedidos</h5>
        <div className="row">
          <div className="col-md-6 form-group">
            <label>Costo de envío por defecto</label>
            <input
              className="form-control"
              type="number"
              min="0"
              value={data.default_shipping_cost}
              onChange={set("default_shipping_cost")}
            />
          </div>
          <div className="col-md-6 form-group">
            <label>Margen de utilidad por defecto (%)</label>
            <input
              className="form-control"
              type="number"
              step="0.01"
              min="0"
              value={data.default_margin_percent}
              onChange={set("default_margin_percent")}
            />
          </div>
        </div>
        <div className="form-group">
          <label>Ubicación por defecto</label>
          <select
            className="form-control"
            value={data.ubicacion_por_defecto}
            onChange={set("ubicacion_por_defecto")}
          >
            <option value="">Sin ubicación</option>
            {ubicaciones.map((u) => (
              <option key={u.id} value={u.id}>{u.nombre}</option>
            ))}
          </select>
        </div>

        <h5 className="mt-4 mb-2">Medios de pago</h5>
        <ListEditor
          items={data.payment_methods}
          onChange={(v) => setData({ ...data, payment_methods: v })}
          codePlaceholder="EF"
        />

        <h5 className="mt-4 mb-2">Documentos</h5>
        <ListEditor
          items={data.document_types}
          onChange={(v) => setData({ ...data, document_types: v })}
          codePlaceholder="BO"
        />

        <button
          className="btn btn-primary"
          disabled={updateMutation.isPending}
        >
          {updateMutation.isPending ? "Guardando..." : "Guardar"}
        </button>
      </form>
    </PageCard>
  );
}