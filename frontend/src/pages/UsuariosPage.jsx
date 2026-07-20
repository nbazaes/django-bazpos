import { useState } from "react";
import { useNavigate, Link, useSearchParams } from "react-router-dom";
import CrudTable from "../components/CrudTable";
import PageCard from "../components/PageCard";
import Pagination from "../components/Pagination";
import PageSizeSelector from "../components/PageSizeSelector";
import { usePageTitle } from "../components/Shell";
import { useDeleteUsuario, useUsuarios } from "../lib/queries";

export default function UsuariosPage() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  usePageTitle("Usuarios");

  const [page, setPage] = useState(parseInt(searchParams.get("page") || "1", 10));
  const [pageSize, setPageSize] = useState(parseInt(searchParams.get("page_size") || "50", 10));

  const params = { page, page_size: pageSize };
  const { data } = useUsuarios(params);
  const deleteMutation = useDeleteUsuario();

  const rows = data?.results ?? [];
  const count = data?.count ?? 0;
  const totalPages = Math.max(1, Math.ceil(count / pageSize));

  const syncURL = (p, ps) => {
    setSearchParams({ page: String(p), page_size: String(ps) }, { replace: true });
  };

  function handlePageChange(newPage) {
    setPage(newPage);
    syncURL(newPage, pageSize);
  }

  function handlePageSizeChange(newSize) {
    setPageSize(newSize);
    setPage(1);
    syncURL(1, newSize);
  }

  function onDelete(row) {
    if (!window.confirm(`Eliminar ${row.username}?`)) return;
    deleteMutation.mutate(row.id);
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
          { key: "groups", label: "Rol", render: (row) => row.groups?.[0]?.name ?? "—" },
        ]}
        onEdit={(row) => navigate(`/usuarios/${row.id}/editar`)}
        onDelete={onDelete}
      />
      <div className="flex flex-wrap items-center justify-between gap-3 mt-4">
        <PageSizeSelector value={pageSize} onChange={handlePageSizeChange} options={[25, 50, 100]} />
        <Pagination
          page={page}
          totalPages={totalPages}
          onPageChange={handlePageChange}
          count={count}
          pageSize={pageSize}
        />
      </div>
    </PageCard>
  );
}
