import { useEffect, useRef, useState } from "react";
import { useNavigate, Link, useSearchParams } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import CrudTable from "../components/CrudTable";
import PageCard from "../components/PageCard";
import Pagination from "../components/Pagination";
import PageSizeSelector from "../components/PageSizeSelector";
import { usePageTitle } from "../lib/usePageTitle";
import AjusteStockModal from "../components/AjusteStockModal";
import { queryKeys, useDeleteProducto, useFactura, useHistorialPrecios, useProducto, useProductos, useUltimaFacturaProducto } from "../lib/queries";
import { apiRequest } from "../lib/api";
import { getUser, isBodeguero, isGerente } from "../lib/auth";

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
  const queryClient = useQueryClient();
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
  const esGerenteOEncargado = isGerente(user);
  const [ajusteProducto, setAjusteProducto] = useState(null);
  const [detalleProductoId, setDetalleProductoId] = useState(null);
  const [facturaDetalleId, setFacturaDetalleId] = useState(null);
  const [historialPage, setHistorialPage] = useState(1);
  const [historialPageSize, setHistorialPageSize] = useState(10);
  const [tabActiva, setTabActiva] = useState("info");

  const rows = data?.results ?? [];
  const count = data?.count ?? 0;
  const totalPages = Math.max(1, Math.ceil(count / pageSize));

  const { data: ultimaFactura } = useUltimaFacturaProducto(detalleProductoId);
  const { data: productoDetalle } = useProducto(detalleProductoId);
  const historialParams = { page: historialPage, page_size: historialPageSize };
  const { data: historialData } = useHistorialPrecios(detalleProductoId, historialParams);
  const { data: facturaDetalle } = useFactura(facturaDetalleId);

  const historialRows = historialData?.results ?? [];
  const historialCount = historialData?.count ?? 0;
  const historialTotalPages = Math.max(1, Math.ceil(historialCount / historialPageSize));

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

  function openDetalle(id) {
    setDetalleProductoId(id);
    setFacturaDetalleId(null);
    setHistorialPage(1);
    setTabActiva("info");
    queryClient.prefetchQuery({
      queryKey: queryKeys.productos.detail(id),
      queryFn: () => apiRequest(`/productos/${id}/`),
    });
    queryClient.prefetchQuery({
      queryKey: ["productos", "ultima-factura", id],
      queryFn: () => apiRequest(`/productos/${id}/ultima-factura/`),
    });
  }

  function abrirHistorial() {
    setTabActiva("historial");
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
          { key: "codigo_proveedor", label: "Cód. Proveedor" },
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
        onView={(row) => openDetalle(row.producto_id)}
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
    {detalleProductoId && (
      <>
        <div className="modal" role="dialog" aria-modal="true">
          <div className="modal-dialog modal-xl" style={{ maxWidth: 1000 }}>
            <div className="modal-content">
              <div className="modal-header">
                <h5 className="modal-title">
                  Detalle del producto
                  {productoDetalle && <>: {productoDetalle.nombre}</>}
                </h5>
                <button type="button" className="modal-close" onClick={() => { setDetalleProductoId(null); setFacturaDetalleId(null); setHistorialPage(1); setTabActiva("info"); }}>&times;</button>
              </div>
              <div className="modal-body">
                <div className="tabs mb-4">
                  <button
                    className={`btn btn-sm ${tabActiva === "info" ? "btn-primary" : "btn-outline"}`}
                    onClick={() => setTabActiva("info")}
                    style={{ marginRight: "0.5rem" }}
                  >
                    Información
                  </button>
                  {esGerenteOEncargado && (
                    <button
                      className={`btn btn-sm ${tabActiva === "historial" ? "btn-primary" : "btn-outline"}`}
                      onClick={abrirHistorial}
                    >
                      Histórico precios
                    </button>
                  )}
                </div>

                {tabActiva === "info" && productoDetalle && (
                  <div>
                    <div className="row mb-3">
                      <div className="col-md-6">
                        <table className="table table-sm table-borderless mb-0">
                          <tbody>
                            <tr><td className="text-muted" style={{ width: 140 }}>Código</td><td><strong>{productoDetalle.codigo_producto}</strong></td></tr>
                            <tr><td className="text-muted">OEM</td><td>{productoDetalle.oem || "—"}</td></tr>
                            <tr><td className="text-muted">OEM alternativos</td><td>{productoDetalle.oem_alternativo || "—"}</td></tr>
                            <tr><td className="text-muted">Cód. Proveedor</td><td>{productoDetalle.codigo_proveedor || "—"}</td></tr>
                            <tr><td className="text-muted">Nombre</td><td>{productoDetalle.nombre}</td></tr>
                            <tr><td className="text-muted">Marca</td><td>{productoDetalle.marca || "—"}</td></tr>
                            <tr><td className="text-muted">Descripción</td><td>{productoDetalle.descripcion || "—"}</td></tr>
                          </tbody>
                        </table>
                      </div>
                      <div className="col-md-6">
                        <table className="table table-sm table-borderless mb-0">
                          <tbody>
                            <tr><td className="text-muted" style={{ width: 140 }}>Precio costo</td><td><strong>${productoDetalle.precio_costo}</strong></td></tr>
                            <tr><td className="text-muted">Precio venta</td><td><strong>${productoDetalle.precio}</strong></td></tr>
                            <tr><td className="text-muted">Margen utilidad</td><td>{productoDetalle.margen_utilidad}%</td></tr>
                            <tr><td className="text-muted">Stock actual</td><td>{productoDetalle.stock_actual}</td></tr>
                            <tr><td className="text-muted">Stock mínimo</td><td>{productoDetalle.stock_minimo}</td></tr>
                            <tr><td className="text-muted">Stock máximo</td><td>{productoDetalle.stock_maximo}</td></tr>
                            <tr><td className="text-muted">Proveedor</td><td>{productoDetalle.proveedor_nombre}</td></tr>
                          </tbody>
                        </table>
                      </div>
                    </div>

                    <hr />

                    <div className="row">
                      <div className="col-md-6">
                        <strong>N° factura última llegada:</strong>{" "}
                        {ultimaFactura ? (
                          <button
                            className="btn btn-link btn-sm"
                            style={{ padding: 0, fontSize: "inherit" }}
                            onClick={() => setFacturaDetalleId(ultimaFactura.factura_id)}
                          >
                            #{ultimaFactura.numero_factura}
                          </button>
                        ) : (
                          "—"
                        )}
                      </div>
                      {ultimaFactura && (
                        <div className="col-md-6">
                          <strong>Fecha:</strong> {ultimaFactura.fecha} &nbsp;|&nbsp;
                          <strong>Proveedor:</strong> {ultimaFactura.proveedor_nombre}
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {tabActiva === "historial" && esGerenteOEncargado && (
                  <div>
                    <div className="table-responsive">
                      <table className="table table-sm table-bordered">
                        <thead>
                          <tr>
                            <th>Fecha</th>
                            <th>Precio costo</th>
                            <th>Precio venta</th>
                            <th>Factura</th>
                          </tr>
                        </thead>
                        <tbody>
                          {historialRows.length === 0 ? (
                            <tr>
                              <td colSpan={4} className="text-center text-muted">Sin registros</td>
                            </tr>
                          ) : (
                            historialRows.map((h) => (
                              <tr key={h.id}>
                                <td className="text-nowrap">{new Date(h.fecha).toLocaleString()}</td>
                                <td>${h.precio_costo_nuevo}</td>
                                <td>${h.precio_venta_nuevo != null ? h.precio_venta_nuevo : "—"}</td>
                                <td>
                                  {h.factura_numero ? (
                                    <button
                                      className="btn btn-link btn-sm"
                                      style={{ padding: 0, fontSize: "inherit" }}
                                      onClick={() => setFacturaDetalleId(h.factura)}
                                    >
                                      #{h.factura_numero}
                                    </button>
                                  ) : "—"}
                                </td>
                              </tr>
                            ))
                          )}
                        </tbody>
                      </table>
                    </div>
                    <div className="flex flex-wrap items-center justify-between gap-3 mt-3">
                      <PageSizeSelector
                        value={historialPageSize}
                        onChange={(newSize) => { setHistorialPageSize(newSize); setHistorialPage(1); }}
                        options={[10, 20, 50]}
                      />
                      <Pagination
                        page={historialPage}
                        totalPages={historialTotalPages}
                        onPageChange={setHistorialPage}
                        count={historialCount}
                        pageSize={historialPageSize}
                      />
                    </div>
                  </div>
                )}
              </div>
              <div className="modal-footer">
                <button type="button" className="btn btn-secondary" onClick={() => { setDetalleProductoId(null); setFacturaDetalleId(null); setHistorialPage(1); setTabActiva("info"); }}>Cerrar</button>
              </div>
            </div>
          </div>
        </div>

        {facturaDetalle && (
          <div className="modal" role="dialog" aria-modal="true">
            <div className="modal-dialog modal-xl" style={{ maxWidth: 1000 }}>
              <div className="modal-content">
                <div className="modal-header">
                  <h5 className="modal-title">Detalle factura #{facturaDetalle.numero_factura}</h5>
                  <button type="button" className="modal-close" onClick={() => setFacturaDetalleId(null)}>&times;</button>
                </div>
                <div className="modal-body">
                  <div className="row mb-4">
                    <div className="col-md-4"><strong>Proveedor:</strong> {facturaDetalle.proveedor_nombre}</div>
                    <div className="col-md-4"><strong>Fecha:</strong> {facturaDetalle.fecha}</div>
                    <div className="col-md-4 text-right">
                      <strong>Total neto:</strong> ${facturaDetalle.monto_total}
                    </div>
                  </div>
                  <div className="table-responsive">
                    <table className="table table-sm table-bordered">
                      <thead>
                        <tr><th>Código</th><th>Nombre</th><th>Marca</th><th>Cantidad</th><th>Costo neto</th></tr>
                      </thead>
                      <tbody>
                        {(facturaDetalle.detalles || []).map((d) => (
                          <tr key={d.id}>
                            <td>{d.codigo_producto}</td>
                            <td>{d.nombre}</td>
                            <td>{d.marca}</td>
                            <td>{d.cantidad}</td>
                            <td>${d.costo_compra}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
                <div className="modal-footer">
                  <button type="button" className="btn btn-secondary" onClick={() => setFacturaDetalleId(null)}>Cerrar</button>
                </div>
              </div>
            </div>
          </div>
        )}
      </>
    )}
    </>
  );
}
