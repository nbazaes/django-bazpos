import { useEffect, useRef, useState } from "react";
import { apiRequest, downloadFile } from "../lib/api";
import { prepareCameraPhoto } from "../lib/cameraPhoto";
import ProductoForm from "./ProductoForm";
import "./FacturaPhotoInput.css";

const quantityFormat = new Intl.NumberFormat("es-CL", { maximumFractionDigits: 4 });
const moneyFormat = new Intl.NumberFormat("es-CL", { style: "currency", currency: "CLP", maximumFractionDigits: 2 });
const displayNumber = (value, currency = false) => value == null || value === "" || !Number.isFinite(Number(value))
  ? "Por revisar" : (currency ? moneyFormat : quantityFormat).format(Number(value));
const displayDate = (value) => value ? value.split("-").reverse().join("/") : "Fecha por revisar";

function Preview({ file, close }) {
  const [url, setUrl] = useState("");
  const [error, setError] = useState("");
  useEffect(() => {
    let active = true;
    let objectUrl;
    const task = file.local ? Promise.resolve(file.local) : downloadFile(file.path);
    task.then((blob) => {
      if (!active) return;
      objectUrl = URL.createObjectURL(blob);
      setUrl(objectUrl);
    }).catch((err) => { if (active) setError(err.message); });
    return () => { active = false; if (objectUrl) URL.revokeObjectURL(objectUrl); };
  }, [file]);
  return <div className="border rounded p-2 mt-2">
    <button type="button" className="btn btn-sm btn-secondary" onClick={close}>Cerrar vista previa</button>
    {error && <p role="alert">{error}</p>}
    {url && (file.mime === "application/pdf"
      ? <><iframe title="Factura PDF" src={url} style={{ width: "100%", height: "65vh", border: 0 }} /><a href={url} target="_blank" rel="noreferrer">Abrir PDF ampliado</a></>
      : <a href={url} target="_blank" rel="noreferrer"><img src={url} alt="Documento de la factura; abre para ampliar" style={{ maxWidth: "100%", maxHeight: "65vh", objectFit: "contain" }} /></a>)}
  </div>;
}

