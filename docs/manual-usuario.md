# Manual de Usuario — Sistema de Punto de Venta Bazpos

**Versión del documento:** 1.0  
**Alcance:** Operación diaria del sistema por Vendedores, Bodegueros y Administradores.  
**Sistema:** Aplicación web accesible desde el navegador (Chrome, Edge o Firefox actualizados).

---

## 1. Acceso al Sistema

### 1.1 Iniciar sesión

1. Abra el navegador e ingrese la dirección del sistema (URL entregada por la administración).
2. En el formulario **Ingresar**, escriba su **Usuario** y **Contraseña**.
3. Haga clic en **Entrar**.

**Resultado esperado:** La pantalla de inicio (Dashboard) se abre con un mensaje de bienvenida con su nombre.

### 1.2 Cerrar sesión

1. En la barra superior, haga clic en **Salir**.
2. En la ventana de confirmación, haga clic en **Cerrar sesión**.

💡 **Nota / Protip:** Siempre cierre sesión al terminar su turno para evitar que otra persona opere con su usuario.

⚠️ **Advertencia:** Si la sesión expira mientras trabaja, el sistema lo redirigirá automáticamente al inicio de sesión. Vuelva a ingresar con sus credenciales; la venta en curso **no se pierde** si no la había confirmado (el carrito se conserva, ver nota en § 6).

### 1.3 Estructura de la interfaz

| Elemento | Descripción |
| :--- | :--- |
| **Menú lateral (sidebar)** | Accesos según su rol. El nombre de la tienda (logo) lo devuelve a la pantalla inicial. |
| **Barra superior (topbar)** | Botón de menú móvil ☰, título de la sección actual, botón de tema claro/oscuro (☀/☾) y botón **Salir**. |
| **Novedades** | Botón de megáfono al pie del menú. Se abre automáticamente una vez por versión nueva y lista los cambios del sistema. |
| **Versión** | Se muestra al pie del menú lateral (p. ej. `v1.5.0`). |

### 1.4 Roles y accesos

| Rol | Secciones del menú |
| :--- | :--- |
| **Vendedor** | Dashboard, VENTAS, Pedidos, Historial, Inventario (consulta) |
| **Bodeguero** | Dashboard, VENTAS, Pedidos, Historial, Inventario (ajustes), Ubicaciones |
| **Encargado / Gerente** | Todo lo anterior más: Productos, Proveedores, Pedidos Prov., Usuarios, Facturas, Reportes, Cierre de caja, Configuración |

---

## 2. [ROL: VENDEDOR] — Atención de Ventas

### 2.1 Realizar una venta (SOP-VEN-01)

**Objetivo:** Registrar y cobrar la venta de uno o más productos.

**Requisitos previos:**
- Sesión iniciada con rol Vendedor (o superior).
- Productos con stock disponible.

**Paso a paso:**

1. En el menú lateral, haga clic en **VENTAS**.
2. **Buscar el producto** de una de las siguientes formas:
   - **Código de barras:** pase el lector sobre el código. El campo **[Lector código de barra]** se llena solo y el producto se agrega al carrito automáticamente. El borde del campo se pone verde si el producto existe.
   - **Por OEM / texto:** escriba en el campo **[Ingrese código OEM]** el código, nombre o marca. El sistema busca automáticamente. Haga clic en **Buscar** si lo desea.
   - En los resultados, revise la fila del producto y haga clic en **Agregar**.
3. **Ajustar cantidades:** en la tabla del carrito, use los botones **+ / −** de la columna Cantidad o escriba el número directamente.
4. **Ajustar descuento (opcional):** junto al total, use el control de **Descuento %**. El descuento es redondeado a los $1.000 más cercanos.
5. Haga clic en **Confirmar venta**.
6. En la ventana de confirmación:
   - **[Documento]:** seleccione **Boleta**, **Factura** u **Otros**.
   - **[Medio de pago]:** seleccione **Efectivo**, **Tarjeta**, **Transferencia** o **Cheque**. Si el cliente paga con varios medios, marque **[Mixto]** y complete los montos de cada medio; la suma debe coincidir con el total (el sistema lo valida).
7. Revise el detalle y haga clic en **Confirmar y guardar**.
8. En la ventana de comprobante, haga clic en **Imprimir** para emitir el documento, o en **Cerrar**.
9. Si el sistema muestra la ventana **Seleccionar ubicación de descuento**, elija la ubicación de donde se descuenta el stock de cada producto y haga clic en **Guardar**.

