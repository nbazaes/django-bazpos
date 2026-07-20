import { useState } from "react";
import { useSearchParams } from "react-router-dom";
import CrudTable from "../components/CrudTable";
import PageCard from "../components/PageCard";
import Pagination from "../components/Pagination";
import PageSizeSelector from "../components/PageSizeSelector";
import { usePageTitle } from "../components/Shell";
import {
  useCreateUbicacion,
  useDeleteUbicacion,
  useUbicaciones,
  useUpdateUbicacion,
} from "../lib/queries";

export default function UbicacionPage() {
  usePageTitle("Ubicaciones");
  const [searchParams, setSearchParams] = useSearchParams();

  const [page, setPage] = useState(parseInt(searchParams.get("page") || "1", 10));
  const [pageSize, setPageSize] = useState(parseInt(searchParams.get("page_size") || "50", 10));
  const [showForm, setShowForm] = useState(false);
  const [editRow, setEditRow] = useState(null);
  const [formData, setFormData] = useState({ nombre: "", descripcion: "" });
  const [mutationError, setMutationError] = useState("");

  const params = { page, page_size: pageSize };
  const { data } = useUbicaciones(params);
  const createMutation = useCreateUbicacion();
  const updateMutation = useUpdateUbicacion();
  const deleteMutation = useDeleteUbicacion();

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

  function openCreate() {
    setEditRow(null);
    setFormData({ nombre: "", marca: "", descripcion: "" });
    setMutationError("");
    setShowForm(true);
  }

  function openEdit(row) {
    setEditRow(row);
    setFormData({ nombre: row.nombre, marca: row.marca || "", descripcion: row.descripcion || "" });
    setMutationError("");
    setShowForm(true);
  }

  function handleSave(e) {
    e.preventDefault();
    setMutationError("");
    if (editRow) {
      updateMutation.mutate(
        { id: editRow.id, data: formData },
        {
          onSuccess: () => setShowForm(false),
          onError: (err) => setMutationError(err.message),
        },
      );
    } else {
      createMutation.mutate(formData, {
        onSuccess: () => setShowForm(false),
        onError: (err) => setMutationError(err.message),
      });
    }
  }

  function onDelete(row) {
    if (!window.confirm(`Eliminar ubicación "${row.nombre}"?`)) return;
    deleteMutation.mutate(row.id);
  }

  return (
    <>
      {mutationError && <div className="alert alert-danger">{mutationError}</div>}
      <PageCard title="Listado de ubicaciones">
        <div className="page-actions">
          <button className="btn btn-primary" onClick={openCreate}>Nueva ubicación</button>
        </div>
        <CrudTable
          rows={rows}
          columns={[
            { key: "nombre", label: "Nombre" },
            { key: "marca", label: "Marca" },
            { key: "descripcion", label: "Descripción" },
          ]}
          onEdit={(row) => openEdit(row)}
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

      {showForm && (
        <div className="modal" role="dialog" aria-modal="true">
          <div className="modal-dialog">
            <div className="modal-content">
              <form onSubmit={handleSave}>
                <div className="modal-header">
                  <h5 className="modal-title">{editRow ? "Editar ubicación" : "Nueva ubicación"}</h5>
                  <button type="button" className="modal-close" onClick={() => setShowForm(false)}>&times;</button>
                </div>
                <div className="modal-body">
                  <div className="form-group">
                    <label>Nombre</label>
                    <input className="form-control" value={formData.nombre} onChange={(e) => setFormData({ ...formData, nombre: e.target.value })} required />
                  </div>
                  <div className="form-group">
                    <label>Marca</label>
                    <input className="form-control" value={formData.marca} onChange={(e) => setFormData({ ...formData, marca: e.target.value })} />
                  </div>
                  <div className="form-group">
                    <label>Descripción</label>
                    <textarea className="form-control" value={formData.descripcion} onChange={(e) => setFormData({ ...formData, descripcion: e.target.value })} />
                  </div>
                  {mutationError && <div className="alert alert-danger">{mutationError}</div>}
                </div>
                <div className="modal-footer">
                  <button type="button" className="btn btn-secondary" onClick={() => setShowForm(false)}>Cancelar</button>
                  <button type="submit" className="btn btn-primary" disabled={createMutation.isPending || updateMutation.isPending}>
                    {editRow ? (updateMutation.isPending ? "Guardando..." : "Guardar") : (createMutation.isPending ? "Creando..." : "Crear")}
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
