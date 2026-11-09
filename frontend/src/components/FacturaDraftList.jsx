import { useState } from "react";
import ConfirmDialog from "./ConfirmDialog";
import { Link } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { getUser } from "../lib/auth";
import { apiRequest } from "../lib/api";
import PageCard from "./PageCard";
import { formatDateTime } from "../lib/format";

export default function FacturaDraftList() {
  const qc = useQueryClient();
  const [pendingDiscard, setPendingDiscard] = useState(null);
  const { data = [], error } = useQuery({ queryKey: ["factura-borradores", getUser()?.id], queryFn: () => apiRequest("/facturas-borradores/") });
  const discard = useMutation({
    mutationFn: (d) => apiRequest(`/facturas-borradores/${d.id}/`, { method: "DELETE", body: { revision: d.revision } }),
    onSuccess: () => setPendingDiscard(null),
    onSettled: () => qc.invalidateQueries({ queryKey: ["factura-borradores"] }),
  });
  return <PageCard title="Mis borradores">
    {error && <p role="alert" className="alert alert-danger">{error.message}</p>}
    {!data.length && !error && <p>No tienes facturas pendientes.</p>}
    <div className="d-flex flex-wrap gap-3">{data.map((d) => <div key={d.id} className="border rounded p-3">
      <strong>{d.header.proveedor_nombre || "Factura pendiente"} {d.header.numero_factura ? `N° ${d.header.numero_factura}` : ""}</strong>
      <p>{d.productos} productos · {formatDateTime(d.actualizado)}</p>
      <Link className="btn btn-sm btn-primary" to={`/facturas/crear?borrador=${d.id}`}>Continuar</Link>{" "}
      <button type="button" className="btn btn-sm btn-secondary" disabled={discard.isPending} onClick={() => {
        discard.reset();
        setPendingDiscard(d);
      }}>Descartar</button>
    </div>)}</div>
    {pendingDiscard && <ConfirmDialog
      title="Descartar borrador"
      confirmLabel="Descartar borrador"
      busy={discard.isPending}
      error={discard.error?.message}
      onCancel={() => setPendingDiscard(null)}
      onConfirm={() => discard.mutate(pendingDiscard)}
    >Se eliminará{pendingDiscard.header.numero_factura ? ` el borrador de la factura N° ${pendingDiscard.header.numero_factura}` : " este borrador"} junto con sus fotos y documentos. Esta acción no se puede deshacer.</ConfirmDialog>}
  </PageCard>;
}