**Resultado esperado:** La venta queda registrada con su número de comprobante, se imprime el documento y el stock se descuenta de la ubicación seleccionada.

**Resolución de problemas frecuentes:**

| Síntoma | Causa probable | Solución |
| :--- | :--- | :--- |
| "Producto no encontrado" | El código no existe en el catálogo | Verifique el código; busque por nombre u OEM. Si el producto no existe, comuníquelo a Gerencia (§ 4.1). |
| "No hay stock disponible" | El producto tiene stock 0 | Marque **[Buscar productos sin stock]** para confirmar; solicite reposición a Bodega. |
| "No puedes agregar más de X unidades" | El carrito supera el stock | Reduzca la cantidad al máximo disponible. |
| El borde del campo de barras se pone rojo | El código de barras no corresponde a un producto | Vuelva a escanear o escriba el código manualmente. |

💡 **Nota / Protip:** Si busca un producto que comparte OEM con otro que sí tiene stock, en el Dashboard verá un ícono de advertencia ⚠ en la tabla de stock bajo mínimo. Puede vender el producto equivalente con stock.

### 2.2 Generar una cotización (SOP-VEN-02)

**Objetivo:** Entregar al cliente una cotización impresa sin descontar stock.

**Requisitos previos:** Al menos un producto en el carrito.

**Paso a paso:**

1. Agregue los productos al carrito (pasos 2 y 3 de § 2.1).
2. Haga clic en **Generar cotización**.
3. Opcional: escriba el **[Nombre del cliente]** y marque **[Ocultar totales en la cotización]** si no desea mostrar montos.
4. Haga clic en **Generar cotización**.
5. En la ventana de la cotización, haga clic en **Imprimir**.

**Resultado esperado:** Se imprime un documento rotulado **COTIZACIÓN** (válida hasta agotar stock) y **no** se descuenta stock.

### 2.3 Convertir una cotización en venta (SOP-VEN-03)

**Objetivo:** Transformar una cotización vigente en una venta confirmada.

**Paso a paso:**

1. En el menú, vaya a **Historial**.
2. En el filtro **[Tipo]**, seleccione **Cotizaciones**.
3. Busque la cotización deseada (estado **Pendiente**) y haga clic en **Convertir a venta**.
4. La pantalla de venta se abre con los productos de la cotización ya cargados en el carrito.
5. Complete la venta según § 2.1 a partir del paso 5.

**Resultado esperado:** La venta se registra vinculada a la cotización; el stock se descuenta al confirmar.

### 2.4 Registrar un pedido a cliente (SOP-VEN-04)

**Objetivo:** Registrar un pedido por encargo con abono y generar el documento impreso.

**Requisitos previos:** Proveedores configurados (los crea Gerencia).

**Paso a paso:**

1. En el menú, haga clic en **Pedidos**.
2. Complete **[Nombre cliente]** y **[Número teléfono cliente]**.
3. En la tarjeta **Producto**, busque un producto existente escribiendo en **[Buscar producto existente (opcional)]**, o complete manualmente los campos **[Código proveedor]**, **[Proveedor]**, **[OEM]**, **[Nombre]**, **[Precio costo]** y **[Porcentaje utilidad]**.
   - Marque **[Sumar envío (+$4.500)]** si el envío se cobra al cliente.
   - Marque **[Pedido Stellantis]** si corresponde a este proveedor especial (costo base 80%).
4. Revise el subtotal y total del producto y haga clic en **Agregar**.
5. Repita para cada producto del pedido.
6. Seleccione **[Método de pago]** (**Efectivo** o **Tarjeta**) y **[Documento]** (**Sin boletear**, **Boleteado** o **Facturado**).
7. Haga clic en **Generar pedido** (o **Generar cotización** si solo es una cotización sin abono).
8. Se imprime el documento del pedido con el detalle de productos y total.

**Resultado esperado:** El pedido queda registrado en el historial con estado y documento, y se imprime el comprobante.

🛑 **Peligro / Acción Crítica:** El texto del documento impreso indica que *el abono constituye garantía por repuestos solicitados y que al desistir el abono se usa para saldar costos y gestión*. Comuníquelo claramente al cliente antes de confirmar.

### 2.5 Consultar el historial de ventas (SOP-VEN-05)

