# Changelog

All notable changes to BAZPOS are documented in this file. The format is based on [Keep a Changelog](https://keepachangelog.com/), and this project adheres to [Semantic Versioning](https://semver.org/).

Entries are shown to users in the app via the "Ver novedades" modal on each new release.

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
