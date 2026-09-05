import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiRequest, buildQuery, downloadFile } from "./api";

const keepPreviousData = (old, next) => next ?? old;

function placeholderData() {
  return keepPreviousData;
}

export const queryKeys = {
  productos: {
    all: ["productos"],
    list: (params) => ["productos", "list", params],
    detail: (id) => ["productos", "detail", id],
  },
  ventas: {
    all: ["ventas"],
    list: (params) => ["ventas", "list", params],
    detail: (id) => ["ventas", "detail", id],
  },
  devoluciones: {
    all: ["devoluciones"],
    list: (params) => ["devoluciones", "list", params],
    detail: (id) => ["devoluciones", "detail", id],
  },
  proveedores: {
    all: ["proveedores"],
    list: (params) => ["proveedores", "list", params],
    detail: (id) => ["proveedores", "detail", id],
  },
  usuarios: {
    all: ["usuarios"],
    list: (params) => ["usuarios", "list", params],
    detail: (id) => ["usuarios", "detail", id],
    grupos: ["usuarios", "grupos"],
  },
  facturas: {
    all: ["facturas"],
    list: (params) => ["facturas", "list", params],
    detail: (id) => ["facturas", "detail", id],
    buscarProducto: (codigo) => ["facturas", "buscar-producto", codigo],
    checkExists: (numero_factura, proveedor_id) => ["facturas", "check-exists", numero_factura, proveedor_id],
    impuesto: ["facturas", "impuesto"],
  },
  ubicaciones: {
    all: ["ubicaciones"],
    list: (params) => ["ubicaciones", "list", params],
    detail: (id) => ["ubicaciones", "detail", id],
  },
  pedidos: {
    all: ["pedidos"],
    list: (params) => ["pedidos", "list", params],
    detail: (id) => ["pedidos", "detail", id],
  },
  configuracion: {
    all: ["configuracion"],
  },
  dashboard: ["dashboard", "stats"],
  reportes: (params) => ["reportes", "stats", params],
  reportesCustom: {
    schema: ["reportes", "custom", "schema"],
    query: (params) => ["reportes", "custom", "query", params],
  },
  cierreCaja: {
    all: ["cierre-caja"],
    detail: (fecha) => ["cierre-caja", "detail", fecha],
    historial: ["cierre-caja", "historial"],
  },
};

function paginatedResult(data) {
  if (Array.isArray(data)) return { results: data, count: data.length };
  return { results: data?.results ?? [], count: data?.count ?? 0 };
}

// ── Productos ──

export function useProductos(params = {}) {
  return useQuery({
    queryKey: queryKeys.productos.list(params),
    queryFn: () => apiRequest(`/productos/${buildQuery(params)}`),
    placeholderData: placeholderData(),
    staleTime: 30_000,
  });
}

export function useProducto(id) {
  return useQuery({
    queryKey: queryKeys.productos.detail(id),
    queryFn: () => apiRequest(`/productos/${id}/`),
    enabled: !!id,
    staleTime: 5 * 60_000,
    placeholderData: placeholderData(),
  });
}

export function useCreateProducto() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data) => apiRequest("/productos/", { method: "POST", body: data }),
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.productos.all }),
  });
}

export function useUpdateProducto() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }) => apiRequest(`/productos/${id}/`, { method: "PUT", body: data }),
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.productos.all }),
  });
}

export function useDeleteProducto() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id) => apiRequest(`/productos/${id}/`, { method: "DELETE" }),
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.productos.all }),
  });
}

export function useProductoPorCodigo(codigo, options = {}) {
  return useQuery({
    queryKey: ["productos", "por-codigo", codigo],
    queryFn: () => apiRequest(`/productos/por-codigo/?codigo=${encodeURIComponent(codigo)}`),
    enabled: (options.enabled ?? true) && !!codigo,
  });
}

// ── Producto detalle ──

export function useUltimaFacturaProducto(productoId) {
  return useQuery({
    queryKey: ["productos", "ultima-factura", productoId],
    queryFn: () => apiRequest(`/productos/${productoId}/ultima-factura/`),
    enabled: !!productoId,
    staleTime: 5 * 60_000,
    placeholderData: placeholderData(),
  });
}

