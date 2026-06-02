import { useEffect, useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import CrudTable from "../components/CrudTable";
import PageCard from "../components/PageCard";
import { usePageTitle } from "../components/Shell";
import { apiRequest } from "../lib/api";

function renderUbicacion(row) {
  const ubicaciones = row.ubicaciones_stock || [];
  if (ubicaciones.length === 0) return "—";

  const desktop = ubicaciones.map((u, i) => (
    <span key={u.nombre}>
      {i > 0 && <span className="text-muted">, </span>}
      {u.nombre} ({u.cantidad})
    </span>
  ));

  const mobile = ubicaciones.length === 1
    ? `${ubicaciones[0].nombre} (${ubicaciones[0].cantidad})`
    : (
      <span className="stock-hover">
        Múltiples
        <span className="stock-popover">
          {ubicaciones.map((u) => (
            <div key={u.nombre} className="popover-row">
              <span>{u.nombre}</span>
              <strong>{u.cantidad}</strong>
            </div>
          ))}
        </span>
      </span>
    );

  return (
    <>
      <span className="ubicacion-desktop">{desktop}</span>
      <span className="ubicacion-mobile">{mobile}</span>
    </>
  );
}

export default function ProductosPage() {
  const navigate = useNavigate();
  usePageTitle("Productos");
  const [rows, setRows] = useState([]);
  const [texto, setTexto] = useState("");

  async function load() {
    const query = texto ? `?texto=${encodeURIComponent(texto)}` : "";
    const data = await apiRequest(`/productos/${query}`);
    setRows(data);
  }

  useEffect(() => {
    load();
  }, []);

  async function onDelete(row) {
    if (!window.confirm(`Eliminar ${row.nombre}?`)) return;
    await apiRequest(`/productos/${row.producto_id}/`, { method: "DELETE" });
    await load();
  }

  return (
      <PageCard title="Listado de productos">
        <div className="page-actions">
          <input
            className="form-control"
            placeholder="Buscar por nombre o código"
            value={texto}
            onChange={(e) => setTexto(e.target.value)}
          />
          <button className="btn btn-primary" onClick={load}>Buscar</button>
          <Link className="btn btn-success" to="/productos/crear">Nuevo producto</Link>
        </div>
        <CrudTable
          rows={rows}
          columns={[
            { key: "codigo_producto", label: "Código", width: "1px" },
            { key: "oem", label: "OEM" },
            { key: "nombre", label: "Nombre" },
            { key: "marca", label: "Marca" },
            { key: "descripcion", label: "Descripción" },
            { key: "precio", label: "Precio", width: "1px" },
            { key: "stock_actual", label: "Stock", width: "1px" },
            { key: "ubicaciones_stock", label: "Ubicación", render: renderUbicacion },
          ]}
          onEdit={(row) => {
            navigate(`/productos/${row.producto_id}/editar`);
          }}
          onDelete={onDelete}
        />
      </PageCard>
  );
}
