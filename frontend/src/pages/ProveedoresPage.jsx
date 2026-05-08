import { useEffect, useState } from "react";
import CrudTable from "../components/CrudTable";
import PageCard from "../components/PageCard";
import Shell from "../components/Shell";
import { apiRequest } from "../lib/api";

export default function ProveedoresPage() {
  const [rows, setRows] = useState([]);

  async function load() {
    setRows(await apiRequest("/proveedores/"));
  }

  useEffect(() => {
    load();
  }, []);

  async function onDelete(row) {
    if (!window.confirm(`Eliminar ${row.nombre}?`)) return;
    await apiRequest(`/proveedores/${row.proveedor_id}/`, { method: "DELETE" });
    await load();
  }

  return (
    <Shell title="Proveedores">
      <PageCard title="Listado de proveedores">
        <div className="page-actions">
          <a className="btn btn-success" href="/gerencia/proveedores/create.html">Nuevo proveedor</a>
        </div>
        <CrudTable
          rows={rows}
          columns={[
            { key: "proveedor_id", label: "ID" },
            { key: "rut", label: "RUT" },
            { key: "nombre", label: "Nombre" },
            { key: "telefono", label: "Telefono" },
          ]}
          onEdit={(row) => (window.location.href = `/gerencia/proveedores/create.html?id=${row.proveedor_id}`)}
          onDelete={onDelete}
        />
      </PageCard>
    </Shell>
  );
}
