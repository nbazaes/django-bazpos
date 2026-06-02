import { useEffect, useState } from "react";
import PageCard from "../components/PageCard";
import Shell from "../components/Shell";
import { apiRequest } from "../lib/api";

function StatCard({ title, value, variant }) {
  return (
    <div className={`stat-card stat-card-${variant}`}>
      <div className="stat-label">{title}</div>
      <div className="stat-value">{value}</div>
    </div>
  );
}

export default function DashboardPage({ user }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    apiRequest("/dashboard/stats/")
      .then(setData)
      .catch((err) => setError(err.message));
  }, []);

  return (
    <Shell title="Dashboard" user={user}>
      {error && <div className="alert alert-danger">{error}</div>}
      {data && (
        <>
          <div className="welcome-section">
            <h1>Bienvenido, {user?.first_name || user?.username}</h1>
          </div>

          <div className="stat-grid">
            <StatCard
              title="Ventas del día"
              value={`$${Number(data.ventas_dia.total || 0).toLocaleString()}`}
              variant="success"
            />
            <StatCard
              title="Cantidad ventas"
              value={data.ventas_dia.cantidad}
              variant="purple"
            />
            <StatCard
              title="Total productos"
              value={data.stock.total_productos}
              variant="info"
            />
            <StatCard
              title="Sin stock"
              value={data.stock.sin_stock}
              variant="danger"
            />
          </div>

          <div className="row">
            {data.es_gerente && data.ventas_dia.desglope && data.ventas_dia.desglope.length > 0 && (
              <div className="col-md-6 mb-4">
                <PageCard title="Ventas por vendedor">
                  <div className="table-responsive">
                    <table className="table table-sm">
                      <thead>
                        <tr>
                          <th>Vendedor</th>
                          <th className="text-right">Ventas</th>
                          <th className="text-right">Total</th>
                        </tr>
                      </thead>
                      <tbody>
                        {data.ventas_dia.desglope.map((row, i) => (
                          <tr key={i}>
                            <td>{row.vendedor}</td>
                            <td className="text-right">{row.cantidad}</td>
                            <td className="text-right">${Number(row.total || 0).toLocaleString()}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </PageCard>
              </div>
            )}

            {data.stock.bajo_minimo && data.stock.bajo_minimo.length > 0 && (
              <div className="col-md-6 mb-4">
                <PageCard title="Productos bajo stock mínimo">
                  <div className="table-responsive">
                    <table className="table table-sm">
                      <thead>
                        <tr>
                          <th>Producto</th>
                          <th className="text-right">Actual</th>
                          <th className="text-right">Mínimo</th>
                        </tr>
                      </thead>
                      <tbody>
                        {data.stock.bajo_minimo.map((p) => (
                          <tr key={p.producto_id}>
                            <td>{p.nombre}</td>
                            <td className="text-right">
                              <span className={p.stock_actual === 0 ? "text-danger font-bold" : "text-warning font-bold"}>
                                {p.stock_actual}
                              </span>
                            </td>
                            <td className="text-right">{p.stock_minimo}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </PageCard>
              </div>
            )}
          </div>

          {data.stock.bajo_minimo && data.stock.bajo_minimo.length === 0 && !data.es_gerente && (
            <div className="alert alert-success">Todo en orden. No hay alertas de stock.</div>
          )}
        </>
      )}
    </Shell>
  );
}