**Objetivo:** Buscar una venta o devolución registrada y ver su detalle.

**Paso a paso:**

1. En el menú, haga clic en **Historial**.
2. Use las pestañas **Ventas**, **Devoluciones** o **Pedidos**.
3. Para filtrar: escriba en **[Buscar por código...]**, seleccione el **[Tipo]** (Ventas o Cotizaciones) y acote **[Desde]** / **[Hasta]** (fechas).
4. Haga clic en **Ver** en la fila deseada para abrir el detalle (productos, pagos, descuento y total).
5. Haga clic en **Imprimir** para reimprimir el comprobante.

**Resultado esperado:** Se muestra el detalle completo de la transacción y, si se desea, se reimprime el documento.

⚠️ **Advertencia:** Las anulaciones y devoluciones solo pueden ejecutarlas usuarios con rol Gerente o Encargado (ver § 4.6).

---

## 3. [ROL: BODEGUERO / INVENTARIO] — Gestión de Stock

### 3.1 Consultar el inventario (SOP-BOD-01)

**Objetivo:** Revisar el stock actual de todos los productos.

**Paso a paso:**

1. En el menú, vaya a la sección **Bodeguero** ➔ **Inventario** (o **Inventario** en la sección general).
2. Escriba en el campo de búsqueda **[Buscar por nombre, código u OEM]** y haga clic en **Buscar** (la búsqueda también ocurre al escribir).
3. Use el selector de tamaño de página (25, 50 o 100) y la paginación para recorrer los resultados.

**Resultado esperado:** Tabla con Código, OEM, Cód. Proveedor, Nombre, Marca, Descripción, Stock actual, Ubicación (con cantidad por ubicación), Stock mínimo y Stock máximo.

💡 **Nota / Protip:** Pase el cursor sobre el stock de un producto para ver el desglose por ubicación cuando tiene más de una.

### 3.2 Ajustar stock (SOP-BOD-02)

**Objetivo:** Corregir la cantidad de unidades de un producto tras conteo físico, merma o error de registro.

**Requisitos previos:** Rol Bodeguero, Encargado o Gerente.

**Paso a paso:**

1. En **Inventario**, ubique el producto y haga clic en **Ajustar** (o en el número de stock en la pantalla **Productos**).
2. Verifique la **[Fecha]** y el **[Código]** del producto.
3. En **[Motivo del ajuste]**, describa la razón (p. ej. "Conteo de inventario", "Merma", "Error de registro"). **El motivo es obligatorio.**
4. En la tabla de ubicaciones, cambie el **[Nuevo stock]** de cada ubicación con los botones **+ / −**.
   - Para sumar una ubicación nueva, use el selector **[Agregar ubicación...]** y haga clic en **Agregar**.
   - Si una ubicación tiene stock 0 puede quitarla con **×**.
5. Haga clic en **Guardar ajuste**.

**Resultado esperado:** El stock se actualiza, queda registrado el motivo y la fecha, y el cambio queda disponible en el historial del producto.

⚠️ **Advertencia:** Un ajuste reduce o aumenta el stock de inmediato. Si corrige por error, haga un nuevo ajuste con el motivo correspondiente; **no** deje de registrar el motivo.

### 3.3 Revisar el historial de ajustes (SOP-BOD-03)

**Objetivo:** Ver quién y cuándo modificó el stock de un producto.

**Paso a paso:**

1. En **Inventario**, haga clic en **Historial** en la fila del producto.
2. Revise las entradas registradas (fecha, motivo, ubicación, cantidades).

**Resultado esperado:** Se muestra el listado cronológico de ajustes del producto.

### 3.4 Administrar ubicaciones (SOP-BOD-04)

**Objetivo:** Crear, editar o eliminar las ubicaciones físicas de la bodega.

**Paso a paso:**

1. En el menú, vaya a la sección **Bodeguero** ➔ **Ubicaciones**.
2. Para crear: haga clic en **Nueva ubicación**, complete **[Nombre]**, **[Marca]** y **[Descripción]**, y haga clic en **Crear**.
3. Para editar: haga clic en el lápiz de la fila, modifique los campos y haga clic en **Guardar**.
4. Para eliminar: haga clic en el bote de basura y confirme en la ventana de confirmación.

**Resultado esperado:** La lista de ubicaciones se actualiza con el cambio.

