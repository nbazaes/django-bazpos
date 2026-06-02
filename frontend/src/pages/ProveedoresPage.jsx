import { useEffect, useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import CrudTable from "../components/CrudTable";
import PageCard from "../components/PageCard";
import { usePageTitle } from "../components/Shell";
import { apiRequest } from "../lib/api";

export default function ProveedoresPage() {
  const navigate = useNavigate();
  usePageTitle("Proveedores");
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
      <PageCard title="Listado de proveedores">
        <div className="page-actions">
          <Link className="btn btn-success" to="/proveedores/crear">Nuevo proveedor</Link>
        </div>
        <CrudTable
          rows={rows}
          columns={[
            { key: "proveedor_id", label: "ID" },
            { key: "rut", label: "RUT" },
            { key: "nombre", label: "Nombre" },
            { key: "telefono", label: "Teléfono" },
          ]}
          onEdit={(row) => navigate(`/proveedores/${row.proveedor_id}/editar`)}
          onDelete={onDelete}
        />
      </PageCard>
  );
}
