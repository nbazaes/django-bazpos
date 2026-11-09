import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "./api";

const BASE = "/facturas-borradores/";

// A single queue orders autosaves, uploads, extraction and final confirmation.
export function useFacturaDraft({ enabled, data, onRestore }) {
  const [initialId] = useState(() => new URLSearchParams(window.location.search).get("borrador"));
  const [draft, setDraft] = useState(null);
  const [status, setStatus] = useState(initialId ? "Cargando borrador…" : "");
  const [error, setError] = useState("");
  const [savedData, setSavedData] = useState(() => JSON.stringify(data));
  const [conflict, setConflict] = useState(false);
  const [missing, setMissing] = useState(false);
  const [ready, setReady] = useState(!initialId);
  const latest = useRef(data);
  const current = useRef(null);
  const lastSaved = useRef("");
  const queue = useRef(Promise.resolve());
  const blocked = useRef(Boolean(initialId));
  const reloadGeneration = useRef(0);
  const recoveryPending = useRef(false);
  const finished = useRef(false);
  const qc = useQueryClient();
  const navigate = useNavigate();
  useEffect(() => { latest.current = data; }, [data]);

  const accept = useCallback((result) => {
    current.current = result;
    setDraft(result);
    qc.invalidateQueries({ queryKey: ["factura-borradores"] });
  }, [qc]);

  const report = useCallback((err) => {
    setStatus("");
    setError(err.message);
    if (err.status === 404) {
      blocked.current = true;
      setMissing(true);
      setError("Este borrador ya no está disponible para tu cuenta. Los datos visibles se conservan; puedes guardarlos como un nuevo borrador.");
    }
    if (err.status === 409) {
      blocked.current = true;
      setConflict(true);
    }
  }, []);

  const enqueue = useCallback((work) => {
    const task = queue.current.then(work, work);
    queue.current = task.catch(() => {});
    return task;
  }, []);

  const reload = useCallback(async () => {
    const id = current.current?.id || initialId;
    if (!id) return;
    const generation = ++reloadGeneration.current;
    blocked.current = true;
    try {
      const result = await apiRequest(`${BASE}${id}/`);
      if (generation !== reloadGeneration.current) return;
      onRestore(result.datos);
      lastSaved.current = JSON.stringify(result.datos);
      setSavedData(lastSaved.current);
      accept(result);
      blocked.current = false;
      setConflict(false);
      setMissing(false);
      setError("");
      setStatus("Guardado");
      setReady(true);
    } catch (err) { if (generation === reloadGeneration.current) report(err); }
  }, [accept, initialId, onRestore, report]);

  useEffect(() => {
    if (enabled && initialId) {
      Promise.resolve().then(reload);
    }
  }, [enabled, initialId, reload]);

  const persist = useCallback(async (force = false) => {
    if (finished.current) throw new Error("El borrador ya fue confirmado o descartado.");
    if (blocked.current) throw new Error("Recarga el borrador antes de continuar.");
    const snapshot = latest.current;
    if (!force && !snapshot.header.numero_factura && !snapshot.header.proveedor_id && !snapshot.items.length && !snapshot.pending.length) return null;
    const encoded = JSON.stringify(snapshot);
    if (current.current && encoded === lastSaved.current) return current.current;
    setStatus("Guardando…");
    const result = current.current
      ? await apiRequest(`${BASE}${current.current.id}/`, { method: "PATCH", body: { revision: current.current.revision, datos: snapshot } })
      : await apiRequest(BASE, { method: "POST", body: { datos: snapshot } });
    lastSaved.current = encoded;
    setSavedData(encoded);
    accept(result);
    const search = new URLSearchParams(window.location.search);
    search.set("borrador", result.id);
    await navigate({ pathname: window.location.pathname, search: `?${search}` }, { replace: true });
    setStatus("Guardado");
    setError("");
    return result;
  }, [accept, navigate]);

  const save = useCallback(() => enqueue(() => finished.current ? null : persist()).catch(report), [enqueue, persist, report]);
  useEffect(() => {
    if (!enabled || !ready || conflict || missing) return;
    const timer = setTimeout(save, 1000);
    return () => clearTimeout(timer);
  }, [data, enabled, ready, conflict, missing, save]);

  const perform = useCallback((suffix, { method = "POST", body = {}, final = false } = {}) => enqueue(async () => {
    try {
      const saved = await persist(true);
      const payload = body instanceof FormData ? body : { ...body };
      if (payload instanceof FormData) payload.set("revision", saved.revision);
      else payload.revision = saved.revision;
      const result = await apiRequest(`${BASE}${saved.id}/${suffix}`, { method, body: payload, timeout: 35000 });
      if (final) {
        finished.current = true;
        qc.invalidateQueries({ queryKey: ["facturas"] });
        qc.invalidateQueries({ queryKey: ["factura-borradores"] });
      } else {
        accept(result);
      }
      setError("");
      return result;
    } catch (err) { report(err); throw err; }
  }), [accept, enqueue, persist, qc, report]);

  const prepareCapture = useCallback(() => enqueue(async () => {
    try {
      const existing = Boolean(current.current);
      const saved = await persist(true);
      if (existing) {
        const remote = await apiRequest(`${BASE}${saved.id}/`);
        if (remote.revision !== saved.revision) {
          const err = new Error("Este borrador cambió en otro dispositivo. Recarga su versión antes de abrir la cámara.");
          err.status = 409;
          throw err;
        }
      }
      setStatus("Guardado");
      setError("");
      return saved;
    } catch (err) { report(err); throw err; }
  }), [enqueue, persist, report]);

  const recover = useCallback(() => {
    if (recoveryPending.current) return;
    recoveryPending.current = true;
    return enqueue(async () => {
      try {
        if (!missing) return;
        // Explicit recovery only: a missing draft might already have been confirmed.
        current.current = null;
        lastSaved.current = "";
        blocked.current = false;
        await persist(true);
        setMissing(false);
        setConflict(false);
        setReady(true);
      } catch (err) { report(err); }
      finally { recoveryPending.current = false; }
    });
  }, [enqueue, missing, persist, report]);

  useEffect(() => {
    if (!enabled) return;
    const warnIfUnsaved = (event) => {
      if (!finished.current && JSON.stringify(latest.current) !== lastSaved.current &&
          (latest.current.header.numero_factura || latest.current.header.proveedor_id || latest.current.items.length)) {
        event.preventDefault();
        event.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", warnIfUnsaved);
    return () => window.removeEventListener("beforeunload", warnIfUnsaved);
  }, [enabled]);

  const displayStatus = status === "Guardado" && JSON.stringify(data) !== savedData ? "Cambios sin guardar…" : status;
  return { draft, status: displayStatus, error, conflict, missing, ready, save, perform, reload, prepareCapture, recover };
}
