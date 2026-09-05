import { useState, useMemo } from "react";
import { Line } from "react-chartjs-2";
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend,
  Filler,
} from "chart.js";
import PageCard from "../components/PageCard";
import ReportesPersonalizadosPage from "./ReportesPersonalizadosPage";
import { usePageTitle } from "../lib/usePageTitle";
import { useReportesStats } from "../lib/queries";

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, Title, Tooltip, Legend, Filler);

const TABS = [
  { key: "ventas-diarias", label: "Ventas Diarias" },
  { key: "top-productos", label: "Top Productos" },
  { key: "stock-critico", label: "Stock Crítico" },
  { key: "ventas-vendedor", label: "Ventas por Vendedor" },
  { key: "personalizados", label: "Reportes personalizados" },
];

function formatCLP(value) {
  return `$${Number(value || 0).toLocaleString("es-CL")}`;
}

export default function ReportesPage() {
  usePageTitle("Reportes");
  const [tab, setTab] = useState("ventas-diarias");

  const hoy = new Date();
  const [mes, setMes] = useState(hoy.getMonth() + 1);
  const [anio, setAnio] = useState(hoy.getFullYear());

  const { data, error, isLoading } = useReportesStats({ mes, anio });

  const chartData = useMemo(() => {
    if (!data?.ventas_diarias) return null;
    const labels = data.ventas_diarias.map((d) => {
      const [, , dia] = d.fecha.split("-");
      return dia;
    });
    const values = data.ventas_diarias.map((d) => d.total);
    return {
      labels,
      datasets: [
        {
          label: "Ventas ($)",
          data: values,
          fill: true,
          borderColor: "#673ab7",
          backgroundColor: "rgba(103, 58, 183, 0.15)",
          tension: 0.3,
          pointRadius: 3,
          pointHoverRadius: 5,
        },
      ],
    };
  }, [data]);

  const chartOptions = useMemo(
    () => ({
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            label: (ctx) => formatCLP(ctx.raw),
          },
        },
      },
      scales: {
        x: {
          grid: { color: "rgba(128,128,128,0.2)" },
          title: { display: true, text: "Día del mes" },
        },
        y: {
          grid: { color: "rgba(128,128,128,0.2)" },
          ticks: {
            callback: (v) => formatCLP(v),
          },
        },
      },
    }),
    []
  );

  return (
    <>
      {tab !== "personalizados" && (
        <div style={{ display: "flex", alignItems: "center", gap: "1rem", marginBottom: "1.5rem", flexWrap: "wrap" }}>
          <label style={{ display: "flex", alignItems: "center", gap: "0.5rem", fontWeight: 500 }}>
            Mes:
            <select
              className="form-control"
              value={mes}
              onChange={(e) => setMes(Number(e.target.value))}
              style={{ maxWidth: 150 }}
            >
              {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => (
                <option key={m} value={m}>
                  {new Date(anio, m - 1, 1).toLocaleString("es-CL", { month: "long" })}
                </option>
              ))}
            </select>
          </label>
          <label style={{ display: "flex", alignItems: "center", gap: "0.5rem", fontWeight: 500 }}>
            Año:
            <select
              className="form-control"
              value={anio}
              onChange={(e) => setAnio(Number(e.target.value))}
              style={{ maxWidth: 110 }}
            >
              {Array.from({ length: 5 }, (_, i) => hoy.getFullYear() - i).map((y) => (
                <option key={y} value={y}>
                  {y}
                </option>
              ))}
            </select>
          </label>
          {data && (
            <div className="stat-card stat-card-success" style={{ marginBottom: 0 }}>
              <div className="stat-label">Total ventas del mes</div>
              <div className="stat-value">{formatCLP(data.total_ventas_mes)}</div>
            </div>
          )}
        </div>
      )}

      <div className="btn-group mb-4" style={{ flexWrap: "wrap" }}>
        {TABS.map((t) => (
          <button
            key={t.key}
            className={`btn btn-sm ${tab === t.key ? "btn-primary" : "btn-outline"}`}
            onClick={() => setTab(t.key)}
          >
            {t.label}
          </button>
        ))}
      </div>

      {isLoading && <div className="text-center text-muted mt-5">Cargando...</div>}
      {error && <div className="alert alert-danger">{error.message}</div>}

      {data && tab === "ventas-diarias" && (
        <PageCard title="Historial de ventas diarias">
          {chartData && (data.ventas_diarias || []).length > 0 ? (
            <div style={{ height: 400 }}>
              <Line data={chartData} options={chartOptions} />
            </div>
          ) : (
            <p className="text-muted">Sin ventas en este período.</p>
          )}
        </PageCard>
      )}

      {data && tab === "top-productos" && (
        <PageCard title="Top 10 productos más vendidos del mes">
          {(data.top_productos_mes || []).length > 0 ? (
            <div className="table-responsive">
              <table className="table table-sm table-bordered">
                <thead>
                  <tr>
                    <th>#</th>
                    <th>Código</th>
                    <th>Producto</th>
                    <th>Cantidad vendida</th>
                    <th>Monto total</th>
                  </tr>
                </thead>
                <tbody>
                  {data.top_productos_mes.map((p, i) => (
                    <tr key={p.producto__producto_id || i}>
                      <td>{i + 1}</td>
                      <td>{p.producto__codigo_producto}</td>
                      <td>{p.producto__nombre}</td>
                      <td>{p.total_vendido}</td>
                      <td>{formatCLP(p.monto_total)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="text-muted">Sin ventas en este período.</p>
          )}
        </PageCard>
      )}

      {data && tab === "stock-critico" && (
        <PageCard title="Stock crítico">
          {(data.stock_critico || []).length > 0 ? (
            <div className="table-responsive">
              <table className="table table-sm table-bordered">
                <thead>
                  <tr>
                    <th>Nombre</th>
                    <th>Código</th>
                    <th>OEM</th>
                    <th>Proveedor</th>
                    <th>Stock actual</th>
                    <th>Stock mínimo</th>
                  </tr>
                </thead>
                <tbody>
                  {data.stock_critico.map((p) => (
                    <tr key={p.producto_id}>
                      <td>{p.nombre}</td>
                      <td>{p.codigo_producto}</td>
                      <td>{p.oem}</td>
                      <td>{p.proveedor_nombre}</td>
                      <td style={{ color: "var(--danger)" }}>{p.stock_actual}</td>
                      <td>{p.stock_minimo}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="text-muted">No hay productos bajo el stock mínimo.</p>
          )}
        </PageCard>
      )}

      {data && tab === "ventas-vendedor" && (
        <PageCard title="Ventas por vendedor del mes">
          {(data.ventas_por_vendedor_mes || []).length > 0 ? (
            <div className="table-responsive">
              <table className="table table-sm table-bordered">
                <thead>
                  <tr>
                    <th>Vendedor</th>
                    <th>Total ($)</th>
                    <th>Cantidad</th>
                  </tr>
                </thead>
                <tbody>
                  {data.ventas_por_vendedor_mes.map((row, i) => (
                    <tr key={i}>
                      <td>{row.vendedor}</td>
                      <td>{formatCLP(row.total)}</td>
                      <td>{row.cantidad}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="text-muted">Sin ventas en este período.</p>
          )}
        </PageCard>
      )}

      {tab === "personalizados" && <ReportesPersonalizadosPage />}
    </>
  );
}
