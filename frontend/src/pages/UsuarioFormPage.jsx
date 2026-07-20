import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import PageCard from "../components/PageCard";
import { usePageTitle } from "../components/Shell";
import { useCreateUsuario, useGrupos, useUpdateUsuario, useUsuario } from "../lib/queries";

const initial = {
  username: "",
  first_name: "",
  last_name: "",
  email: "",
  password: "",
  group_id: "",
  is_active: true,
};

export default function UsuarioFormPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  usePageTitle(id ? "Editar usuario" : "Crear usuario");

  const [data, setData] = useState(initial);
  const [error, setError] = useState("");

  const { data: gruposData } = useGrupos();
  const { data: usuarioData } = useUsuario(id);
  const createMutation = useCreateUsuario();
  const updateMutation = useUpdateUsuario();

  const groups = gruposData ?? [];

  useEffect(() => {
    if (usuarioData && id) {
      setData({ ...usuarioData, password: "", group_id: usuarioData.groups?.[0]?.id || "" });
    }
  }, [usuarioData, id]);

  function submit(event) {
    event.preventDefault();
    setError("");
    const payload = {
      ...data,
      group_id: data.group_id ? Number(data.group_id) : null,
    };
    if (id && !payload.password) delete payload.password;
    const mutation = id ? updateMutation : createMutation;
    mutation.mutate(id ? { id, data: payload } : payload, {
      onSuccess: () => navigate("/usuarios"),
      onError: (err) => setError(err.message),
    });
  }

  return (
    <PageCard title={id ? "Editar usuario" : "Crear usuario"}>
      {error && <div className="alert alert-danger">{error}</div>}
      <form onSubmit={submit}>
        <div className="row">
          <div className="col-md-4 form-group"><label>Usuario</label><input disabled={Boolean(id)} className="form-control" value={data.username} onChange={(e) => setData({ ...data, username: e.target.value })} required /></div>
          <div className="col-md-4 form-group"><label>Nombre</label><input className="form-control" value={data.first_name} onChange={(e) => setData({ ...data, first_name: e.target.value })} /></div>
          <div className="col-md-4 form-group"><label>Apellido</label><input className="form-control" value={data.last_name} onChange={(e) => setData({ ...data, last_name: e.target.value })} /></div>
          <div className="col-md-6 form-group"><label>Email</label><input className="form-control" value={data.email} onChange={(e) => setData({ ...data, email: e.target.value })} /></div>
          <div className="col-md-6 form-group"><label>Contraseña {id ? "(opcional)" : ""}</label><input type="password" className="form-control" value={data.password} onChange={(e) => setData({ ...data, password: e.target.value })} required={!id} /></div>
          <div className="col-md-6 form-group"><label>Grupo</label><select className="form-control" value={data.group_id} onChange={(e) => setData({ ...data, group_id: e.target.value })}><option value="">Sin grupo</option>{groups.map((g) => <option value={g.id} key={g.id}>{g.name}</option>)}</select></div>
        </div>
        <button className="btn btn-primary" disabled={createMutation.isPending || updateMutation.isPending}>
          {createMutation.isPending || updateMutation.isPending ? "Guardando..." : "Guardar"}
        </button>
      </form>
    </PageCard>
  );
}