🛑 **Peligro / Acción Crítica:** Eliminar una ubicación puede afectar los productos que tienen stock asignado en ella. Revise que esté vacía antes de eliminarla.

---

## 4. [ROL: ADMINISTRADOR / GERENCIA] — Gestión de la Tienda

### 4.1 Crear y editar productos (SOP-GER-01)

**Objetivo:** Dar de alta productos nuevos o actualizar sus datos de compra y venta.

**Requisitos previos:** El proveedor del producto debe existir (§ 4.2).

**Paso a paso:**

1. En el menú, vaya a la sección **Gerente** ➔ **Productos**.
2. Haga clic en **Nuevo producto** (o en el lápiz de una fila para editar).
3. Complete los campos:
   - **[Código Producto]**, **[Código OEM]**, **[OEM alternativos]**, **[Código proveedor]**, **[Nombre]**, **[Marca]**, **[Descripción]**.
   - **[Precio costo]**, **[Stock mínimo]**, **[Stock máximo]**, **[Margen utilidad (%)]** y **[Proveedor]**.
4. Observe el **Precio de venta** calculado en la parte inferior (costo + margen + IVA).
5. Haga clic en **Guardar**.

**Resultado esperado:** El producto aparece en el catálogo y puede venderse. En edición, el campo **[Stock actual]** muestra el stock por ubicación (no editable aquí; use § 3.2).

💡 **Nota / Protip:** En el listado, haga clic en **Ver** para abrir el detalle con pestañas **Información** y **Histórico precios**. Desde el histórico puede rastrear cuándo cambió cada precio y desde qué factura.

### 4.2 Crear y editar proveedores (SOP-GER-02)

**Paso a paso:**

1. En el menú, vaya a **Proveedores**.
2. Haga clic en **Nuevo proveedor**.
3. Complete **[RUT]**, **[Nombre]**, **[Contacto]**, **[Teléfono]**, **[Correo]** y **[Dirección]**.
4. Haga clic en **Guardar**.

**Resultado esperado:** El proveedor queda disponible al crear productos, facturas y pedidos.

### 4.3 Registrar una factura de compra (SOP-GER-03)

**Objetivo:** Registrar la llegada de mercadería de un proveedor; el sistema calcula precios de venta y aumenta el stock.

**Requisitos previos:** Proveedor y productos existentes (o creados durante el proceso).

**Paso a paso:**

1. En el menú, vaya a **Facturas**.
2. Haga clic en **Nueva factura**.
3. **Paso 1 — Encabezado:** escriba el **[Número factura]** y seleccione el **[Proveedor]**. Haga clic en **Continuar**.
   - Si la factura ya fue ingresada, el sistema avisa y lo lleva al registro existente para editarlo.
4. **Paso 2 — Productos:** verifique la **[Fecha]**.
   - Busque cada producto en el campo **[Buscar por código, OEM o nombre...]** y haga clic en **Agregar**. Si el producto no existe, haga clic en **Crear producto** (se abre el formulario dentro de la misma ventana).
   - Para cada línea, revise **[Precio costo]**, la **[Cantidad]**, el **[Margen utilidad (%)]** y el **[Precio venta]** calculado.
   - Asigne el stock a ubicaciones con el botón de la columna **[Ubicación]**: elija la ubicación y la cantidad y haga clic en **Aceptar**. La cantidad repartida debe ser **exactamente igual** a la cantidad recibida.
5. Verifique el **Total neto** y el **Total con IVA**.
6. Haga clic en **Guardar factura**.

**Resultado esperado:** El stock aumenta en las ubicaciones asignadas, los precios de venta se actualizan según el margen, y la factura queda en el listado.

⚠️ **Advertencia:** Si un producto queda con "Repartir stock incompleto", el botón **Guardar factura** se deshabilita hasta que la suma por ubicaciones iguale la cantidad recibida.

💡 **Nota / Protip:** La factura se guarda como **borrador automático** mientras la escribe. Si se le cae la conexión, al volver el sistema la recupera; use **Descartar borrador** si no la necesita.

💡 **Nota / Protip:** Para imprimir etiquetas de código de barras: abra el detalle de una factura (**Ver**) y haga clic en **Imprimir etiquetas**. Se genera una hoja de etiquetas, una por cada unidad recibida.

### 4.4 Pedidos a proveedores (SOP-GER-04)

**Objetivo:** Confeccionar y finalizar la lista diaria de productos que se pedirán a cada proveedor.

