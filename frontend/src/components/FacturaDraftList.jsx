import { Link } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { getUser } from "../lib/auth";
import { apiRequest } from "../lib/api";
import PageCard from "./PageCard";
import { formatDateTime } from "../lib/format";

export default function FacturaDraftList() {
  const qc = useQueryClient();
  const { data = [], error } = useQuery({ queryKey: ["factura-borradores", getUser()?.id], queryFn: () => apiRequest("/facturas-borradores/") });
  const discard = useMutation({
    mutationFn: (d) => apiRequest(`/facturas-borradores/${d.id}/`, { method: "DELETE", body: { revision: d.revision } }),
    onSettled: () => qc.invalidateQueries({ queryKey: ["factura-borradores"] }),
  });
  return <PageCard title="Mis borradores">
    {(error || discard.error) && <p role="alert" className="alert alert-danger">{(error || discard.error).message}</p>}
    {!data.length && !error && <p>No tienes facturas pendientes.</p>}
    <div className="d-flex flex-wrap gap-3">{data.map((d) => <div key={d.id} className="border rounded p-3">
      <strong>{d.header.proveedor_nombre || "Factura pendiente"} {d.header.numero_factura ? `N° ${d.header.numero_factura}` : ""}</strong>
      <p>{d.productos} productos · {formatDateTime(d.actualizado)}</p>
      <Link className="btn btn-sm btn-primary" to={`/facturas/crear?borrador=${d.id}`}>Continuar</Link>{" "}
      <button type="button" className="btn btn-sm btn-secondary" disabled={discard.isPending} onClick={() => {
        if (window.confirm("¿Descartar el borrador y sus documentos?")) discard.mutate(d);
      }}>Descartar</button>
    </div>)}</div>
  </PageCard>;
}
