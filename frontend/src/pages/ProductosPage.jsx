import { useEffect, useRef, useState } from "react";
import { useNavigate, Link, useSearchParams } from "react-router-dom";
import CrudTable from "../components/CrudTable";
import PageCard from "../components/PageCard";
import Pagination from "../components/Pagination";
import PageSizeSelector from "../components/PageSizeSelector";
import { usePageTitle } from "../components/Shell";
import AjusteStockModal from "../components/AjusteStockModal";
import { useDeleteProducto, useProductos } from "../lib/queries";
import { getUser, isBodeguero } from "../lib/auth";

function renderUbicacion(row) {
  const ubicaciones = row.ubicaciones_stock || [];
  if (ubicaciones.length === 0) return "—";

  const desktop = ubicaciones.map((u, i) => (
    <span key={u.ubicacion_id ?? `null-${i}`}>
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
          {ubicaciones.map((u, i) => (
            <div key={u.ubicacion_id ?? `null-${i}`} className="popover-row">
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
  const [searchParams, setSearchParams] = useSearchParams();
  usePageTitle("Productos");

  const [texto, setTexto] = useState(searchParams.get("texto") || "");
  const [page, setPage] = useState(parseInt(searchParams.get("page") || "1", 10));
  const [pageSize, setPageSize] = useState(parseInt(searchParams.get("page_size") || "50", 10));
  const debounceRef = useRef(null);

  const params = { texto, page, page_size: pageSize };
  const { data, isFetching } = useProductos(params);
  const deleteMutation = useDeleteProducto();

  const user = getUser();
  const puedeAjustar = isBodeguero(user);
  const [ajusteProducto, setAjusteProducto] = useState(null);

  const rows = data?.results ?? [];
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

  async function onDelete(row) {
    if (!window.confirm(`Eliminar ${row.nombre}?`)) return;
    deleteMutation.mutate(row.producto_id);
  }

  return (
    <>
      <PageCard title="Listado de productos">
      <div className="page-actions">
        <input
          className="form-control"
          placeholder="Buscar por nombre o código"
          value={texto}
          onChange={(e) => handleTextoChange(e.target.value)}
        />
        <button className="btn btn-primary" onClick={() => { setPage(1); syncURL(texto, 1, pageSize); }}>
          Buscar
        </button>
        <Link className="btn btn-success" to="/productos/crear">
          Nuevo producto
        </Link>
      </div>
      <CrudTable
        rows={isFetching && !rows.length ? [] : rows}
        columns={[
          { key: "codigo_producto", label: "Código", width: "1px" },
          { key: "oem", label: "OEM" },
          { key: "nombre", label: "Nombre" },
          { key: "marca", label: "Marca" },
          { key: "descripcion", label: "Descripción" },
          { key: "precio", label: "Precio", width: "1px" },
          { key: "stock_actual", label: "Stock", width: "1px", render: (row) => (
            puedeAjustar ? (
              <button
                className="btn btn-link btn-sm"
                style={{ padding: 0, fontSize: "inherit", fontWeight: 600 }}
                onClick={() => setAjusteProducto(row)}
                title="Ajustar stock"
              >
                {row.stock_actual}
              </button>
            ) : row.stock_actual
          ) },
          { key: "ubicaciones_stock", label: "Ubicación", render: renderUbicacion },
        ]}
        onEdit={(row) => {
          navigate(`/productos/${row.producto_id}/editar`);
        }}
        onDelete={onDelete}
      />
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
    </PageCard>
    {ajusteProducto && (
      <AjusteStockModal
        producto={ajusteProducto}
        onClose={() => setAjusteProducto(null)}
      />
    )}
    </>
  );
}
