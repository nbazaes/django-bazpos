import { useEffect, useMemo, useState } from "react";
import PageCard from "../components/PageCard";
import Shell from "../components/Shell";
import { apiRequest } from "../lib/api";

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
  const id = useMemo(() => new URLSearchParams(window.location.search).get("id"), []);
  const [data, setData] = useState(initial);
  const [groups, setGroups] = useState([]);
  const [error, setError] = useState("");

  useEffect(() => {
    apiRequest("/usuarios/grupos/").then(setGroups).catch((err) => setError(err.message));
    if (id) {
      apiRequest(`/usuarios/${id}/`)
        .then((row) => {
          setData({ ...row, password: "", group_id: row.groups?.[0]?.id || "" });
        })
        .catch((err) => setError(err.message));
    }
  }, [id]);

  async function submit(event) {
    event.preventDefault();
    const payload = {
      ...data,
      group_id: data.group_id ? Number(data.group_id) : null,
    };
    try {
      await apiRequest(id ? `/usuarios/${id}/` : "/usuarios/", {
        method: id ? "PUT" : "POST",
        body: payload,
      });
      window.location.href = "/gerencia/usuarios/usuarios.html";
    } catch (err) {
      setError(err.message);
    }
  }

  return (
    <Shell title={id ? "Editar usuario" : "Crear usuario"}>
      <PageCard title={id ? "Editar usuario" : "Crear usuario"}>
        {error && <div className="alert alert-danger">{error}</div>}
        <form onSubmit={submit}>
          <div className="row">
            <div className="col-md-4 form-group"><label>Usuario</label><input disabled={Boolean(id)} className="form-control" value={data.username} onChange={(e) => setData({ ...data, username: e.target.value })} required /></div>
            <div className="col-md-4 form-group"><label>Nombre</label><input className="form-control" value={data.first_name} onChange={(e) => setData({ ...data, first_name: e.target.value })} /></div>
            <div className="col-md-4 form-group"><label>Apellido</label><input className="form-control" value={data.last_name} onChange={(e) => setData({ ...data, last_name: e.target.value })} /></div>
            <div className="col-md-6 form-group"><label>Email</label><input className="form-control" value={data.email} onChange={(e) => setData({ ...data, email: e.target.value })} /></div>
            <div className="col-md-6 form-group"><label>Contrasena {id ? "(opcional)" : ""}</label><input type="password" className="form-control" value={data.password} onChange={(e) => setData({ ...data, password: e.target.value })} required={!id} /></div>
            <div className="col-md-6 form-group"><label>Grupo</label><select className="form-control" value={data.group_id} onChange={(e) => setData({ ...data, group_id: e.target.value })}><option value="">Sin grupo</option>{groups.map((g) => <option value={g.id} key={g.id}>{g.name}</option>)}</select></div>
          </div>
          <button className="btn btn-primary">Guardar</button>
        </form>
      </PageCard>
    </Shell>
  );
}
