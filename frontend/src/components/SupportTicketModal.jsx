import { useState, useEffect } from "react";
import { useLocation } from "react-router-dom";
import { getUser } from "../lib/auth";
import { useStoreName } from "../lib/storeName";
import { sendSupportTicket } from "../lib/api";

const PRIORITIES = [
  { id: "baja", label: "Baja", icon: "bi-check2", colorClass: "prio-baja" },
  { id: "media", label: "Media", icon: "bi-dash", colorClass: "prio-media" },
  { id: "alta", label: "Alta", icon: "bi-exclamation-triangle", colorClass: "prio-alta" },
  { id: "urgente", label: "Urgente", icon: "bi-lightning-charge-fill", colorClass: "prio-urgente" },
];

export default function SupportTicketModal({ onClose }) {
  const location = useLocation();
  const user = getUser();
  const storeName = useStoreName();
  const appVersion = import.meta.env.APP_VERSION || "2.3.0";

  const [tipo, setTipo] = useState("soporte");
  const [prioridad, setPrioridad] = useState("media");
  const [titulo, setTitulo] = useState("");
  const [descripcion, setDescripcion] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    function handleKeyDown(e) {
      if (e.key === "Escape" && !loading) {
        onClose();
      }
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [loading, onClose]);

  async function handleSubmit(e) {
    e.preventDefault();
    if (!descripcion.trim() || descripcion.trim().length < 5) {
      setError("Por favor escribe una descripción de al menos 5 caracteres.");
      return;
    }

    setLoading(true);
    setError(null);

    try {
      await sendSupportTicket({
        tipo,
        prioridad,
        titulo: titulo.trim(),
        descripcion: descripcion.trim(),
        current_path: location.pathname,
        app_version: appVersion,
      });
      setSuccess(true);
    } catch (err) {
      setError(err.message || "Ocurrió un error al enviar el ticket. Inténtalo nuevamente.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="modal" role="dialog" aria-modal="true" aria-labelledby="support-ticket-title">
      <div className="modal-dialog modal-lg">
        <div className="modal-content">
          
          <div className="modal-header">
            <h5 id="support-ticket-title" className="modal-title d-flex align-items-center gap-2">
              <i className="bi bi-headset text-accent" />
              <span>Enviar Ticket de Soporte o Sugerencia</span>
            </h5>
            <button
              type="button"
              className="modal-close"
              onClick={onClose}
              disabled={loading}
              aria-label="Cerrar"
            >
              &times;
            </button>
          </div>

          {success ? (
            <div className="modal-body text-center py-5">
              <div className="ticket-success-icon mb-3">
                <i className="bi bi-check-circle-fill text-success" style={{ fontSize: "3.5rem" }} />
              </div>
              <h4 className="fw-bold mb-2">¡Ticket enviado correctamente!</h4>
              <p className="text-secondary mb-4 mx-auto" style={{ maxWidth: 450 }}>
                {tipo === "sugerencia"
                  ? "Gracias por tu propuesta. La revisaremos detalladamente para seguir mejorando la plataforma."
                  : "Tu solicitud de soporte ha sido recibida por el equipo técnico. Te contactaremos a la brevedad."}
              </p>
              <button type="button" className="btn btn-primary" onClick={onClose}>
                Entendido
              </button>
            </div>
          ) : (
            <form onSubmit={handleSubmit}>
              <div className="modal-body">
                {error && (
                  <div className="alert alert-danger d-flex align-items-center gap-2 mb-3" role="alert">
                    <i className="bi bi-exclamation-circle-fill" />
                    <span>{error}</span>
                  </div>
                )}

                {/* Tipo de Ticket */}
                <div className="mb-3">
                  <label className="form-label fw-semibold mb-2">Tipo de Ticket</label>
                  <div className="ticket-type-grid">
                    <button
                      type="button"
                      className={`ticket-type-card ${tipo === "soporte" ? "active" : ""}`}
                      onClick={() => setTipo("soporte")}
                    >
                      <i className="bi bi-tools" />
                      <div>
                        <div className="fw-bold">Soporte Técnico</div>
                        <small className="text-secondary">Reportar un error, bug o problema técnico</small>
                      </div>
                    </button>

                    <button
                      type="button"
                      className={`ticket-type-card ${tipo === "sugerencia" ? "active" : ""}`}
                      onClick={() => setTipo("sugerencia")}
                    >
                      <i className="bi bi-lightbulb-fill" />
                      <div>
                        <div className="fw-bold">Sugerencia</div>
                        <small className="text-secondary">Proponer una nueva funcionalidad o mejora</small>
                      </div>
                    </button>
                  </div>
                </div>

                {/* Prioridad */}
                <div className="mb-3">
                  <label className="form-label fw-semibold mb-2">Nivel de Prioridad</label>
                  <div className="priority-pill-group">
                    {PRIORITIES.map((p) => (
                      <button
                        key={p.id}
                        type="button"
                        className={`priority-pill ${p.colorClass} ${prioridad === p.id ? "active" : ""}`}
                        onClick={() => setPrioridad(p.id)}
                      >
                        <i className={`bi ${p.icon}`} />
                        <span>{p.label}</span>
                      </button>
                    ))}
                  </div>
                </div>

                {/* Asunto / Título (Opcional) */}
                <div className="mb-3">
                  <label htmlFor="ticket-title" className="form-label fw-semibold">
                    Asunto o Título Corto <span className="text-muted fw-normal">(Opcional)</span>
                  </label>
                  <input
                    id="ticket-title"
                    type="text"
                    className="form-control"
                    placeholder={
                      tipo === "sugerencia"
                        ? "Ej: Agregar filtro por proveedor en compras..."
                        : "Ej: Error al imprimir comprobante en ventas..."
                    }
                    value={titulo}
                    onChange={(e) => setTitulo(e.target.value)}
                    maxLength={200}
                    disabled={loading}
                  />
                </div>

                {/* Descripción (Requerida) */}
                <div className="mb-3">
                  <label htmlFor="ticket-description" className="form-label fw-semibold">
                    Descripción Detallada <span className="text-danger">*</span>
                  </label>
                  <textarea
                    id="ticket-description"
                    className="form-control"
                    rows={4}
                    placeholder={
                      tipo === "sugerencia"
                        ? "Describe la función que te gustaría ver, cómo funcionaría y qué beneficio aportaría..."
                        : "Describe detalladamente qué estabas haciendo, qué ocurrió y qué esperabas que pasara..."
                    }
                    value={descripcion}
                    onChange={(e) => setDescripcion(e.target.value)}
                    required
                    minLength={5}
                    disabled={loading}
                  />
                  <div className="d-flex justify-content-between mt-1 text-muted small">
                    <span>Mínimo 5 caracteres</span>
                    <span>{descripcion.length} caracteres</span>
                  </div>
                </div>

                {/* Contexto Automático */}
                <div className="ticket-context-card">
                  <div className="d-flex align-items-center gap-2 mb-1 fw-semibold text-secondary small">
                    <i className="bi bi-info-circle-fill text-accent" />
                    <span>Información de contexto adjunta automáticamente:</span>
                  </div>
                  <div className="ticket-context-details text-muted small">
                    <span>👤 <strong>{user?.username || "Usuario"}</strong></span>
                    <span>🏪 <strong>{storeName}</strong></span>
                    <span>📦 <strong>v{appVersion}</strong></span>
                    <span>📍 <code>{location.pathname}</code></span>
                  </div>
                </div>
              </div>

              <div className="modal-footer">
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={onClose}
                  disabled={loading}
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="btn btn-primary d-flex align-items-center gap-2"
                  disabled={loading || !descripcion.trim()}
                >
                  {loading ? (
                    <>
                      <span className="spinner-border spinner-border-sm" role="status" aria-hidden="true" />
                      <span>Enviando...</span>
                    </>
                  ) : (
                    <>
                      <i className="bi bi-send-fill" />
                      <span>Enviar Ticket</span>
                    </>
                  )}
                </button>
              </div>
            </form>
          )}

        </div>
      </div>
    </div>
  );
}