export function useHistorialPrecios(productoId, params = {}) {
  return useQuery({
    queryKey: ["productos", "historial-precios", productoId, params],
    queryFn: () => apiRequest(`/productos/${productoId}/historial-precios/${buildQuery(params)}`),
    enabled: !!productoId,
    staleTime: 5 * 60_000,
    placeholderData: placeholderData(),
  });
}

// ── Ventas ──

export function useVentas(params = {}) {
  return useQuery({
    queryKey: queryKeys.ventas.list(params),
    queryFn: () => apiRequest(`/ventas/${buildQuery(params)}`),
    placeholderData: placeholderData(),
    staleTime: 30_000,
  });
}

export function useVenta(id) {
  return useQuery({
    queryKey: queryKeys.ventas.detail(id),
    queryFn: () => apiRequest(`/ventas/${id}/`),
    enabled: !!id,
    staleTime: 5 * 60_000,
    placeholderData: placeholderData(),
  });
}

export function useCreateVenta() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data) => apiRequest("/ventas/", { method: "POST", body: data }),
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.ventas.all }),
  });
}

export function useValidarStock() {
  return useMutation({
    mutationFn: (productos) =>
      apiRequest("/ventas/validar-stock/", { method: "POST", body: { productos } }),
  });
}

export function useUbicacionesParaDeducir(ventaId) {
  return useQuery({
    queryKey: ["ventas", "ubicaciones-deducir", ventaId],
    queryFn: () => apiRequest(`/ventas/${ventaId}/ubicaciones-para-deducir/`),
    enabled: !!ventaId,
  });
}

export function useDeducirStock() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ ventaId, deducciones }) =>
      apiRequest(`/ventas/${ventaId}/deducir-stock/`, {
        method: "POST",
        body: { deducciones },
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.ventas.all }),
  });
}

export function useAnularVenta() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ ventaId, motivo, restauraciones }) =>
      apiRequest(`/ventas/${ventaId}/anular/`, {
        method: "POST",
        body: { motivo, restauraciones },
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.ventas.all }),
  });
}

export function useDevolverProductos() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ ventaId, motivo, productos }) =>
      apiRequest(`/ventas/${ventaId}/devolver/`, {
        method: "POST",
        body: { motivo, productos },
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.ventas.all });
      qc.invalidateQueries({ queryKey: queryKeys.devoluciones.all });
    },
  });
}

// ── Devoluciones ──

export function useDevoluciones(params = {}) {
  return useQuery({
    queryKey: queryKeys.devoluciones.list(params),
    queryFn: () => apiRequest(`/devoluciones/${buildQuery(params)}`),
    placeholderData: placeholderData(),
    staleTime: 30_000,
  });
}

export function useDevolucion(id) {
  return useQuery({
    queryKey: queryKeys.devoluciones.detail(id),
    queryFn: () => apiRequest(`/devoluciones/${id}/`),
    enabled: !!id,
    staleTime: 5 * 60_000,
    placeholderData: placeholderData(),
  });
}

// ── Pedidos ──

export function usePedidos(params = {}) {
  return useQuery({
    queryKey: queryKeys.pedidos.list(params),
    queryFn: () => apiRequest(`/pedidos/${buildQuery(params)}`),
    placeholderData: placeholderData(),
    staleTime: 30_000,
  });
}

export function usePedido(id) {
  return useQuery({
    queryKey: queryKeys.pedidos.detail(id),
    queryFn: () => apiRequest(`/pedidos/${id}/`),
    enabled: !!id,
  });
}

export function useCreatePedido() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data) => apiRequest("/pedidos/", { method: "POST", body: data }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.pedidos.all });
      qc.invalidateQueries({ queryKey: queryKeys.ventas.all });
    },
  });
}

export function useCambiarEstadoPedido() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ pedidoId, estado, estado_documento }) =>
      apiRequest(`/pedidos/${pedidoId}/cambiar-estado/`, {
        method: "POST",
        body: { estado, estado_documento },
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.pedidos.all });
      qc.invalidateQueries({ queryKey: queryKeys.productos.all });
    },
  });
}

export function useMarcarRetiro() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ pedidoId, persona_retiro, estado_documento }) =>
      apiRequest(`/pedidos/${pedidoId}/marcar-retiro/`, {
        method: "POST",
        body: { persona_retiro, estado_documento },
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.pedidos.all });
      qc.invalidateQueries({ queryKey: queryKeys.productos.all });
      qc.invalidateQueries({ queryKey: queryKeys.ventas.all });
    },
  });
}