**Paso a paso:**

1. En el menú, vaya a **Pedidos Prov.**.
2. Se muestra la lista del día agrupada por proveedor. Los productos con **Stock crítico** (agregados desde el Dashboard) aparecen automáticamente.
3. Marque la casilla **[Pedido]** de cada producto que efectivamente pedirá.
   - Para agregar un producto manualmente: haga clic en **+ Agregar producto**. En la pestaña **Producto existente** busque por código de proveedor; en **Producto personalizado** ingrese proveedor, nombre y código. Haga clic en **Agregar**.
4. Haga clic en **Imprimir** para emitir el listado para los proveedores.
5. Cuando la lista esté completa, haga clic en **Terminar pedido** y confirme con **Finalizar pedido**.

**Resultado esperado:** El pedido del día queda **Finalizado** y no se puede modificar. Los productos **no marcados** como pedidos se transfieren automáticamente a la lista del día siguiente.

🛑 **Peligro / Acción Crítica:** Al finalizar, lo que no está marcado pasa al día siguiente. Verifique que cada casilla corresponda a lo realmente solicitado antes de terminar.

### 4.5 Crear y administrar usuarios (SOP-GER-05)

**Objetivo:** Crear cuentas de acceso y asignar roles.

**Paso a paso:**

1. En el menú, vaya a **Usuarios**.
2. Haga clic en **Nuevo usuario**.
3. Complete **[Usuario]**, **[Nombre]**, **[Apellido]**, **[Email]** y **[Contraseña]**.
4. En **[Grupo]**, seleccione el rol: **Vendedor**, **Bodeguero**, **Encargado** o **Gerente**.
5. Haga clic en **Guardar**.

**Resultado esperado:** El usuario puede iniciar sesión con sus credenciales y ve solo las secciones de su rol.

⚠️ **Advertencia:** Para editar un usuario, el campo **[Usuario]** no puede modificarse. La contraseña solo se cambia si escribe una nueva al editar.

🛑 **Peligro / Acción Crítica:** La eliminación de un usuario es definitiva. Prefiera dejar la cuenta inactiva si el colaborador solo se ausenta temporalmente.

### 4.6 Anular una venta (SOP-GER-06)

**Objetivo:** Cancelar una venta **confirmada** (estado CO) reponiendo el stock.

**Requisitos previos:** Rol Gerente o Encargado. La venta debe estar en estado **CO** (confirmada) y ser de tipo **Venta**.

**Paso a paso:**

1. En el menú, vaya a **Historial** ➔ pestaña **Ventas**.
2. Localice la venta y haga clic en **Anular**.
3. Para cada producto, seleccione en **[Ubicación reposición]** dónde se repone el stock.
4. En **[Motivo de anulación]**, describa el motivo. **Es obligatorio.**
5. Haga clic en **Confirmar anulación**.

**Resultado esperado:** La venta queda anulada, el stock se repone en las ubicaciones indicadas y el monto se descuenta de los totales del día.

🛑 **Peligro / Acción Crítica:** La anulación es **irreversible** y queda registrada con su motivo. Úsela solo cuando corresponda y verifique las ubicaciones antes de confirmar.

### 4.7 Devolver productos (SOP-GER-07)

**Objetivo:** Devolver el dinero de productos vendidos (total o parcial).

**Paso a paso:**

1. En **Historial** ➔ pestaña **Ventas**, haga clic en **Devolver** en la venta correspondiente.
2. Marque la casilla de cada producto a devolver.
3. Ajuste la **[Cant.]** y el **[Monto a devolver]** (no puede superar el monto disponible).
4. Marque **[Reponer]** si el producto vuelve a stock y elija la **[Ubicación]**.
5. Escriba el **[Motivo de devolución]** (obligatorio).
6. Haga clic en **Confirmar devolución**.

**Resultado esperado:** Se registra la devolución, se reintegra el monto, se repone el stock si corresponde y el producto queda marcado como **Devuelto** o **Dev. parcial** en el historial.

### 4.8 Cierre de caja (SOP-GER-08)

**Objetivo:** Registrar y archivar el resumen de ventas de un día para control de caja.

**Paso a paso:**

