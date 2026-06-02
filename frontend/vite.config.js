import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { resolve } from 'path'

export default defineConfig({
  plugins: [react()],
  build: {
    rollupOptions: {
      input: {
        index: resolve(__dirname, 'index.html'),
        admin: resolve(__dirname, 'admin.html'),
        not_found: resolve(__dirname, '404.html'),
        administrador_pruebas: resolve(__dirname, 'administrador_pruebas.html'),
        forgot_password: resolve(__dirname, 'forgot-password.html'),
        login: resolve(__dirname, 'registration/login.html'),
        ventas_venta: resolve(__dirname, 'ventas/venta.html'),
        ventas_pedidos: resolve(__dirname, 'ventas/pedidos.html'),
        ventas_inventario: resolve(__dirname, 'ventas/inventario.html'),
        ventas_productos_lista: resolve(__dirname, 'ventas/productos/producto.html'),
        ventas_productos_form: resolve(__dirname, 'ventas/productos/create.html'),
        gerencia_proveedores: resolve(__dirname, 'gerencia/proveedores.html'),
        gerencia_proveedores_lista: resolve(__dirname, 'gerencia/proveedores/lista_proveedores.html'),
        gerencia_proveedores_form: resolve(__dirname, 'gerencia/proveedores/create.html'),
        gerencia_usuarios_lista: resolve(__dirname, 'gerencia/usuarios/usuarios.html'),
        gerencia_usuarios_register: resolve(__dirname, 'gerencia/usuarios/register.html'),
        gerencia_usuarios_form: resolve(__dirname, 'gerencia/usuarios/create.html'),
        gerencia_usuarios_edit: resolve(__dirname, 'gerencia/usuarios/editar.html'),
        gerencia_facturas_lista: resolve(__dirname, 'gerencia/facturas/facturas.html'),
        gerencia_facturas_form: resolve(__dirname, 'gerencia/facturas/create.html'),
        gerencia_ubicaciones: resolve(__dirname, 'gerencia/ubicaciones/ubicaciones.html'),
      },
    },
  },
})
