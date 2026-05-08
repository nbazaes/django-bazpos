import { useEffect, useState } from "react";
import CrudTable from "../components/CrudTable";
import PageCard from "../components/PageCard";
import Shell from "../components/Shell";
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
    <Shell title="Productos">
      <PageCard title="Listado de productos">
        <div className="page-actions">
          <input
            className="form-control"
            style={{ maxWidth: 320 }}
            placeholder="Buscar por nombre o codigo"
            value={texto}
            onChange={(e) => setTexto(e.target.value)}
          />
          <button className="btn btn-primary" onClick={load}>Buscar</button>
          <a className="btn btn-success" href="/ventas/productos/create.html">Nuevo producto</a>
        </div>
        <CrudTable
          rows={rows}
          columns={[
            { key: "codigo_producto", label: "Codigo", width: "1px" },
            { key: "oem", label: "OEM" },
            { key: "nombre", label: "Nombre" },
            { key: "marca", label: "Marca" },
            { key: "descripcion", label: "Descripción" },
            { key: "precio", label: "Precio", width: "1px" },
            { key: "stock_actual", label: "Stock", width: "1px" },
            { key: "ubicaciones_stock", label: "Ubicación", render: renderUbicacion },
          ]}
          onEdit={(row) => {
            window.location.href = `/ventas/productos/create.html?id=${row.producto_id}`;
          }}
          onDelete={onDelete}
        />
      </PageCard>
      <style>{`
        .ubicacion-mobile { display: none; }
        @media (max-width: 767px) {
          .ubicacion-desktop { display: none; }
          .ubicacion-mobile { display: inline; }
        }
        .stock-hover {
          position: relative;
          display: inline-block;
          cursor: pointer;
          border-bottom: 1px dashed #999;
        }
        .stock-popover {
          visibility: hidden;
          opacity: 0;
          position: absolute;
          bottom: calc(100% + 8px);
          left: 50%;
          transform: translateX(-50%);
          background: #fff;
          border: 1px solid #d1d3e2;
          border-radius: 6px;
          padding: 8px 12px;
          white-space: nowrap;
          z-index: 100;
          box-shadow: 0 4px 12px rgba(0,0,0,0.15);
          transition: opacity 0.15s ease;
          min-width: 180px;
        }
        .stock-popover::after {
          content: "";
          position: absolute;
          top: 100%;
          left: 50%;
          transform: translateX(-50%);
          border: 6px solid transparent;
          border-top-color: #fff;
        }
        .stock-popover::before {
          content: "";
          position: absolute;
          top: 100%;
          left: 50%;
          transform: translateX(-50%);
          border: 7px solid transparent;
          border-top-color: #d1d3e2;
        }
        .stock-hover:hover .stock-popover {
          visibility: visible;
          opacity: 1;
        }
        .popover-row {
          display: flex;
          justify-content: space-between;
          gap: 16px;
          padding: 2px 0;
        }
        .popover-row + .popover-row {
          border-top: 1px solid #eaecf4;
        }
      `}</style>
    </Shell>
  );
}
