let inventario = []; // Aquí deberías cargar tu inventario desde la API
let productoSeleccionado; // Variable para almacenar el producto seleccionado
let totalOriginal = 0; // Variable para almacenar el total original

// Simulación de llamada a la API para obtener inventario
$.ajax({
    url: '/ventas/api/data/',
    method: 'GET',
    success: function(data) {
        inventario = data;
    },
    error: function(error) {
        console.error('Error al cargar inventario:', error);
        Swal.fire('Error', 'No se pudo cargar el inventario', 'error');
    }
});

function buscarProducto() {
    const codigo = $('#codigoProducto').val().toUpperCase();
    const producto = inventario.find(item => item.codigo === codigo);

    if (producto) {
        Swal.fire({
            title: 'Producto encontrado',
            html: `<strong>Nombre:</strong> ${producto.nombre}<br>
                   <strong>Código:</strong> ${producto.codigo}<br>
                   <strong>Descripción:</strong> ${producto.descripcion}<br>
                   <strong>Precio:</strong> ${producto.precio}<br>
                   <strong>Stock Actual:</strong> ${producto.stock_actual}`,
            icon: 'info'
        });
    } else {
        Swal.fire('Producto no encontrado', 'El producto con el código ingresado no existe', 'error');
    }
}

function agregarProducto() {
    const codigo = $('#codigoProducto').val();
    const producto = inventario.find(item => item.codigo === codigo);
    if (!producto) {
        Swal.fire('Error', 'No se encontró el producto. Verifique el código ingresado.', 'error');
        return;
    }

    Swal.fire({
        title: 'Ingrese la cantidad',
        input: 'number',
        inputValue: 1,
        inputAttributes: {
            min: 1,
            step: 1
        },
        showCancelButton: true,
        confirmButtonText: 'Aceptar',
        cancelButtonText: 'Cancelar',
        inputValidator: (value) => {
            const cantidad = parseInt(value);
            if (!value || isNaN(cantidad) || cantidad <= 0) {
                return 'Ingrese una cantidad válida';
            }
        }
    }).then((result) => {
        if (result.isConfirmed) {
            let cantidad = parseInt(result.value);

            let filaExistente = $(`#productoList tr[data-codigo='${producto.codigo}']`);

            if (filaExistente.length > 0) {
                let cantidadActual = parseInt(filaExistente.find('.cantidad').text());
                let nuevaCantidad = cantidadActual + cantidad;
                filaExistente.find('.cantidad').text(nuevaCantidad);
                let nuevoPrecioTotal = nuevaCantidad * producto.precio;
                filaExistente.find('.precio-total').text(nuevoPrecioTotal.toFixed(2));
            } else {
                const fila = `
                    <tr data-codigo="${producto.codigo}">
                        <td class="cantidad">${cantidad}</td>
                        <td>${producto.codigo}</td>
                        <td>${producto.nombre}</td>
                        <td class="precio-total">${(producto.precio * cantidad).toFixed(2)}</td>
                        <td>
                            <a href="#" class="btn btn-primary btn-sm" onclick="mostrarCardPorcentaje('${producto.codigo}')">
                                <i class="fas fa-sm text-white-50"></i> Modificar
                            </a>
                            <a href="#" class="btn btn-danger btn-sm ml-3" onclick="eliminarProducto(this, ${producto.precio})">
                                <i class="fas fa-trash"></i>
                            </a>
                        </td>
                    </tr>
                `;

                $('#productoList').append(fila);
            }

            actualizarTotal(producto.precio * cantidad);
        }
    });
}
$('#btnAgregarProducto').on('click', agregarProducto);

function actualizarTotal(precio) {
    const totalElem = $('#total');
    const totalActual = parseFloat(totalElem.text().replace('$', '')) || 0;
    const nuevoTotal = totalActual + parseFloat(precio);

    totalElem.text(`$${nuevoTotal.toFixed(2)}`);
    totalOriginal = nuevoTotal; // Guardar el valor original del total
}

function eliminarProducto(elem, precio) {
    const fila = $(elem).closest('tr');
    const cantidad = parseInt(fila.find('.cantidad').text());
    const precioUnitario = precio / cantidad;
    actualizarTotal(-(precioUnitario * cantidad));
    fila.remove();
}

function mostrarCardPorcentaje(codigo) {
    productoSeleccionado = inventario.find(item => item.codigo === codigo);
    if (productoSeleccionado) {
        $('#cardPorcentaje').show();
        $('#porcentajeActual').text(`%${productoSeleccionado.margen_utilidad}`);
    }
}

