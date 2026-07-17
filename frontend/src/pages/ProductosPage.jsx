import { useEffect, useState } from "react";
import { useNavigate, Link, useSearchParams } from "react-router-dom";
import CrudTable from "../components/CrudTable";
import PageCard from "../components/PageCard";
import Pagination from "../components/Pagination";
import PageSizeSelector from "../components/PageSizeSelector";
import { usePageTitle } from "../components/Shell";
import { apiRequest, buildQuery } from "../lib/api";

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
  const [searchParams, setSearchParams] = useSearchParams();
  usePageTitle("Productos");

  const [rows, setRows] = useState([]);
  const [texto, setTexto] = useState(searchParams.get("texto") || "");
  const [count, setCount] = useState(0);
  const [page, setPage] = useState(parseInt(searchParams.get("page") || "1", 10));
  const [pageSize, setPageSize] = useState(parseInt(searchParams.get("page_size") || "50", 10));

  const totalPages = Math.max(1, Math.ceil(count / pageSize));

  async function load(targetPage = page, targetPageSize = pageSize, targetTexto = texto) {
    const safePage = Math.max(1, Math.min(targetPage, totalPages || 1));
    if (safePage !== page) setPage(safePage);
    const params = {
      texto: targetTexto,
      page: safePage,
      page_size: targetPageSize,
    };
    const data = await apiRequest(`/productos/${buildQuery(params)}`);
    setRows(data.results || []);
    setCount(data.count || 0);

    setSearchParams(
      {
        ...(targetTexto ? { texto: targetTexto } : {}),
        page: String(safePage),
        page_size: String(targetPageSize),
      },
      { replace: true }
    );
  }

  useEffect(() => {
    const urlTexto = searchParams.get("texto") || "";
    const urlPage = parseInt(searchParams.get("page") || "1", 10);
    const urlPageSize = parseInt(searchParams.get("page_size") || "50", 10);
    if (urlTexto !== texto) setTexto(urlTexto);
    if (urlPage !== page) setPage(urlPage);
    if (urlPageSize !== pageSize) setPageSize(urlPageSize);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  useEffect(() => {
    const timeoutId = setTimeout(() => {
      load();
    }, 300);
    return () => clearTimeout(timeoutId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [texto, page, pageSize]);

  async function onDelete(row) {
    if (!window.confirm(`Eliminar ${row.nombre}?`)) return;
    await apiRequest(`/productos/${row.producto_id}/`, { method: "DELETE" });
    await load();
  }

  function handleTextoChange(value) {
    setTexto(value);
    setPage(1);
  }

  function handlePageChange(newPage) {
    setPage(newPage);
  }

  function handlePageSizeChange(newSize) {
    setPageSize(newSize);
    setPage(1);
  }

  return (
    <PageCard title="Listado de productos">
      <div className="page-actions">
        <input
          className="form-control"
          placeholder="Buscar por nombre o código"
          value={texto}
          onChange={(e) => handleTextoChange(e.target.value)}
        />
        <button className="btn btn-primary" onClick={() => { setPage(1); load(1, pageSize, texto); }}>
          Buscar
        </button>
        <Link className="btn btn-success" to="/productos/crear">
          Nuevo producto
        </Link>
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
  );
}
