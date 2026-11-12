import { useEffect, useRef, useState } from "react";
import { API_BASE } from "../lib/config";
import { APP_VERSION } from "../lib/changelog";

function contactHref(contact) {
  if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(contact)) {
    return `mailto:${encodeURIComponent(contact)}`;
  }
  try {
    const url = new URL(contact);
    if (["http:", "https:"].includes(url.protocol)) return url.href;
  } catch {
    // Other contact formats are displayed as plain text.
  }
  return null;
}

export default function AboutModal({ onClose }) {
  const dialogRef = useRef(null);
  const [about, setAbout] = useState(null);

  useEffect(() => {
    const opener = document.activeElement;
    const dialog = dialogRef.current;
    const previousOverflow = document.body.style.overflow;
    dialog.showModal();
    document.body.style.overflow = "hidden";
    return () => {
      dialog.close();
      document.body.style.overflow = previousOverflow;
      if (opener instanceof HTMLElement && opener.isConnected) opener.focus();
    };
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    fetch(`${API_BASE}/store-name/`, { signal: controller.signal })
      .then((response) => (response.ok ? response.json() : null))
      .then((data) => {
        if (!controller.signal.aborted && typeof data?.about?.company === "string") {
          setAbout({
            company: data.about.company,
            contact: typeof data.about.contact === "string" ? data.about.contact : "",
          });
        }
      })
      .catch(() => {});
    return () => controller.abort();
  }, []);

  const href = about?.contact ? contactHref(about.contact) : null;

  return (
    <dialog
      ref={dialogRef}
      className="about-dialog"
      aria-labelledby="about-title"
      aria-describedby="about-description"
      onCancel={(event) => { event.preventDefault(); onClose(); }}
    >
      <div className="modal-content">
        <div className="modal-header">
          <h5 className="modal-title" id="about-title">Acerca de BazPOS</h5>
          <button type="button" className="modal-close" onClick={onClose} aria-label="Cerrar">&times;</button>
        </div>
        <div className="modal-body">
          <p id="about-description">
            Sistema de punto de venta y gestión comercial de código abierto para administrar ventas,
            inventario, compras y reportes.
          </p>
          <p className="text-secondary">Versión {APP_VERSION}</p>
          {about?.company && (
            <div className="about-company">
              <p className="mb-1">{about.company}</p>
              {about.contact && (
                href ? <a href={href}>{about.contact}</a> : <span>{about.contact}</span>
              )}
            </div>
          )}
        </div>
        <div className="modal-footer">
          <a
            className="btn btn-outline btn-icon me-auto"
            href="https://github.com/nbazaes/django-bazpos"
            target="_blank"
            rel="noopener noreferrer"
            title="Ver BazPOS en GitHub (abre en una nueva pestaña)"
            aria-label="Ver BazPOS en GitHub (abre en una nueva pestaña)"
          >
            <i className="bi bi-github" aria-hidden="true" />
          </a>
          <button type="button" className="btn btn-primary" onClick={onClose}>Cerrar</button>
        </div>
      </div>
    </dialog>
  );
}