export function useCancelarPedido() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ pedidoId, motivo }) =>
      apiRequest(`/pedidos/${pedidoId}/cancelar/`, {
        method: "POST",
        body: { motivo },
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.pedidos.all });
      qc.invalidateQueries({ queryKey: queryKeys.ventas.all });
    },
  });
}

export function useDevolverPedido() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ pedidoId, motivo, productos }) =>
      apiRequest(`/pedidos/${pedidoId}/devolver/`, {
        method: "POST",
        body: { motivo, productos },
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.pedidos.all });
      qc.invalidateQueries({ queryKey: queryKeys.ventas.all });
      qc.invalidateQueries({ queryKey: queryKeys.devoluciones.all });
    },
  });
}

export function useConvertirCotizacion() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ pedidoId, detalle_ids, nombre_cliente, telefono_cliente, metodo_pago, estado_documento }) =>
      apiRequest(`/pedidos/${pedidoId}/convertir-a-pedido/`, {
        method: "POST",
        body: { detalle_ids, nombre_cliente, telefono_cliente, metodo_pago, estado_documento },
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.pedidos.all });
      qc.invalidateQueries({ queryKey: queryKeys.ventas.all });
      qc.invalidateQueries({ queryKey: queryKeys.productos.all });
    },
  });
}

// ── Proveedores ──

export function useProveedores(params = {}) {
  return useQuery({
    queryKey: queryKeys.proveedores.list(params),
    queryFn: () => apiRequest(`/proveedores/${buildQuery(params)}`),
    placeholderData: placeholderData(),
    staleTime: 30_000,
  });
}

export function useProveedor(id) {
  return useQuery({
    queryKey: queryKeys.proveedores.detail(id),
    queryFn: () => apiRequest(`/proveedores/${id}/`),
    enabled: !!id,
  });
}

export function useCreateProveedor() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data) => apiRequest("/proveedores/", { method: "POST", body: data }),
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.proveedores.all }),
  });
}

export function useUpdateProveedor() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }) => apiRequest(`/proveedores/${id}/`, { method: "PUT", body: data }),
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.proveedores.all }),
  });
}

export function useDeleteProveedor() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id) => apiRequest(`/proveedores/${id}/`, { method: "DELETE" }),
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.proveedores.all }),
  });
}

// ── Usuarios ──

export function useUsuarios(params = {}) {
  return useQuery({
    queryKey: queryKeys.usuarios.list(params),
    queryFn: () => apiRequest(`/usuarios/${buildQuery(params)}`),
    placeholderData: placeholderData(),
    staleTime: 30_000,
  });
}

export function useUsuario(id) {
  return useQuery({
    queryKey: queryKeys.usuarios.detail(id),
    queryFn: () => apiRequest(`/usuarios/${id}/`),
    enabled: !!id,
  });
}

export function useCreateUsuario() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data) => apiRequest("/usuarios/", { method: "POST", body: data }),
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.usuarios.all }),
  });
}

export function useUpdateUsuario() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }) => apiRequest(`/usuarios/${id}/`, { method: "PUT", body: data }),
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.usuarios.all }),
  });
}

export function useDeleteUsuario() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id) => apiRequest(`/usuarios/${id}/`, { method: "DELETE" }),
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.usuarios.all }),
  });
}

export function useGrupos() {
  return useQuery({
    queryKey: queryKeys.usuarios.grupos,
    queryFn: () => apiRequest("/usuarios/grupos/"),
    staleTime: 5 * 60_000,
  });
}

// ── Facturas ──

export function useFacturas(params = {}) {
  return useQuery({
    queryKey: queryKeys.facturas.list(params),
    queryFn: () => apiRequest(`/facturas/${buildQuery(params)}`),
    placeholderData: placeholderData(),
    staleTime: 30_000,
  });
}

export function useFactura(id) {
  return useQuery({
    queryKey: queryKeys.facturas.detail(id),
    queryFn: () => apiRequest(`/facturas/${id}/`),
    enabled: !!id,
  });
}

export function useCreateFactura() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data) => apiRequest("/facturas/", { method: "POST", body: data }),
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.facturas.all }),
  });
}

