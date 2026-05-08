import { useEffect, useState } from "react";
import PageCard from "../components/PageCard";
import Shell from "../components/Shell";
import { apiRequest } from "../lib/api";

function StatCard({ title, value, icon, colorClass }) {
  return (
    <div className="col-md-3 mb-4">
      <div className={`card border-left-${colorClass} shadow h-100 py-2`}>
        <div className="card-body">
          <div className="row no-gutters align-items-center">
            <div className="col mr-2">
              <div className="text-xs font-weight-bold text-uppercase mb-1" style={{ color: "#5a5c69" }}>
                {title}
              </div>
              <div className="h5 mb-0 font-weight-bold text-gray-800">{value}</div>
            </div>
            <div className="col-auto">
              <i className={`fas ${icon} fa-2x text-gray-300`}></i>
            </div>
          </div>
        </div>
      </div>
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
          <div className="d-sm-flex align-items-center justify-content-between mb-4">
            <h1 className="h3 mb-0 text-gray-800">
              Bienvenido, {user?.first_name || user?.username}
            </h1>
          </div>

          <div className="row">
            <StatCard
              title="Ventas del dia"
              value={`$${data.ventas_dia.total.toLocaleString()}`}
              icon="fa-dollar-sign"
              colorClass="success"
            />
            <StatCard
              title="Cantidad ventas"
              value={data.ventas_dia.cantidad}
              icon="fa-shopping-cart"
              colorClass="primary"
            />
            <StatCard
              title="Total productos"
              value={data.stock.total_productos}
              icon="fa-boxes"
              colorClass="info"
            />
            <StatCard
              title="Sin stock"
              value={data.stock.sin_stock}
              icon="fa-exclamation-triangle"
              colorClass="danger"
            />
          </div>

          <div className="row">
            {data.es_gerente && data.ventas_dia.desglose.length > 0 && (
              <div className="col-lg-6 mb-4">
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
                        {data.ventas_dia.desglose.map((row, i) => (
                          <tr key={i}>
                            <td>{row.vendedor}</td>
                            <td className="text-right">{row.cantidad}</td>
                            <td className="text-right">${row.total.toLocaleString()}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </PageCard>
              </div>
            )}

            {data.stock.bajo_minimo.length > 0 && (
              <div className="col-lg-6 mb-4">
                <PageCard title="Productos bajo stock minimo">
                  <div className="table-responsive">
                    <table className="table table-sm">
                      <thead>
                        <tr>
                          <th>Producto</th>
                          <th className="text-right">Actual</th>
                          <th className="text-right">Minimo</th>
                        </tr>
                      </thead>
                      <tbody>
                        {data.stock.bajo_minimo.map((p) => (
                          <tr key={p.producto_id}>
                            <td>{p.nombre}</td>
                            <td className="text-right">
                              <span className={p.stock_actual === 0 ? "text-danger font-weight-bold" : "text-warning"}>
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

          {data.stock.bajo_minimo.length === 0 && !data.es_gerente && (
            <div className="alert alert-success">
              <i className="fas fa-check-circle mr-1"></i>
              Todo en orden. No hay alertas de stock.
            </div>
          )}
        </>
      )}
    </Shell>
  );
}
