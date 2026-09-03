import { useState } from "react";
import PageCard from "../components/PageCard";
import CierreDetalleModal from "../components/CierreDetalleModal";
import { usePageTitle } from "../lib/usePageTitle";
import { useToast } from "../lib/useToast";
import { useStoreName, formatMoney, getLocale } from "../lib/storeConfig";
import { useCierreCaja, useCierreCajaHistorial, useGuardarCierre } from "../lib/queries";

const fmtMoney = (n) => formatMoney(n);

function fmtFecha(iso) {
  if (!iso) return "—";
  const [y, m, d] = iso.split("-");
  return `${d}/${m}/${y}`;
}

function fmtFechaHora(iso) {
  if (!iso) return "—";
  const d = new Date(iso);
  return d.toLocaleString(getLocale());
}

export default function CierreCajaPage() {
  usePageTitle("Cierre de caja");
  const showToast = useToast();
  const storeName = useStoreName();
  const today = new Date();
  const localToday = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
  const [fecha, setFecha] = useState(localToday);

  const { data, error, isLoading } = useCierreCaja(fecha);
  const { data: historial } = useCierreCajaHistorial();
  const guardarMutation = useGuardarCierre();
  const [detalle, setDetalle] = useState(null);

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

  function handleImprimir() {
    window.print();
  }

  const pagos = data?.pagos || {};
  const documentos = data?.documentos || {};
  const pagosLabels = data?.pagos_labels || {};
  const documentosLabels = data?.documentos_labels || {};
  const pagosList = data?.pagos_list || Object.keys(pagos);
  const documentosList = data?.documentos_list || Object.keys(documentos);

  const filasPago = pagosList.map((code) => [
    pagosLabels[code] || code,
    code,
    `Ventas ${pagosLabels[code] || code}`,
    pagos[code] ?? 0,
  ]);

  const filasDoc = documentosList.map((code) => [
    documentosLabels[code] || code,
    code,
    `Ventas ${documentosLabels[code] || code}`,
    documentos[code] ?? 0,
  ]);

  const abrirDetalle = (tipo, clave, titulo, valor) => {
    if (valor > 0) setDetalle({ tipo, clave, titulo });
  };

  const historialFiltered = (historial || []).filter((c) => c.fecha === fecha);
  const ultimoGuardado = historialFiltered[0] || null;

  return (
    <>
      <div className="no-print" style={{ display: "flex", alignItems: "flex-end", gap: "1rem", marginBottom: "1.5rem", flexWrap: "wrap" }}>
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
        <button
          className="btn btn-secondary"
          onClick={handleImprimir}
          disabled={isLoading || !!error}
        >
          Imprimir
        </button>
        {ultimoGuardado && (
          <span className="text-success" style={{ fontWeight: 500 }}>
            ✓ Cierre guardado el {fmtFechaHora(ultimoGuardado.created_at)} por {ultimoGuardado.usuario || "—"}
          </span>
        )}
      </div>

      <div className="only-print" style={{ textAlign: "center", marginBottom: "1.5rem" }}>
        <h1 style={{ margin: 0, fontSize: "1.4rem" }}>{storeName}</h1>
        <div style={{ fontSize: "1.1rem", fontWeight: 600 }}>Cierre de caja — {fmtFecha(fecha)}</div>
        {ultimoGuardado && (
          <div style={{ fontSize: "0.85rem" }}>
            Guardado el {fmtFechaHora(ultimoGuardado.created_at)} por {ultimoGuardado.usuario || "—"}
          </div>
        )}
      </div>

      {isLoading && <div className="text-center text-muted mt-5">Cargando...</div>}
      {error && <div className="alert alert-danger">{error.message}</div>}

      {data && (
        <>
          <div className="row mb-4">
            <div className="col-3">
              <div className="stat-card stat-card-success">
                <div className="stat-label">Total vendido</div>
                <div className="stat-value">{fmtMoney(data.total_vendido)}</div>
              </div>
            </div>
            <div className="col-3">
              <div
                className="stat-card stat-card-info"
                onClick={() => abrirDetalle("devolucion", "", "Devoluciones", data.total_devoluciones)}
                style={data.total_devoluciones > 0 ? { cursor: "pointer" } : undefined}
              >
                <div className="stat-label">Devoluciones</div>
                <div className="stat-value">{fmtMoney(data.total_devoluciones)}</div>
              </div>
            </div>
            <div className="col-3">
              <div
                className="stat-card stat-card-danger"
                onClick={() => abrirDetalle("anulacion", "", "Anulaciones", data.total_anulaciones)}
                style={data.total_anulaciones > 0 ? { cursor: "pointer" } : undefined}
              >
                <div className="stat-label">Anulaciones</div>
                <div className="stat-value">{fmtMoney(data.total_anulaciones)}</div>
              </div>
            </div>
            <div className="col-3">
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
                  <table className="table table-sm">
                    <thead>
                      <tr><th>Medio de pago</th><th>Monto</th></tr>
                    </thead>
                    <tbody>
                      {filasPago.map(([label, clave, titulo, valor]) => (
                        <tr
                          key={label}
                          onClick={() => abrirDetalle("pago", clave, titulo, valor)}
                          style={valor > 0 ? { cursor: "pointer" } : undefined}
                        >
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
                  <table className="table table-sm">
                    <thead>
                      <tr><th>Documento</th><th>Monto</th></tr>
                    </thead>
                    <tbody>
                      {filasDoc.map(([label, clave, titulo, valor]) => (
                        <tr
                          key={label}
                          onClick={() => abrirDetalle("documento", clave, titulo, valor)}
                          style={valor > 0 ? { cursor: "pointer" } : undefined}
                        >
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

      <div className="mt-4 no-print">
        <PageCard title={`Historial de cierres de la fecha ${fmtFecha(fecha)}`}>
          {historialFiltered.length > 0 ? (
            <div className="table-responsive">
              <table className="table table-sm">
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

      {detalle && (
        <CierreDetalleModal
          fecha={fecha}
          tipo={detalle.tipo}
          clave={detalle.clave}
          titulo={detalle.titulo}
          onClose={() => setDetalle(null)}
        />
      )}
    </>
  );
}