export function useUpdateFactura() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }) => apiRequest(`/facturas/${id}/`, { method: "PUT", body: data }),
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.facturas.all }),
  });
}

export function useDeleteFactura() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id) => apiRequest(`/facturas/${id}/`, { method: "DELETE" }),
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.facturas.all }),
  });
}

export function useReconciliarFacturaPedidos() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, descontar }) =>
      apiRequest(`/facturas/${id}/reconciliar-pedidos/`, {
        method: "POST",
        body: { descontar },
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.facturas.all });
      qc.invalidateQueries({ queryKey: queryKeys.productos.all });
      qc.invalidateQueries({ queryKey: queryKeys.pedidos.all });
    },
  });
}

export function useBuscarProductoFactura(codigo) {
  return useQuery({
    queryKey: queryKeys.facturas.buscarProducto(codigo),
    queryFn: () => apiRequest(`/facturas/buscar-producto/?codigo_producto=${encodeURIComponent(codigo)}`),
    enabled: !!codigo,
  });
}

export function useImpuesto() {
  return useQuery({
    queryKey: queryKeys.facturas.impuesto,
    queryFn: () => apiRequest("/facturas/impuesto/"),
    staleTime: 5 * 60_000,
  });
}

export function useCheckFacturaExiste() {
  return useMutation({
    mutationFn: ({ numero_factura, proveedor_id }) =>
      apiRequest(`/facturas/check-exists/?numero_factura=${numero_factura}&proveedor_id=${proveedor_id}`),
  });
}

export function useCrearProductoRapido() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data) =>
      apiRequest("/facturas/crear-producto-rapido/", { method: "POST", body: data }),
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.productos.all }),
  });
}

// ── Ubicaciones ──

export function useUbicaciones(params = {}) {
  return useQuery({
    queryKey: queryKeys.ubicaciones.list(params),
    queryFn: () => apiRequest(`/ubicaciones/${buildQuery(params)}`),
    placeholderData: placeholderData(),
    staleTime: 30_000,
  });
}

export function useUbicacion(id) {
  return useQuery({
    queryKey: queryKeys.ubicaciones.detail(id),
    queryFn: () => apiRequest(`/ubicaciones/${id}/`),
    enabled: !!id,
  });
}

export function useCreateUbicacion() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data) => apiRequest("/ubicaciones/", { method: "POST", body: data }),
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.ubicaciones.all }),
  });
}

export function useUpdateUbicacion() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }) => apiRequest(`/ubicaciones/${id}/`, { method: "PUT", body: data }),
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.ubicaciones.all }),
  });
}

export function useDeleteUbicacion() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id) => apiRequest(`/ubicaciones/${id}/`, { method: "DELETE" }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.ubicaciones.all });
      qc.invalidateQueries({ queryKey: queryKeys.productos.all });
    },
  });
}

// ── Ajustes de stock ──

export function useAjustarStock() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ productoId, data }) =>
      apiRequest(`/productos/${productoId}/ajustar-stock/`, { method: "POST", body: data }),
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.productos.all }),
  });
}

export function useHistorialAjustes(productoId) {
  return useQuery({
    queryKey: ["historial-ajustes", productoId],
    queryFn: () => apiRequest(`/productos/${productoId}/historial-ajustes/`),
    enabled: !!productoId,
  });
}

// ── Dashboard ──

export function useDashboardStats() {
  return useQuery({
    queryKey: queryKeys.dashboard,
    queryFn: () => apiRequest("/dashboard/stats/"),
    staleTime: 30_000,
  });
}

// ── Reportes ──

export function useReportesStats(params = {}) {
  return useQuery({
    queryKey: queryKeys.reportes(params),
    queryFn: () => apiRequest(`/reportes/stats/${buildQuery(params)}`),
    placeholderData: placeholderData(),
    staleTime: 60_000,
  });
}

export function useReportesCustomSchema() {
  return useQuery({
    queryKey: queryKeys.reportesCustom.schema,
    queryFn: () => apiRequest("/reportes/custom/schema/"),
    staleTime: 5 * 60_000,
  });
}

