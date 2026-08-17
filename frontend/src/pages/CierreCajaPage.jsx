import { useState } from "react";
import PageCard from "../components/PageCard";
import { usePageTitle } from "../lib/usePageTitle";
import { useToast } from "../lib/useToast";
import { useCierreCaja, useCierreCajaHistorial, useGuardarCierre } from "../lib/queries";

const fmtMoney = (n) => `$${Number(n || 0).toLocaleString("es-CL")}`;

function fmtFecha(iso) {
  if (!iso) return "—";
  const [y, m, d] = iso.split("-");
  return `${d}/${m}/${y}`;
}

function fmtFechaHora(iso) {
  if (!iso) return "—";
  const d = new Date(iso);
  return d.toLocaleString("es-CL");
}

export default function CierreCajaPage() {
  usePageTitle("Cierre de caja");
  const showToast = useToast();
  const today = new Date();
  const localToday = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
  const [fecha, setFecha] = useState(localToday);

  const { data, error, isLoading } = useCierreCaja(fecha);
  const { data: historial } = useCierreCajaHistorial();
  const guardarMutation = useGuardarCierre();

  function handleGuardar() {
    guardarMutation.mutate(fecha, {
      onSuccess: (res) => {
        showToast(`Cierre de caja del ${fmtFecha(res.fecha)} guardado correctamente`, "success");
      },
      onError: (err) => {
        showToast(err.message || "No se pudo guardar el cierre de caja", "danger");
      },
    });
  }

  const pagos = data?.pagos || {};
  const documentos = data?.documentos || {};

  const filasPago = [
    ["Efectivo", pagos.efectivo],
    ["Tarjeta", pagos.tarjeta],
    ["Transferencia", pagos.transferencia],
    ["Cheque", pagos.cheque],
    ["Sin clasificar", pagos.sin_clasificar],
  ];

  const filasDoc = [
    ["Boleta", documentos.boleta],
    ["Factura", documentos.factura],
    ["Otros", documentos.otros],
    ["Sin clasificar", documentos.sin_clasificar],
  ];

  const historialFiltered = (historial || []).filter((c) => c.fecha === fecha);
  const ultimoGuardado = historialFiltered[0] || null;

  return (
    <>
      <div style={{ display: "flex", alignItems: "flex-end", gap: "1rem", marginBottom: "1.5rem", flexWrap: "wrap" }}>
        <label style={{ display: "flex", flexDirection: "column", gap: "0.4rem", fontWeight: 500 }}>
          Fecha
          <input
            type="date"
            className="form-control"
            value={fecha}
            onChange={(e) => setFecha(e.target.value)}
            style={{ maxWidth: 200 }}
          />
        </label>
        <button
          className="btn btn-primary"
          onClick={handleGuardar}
          disabled={guardarMutation.isPending}
        >
          {guardarMutation.isPending ? "Guardando..." : "Guardar cierre de caja"}
        </button>
        {ultimoGuardado && (
          <span className="text-success" style={{ fontWeight: 500 }}>
            ✓ Cierre guardado el {fmtFechaHora(ultimoGuardado.created_at)} por {ultimoGuardado.usuario || "—"}
          </span>
        )}
      </div>

      {isLoading && <div className="text-center text-muted mt-5">Cargando...</div>}
      {error && <div className="alert alert-danger">{error.message}</div>}

      {data && (
        <>
          <div className="row mb-4">
            <div className="col-md-3">
              <div className="stat-card stat-card-success">
                <div className="stat-label">Total vendido</div>
                <div className="stat-value">{fmtMoney(data.total_vendido)}</div>
                <div className="stat-breakdown">{data.cantidad_ventas} ventas</div>
              </div>
            </div>
            <div className="col-md-3">
              <div className="stat-card stat-card-info">
                <div className="stat-label">Devoluciones</div>
                <div className="stat-value">{fmtMoney(data.total_devoluciones)}</div>
              </div>
            </div>
            <div className="col-md-3">
              <div className="stat-card stat-card-danger">
                <div className="stat-label">Anulaciones</div>
                <div className="stat-value">{fmtMoney(data.total_anulaciones)}</div>
              </div>
            </div>
            <div className="col-md-3">
              <div className="stat-card stat-card-purple">
                <div className="stat-label">Total del día</div>
                <div className="stat-value">{fmtMoney(data.total_final)}</div>
              </div>
            </div>
          </div>

          <div className="row">
            <div className="col-md-6">
              <PageCard title="Ventas por medio de pago">
                <div className="table-responsive">
                  <table className="table table-sm table-bordered">
                    <thead>
                      <tr><th>Medio de pago</th><th>Monto</th></tr>
                    </thead>
                    <tbody>
                      {filasPago.map(([label, valor]) => (
                        <tr key={label}>
                          <td>{label}</td>
                          <td>{fmtMoney(valor)}</td>
                        </tr>
                      ))}
                      <tr>
                        <td><strong>Total</strong></td>
                        <td><strong>{fmtMoney(data.total_vendido)}</strong></td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </PageCard>
            </div>
            <div className="col-md-6">
              <PageCard title="Ventas por documento">
                <div className="table-responsive">
                  <table className="table table-sm table-bordered">
                    <thead>
                      <tr><th>Documento</th><th>Monto</th></tr>
                    </thead>
                    <tbody>
                      {filasDoc.map(([label, valor]) => (
                        <tr key={label}>
                          <td>{label}</td>
                          <td>{fmtMoney(valor)}</td>
                        </tr>
                      ))}
                      <tr>
                        <td><strong>Total</strong></td>
                        <td><strong>{fmtMoney(data.total_vendido)}</strong></td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </PageCard>
            </div>
          </div>
        </>
      )}

      <div className="mt-4">
        <PageCard title={`Historial de cierres de la fecha ${fmtFecha(fecha)}`}>
          {historialFiltered.length > 0 ? (
            <div className="table-responsive">
              <table className="table table-sm table-bordered">
                <thead>
                  <tr>
                    <th>#</th>
                    <th>Guardado</th>
                    <th>Usuario</th>
                    <th>Total vendido</th>
                    <th>Devoluciones</th>
                    <th>Anulaciones</th>
                    <th>Total del día</th>
                  </tr>
                </thead>
                <tbody>
                  {historialFiltered.map((c, i) => (
                    <tr key={c.id}>
                      <td>{historialFiltered.length - i}</td>
                      <td>{fmtFechaHora(c.created_at)}</td>
                      <td>{c.usuario || "—"}</td>
                      <td>{fmtMoney(c.total_vendido)}</td>
                      <td>{fmtMoney(c.total_devoluciones)}</td>
                      <td>{fmtMoney(c.total_anulaciones)}</td>
                      <td><strong>{fmtMoney(c.total_final)}</strong></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="text-muted mb-0">No hay cierres guardados para esta fecha.</p>
          )}
        </PageCard>
      </div>
    </>
  );
}