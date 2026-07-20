import { useState } from "react";
import { useNavigate, Link, useSearchParams } from "react-router-dom";
import CrudTable from "../components/CrudTable";
import PageCard from "../components/PageCard";
import Pagination from "../components/Pagination";
import PageSizeSelector from "../components/PageSizeSelector";
import { usePageTitle } from "../components/Shell";
import { useDeleteProveedor, useProveedores } from "../lib/queries";

export default function ProveedoresPage() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  usePageTitle("Proveedores");

  const [page, setPage] = useState(parseInt(searchParams.get("page") || "1", 10));
  const [pageSize, setPageSize] = useState(parseInt(searchParams.get("page_size") || "50", 10));

  const params = { page, page_size: pageSize };
  const { data } = useProveedores(params);
  const deleteMutation = useDeleteProveedor();

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
    if (!window.confirm(`Eliminar ${row.nombre}?`)) return;
    deleteMutation.mutate(row.proveedor_id);
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
