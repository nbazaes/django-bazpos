import { useEffect, useState } from "react";
import CrudTable from "../components/CrudTable";
import PageCard from "../components/PageCard";
import Shell from "../components/Shell";
import { apiRequest } from "../lib/api";

export default function UsuariosPage() {
  const [rows, setRows] = useState([]);

  async function load() {
    setRows(await apiRequest("/usuarios/"));
  }

  useEffect(() => {
    load();
  }, []);

  async function onDelete(row) {
    if (!window.confirm(`Eliminar ${row.username}?`)) return;
    await apiRequest(`/usuarios/${row.id}/`, { method: "DELETE" });
    await load();
  }

  return (
    <Shell title="Usuarios">
      <PageCard title="Listado de usuarios">
        <div className="page-actions">
          <a className="btn btn-success" href="/gerencia/usuarios/create.html">Nuevo usuario</a>
        </div>
        <CrudTable
          rows={rows}
          columns={[
            { key: "id", label: "ID" },
            { key: "username", label: "Usuario" },
            { key: "first_name", label: "Nombre" },
            { key: "last_name", label: "Apellido" },
          ]}
          onEdit={(row) => (window.location.href = `/gerencia/usuarios/editar.html?id=${row.id}`)}
          onDelete={onDelete}
        />
      </PageCard>
    </Shell>
  );
}
