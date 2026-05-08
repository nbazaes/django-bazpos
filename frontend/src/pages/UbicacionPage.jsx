import { useEffect, useState } from "react";
import CrudTable from "../components/CrudTable";
import PageCard from "../components/PageCard";
import Shell from "../components/Shell";
import { apiRequest } from "../lib/api";

export default function UbicacionPage() {
  const [rows, setRows] = useState([]);
  const [showForm, setShowForm] = useState(false);
  const [editRow, setEditRow] = useState(null);
  const [formData, setFormData] = useState({ nombre: "", descripcion: "" });
  const [error, setError] = useState("");

  async function load() {
    try {
      const data = await apiRequest("/ubicaciones/");
      setRows(data);
    } catch (err) {
      setError(err.message);
    }
  }

  useEffect(() => {
    load();
  }, []);

  function openCreate() {
    setEditRow(null);
    setFormData({ nombre: "", descripcion: "" });
    setShowForm(true);
  }

  function openEdit(row) {
    setEditRow(row);
    setFormData({ nombre: row.nombre, descripcion: row.descripcion || "" });
    setShowForm(true);
  }

  async function handleSave(e) {
    e.preventDefault();
    try {
      if (editRow) {
        await apiRequest(`/ubicaciones/${editRow.id}/`, {
          method: "PUT",
          body: formData,
        });
      } else {
        await apiRequest("/ubicaciones/", {
          method: "POST",
          body: formData,
        });
      }
      setShowForm(false);
      setError("");
      await load();
    } catch (err) {
      setError(err.message);
    }
  }

  async function onDelete(row) {
    if (!window.confirm(`Eliminar ubicacion "${row.nombre}"?`)) return;
    try {
      await apiRequest(`/ubicaciones/${row.id}/`, { method: "DELETE" });
      await load();
    } catch (err) {
      setError(err.message);
    }
  }

  return (
    <Shell title="Ubicaciones">
      {error && <div className="alert alert-danger">{error}</div>}
      <PageCard title="Listado de ubicaciones">
        <div className="page-actions">
          <button className="btn btn-primary" onClick={openCreate}>Nueva ubicacion</button>
        </div>
        <CrudTable
          rows={rows}
          columns={[
            { key: "id", label: "ID" },
            { key: "nombre", label: "Nombre" },
            { key: "descripcion", label: "Descripcion" },
          ]}
          onEdit={(row) => openEdit(row)}
          onDelete={onDelete}
        />
      </PageCard>

      {showForm && (
        <div className="modal" style={{ display: "block", backgroundColor: "rgba(0,0,0,0.45)" }} role="dialog" aria-modal="true">
          <div className="modal-dialog modal-dialog-centered">
            <div className="modal-content">
              <form onSubmit={handleSave}>
                <div className="modal-header">
                  <h5 className="modal-title">{editRow ? "Editar ubicacion" : "Nueva ubicacion"}</h5>
                  <button type="button" className="close" onClick={() => setShowForm(false)}>&times;</button>
                </div>
                <div className="modal-body">
                  <div className="form-group">
                    <label>Nombre</label>
                    <input className="form-control" value={formData.nombre} onChange={(e) => setFormData({ ...formData, nombre: e.target.value })} required />
                  </div>
                  <div className="form-group">
                    <label>Descripcion</label>
                    <textarea className="form-control" value={formData.descripcion} onChange={(e) => setFormData({ ...formData, descripcion: e.target.value })} />
                  </div>
                </div>
                <div className="modal-footer">
                  <button type="button" className="btn btn-secondary" onClick={() => setShowForm(false)}>Cancelar</button>
                  <button type="submit" className="btn btn-primary">{editRow ? "Guardar" : "Crear"}</button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}
    </Shell>
  );
}
