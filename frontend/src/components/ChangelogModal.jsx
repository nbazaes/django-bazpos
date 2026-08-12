import { APP_VERSION } from "../lib/changelog";

const SECTION_LABELS = {
  Added: "Novedades",
  Changed: "Cambios",
  Deprecated: "Obsoletos",
  Removed: "Eliminado",
  Fixed: "Correcciones",
  Security: "Seguridad",
  Performance: "Rendimiento",
};

function sectionLabel(name) {
  return SECTION_LABELS[name] || name;
}

export default function ChangelogModal({ entries, onClose, dismissable = true }) {
  return (
    <div className="modal" role="dialog" aria-modal="true">
      <div className="modal-dialog modal-xl">
        <div className="modal-content">
          <div className="modal-header">
            <h5 className="modal-title">
              <i className="bi bi-megaphone me-2" />
              Novedades
            </h5>
            <button type="button" className="modal-close" onClick={onClose} aria-label="Cerrar">&times;</button>
          </div>
          <div className="modal-body">
            {entries.length === 0 ? (
              <p className="text-secondary mb-0">No hay novedades registradas.</p>
            ) : (
              entries.map((entry) => (
                <div key={entry.version} className="mb-4">
                  <div className="d-flex align-items-center gap-2 mb-1">
                    <span className="badge badge-purple">v{entry.version}</span>
                    {entry.date && <span className="text-secondary small">{entry.date}</span>}
                  </div>
                  {Object.keys(entry.sections || {}).map((section) => (
                    <div key={section} className="mb-2">
                      <div className="small fw-semibold text-secondary">{sectionLabel(section)}</div>
                      <ul className="mb-0 ps-4">
                        {(entry.sections[section] || []).map((item, idx) => (
                          <li key={idx}>{item}</li>
                        ))}
                      </ul>
                    </div>
                  ))}
                </div>
              ))
            )}
          </div>
          <div className="modal-footer">
            {dismissable && (
              <span className="text-secondary small me-auto">
                Corre en la versión {APP_VERSION}
              </span>
            )}
            <button type="button" className="btn btn-primary" onClick={onClose}>
              Entendido
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
