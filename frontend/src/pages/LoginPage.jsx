import { useState } from "react";
import { login, me } from "../lib/api";
import { saveUser } from "../lib/auth";

export default function LoginPage() {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");

  async function handleSubmit(event) {
    event.preventDefault();
    setError("");
    try {
      await login(username, password);
      const user = await me();
      saveUser(user);
      window.location.href = "/";
    } catch (err) {
      setError(err.message);
    }
  }

  return (
    <div className="auth-container">
      <div className="auth-panel">
        <div className="auth-logo">
          <h1>Bazpos</h1>
          <p>Sistema de punto de venta</p>
        </div>
        <div className="auth-card">
          <h2>Ingresar</h2>
          {error && <div className="alert alert-danger">{error}</div>}
          <form onSubmit={handleSubmit}>
            <div className="form-group">
              <label>Usuario</label>
              <input className="form-control" value={username} onChange={(e) => setUsername(e.target.value)} required />
            </div>
            <div className="form-group">
              <label>Contraseña</label>
              <input
                className="form-control"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
            </div>
            <button className="btn btn-primary w-full" type="submit">
              Entrar
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
