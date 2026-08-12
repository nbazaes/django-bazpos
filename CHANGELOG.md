# Changelog

All notable changes to BAZPOS are documented in this file. The format is based on [Keep a Changelog](https://keepachangelog.com/), and this project adheres to [Semantic Versioning](https://semver.org/).

Entries are shown to users in the app via the "Ver novedades" modal on each new release.

## [1.16.1] - 2026-08-10

### Fixed

- Pedidos: se restauraba incorrectamente la última fecha de llegada al buscar productos.

## [1.16.0] - 2026-08-10

### Added

- Dashboard: las devoluciones y ventas anuladas ya se descuentan del total de ventas.
- Facturas: botón "Crear producto" integrado cuando la búsqueda no arroja resultados.

### Changed

- Infraestructura: CI y deploy automatizados con GitHub Actions (tests + build + despliegue en VPS).

## [1.15.0] - 2026-08-01

### Added

- Historial de pedidos: filtros por estado, búsqueda por nombre/ID y rango de fechas.
- Facturas: búsqueda con autocompletado, columnas de código del proveedor y distribución por ubicación.
- Impresión de documento (venta/cotización) directamente desde el backend.

### Changed

- Las cotizaciones ya no se mezclan con los pedidos pendientes en el filtro de estado.
- Búsqueda de productos en creación de pedidos ahora se hace del lado del servidor (más rápida).

### Fixed

- Permisos de Ubicaciones habilitados para los roles Encargado y Gerente.
- Documentos HTML impresos ya no pasan por el renderizador DRF.

### Performance

- Índices de base de datos en productos, ventas y pedidos para acelerar consultas y el dashboard.

## [1.14.0] - 2026-07-31

### Added

- Al convertir una cotización a pedido, sus ítems se agregan automáticamente a la lista de pedido al proveedor.

### Fixed

- Búsqueda de productos en creación de pedidos: ahora coincide con el código del proveedor.
- Credenciales de demo movidas a variables de entorno.