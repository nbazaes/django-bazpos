import { useEffect, useState } from "react";
import PageCard from "../components/PageCard";
import Shell from "../components/Shell";
import { apiRequest } from "../lib/api";

function UbicacionCell({ ubicaciones }) {
  const total = (ubicaciones || []).reduce((s, u) => s + u.cantidad, 0);
  if (!ubicaciones || ubicaciones.length === 0) return <span>—</span>;

  return (
    <>
      <span className="ubicacion-desktop">
        {ubicaciones.map((u, i) => (
          <span key={u.nombre}>
            {i > 0 && <span className="text-muted">, </span>}
            {u.nombre} ({u.cantidad})
          </span>
        ))}
      </span>
      <span className="ubicacion-mobile">
        {ubicaciones.length === 1
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
          )}
      </span>
    </>
  );
}

export default function InventarioPage() {
  const [productos, setProductos] = useState([]);

  useEffect(() => {
    apiRequest("/productos/").then(setProductos);
  }, []);

  return (
    <Shell title="Inventario">
      <PageCard title="Inventario actual">
        <table className="table table-sm table-bordered inv-table">
          <thead>
            <tr>
              <th>Código</th>
              <th>OEM</th>
              <th>Nombre</th>
              <th>Marca</th>
              <th>Descripción</th>
              <th>Stock actual</th>
              <th>Ubicación</th>
              <th>Stock min</th>
              <th>Stock max</th>
            </tr>
          </thead>
          <tbody>
            {productos.map((p) => (
              <tr key={p.producto_id}>
                <td>{p.codigo_producto}</td>
                <td>{p.oem}</td>
                <td>{p.nombre}</td>
                <td>{p.marca}</td>
                <td style={{ maxWidth: 200, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{p.descripcion}</td>
                <td>{p.stock_actual}</td>
                <td><UbicacionCell ubicaciones={p.ubicaciones_stock} /></td>
                <td>{p.stock_minimo}</td>
                <td>{p.stock_maximo}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </PageCard>
      <style>{`
        .inv-table th, .inv-table td { white-space: nowrap; }
        .inv-table th:nth-child(1), .inv-table td:nth-child(1) { width: 1px; }
        .inv-table th:nth-child(2), .inv-table td:nth-child(2) { width: 1px; }
        .inv-table th:nth-child(6), .inv-table td:nth-child(6) { width: 1px; }
        .inv-table th:nth-child(9), .inv-table td:nth-child(9) { width: 1px; }
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
          padding-top: 4px;
          margin-top: 2px;
        }
      `}</style>
    </Shell>
  );
}
