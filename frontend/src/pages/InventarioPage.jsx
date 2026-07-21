import { useEffect, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import PageCard from "../components/PageCard";
import Pagination from "../components/Pagination";
import PageSizeSelector from "../components/PageSizeSelector";
import { usePageTitle } from "../components/Shell";
import AjusteStockModal from "../components/AjusteStockModal";
import HistorialAjustesModal from "../components/HistorialAjustesModal";
import { useProductos } from "../lib/queries";
import { getUser, isGerente } from "../lib/auth";

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
  usePageTitle("Inventario");
  const [searchParams, setSearchParams] = useSearchParams();

  const [texto, setTexto] = useState(searchParams.get("texto") || "");
  const [page, setPage] = useState(parseInt(searchParams.get("page") || "1", 10));
  const [pageSize, setPageSize] = useState(parseInt(searchParams.get("page_size") || "50", 10));
  const debounceRef = useRef(null);

  const params = { texto, page, page_size: pageSize };
  const { data, isFetching } = useProductos(params);

  const user = getUser();
  const puedeAjustar = isGerente(user);

  const [ajusteProducto, setAjusteProducto] = useState(null);
  const [historialProducto, setHistorialProducto] = useState(null);

  const productos = data?.results ?? [];
  const count = data?.count ?? 0;
  const totalPages = Math.max(1, Math.ceil(count / pageSize));

  useEffect(() => {
    const urlTexto = searchParams.get("texto") || "";
    const urlPage = parseInt(searchParams.get("page") || "1", 10);
    const urlPageSize = parseInt(searchParams.get("page_size") || "50", 10);
    if (urlTexto !== texto) setTexto(urlTexto);
    if (urlPage !== page) setPage(urlPage);
    if (urlPageSize !== pageSize) setPageSize(urlPageSize);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  const syncURL = (t, p, ps) => {
    setSearchParams(
      { ...(t ? { texto: t } : {}), page: String(p), page_size: String(ps) },
      { replace: true },
    );
  };

  function handleTextoChange(value) {
    setTexto(value);
    setPage(1);
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      syncURL(value, 1, pageSize);
    }, 300);
  }

  function handlePageChange(newPage) {
    setPage(newPage);
    syncURL(texto, newPage, pageSize);
  }

  function handlePageSizeChange(newSize) {
    setPageSize(newSize);
    setPage(1);
    syncURL(texto, 1, newSize);
  }

  return (
    <PageCard title="Inventario actual">
      <div className="page-actions">
        <input
          className="form-control"
          placeholder="Buscar por nombre, código u OEM"
          value={texto}
          onChange={(e) => handleTextoChange(e.target.value)}
        />
        <button className="btn btn-primary" onClick={() => { setPage(1); syncURL(texto, 1, pageSize); }}>
          Buscar
        </button>
      </div>
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
              {puedeAjustar && <th style={{ width: "1px" }}>Acciones</th>}
            </tr>
          </thead>
          <tbody>
            {isFetching && !productos.length ? (
              <tr><td colSpan={puedeAjustar ? 10 : 9} className="text-center text-muted">Cargando...</td></tr>
            ) : productos.length === 0 ? (
              <tr><td colSpan={puedeAjustar ? 10 : 9} className="text-center text-muted">No hay registros</td></tr>
            ) : (
              productos.map((p) => (
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
                  {puedeAjustar && (
                    <td className="text-nowrap">
                      <button
                        className="btn btn-sm btn-outline mr-1"
                        title="Ajustar stock"
                        onClick={() => setAjusteProducto(p)}
                      >
                        Ajustar
                      </button>
                      <button
                        className="btn btn-sm btn-outline"
                        title="Ver historial"
                        onClick={() => setHistorialProducto(p)}
                      >
                        Historial
                      </button>
                    </td>
                  )}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-3 mt-4">
        <PageSizeSelector value={pageSize} onChange={handlePageSizeChange} options={[25, 50, 100]} />
        <Pagination
          page={page}
          totalPages={totalPages}
          onPageChange={handlePageChange}
          count={count}
          pageSize={pageSize}
        />
      </div>
      {ajusteProducto && (
        <AjusteStockModal
          producto={ajusteProducto}
          onClose={() => setAjusteProducto(null)}
        />
      )}
      {historialProducto && (
        <HistorialAjustesModal
          producto={historialProducto}
          onClose={() => setHistorialProducto(null)}
        />
      )}
    </PageCard>
  );
}
