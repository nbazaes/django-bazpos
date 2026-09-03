# Changelog

All notable changes to BAZPOS are documented in this file. The format is based on [Keep a Changelog](https://keepachangelog.com/), and this project adheres to [Semantic Versioning](https://semver.org/).

Entries are shown to users in the app via the "Ver novedades" modal on each new release.

## [2.0.0] - 2026-09-03

### Agregado

- Configuración completa de la tienda desde un solo lugar: moneda, zona horaria, impuesto, redondeo de precios y totales, costo de envío y margen por defecto, ubicación por defecto, medios de pago y documentos.
- Selector de tema con 6 esquemas de color (claro/oscuro), disponible para todos los usuarios en Configuración.
- Medios de pago y documentos editables y activables según el negocio; el cierre de caja se adapta automáticamente a ellos.
- Datos de demostración con perfiles: retail genérico (sin OEM) o autopartes.
- Los campos de autopartes (OEM, marca, código de proveedor) y módulos opcionales se activan según el perfil del negocio.

### Cambiado

- El nombre de la tienda y el idioma/región (locale) se configuran en la instalación (`.env`), no desde la interfaz.
- El impuesto y el redondeo se calculan siempre con la configuración de la tienda, en ventas, pedidos, facturas y precios de productos, para que los montos cuadren entre pantallas.
- El descuento de costo en pedidos (antes fijo para Stellantis) ahora es una regla configurable por línea de pedido.
- El RUT de proveedor se renombra a «ID tributario» y pasa a ser opcional según el perfil.

### Eliminado

- El código y los flujos atados a una sola tienda o un solo proveedor; el sistema ahora es un POS retail genérico y configurable.

## [1.27.0] - 2026-09-03

### Agregado

- Seis esquemas de color, con variantes clara y oscura, y selector de tema en Configuración que se aplica al instante.
- Configuración disponible para todos los roles; los datos de la tienda quedan restringidos a Gerente y Encargado.

### Cambiado

- La deducción de stock ahora permite combinar existencias de distintas ubicaciones y valida que no se descuente más de lo disponible.

### Corregido

- El stock se descuenta de forma segura al crear una venta y al reasignar ubicaciones.

### Eliminado

- Se eliminó la opción de cancelar la deducción de stock desde el modal de ubicaciones.

## [1.26.0] - 2026-09-02

### Agregado

- Catálogo público consultable con búsqueda, filtros por marca y OEM, disponibilidad por ubicación y desglose de stock.
- Ahora puedes editar los productos del catálogo directamente desde la tabla de ítems de una factura.

### Corregido

- El aviso de stock insuficiente aparece dentro de la ventana de selección de ubicación e indica el producto correspondiente.

### Rendimiento

- La aplicación carga más rápido gracias a mejoras en la carga y almacenamiento de sus recursos.

## [1.25.0] - 2026-08-28

### Agregado

- Paginación en la tabla de stock crítico y filtro «Solo con stock» en el reporte de productos.
- Se agregaron iconos y se pulieron las tarjetas y el estilo

### Corregido

- La tabla de stock crítico dejó de parpadear, recargarse y reordenarse innecesariamente.

## [1.24.0] - 2026-08-27

### Agregado

- Ahora puedes imprimir el resumen del cierre de caja, con encabezado de tienda y fecha.
- En el módulo de Cierre de caja, consulta el detalle de ventas por medio de pago, documento y devoluciones haciendo clic en sus tarjetas o filas.
- Los pedidos admiten efectivo, tarjeta, transferencia, cheque y el documento «Otros».

### Cambiado

- El cierre de caja luce más ordenado, con tarjetas del mismo tamaño en una sola fila y tablas más limpias.

### Corregido

- Puedes retirar pedidos aunque el stock quede negativo; además, se corrigen automáticamente productos mal vinculados y se pueden reconciliar pedidos al ingresar una factura.

## [1.23.0] - 2026-08-27

### Agregado

- Nuevo constructor de reportes personalizados de productos y ventas, con columnas y filtros seleccionables, paginación y exportación a CSV.
- El reporte de productos permite consultar el stock total y por ubicación a una fecha determinada.

### Corregido

- La búsqueda de productos en ventas y facturas vuelve a mostrar la última fecha de llegada.

### Rendimiento

- Mejorado el rendimiento y la estabilidad general.

## [1.22.1] - 2026-08-24

### Agregado

- Agrega un botón para ocultar o mostrar la barra lateral en escritorio.
- Recuerda la última ubicación de venta al hacer devoluciones o anulaciones.

### Corregido

- El historial de precios vuelve a cargar correctamente al abrir el detalle de un producto.

## [1.22.0] - 2026-08-23

### Rendimiento

- El historial de ventas carga más rápido al mostrar información de pedidos asociados.

## [1.21.0] - 2026-08-19

### Agregado

- Seguimiento de cotizaciones convertidas en ventas o pedidos.
- Devoluciones parciales múltiples en ventas y pedidos, incluyendo reintegro de dinero para pedidos.
- Guardado de borradores de factura y resaltado de filas con stock sin conciliar.

### Corregido

- Ahora hace check del código de producto antes de rellenar todo el formulario
- Ahora es obligatorio seleccionar documento y medio de pago antes de confirmar una venta; también se corrigió el control de cantidades al repetir aumentos o disminuciones.

## [1.20.1] - 2026-08-18

### Agregado

- El historial de ventas ahora muestra el tipo de documento y el desglose de medios de pago.

### Corregido

- Los modales del historial de pedidos aparecen centrados correctamente y el menú lateral dejó de parpadear al pasar el cursor.
- El control de cantidades ya no se queda atascado al repetir aumentos o disminuciones.

### Rendimiento

- Mejoró la velocidad de carga del detalle de ventas, especialmente en ventas asociadas a pedidos.

## [1.20.0] - 2026-08-17

### Agregado

- Chat interno entre usuarios activos para coordinarse directamente desde BAZPOS.
- Nuevo cierre de caja con medios de pago, documentos, pagos mixtos, desglose diario e historial.

### Corregido

- El stock en “Sin ubicación” ya no provoca errores al elegir ubicaciones para deducir stock y sigue descontándose automáticamente.

## [1.19.1] - 2026-08-14

### Cambiado

- El aviso de novedades se marca como visto al abrirlo.

### Corregido

- Reportes ahora se muestran correctamente aunque no haya datos disponibles.

## [1.19.0] - 2026-08-14

### Agregado

- Nuevo módulo de Reportes con gráficos de ventas, productos más vendidos, stock crítico y reportes por vendedor.

## [1.18.0] - 2026-08-13

### Agregado

- Store name configurable en runtime via STORE_NAME/.env
- Backups offsite con restic + Backblaze B2 para el VPS

## [1.17.5] - 2026-08-12

### Corregido

- Arreglos de estilo varios

## [1.17.4] - 2026-08-12

### Agregado

- Se agregó una ventana que muestra las novedades de la versión al actualizar la app.
