import { useState } from "react";
import PageCard from "../components/PageCard";
import Pagination from "../components/Pagination";
import PageSizeSelector from "../components/PageSizeSelector";
import MultiSelect from "../components/MultiSelect";
import { formatDateTime } from "../lib/format";
import { useToast } from "../lib/useToast";
import { downloadReporteCsv, useReporteCustom, useReportesCustomSchema } from "../lib/queries";
import { formatMoney } from "../lib/storeConfig";

const PRESETS = {
  productos: ["codigo_producto", "nombre", "marca", "proveedor_nombre", "precio_costo", "stock_actual"],
  ventas: ["fecha_venta", "vendedor", "producto_codigo", "producto_nombre", "cantidad", "subtotal"],
};

const EMPTY_FILTERS = {
  ubicaciones: [],
  proveedores: [],
  marcas: [],
  vendedores: [],
  texto: "",
  fecha_desde: "",
  fecha_hasta: "",
  sin_stock: false,
  con_stock: false,
  bajo_minimo: false,
};

function formatCLP(value) {
  return formatMoney(value);
}

function formatDate(value) {
  if (!value) return "—";
  const [y, m, d] = String(value).slice(0, 10).split("-");
  if (!y || !m || !d) return String(value);
  return `${d}/${m}/${y}`;
}

function renderCell(type, value) {
  if (value === null || value === undefined || value === "") return "—";
  if (type === "money") return formatCLP(value);
  if (type === "datetime") return formatDateTime(value);
  if (type === "date") return formatDate(value);
  return String(value);
}

