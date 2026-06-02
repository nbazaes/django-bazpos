import { useEffect, useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import CrudTable from "../components/CrudTable";
import PageCard from "../components/PageCard";
import { usePageTitle } from "../components/Shell";
import { apiRequest } from "../lib/api";

export default function UsuariosPage() {
  const navigate = useNavigate();
  usePageTitle("Usuarios");
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
      <PageCard title="Listado de usuarios">
        <div className="page-actions">
          <Link className="btn btn-success" to="/usuarios/crear">Nuevo usuario</Link>
        </div>
        <CrudTable
          rows={rows}
          columns={[
            { key: "id", label: "ID" },
            { key: "username", label: "Usuario" },
            { key: "first_name", label: "Nombre" },
            { key: "last_name", label: "Apellido" },
          ]}
          onEdit={(row) => navigate(`/usuarios/${row.id}/editar`)}
          onDelete={onDelete}
        />
      </PageCard>
  );
}
