import { useEffect, useId, useRef } from "react";
import { createPortal } from "react-dom";

export default function ConfirmDialog({ title, children, confirmLabel, onConfirm, onCancel, busy = false, error = "" }) {
  const titleId = useId();
  const descriptionId = useId();
  const cancelRef = useRef(null);
  const dialogRef = useRef(null);

  useEffect(() => {
    const previousFocus = document.activeElement;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    cancelRef.current?.focus();
    return () => {
      document.body.style.overflow = previousOverflow;
      if (previousFocus?.isConnected) previousFocus.focus();
    };
  }, []);

  function handleKeyDown(event) {
    if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      if (!busy) onCancel();
    }
    if (event.key === "Tab") {
      const controls = [...dialogRef.current.querySelectorAll('button:not(:disabled), [href], input:not(:disabled), [tabindex="0"]')];
      if (!controls.length) { event.preventDefault(); return; }
      const first = controls[0], last = controls[controls.length - 1];
      if (event.shiftKey && (document.activeElement === first || !controls.includes(document.activeElement))) {
        event.preventDefault(); last.focus();
      } else if (!event.shiftKey && (document.activeElement === last || !controls.includes(document.activeElement))) {
        event.preventDefault(); first.focus();
      }
    }
  }

  return createPortal(
    <div className="modal" role="alertdialog" aria-modal="true" aria-labelledby={titleId} aria-describedby={descriptionId} aria-busy={busy} onKeyDown={handleKeyDown} onClick={(event) => {
      if (event.target === event.currentTarget && !busy) onCancel();
    }}>
      <div className="modal-dialog" ref={dialogRef} style={{ maxWidth: 460 }}>
        <div className="modal-content">
          <div className="modal-header">
            <h3 id={titleId} className="modal-title">{title}</h3>
            <button type="button" className="modal-close" aria-label="Cerrar" disabled={busy} onClick={onCancel}>×</button>
          </div>
          <div className="modal-body">
            <p id={descriptionId}>{children}</p>
            {error && <div className="alert alert-danger" role="alert">{error}</div>}
          </div>
          <div className="modal-footer">
            <button ref={cancelRef} type="button" className="btn btn-secondary" disabled={busy} onClick={onCancel}>Cancelar</button>
            <button type="button" className="btn btn-danger" disabled={busy} onClick={onConfirm}>{busy ? "Descartando…" : confirmLabel}</button>
          </div>
        </div>
      </div>
    </div>, document.body,
  );
}
