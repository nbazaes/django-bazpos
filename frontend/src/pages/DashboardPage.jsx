import { useEffect, useRef } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import PageCard from "../components/PageCard";
import { usePageTitle } from "../components/Shell";
import { getUser } from "../lib/auth";
import { useDashboardStats } from "../lib/queries";
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
  const { data, error } = useDashboardStats();

  useEffect(() => {
    if (!didToast.current && location.state?.welcome) {
      didToast.current = true;
      showToast(`Bienvenido, ${location.state.welcome}`, "success");
      navigate(".", { replace: true, state: {} });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <>
      {error && <div className="alert alert-danger">{error.message}</div>}
      {data && (
        <>
          <div className="welcome-section">
            <h1>Bienvenido, {user?.first_name || user?.username}</h1>
          </div>
          <div className="row mb-4">
            <div className="col-md-4">
              <StatCard
                title={`${data.es_gerente ? "Total ventas hoy" : "Total ventas hoy"}`}
                value={`$${Number(data.ventas_dia.total || 0).toLocaleString()}`}
                variant="success"
              />
            </div>
            <div className="col-md-4">
              <StatCard
                title="Cantidad ventas"
                value={data.ventas_dia.cantidad}
                variant="info"
              />
            </div>
            <div className="col-md-4">
              <StatCard
                title="Total productos"
                value={data.stock.total_productos}
                variant="purple"
              />
            </div>
          </div>
          {data.ventas_dia.desglose && data.ventas_dia.desglose.length > 0 && (
            <div className="mb-4">
              <PageCard title={data.es_gerente ? "Ventas por vendedor" : "Mis ventas de hoy"}>
                <div className="table-responsive">
                  <table className="table table-sm table-bordered">
                    <thead>
                      <tr><th>Vendedor</th><th>Total ($)</th><th>Cantidad</th></tr>
                    </thead>
                    <tbody>
                      {data.ventas_dia.desglose.map((row, i) => (
                        <tr key={i}>
                          <td>{row.vendedor}</td>
                          <td>${Number(row.total || 0).toLocaleString()}</td>
                          <td>{row.cantidad}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </PageCard>
            </div>
          )}
          {data.stock.bajo_minimo && data.stock.bajo_minimo.length > 0 && (
            <div className="mb-4">
              <PageCard title="Productos bajo stock mínimo">
                <div className="table-responsive">
                  <table className="table table-sm table-bordered">
                    <thead>
                      <tr><th>Nombre</th><th>Stock actual</th><th>Stock mínimo</th></tr>
                    </thead>
                    <tbody>
                      {data.stock.bajo_minimo.map((p) => (
                        <tr key={p.producto_id}>
                          <td>{p.nombre}</td>
                          <td style={{ color: "var(--danger)" }}>{p.stock_actual}</td>
                          <td>{p.stock_minimo}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </PageCard>
            </div>
          )}
        </>
      )}
      {!data && !error && (
        <div className="text-center text-muted mt-5">Cargando...</div>
      )}
    </>
  );
}