export default function FacturaPhotoInput({ controller, header, items, pending, excluded = [], setPending, setExcluded, onApply, onLinked }) {
  const [open, setOpen] = useState(false);
  const [documentsOpen, setDocumentsOpen] = useState(false);
  const [files, setFiles] = useState([]);
  const [preview, setPreview] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [cameraHint, setCameraHint] = useState("");
  const [result, setResult] = useState(null);
  const [search, setSearch] = useState("");
  const [matches, setMatches] = useState([]);
  const [selectedLine, setSelectedLine] = useState(null);
  const [creating, setCreating] = useState(false);
  const uploadRef = useRef(null);
  const cameraRef = useRef(null);
  const sequence = useRef(0);
  const [cameraPrepared, setCameraPrepared] = useState("");
  const draft = controller.draft;
  const cameraReady = cameraPrepared === `${draft?.id}:${draft?.revision}` && controller.status === "Guardado";

  async function run(task) {
    setBusy(true); setError("");
    try { await task(); } catch (err) { setError(err.message); }
    finally { setBusy(false); }
  }
  function choose(e) {
    const added = Array.from(e.target.files || []);
    setFiles((previous) => [...previous, ...added]);
    e.target.value = "";
    if (added[0]) setPreview({ local: added[0], mime: added[0].type });
  }
  function openCamera() {
    if (cameraReady) {
      setCameraHint("");
      setCameraPrepared("");
      // Safari requires this call directly in the tap handler, with no await,
      // timer or reliance on navigator.userActivation (missing in older iOS).
      cameraRef.current.click();
      return;
    }
    return run(async () => {
      const saved = await controller.prepareCapture();
      setCameraPrepared(`${saved.id}:${saved.revision}`);
      setCameraHint("Borrador guardado. Pulsa Abrir cámara para tomar la foto.");
    });
  }
  async function capturePhoto(event) {
    const original = event.target.files?.[0];
    event.target.value = "";
    if (!original) return;
    setCameraHint("");
    await run(async () => {
      let photo = original;
      try {
        photo = await prepareCameraPhoto(original);
        const body = new FormData();
        body.append("archivos", photo);
        const saved = await controller.perform("documentos/", { body });
        const doc = saved.documentos[saved.documentos.length - 1];
        setResult(null);
        setPreview({ path: `/facturas-borradores/${saved.id}/documentos/${doc.id}/`, mime: doc.mime });
      } catch (err) {
        // Keep the file available for a retry; never clear the invoice fields.
        setFiles((previous) => [...previous, photo]);
        throw err;
      }
    });
  }
  async function lookup(value) {
    setSearch(value);
    const requestId = ++sequence.current;
    if (!value.trim()) { setMatches([]); return; }
    try {
      const response = await apiRequest(`/productos/?texto=${encodeURIComponent(value)}&sin_stock=true&page_size=30`);
      if (requestId === sequence.current) setMatches(response.results || []);
    } catch (err) { if (requestId === sequence.current) setError(err.message); }
  }
  function link(product) {
    onLinked(selectedLine, product);
    setSelectedLine(null); setCreating(false); setMatches([]); setSearch("");
  }
  function apply() {
    if ((items.length || pending.length || header.numero_factura) && !window.confirm("¿Reemplazar los datos del formulario por esta lectura?")) return;
    onApply(result || draft.ocr);
    setResult(null);
  }
  const extraction = result || draft?.ocr;
  const hasReading = Boolean(extraction?.lineas);
  const covered = new Set([...items.map((item) => item.ocr_line), ...pending.map((line) => line.ocr_line), ...excluded]);
  const applied = hasReading && !result && extraction.lineas.length > 0 && extraction.lineas.every((line, index) => covered.has(line.ocr_line ?? index));
  const linkedCount = items.filter((item) => item.ocr_line != null).length;
  const currentStep = applied ? 2 : hasReading ? 1 : 0;
  const active = open || draft?.documentos?.length > 0 || pending.length > 0 || files.length > 0;
  const locked = busy || controller.conflict || controller.missing || !controller.ready;

  function exclude(line) {
    if (!window.confirm("¿Excluir expresamente esta línea de la factura?")) return;
    setPending((prev) => prev.filter((p) => p.ocr_line !== line.ocr_line));
    setExcluded((prev) => [...prev, line.ocr_line]);
  }

  return <div className="invoice-ocr">
    {!active && <button type="button" className="btn btn-secondary" onClick={() => setOpen(true)} disabled={!controller.ready}>
      <i className="bi bi-camera" aria-hidden="true" /> Ingresar con foto
    </button>}
    {active && <section aria-label="Ingreso de factura con foto">
      <ol className="invoice-ocr__steps" aria-label="Progreso de lectura">
        {["Documento", "Lectura", "Revisión"].map((label, index) => <li key={label} className={`${index === currentStep ? "is-current" : ""} ${index < currentStep ? "is-complete" : ""}`} aria-current={index === currentStep ? "step" : undefined}>
          <span aria-hidden="true">{index < currentStep ? <i className="bi bi-check-lg" /> : index + 1}</span>{label}
        </li>)}
      </ol>

      <div className="invoice-ocr__source">
        <div className="invoice-ocr__source-heading">
          <div className="invoice-ocr__source-label"><i className="bi bi-file-earmark-image" aria-hidden="true" /><strong>Documento de origen</strong><span>{draft?.documentos?.length || files.length || 0} archivo{(draft?.documentos?.length || files.length) === 1 ? "" : "s"}</span></div>
          {hasReading && <button type="button" className="btn btn-sm btn-secondary" aria-expanded={documentsOpen} onClick={() => setDocumentsOpen(!documentsOpen)}>{documentsOpen ? "Cerrar opciones" : "Cambiar documentos"}</button>}
        </div>
        <input ref={uploadRef} type="file" hidden accept="image/jpeg,image/png,application/pdf" multiple onChange={choose} />
        <input ref={cameraRef} type="file" hidden accept="image/*" capture="environment" onChange={capturePhoto} />
        {(!hasReading || documentsOpen) && <div className="invoice-ocr__upload">
          {!draft?.documentos?.length && !files.length && <div className="invoice-ocr__upload-intro"><i className="bi bi-camera" aria-hidden="true" /><div><strong>Captura tu factura</strong><p>Selecciona un archivo o toma una foto desde tu teléfono.</p></div></div>}
          <div className="invoice-ocr__actions">
            <button type="button" className="btn btn-secondary" disabled={locked} onClick={() => uploadRef.current.click()}><i className="bi bi-upload" aria-hidden="true" /> Subir foto o PDF</button>
            <button type="button" className="btn btn-secondary" disabled={locked} onClick={openCamera}><i className="bi bi-camera" aria-hidden="true" /> {cameraReady ? "Abrir cámara" : "Usar cámara"}</button>
          </div>
          {cameraReady && cameraHint && <p className="invoice-ocr__hint" role="status">{cameraHint}</p>}
          <p className="invoice-ocr__hint">Una factura · JPG, PNG o PDF · Hasta 5 páginas y 10 MB</p>
        </div>}
        <div className="invoice-ocr__files">
          {files.map((file, i) => <div key={`${file.name}-${i}`} className="invoice-ocr__file">
            <button type="button" className="invoice-ocr__file-link" title={file.name} onClick={() => setPreview({ local: file, mime: file.type })}><i className="bi bi-file-earmark" aria-hidden="true" /><span>{file.name}</span><small>Sin adjuntar</small></button>
            <button type="button" className="btn btn-sm btn-icon btn-secondary" title={`Quitar ${file.name}`} aria-label={`Quitar ${file.name}`} disabled={busy} onClick={() => { setFiles(files.filter((_, idx) => idx !== i)); setPreview(null); }}><i className="bi bi-x-lg" aria-hidden="true" /></button>
          </div>)}
          {draft?.documentos?.map((doc) => <div key={doc.id} className="invoice-ocr__file">
            <button type="button" className="invoice-ocr__file-link" title={`Ver ${doc.nombre}`} onClick={() => setPreview({ path: `/facturas-borradores/${draft.id}/documentos/${doc.id}/`, mime: doc.mime })}><i className={`bi ${doc.mime === "application/pdf" ? "bi-file-earmark-pdf" : "bi-file-earmark-image"}`} aria-hidden="true" /><span>{doc.nombre}</span><small>{doc.paginas} pág.</small><i className="bi bi-arrows-angle-expand" aria-hidden="true" /></button>
            {(!hasReading || documentsOpen) && <button type="button" className="btn btn-sm btn-icon btn-secondary" title={`Quitar ${doc.nombre}`} aria-label={`Quitar ${doc.nombre}`} disabled={locked} onClick={() => run(async () => {
              await controller.perform(`documentos/${doc.id}/`, { method: "DELETE" }); setPreview(null); setResult(null);
            })}><i className="bi bi-x-lg" aria-hidden="true" /></button>}
          </div>)}
        </div>
        {files.length > 0 && <button type="button" className="btn btn-primary" disabled={locked} onClick={() => run(async () => {
          const body = new FormData(); files.forEach((file) => body.append("archivos", file));
          await controller.perform("documentos/", { body }); setFiles([]); setPreview(null); setResult(null);
        })}>{busy ? "Adjuntando…" : "Adjuntar al borrador"}</button>}
        {preview && (!preview.path || preview.path.startsWith(`/facturas-borradores/${draft?.id}/`)) && <Preview file={preview} close={() => setPreview(null)} />}
        {draft?.documentos?.length > 0 && (!hasReading || documentsOpen) && <div className="invoice-ocr__read-action">
          <button type="button" className="btn btn-primary" disabled={locked || files.length > 0} onClick={() => run(async () => {
            const response = await controller.perform("extraer/"); setResult(response.ocr); setDocumentsOpen(false);
          })}><i className={`bi ${busy ? "bi-hourglass-split" : "bi-stars"}`} aria-hidden="true" /> {busy ? "Procesando…" : hasReading ? "Volver a leer documentos" : "Leer documentos"}</button>
          <span>Se enviará al servicio de IA de la tienda para extraer los datos.</span>
        </div>}
      </div>
      {busy && <p role="status" className="invoice-ocr__busy"><i className="bi bi-hourglass-split" aria-hidden="true" /> Procesando documentos. Puedes esperar en esta pantalla.</p>}
      {error && <p className="alert alert-danger mt-2" role="alert">{error}</p>}

      {hasReading && <div className="invoice-ocr__result">
        <div className="invoice-ocr__result-heading"><span className="invoice-ocr__eyebrow"><i className="bi bi-check-circle" aria-hidden="true" /> Lectura completada</span><span className="invoice-ocr__count">{extraction.lineas.length} {extraction.lineas.length === 1 ? "línea" : "líneas"}</span></div>
        <div className="invoice-ocr__summary">
          <div><span className="invoice-ocr__label">Proveedor</span><strong>{extraction.proveedor_nombre || "Proveedor por revisar"}</strong></div>
          <div><span className="invoice-ocr__label">N° factura</span><strong>{extraction.numero_factura || "Por revisar"}</strong></div>
          <div><span className="invoice-ocr__label">Emisión</span><strong>{displayDate(extraction.fecha)}</strong></div>
          <div><span className="invoice-ocr__label">Total impreso</span><strong>{displayNumber(extraction.total, true)}</strong></div>
        </div>
        {extraction.advertencias?.length > 0 && <div className="alert alert-warning">{extraction.advertencias.map((note, i) => <p key={i}>{note}</p>)}</div>}
        {!applied && <div className="invoice-ocr__apply"><p>Completa el formulario con los datos leídos y revisa las coincidencias de productos.</p><button type="button" className="btn btn-primary" disabled={!extraction.lineas.length || locked} onClick={apply}><i className="bi bi-arrow-down-circle" aria-hidden="true" /> Rellenar formulario con esta lectura</button></div>}
      </div>}

      {(applied || pending.length > 0) && <div className="invoice-ocr__review">
        <div className="invoice-ocr__review-heading">
          <div><h3>Revisión de productos</h3><p>{pending.length ? "Vincula cada línea con un producto de tu catálogo para continuar." : "Los productos están listos. Revisa los datos en el formulario antes de guardar."}</p></div>
          <div className="invoice-ocr__badges"><span className="invoice-ocr__badge is-linked"><i className="bi bi-check2" aria-hidden="true" /> {linkedCount} {linkedCount === 1 ? "vinculado" : "vinculados"}</span>{pending.length > 0 && <span className="invoice-ocr__badge is-pending">{pending.length} pendientes</span>}{excluded.length > 0 && <span className="invoice-ocr__badge">{excluded.length} excluidos</span>}</div>
        </div>
        {pending.length > 0 && <div className="invoice-ocr__lines" aria-label="Líneas pendientes de vincular">
          <div className="invoice-ocr__line-head" aria-hidden="true"><span>#</span><span>Producto leído</span><span>Cantidad</span><span>Costo neto / un.</span><span>Acciones</span></div>
          {pending.map((line) => <div key={line.ocr_line} className="invoice-ocr__line">
            <span className="invoice-ocr__line-index">{String(line.ocr_line + 1).padStart(2, "0")}</span>
            <div className="invoice-ocr__product"><strong>{line.codigo || "Sin código"}</strong><p title={line.descripcion}>{line.descripcion || "Descripción ilegible"}</p><small>Archivo {line.archivo} · página {line.pagina}</small></div>
            <div className="invoice-ocr__quantity"><span className="invoice-ocr__mobile-label">Cantidad</span>{displayNumber(line.cantidad)}</div>
            <div className="invoice-ocr__cost"><span className="invoice-ocr__mobile-label">Costo neto / un.</span>{displayNumber(line.costo_neto, true)}</div>
            <div className="invoice-ocr__line-actions"><button type="button" className="btn btn-sm btn-secondary" title={`Vincular o crear producto para ${line.codigo || line.descripcion}`} aria-label={`Vincular o crear producto para ${line.codigo || line.descripcion}`} disabled={locked} onClick={() => { setSelectedLine(line); setSearch(""); setMatches([]); }}><i className="bi bi-link-45deg" aria-hidden="true" /> Vincular</button><button type="button" className="btn btn-sm btn-icon invoice-ocr__exclude" title={`Excluir línea ${line.ocr_line + 1}`} aria-label={`Excluir línea ${line.ocr_line + 1}`} disabled={locked} onClick={() => exclude(line)}><i className="bi bi-x-lg" aria-hidden="true" /></button></div>
          </div>)}
        </div>}
        {!pending.length && <p className="invoice-ocr__complete"><i className="bi bi-check-circle" aria-hidden="true" /> Sin líneas pendientes de vincular.</p>}
      </div>}
    </section>}
    {selectedLine && <div className="modal invoice-ocr__link-dialog" role="dialog" aria-modal="true" aria-label="Vincular línea de factura">
      <div className="modal-dialog modal-xl"><div className="modal-content">
        <div className="modal-header"><div><h3 className="h5">Vincular producto</h3><p className="invoice-ocr__dialog-product">{selectedLine.codigo || "Sin código"} · {selectedLine.descripcion || "Descripción ilegible"}</p></div><button type="button" className="modal-close" aria-label="Cerrar" onClick={() => { setSelectedLine(null); setCreating(false); }}>×</button></div>
        <div className="modal-body" style={{ maxHeight: "75vh", overflowY: "auto" }}>
          {!creating ? <>
            <label>Buscar por código o descripción<input className="form-control" value={search} onChange={(e) => lookup(e.target.value)} /></label>
            {(matches.length ? matches : selectedLine.candidatos || []).map((p) => <div key={p.producto_id} className="mt-2"><button type="button" className="btn btn-sm btn-secondary" onClick={() => link(p)}>{p.codigo_producto} — {p.nombre}</button></div>)}
            <button type="button" className="btn btn-primary mt-3" disabled={!header.proveedor_id} onClick={() => setCreating(true)}>Crear producto con estos datos</button>
            {!header.proveedor_id && <p>Selecciona primero el proveedor en el formulario.</p>}
          </> : <ProductoForm initialProveedor={String(header.proveedor_id)} initialValues={{ codigo_proveedor: selectedLine.codigo || "", nombre: (selectedLine.descripcion || "").slice(0, 100), descripcion: selectedLine.descripcion || "", precio_costo: Math.round(Number(selectedLine.costo_neto) || 0) }} onSaved={link} />}
        </div>
      </div></div>
    </div>}
  </div>;
}
