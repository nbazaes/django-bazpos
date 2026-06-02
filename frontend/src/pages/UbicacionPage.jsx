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
    setFormData({ nombre: "", marca: "", descripcion: "" });
    setShowForm(true);
  }

  function openEdit(row) {
    setEditRow(row);
    setFormData({ nombre: row.nombre, marca: row.marca || "", descripcion: row.descripcion || "" });
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
    if (!window.confirm(`Eliminar ubicación "${row.nombre}"?`)) return;
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
