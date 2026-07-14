import { useEffect, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import PageCard from "../components/PageCard";
import { usePageTitle } from "../components/Shell";
import { apiRequest } from "../lib/api";
import { getUser } from "../lib/auth";
import { useToast } from "../lib/toast";

function StatCard({ title, value, variant }) {
  return (
    <div className={`stat-card stat-card-${variant}`}>
      <div className="stat-label">{title}</div>
      <div className="stat-value">{value}</div>
    </div>
  );
}

export default function DashboardPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const showToast = useToast();
  const user = getUser();
  usePageTitle("Dashboard");
  const didToast = useRef(false);
  const [data, setData] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!didToast.current && location.state?.welcome) {
      didToast.current = true;
      showToast(`Bienvenido, ${location.state.welcome}`, "success");
      navigate(".", { replace: true, state: {} });
    }
  }, []);

  useEffect(() => {
    apiRequest("/dashboard/stats/")
      .then(setData)
      .catch((err) => setError(err.message));
  }, []);

  return (
    <>
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
            {data.ventas_dia.desglose && data.ventas_dia.desglose.length > 0 && (
              <div className="col-md-6 mb-4">
                <PageCard title={data.es_gerente ? "Ventas por vendedor" : "Mis ventas de hoy"}>
                  <div className="table-responsive">
                    <table className="table table-sm">
                      <thead>
                        <tr>
                          <th>{data.es_gerente ? "Vendedor" : "Usuario"}</th>
                          <th className="text-right">Ventas</th>
                          <th className="text-right">Total</th>
                        </tr>
                      </thead>
                      <tbody>
                        {data.ventas_dia.desglose.map((row, i) => (
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
    </>
  );
}