1. En el menú, vaya a **Cierre de caja** (o use el botón **Cierre de caja** del Dashboard).
2. Seleccione la **[Fecha]** a cerrar.
3. Revise las tarjetas: **Total vendido**, **Devoluciones**, **Anulaciones** y **Total del día**.
4. Verifique el detalle por **Medio de pago** (Efectivo, Tarjeta, Transferencia, Cheque) y por **Documento** (Boleta, Factura, Otros).
5. Haga clic en **Guardar cierre de caja**.

**Resultado esperado:** El cierre queda archivado con fecha, hora, usuario y totales. Si ya existe un cierre para esa fecha, el sistema muestra el aviso **✓ Cierre guardado el ... por ...** y el historial de cierres de la fecha.

🛑 **Peligro / Acción Crítica:** Si el arqueo físico no cuadra con el **Total del día**, no guarde el cierre aún; revise ventas, devoluciones y anulaciones del día antes de confirmar.

### 4.9 Reportes (SOP-GER-09)

**Objetivo:** Analizar el desempeño del mes.

**Paso a paso:**

1. En el menú, vaya a **Reportes**.
2. Seleccione **[Mes]** y **[Año]**.
3. Elija una pestaña:
   - **Ventas Diarias:** gráfico de líneas con la venta de cada día.
   - **Top Productos:** los 10 productos más vendidos del mes.
   - **Stock Crítico:** productos bajo el stock mínimo.
   - **Ventas por Vendedor:** total y cantidad por colaborador.

**Resultado esperado:** Se muestran los indicadores del período seleccionado; la tarjeta **Total ventas del mes** resume el mes al instante.

### 4.10 Configuración de la tienda (SOP-GER-10)

**Objetivo:** Mantener los datos de contacto, IVA y zona horaria de la tienda.

**Paso a paso:**

1. En el menú, vaya a **Configuración**.
2. Complete **[Teléfono]**, **[IVA (%)]**, **[Zona horaria]** (con autocompletado) y **[Dirección]**.
3. Haga clic en **Guardar**.

**Resultado esperado:** Los cambios se aplican de inmediato: el IVA afecta los cálculos de venta y factura, y el teléfono/dirección aparecen en los comprobantes impresos.

⚠️ **Advertencia:** Cambiar el **[IVA (%)]** modifica todos los cálculos futuros de precios. Coordine el cambio con el resto del equipo.

---

## 5. Pantalla de inicio (Dashboard)

**Objetivo:** Monitorear el día de un vistazo.

**Disponible para todos los roles**, la pantalla inicial muestra:

- **Total ventas hoy** (vendido, menos devoluciones y anulaciones), **Cantidad ventas** y **Total productos**.
- **Ventas por vendedor** (si es Gerente) o **Mis ventas de hoy** (Vendedor).
- **Productos bajo stock mínimo:** tabla con el stock crítico. Acciones por producto:
  - **Recordar mañana:** oculta la alerta solo por el resto del día.
  - **Ignorar permanentemente:** deja de alertar sobre este producto.
  - **Agregar a pedido:** incorpora el producto a la lista del día en **Pedidos Prov.**.
  - Ícono ⚠: muestra productos con el mismo OEM que sí tienen stock (alternativa de venta).

---

## 6. Resolución de problemas generales

| Síntoma | Causa probable | Solución |
| :--- | :--- | :--- |
| No puedo iniciar sesión | Credenciales incorrectas o usuario inactivo | Verifique mayúsculas/minúsculas; si persiste, solicite a Gerencia restablecer la contraseña (§ 4.5). |
| No veo una sección del menú | El rol no tiene permiso para ella | Solo Gerente/Encargado acceden a la sección; solicite el cambio de rol a Gerencia. |
| Me redirige a la pantalla de ingreso mientras trabajo | Sesión expirada | Vuelva a ingresar. En ventas, el carrito se conserva (nota al final de esta tabla). |
| El comprobante no imprime | Bloqueador de ventanas emergentes activo | Permita ventanas emergentes para el sitio del sistema. |
| El sistema está lento | Conexión o carga de datos | Espere unos segundos; si persiste, reinicie el navegador. |
| La venta quedó guardada sin imprimir | Error al imprimir el comprobante | Vaya a **Historial** ➔ **Ver** y use **Imprimir** para reimprimir (§ 2.5). |

💡 **Nota / Protip:** El carrito de venta se guarda automáticamente mientras trabaja. Si cierra el navegador sin confirmar, al volver a **VENTAS** los productos siguen en el carrito. Use **Limpiar venta** para descartarlos.