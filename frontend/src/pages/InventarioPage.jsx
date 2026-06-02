import { useEffect, useState } from "react";
import PageCard from "../components/PageCard";
import Shell from "../components/Shell";
import { apiRequest } from "../lib/api";

function UbicacionCell({ ubicaciones }) {
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
        <div className="table-responsive">
          <table className="table table-sm table-bordered">
            <thead>
              <tr>
                <th style={{ width: "1px" }}>Código</th>
                <th style={{ width: "1px" }}>OEM</th>
                <th>Nombre</th>
                <th>Marca</th>
                <th>Descripción</th>
                <th style={{ width: "1px" }}>Stock actual</th>
                <th>Ubicación</th>
                <th style={{ width: "1px" }}>Stock min</th>
                <th style={{ width: "1px" }}>Stock max</th>
              </tr>
            </thead>
            <tbody>
              {productos.map((p) => (
                <tr key={p.producto_id}>
                  <td className="text-nowrap">{p.codigo_producto}</td>
                  <td className="text-nowrap">{p.oem}</td>
                  <td>{p.nombre}</td>
                  <td>{p.marca}</td>
                  <td className="text-truncate" style={{ maxWidth: 200 }}>{p.descripcion}</td>
                  <td>{p.stock_actual}</td>
                  <td><UbicacionCell ubicaciones={p.ubicaciones_stock} /></td>
                  <td>{p.stock_minimo}</td>
                  <td>{p.stock_maximo}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </PageCard>
    </Shell>
  );
}