export default function ReportesPersonalizadosPage() {
  const show = useToast();

  const [dataset, setDataset] = useState("productos");
  const [filters, setFilters] = useState({ ...EMPTY_FILTERS });
  const [fields, setFields] = useState(PRESETS.productos);
  const [incluirStockUbicacion, setIncluirStockUbicacion] = useState(false);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(50);

  const { data: schemaData } = useReportesCustomSchema();

  const datasets = schemaData?.datasets ?? [];
  const schema = datasets.find((d) => d.key === dataset);
  const datasetFilters = schema?.filters ?? [];
  const datasetFields = schema?.fields ?? [];
  const dynamicConfig = schema?.dynamic_fields;
  const stockPrefix = dynamicConfig?.prefix;

  const selectDataset = (key) => {
    setDataset(key);
    setFilters({ ...EMPTY_FILTERS });
    setFields(PRESETS[key] ?? []);
    setIncluirStockUbicacion(false);
    setPage(1);
  };

  const setFilter = (key, value) => {
    setFilters((prev) => ({ ...prev, [key]: value }));
    setPage(1);
  };

  const toggleField = (key) => {
    setFields((prev) => (prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]));
    setPage(1);
  };

  const dynamicStockKeys =
    stockPrefix && incluirStockUbicacion
      ? filters.ubicaciones.map((id) => `${stockPrefix}${id}`)
      : [];

  const effectiveFields = [
    ...fields.filter((f) => !f.startsWith(stockPrefix ?? "__none__")),
    ...dynamicStockKeys,
  ];

  const params = {
    dataset,
    fields: effectiveFields.join(","),
    ubicaciones: filters.ubicaciones.join(","),
    proveedores: filters.proveedores.join(","),
    marcas: filters.marcas.join(","),
    vendedores: filters.vendedores.join(","),
    texto: filters.texto || undefined,
    fecha_desde: filters.fecha_desde || undefined,
    fecha_hasta: filters.fecha_hasta || undefined,
    stock_fecha: filters.stock_fecha || undefined,
    sin_stock: filters.sin_stock ? "true" : undefined,
    con_stock: filters.con_stock ? "true" : undefined,
    bajo_minimo: filters.bajo_minimo ? "true" : undefined,
    page,
    page_size: pageSize,
  };

  const { data, error, isLoading, isFetching } = useReporteCustom(params);

  const selectedUbicaciones = filters.ubicaciones;

  const exportar = async () => {
    try {
      await downloadReporteCsv(params);
      show("Reporte exportado", "success");
    } catch (e) {
      show(`Error al exportar: ${e.message}`, "danger");
    }
  };

  const renderFilter = (f) => {
    switch (f.type) {
      case "multiselect":
        return (
          <MultiSelect
            key={f.key}
            label={f.label}
            options={f.options ?? []}
            selected={filters[f.key] ?? []}
            onChange={(v) => setFilter(f.key, v)}
          />
        );
      case "date":
        return (
          <label className="report-filter-field" key={f.key}>
            <span className="multiselect-label">{f.label}</span>
            <input
              type="date"
              className="form-control form-control-sm"
              value={filters[f.key] || ""}
              onChange={(e) => setFilter(f.key, e.target.value)}
            />
          </label>
        );
      case "boolean":
        return (
          <label className="checkbox-custom report-checkbox" key={f.key}>
            <input
              type="checkbox"
              checked={filters[f.key] || false}
              onChange={(e) => setFilter(f.key, e.target.checked)}
            />
            <span>{f.label}</span>
          </label>
        );
      case "text":
      default:
        return (
          <label className="report-filter-field" key={f.key}>
            <span className="multiselect-label">{f.label}</span>
            <input
              type="text"
              className="form-control form-control-sm"
              placeholder={f.placeholder ?? ""}
              value={filters[f.key] || ""}
              onChange={(e) => setFilter(f.key, e.target.value)}
            />
          </label>
        );
    }
  };

  return (
    <>
      <div className="btn-group mb-3" style={{ flexWrap: "wrap" }}>
        {datasets.map((d) => (
          <button
            key={d.key}
            className={`btn btn-sm ${dataset === d.key ? "btn-primary" : "btn-outline"}`}
            onClick={() => selectDataset(d.key)}
          >
            {d.label}
          </button>
        ))}
      </div>

      {schema && (
        <>
          <div className="card mb-3">
            <div className="card-header">
              <h6 className="card-title">Filtros</h6>
            </div>
            <div className="card-body">
              <div className="report-filters">
                {datasetFilters.map(renderFilter)}
              </div>
            </div>
          </div>

          <div className="card mb-3">
            <div className="card-header d-flex justify-content-between align-items-center">
              <h6 className="card-title">Columnas a mostrar</h6>
              <button
                type="button"
                className="btn btn-sm btn-outline"
                onClick={() => setFields(datasetFields.map((f) => f.key))}
              >
                Seleccionar todas
              </button>
            </div>
            <div className="card-body">
              <div className="report-field-chips">
                {datasetFields.map((f) => (
                  <label key={f.key} className="report-field-chip">
                    <input
                      type="checkbox"
                      checked={fields.includes(f.key)}
                      onChange={() => toggleField(f.key)}
                    />
                    <span>{f.label}</span>
                  </label>
                ))}
                {dynamicConfig && selectedUbicaciones.length > 0 && (
                  <label className="report-field-chip">
                    <input
                      type="checkbox"
                      checked={incluirStockUbicacion}
                      onChange={(e) => {
                        setIncluirStockUbicacion(e.target.checked);
                        setPage(1);
                      }}
                    />
                    <span>Stock por cada ubicación</span>
                  </label>
                )}
              </div>
            </div>
          </div>
        </>
      )}

      <PageCard title={`Resultados${data?.total != null ? ` (${data.total})` : ""}`}>
        <div className="d-flex justify-content-between align-items-center flex-wrap gap-2 mb-2">
          <PageSizeSelector value={pageSize} onChange={(v) => { setPageSize(v); setPage(1); }} />
          <button
            type="button"
            className="btn btn-sm btn-success"
            onClick={exportar}
            disabled={isLoading || !data}
          >
            Exportar CSV
          </button>
        </div>

        {isLoading && <div className="text-center text-muted mt-4">Cargando...</div>}
        {error && <div className="alert alert-danger">{error.message}</div>}

        {data?.rows && !isLoading && (
          <>
            {data.rows.length === 0 ? (
              <p className="text-muted">Sin resultados para los filtros seleccionados.</p>
            ) : (
              <div className="table-responsive">
                <table className="table table-sm table-bordered">
                  <thead>
                    <tr>
                      {(data.columns ?? []).map((c) => (
                        <th key={c.key}>{c.label}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {data.rows.map((row, i) => (
                      <tr key={i}>
                        {(data.columns ?? []).map((c) => (
                          <td key={c.key}>{renderCell(c.type, row[c.key])}</td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            {isFetching && <div className="text-muted text-sm mt-2">Actualizando...</div>}
            <Pagination
              page={data.page}
              totalPages={data.pages}
              onPageChange={setPage}
              count={data.total}
              pageSize={data.page_size}
            />
          </>
        )}
      </PageCard>
    </>
  );
}