export function useReporteCustom(params = {}) {
  return useQuery({
    queryKey: queryKeys.reportesCustom.query(params),
    queryFn: () => apiRequest(`/reportes/custom/query/${buildQuery(params)}`),
    enabled: !!params.dataset,
    placeholderData: placeholderData(),
    staleTime: 30_000,
  });
}

export async function downloadReporteCsv(params = {}) {
  const blob = await downloadFile(`/reportes/custom/export/${buildQuery(params)}`);
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `reporte-${params.dataset || "reporte"}-${new Date()
    .toISOString()
    .slice(0, 10)}.csv`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

// ── Cierre de caja ──

export function useCierreCaja(fecha) {
  return useQuery({
    queryKey: queryKeys.cierreCaja.detail(fecha),
    queryFn: () => apiRequest(`/cierre-caja/${buildQuery({ fecha })}`),
    enabled: !!fecha,
    staleTime: 30_000,
  });
}

export function useGuardarCierre() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (fecha) =>
      apiRequest("/cierre-caja/", { method: "POST", body: { fecha } }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.cierreCaja.all });
    },
  });
}

export function useCierreCajaHistorial() {
  return useQuery({
    queryKey: queryKeys.cierreCaja.historial,
    queryFn: () => apiRequest("/cierre-caja/historial/"),
    staleTime: 30_000,
  });
}

export function useCierreDetalle(fecha, tipo, clave, enabled) {
  return useQuery({
    queryKey: [...queryKeys.cierreCaja.all, "detalle", fecha, tipo, clave],
    queryFn: () =>
      apiRequest(`/cierre-caja/detalle/${buildQuery({ fecha, tipo, clave })}`),
    enabled,
    staleTime: 30_000,
  });
}

// ── Configuración ──

export function useStoreConfig() {
  return useQuery({
    queryKey: queryKeys.configuracion.all,
    queryFn: () => apiRequest("/configuracion/"),
    staleTime: 5 * 60_000,
  });
}

export function useUpdateStoreConfig() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload) =>
      apiRequest(`/configuracion/${payload.id}/`, { method: "PATCH", body: payload.data }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.configuracion.all });
      qc.invalidateQueries({ queryKey: queryKeys.facturas.impuesto });
    },
  });
}

// ── Pedidos a Proveedores ──

export const queryKeysPedidoProveedor = {
  all: ["pedidos-proveedor"],
  hoy: ["pedidos-proveedor", "hoy"],
  historial: (params) => ["pedidos-proveedor", "historial", params],
  detail: (id) => ["pedidos-proveedor", "detail", id],
};

export function usePedidoProveedorHoy() {
  return useQuery({
    queryKey: queryKeysPedidoProveedor.hoy,
    queryFn: () => apiRequest("/pedidos-proveedor/hoy/"),
    staleTime: 30_000,
  });
}

export function usePedidoProveedorHistorial(params = {}) {
  return useQuery({
    queryKey: queryKeysPedidoProveedor.historial(params),
    queryFn: () => apiRequest(`/pedidos-proveedor/${buildQuery(params)}`),
    placeholderData: placeholderData(),
    staleTime: 30_000,
  });
}

export function usePedidoProveedorDia(id) {
  return useQuery({
    queryKey: queryKeysPedidoProveedor.detail(id),
    queryFn: () => apiRequest(`/pedidos-proveedor/${id}/`),
    enabled: !!id,
  });
}

export function useAgregarItemPedidoProveedor() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload) =>
      apiRequest("/pedidos-proveedor/agregar-item/", {
        method: "POST",
        body: payload,
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeysPedidoProveedor.all });
    },
  });
}

export function useToggleItemPedidoProveedor() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ diaId, itemId }) =>
      apiRequest(`/pedidos-proveedor/${diaId}/toggle-item/${itemId}/`, {
        method: "POST",
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeysPedidoProveedor.all });
    },
  });
}

export function useEliminarItemPedidoProveedor() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ diaId, itemId }) =>
      apiRequest(`/pedidos-proveedor/${diaId}/eliminar-item/${itemId}/`, {
        method: "DELETE",
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeysPedidoProveedor.all });
    },
  });
}

export function useTransferirPedidoProveedor() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (diaId) =>
      apiRequest(`/pedidos-proveedor/${diaId}/transferir/`, {
        method: "POST",
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeysPedidoProveedor.all });
    },
  });
}

// ── Utils ──

export { paginatedResult };
