import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiRequest, buildQuery } from "./api";

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
  dashboard: ["dashboard", "stats"],
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

export function useProductoPorCodigo(codigo) {
  return useQuery({
    queryKey: ["productos", "por-codigo", codigo],
    queryFn: () => apiRequest(`/productos/por-codigo/?codigo=${encodeURIComponent(codigo)}`),
    enabled: !!codigo,
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
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.ubicaciones.all }),
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

// ── Utils ──

export { paginatedResult };