function aplicarPorcentaje() {
    const porcentaje = parseFloat($('#porcentajeUtilidad').val());
    if (isNaN(porcentaje) || porcentaje <= 0) {
        Swal.fire('Error', 'Ingrese un porcentaje de utilidad válido.', 'error');
        return;
    }

    let filaExistente = $(`#productoList tr[data-codigo='${productoSeleccionado.codigo}']`);

    if (filaExistente.length > 0) {
        const costo = productoSeleccionado.precio_costo;
        const precioConUtilidad = costo + (costo * (porcentaje / 100));
        const precioFinal = precioConUtilidad + (precioConUtilidad * 0.19);
        
        filaExistente.find('.precio-total').text(precioFinal.toFixed(2));
        $('#cardPorcentaje').hide(); // Ocultar la tarjeta de porcentaje después de aplicar
        Swal.fire('Precio actualizado', 'El precio se ha actualizado con éxito.', 'success');
    }
}

function cancelarPorcentaje() {
    $('#cardPorcentaje').hide(); // Ocultar la tarjeta de porcentaje cuando se cancela
}

function modificarParaOferta() {
    Swal.fire({
        title: 'Modificar para oferta',
        input: 'number',
        inputLabel: 'Ingrese el porcentaje de descuento',
        inputPlaceholder: 'Porcentaje de descuento',
        showCancelButton: true,
        showDenyButton: true, // Agregar botón de reset
        confirmButtonText: 'Aplicar',
        denyButtonText: 'Resetear',
        cancelButtonText: 'Cancelar',
        inputValidator: (value) => {
            if (!value || value <= 0) {
                return 'Ingrese un porcentaje válido';
            }
        }
    }).then((result) => {
        if (result.isConfirmed) {
            const descuento = parseFloat(result.value);
            const totalElem = $('#total');
            const totalActual = parseFloat(totalElem.text().replace('$', '')) || 0;
            const totalConDescuento = totalActual - (totalActual * (descuento / 100));
            totalElem.text(`$${totalConDescuento.toFixed(2)}`);
            Swal.fire('Descuento aplicado', `Se ha aplicado un ${descuento}% de descuento al total.`, 'success');
        } else if (result.isDenied) {
            const totalElem = $('#total');
            totalElem.text(`$${totalOriginal.toFixed(2)}`);
            Swal.fire('Valor reseteado', 'El total ha sido restaurado al valor original.', 'success');
        }
    });
}

function borrarTodo() {
    $('#productoList').empty();
    totalOriginal = 0;
    $('#total').text('$0');
    Swal.fire('Borrado', 'Todos los productos han sido eliminados de la tabla.', 'success');
}

function generarCotizacion() {
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF();
    
    // Estilo de la cotización
    doc.setFontSize(18);
    doc.text('COTIZACIÓN', 105, 20, { align: 'center' });
    doc.setFontSize(10);

    // Información de la cotización
    doc.text(`Fecha: ${new Date().toLocaleDateString()}`, 15, 30);
    // Puedes ajustar los datos de cotización según lo que necesites
    const cotizacionId = Math.floor(Math.random() * 100000);  // Ejemplo de ID de cotización
    doc.text(`Número de Cotización: ${cotizacionId}`, 15, 36);

    // Encabezados de productos
    doc.line(15, 45, 195, 45);
    doc.text('Código', 20, 50);
    doc.text('Producto', 50, 50);
    doc.text('Cantidad', 100, 50);
    doc.text('Precio', 150, 50);
    doc.line(15, 53, 195, 53);

    // Detalles de productos
    let yPosition = 60;
    $('#productoList tr').each(function(index) {
        const codigo = $(this).find('td:nth-child(1)').text();
        const nombre = $(this).find('td:nth-child(2)').text();
        const cantidad = $(this).find('.cantidad').text();
        const precio = $(this).find('.precio-total').text();

        doc.text(codigo, 20, yPosition);
        doc.text(nombre, 50, yPosition);
        doc.text(cantidad, 100, yPosition);
        doc.text(precio, 150, yPosition);
        yPosition += 7;
    });

    // Total
    const totalElem = parseFloat($('#total').text().replace('$', ''));
    doc.line(15, yPosition + 5, 195, yPosition + 5);
    doc.text('TOTAL', 100, yPosition + 12);
    doc.text(`$${totalElem.toFixed(2)}`, 150, yPosition + 12);

    doc.save('cotizacion.pdf');
}

