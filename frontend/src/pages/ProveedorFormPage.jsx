import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import PageCard from "../components/PageCard";
import { usePageTitle } from "../lib/usePageTitle";
import {
  useCreateProveedor,
  useProveedor,
  useUpdateProveedor,
} from "../lib/queries";
import { getStoreConfig } from "../lib/storeConfig";

const initialState = {
  tax_id: "",
  nombre: "",
  persona_contacto: "",
  telefono: "",
  correo: "",
  direccion: "",
};

export default function ProveedorFormPage() {
  const navigate = useNavigate();
  const { id } = useParams();
  usePageTitle(id ? "Editar proveedor" : "Crear proveedor");
  const showRutField = getStoreConfig().feature_flags?.supplier_rut_field === true;
  const taxLabel = showRutField ? "RUT" : "ID tributario";
  const taxRequired = showRutField;

  const [data, setData] = useState(initialState);
  const [error, setError] = useState("");

  const { data: proveedorData } = useProveedor(id);
  const createMutation = useCreateProveedor();
  const updateMutation = useUpdateProveedor();

  useEffect(() => {
    if (proveedorData && id) {
      let cancelled = false;
      Promise.resolve().then(() => {
        if (!cancelled) setData(proveedorData);
      });
      return () => { cancelled = true; };
    }
  }, [proveedorData, id]);

  function submit(event) {
    event.preventDefault();
    setError("");
    const mutation = id ? updateMutation : createMutation;
    mutation.mutate(id ? { id, data } : data, {
      onSuccess: () => navigate("/proveedores"),
      onError: (err) => setError(err.message),
    });
  }

  return (
    <PageCard title={id ? "Editar proveedor" : "Crear proveedor"}>
      {error && <div className="alert alert-danger">{error}</div>}
      <form onSubmit={submit}>
        <div className="row">
          <div className="col-md-6 form-group"><label>{taxLabel}</label><input className="form-control" value={data.tax_id || ""} onChange={(e) => setData({ ...data, tax_id: e.target.value })} required={taxRequired} /></div>
          <div className="col-md-6 form-group"><label>Nombre</label><input className="form-control" value={data.nombre} onChange={(e) => setData({ ...data, nombre: e.target.value })} required /></div>
          <div className="col-md-6 form-group"><label>Contacto</label><input className="form-control" value={data.persona_contacto || ""} onChange={(e) => setData({ ...data, persona_contacto: e.target.value })} /></div>
          <div className="col-md-6 form-group"><label>Teléfono</label><input className="form-control" value={data.telefono || ""} onChange={(e) => setData({ ...data, telefono: e.target.value })} /></div>
          <div className="col-md-6 form-group"><label>Correo</label><input className="form-control" value={data.correo || ""} onChange={(e) => setData({ ...data, correo: e.target.value })} /></div>
          <div className="col-md-6 form-group"><label>Dirección</label><input className="form-control" value={data.direccion || ""} onChange={(e) => setData({ ...data, direccion: e.target.value })} /></div>
        </div>
        <button className="btn btn-primary" disabled={createMutation.isPending || updateMutation.isPending}>
          {createMutation.isPending || updateMutation.isPending ? "Guardando..." : "Guardar"}
        </button>
      </form>
    </PageCard>
  );
}
