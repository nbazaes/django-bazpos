// Función principal para manejar la venta completa
async function procesarVenta() {
    // Validar que hay productos en la lista
    const productosVenta = obtenerProductosVenta();
    if (productosVenta.length === 0) {
        Swal.fire('Error', 'No hay productos en la venta', 'error');
        return;
    }

    try {
        // Validar stock de todos los productos
        const stockValido = await validarStockProductos(productosVenta);

        if (!stockValido) {
            Swal.fire('Error', 'Uno o más productos no tienen stock suficiente', 'error');
            return;
        }
        const detallesVenta = obtenerDetallesVenta(productosVenta);
        const confirmacion = await Swal.fire({
            title: 'Detalles de la Venta',
            html: detallesVenta,
            icon: 'info',
            showCancelButton: true,
            confirmButtonText: 'Confirmar', cancelButtonText: 'Cancelar'
        });

        if (confirmacion.isConfirmed) {
            // Si el stock es válido, proceder con la venta
            const resultadoVenta = await registrarVenta(productosVenta);

            if (resultadoVenta) {
                generarBoletaPDF(productosVenta, resultadoVenta);
                limpiarListaVenta();
            }
        }


    } catch (error) {
        console.error('Error al procesar la venta:', error);
        Swal.fire('Error', 'No se pudo procesar la venta', 'error');
    }
}

// Obtener productos de la lista de venta
function obtenerProductosVenta() {
    const productos = [];
    $('#productoList tr').each(function () {
        const codigo = $(this).data('codigo');
        const cantidad = parseInt($(this).find('.cantidad').text());
        const precio = parseFloat($(this).find('.precio-total').text());

        productos.push({
            codigo,
            cantidad,
            precio
        });
    });
    return productos;
}

// Validar stock de los productos
async function validarStockProductos(productos) {
    return new Promise((resolve, reject) => {
        $.ajax({
            url: '/ventas/validar-stock/',
            method: 'POST',
            data: JSON.stringify({ productos }),
            contentType: 'application/json',
            success: function (response) {
                resolve(response.stock_valido);
            },
            error: function (error) {
                reject(error);
            }
        });
    });
}

// Registrar venta en base de datos
async function registrarVenta(productos) {
    const totalVenta = parseFloat($('#total').text().replace('$', ''));

    return new Promise((resolve, reject) => {
        $.ajax({
            url: '/ventas/registrar/',
            method: 'POST',
            data: JSON.stringify({
                productos: productos,
                total: totalVenta,
                fecha: new Date().toISOString()
            }),
            contentType: 'application/json',
            success: function (response) {
                resolve(response);
            },
            error: function (error) {
                reject(error);
            }
        });
    });
}

// Generar boleta en PDF
function generarBoletaPDF(productos, datosVenta) {
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF();

    // Estilo de la boleta
    doc.setFontSize(18);
    doc.text('BOLETA DE VENTA', 105, 20, { align: 'center' });
    doc.setFontSize(10);

    // Información de la venta
    doc.text(`Fecha: ${new Date().toLocaleDateString()}`, 15, 30);
    doc.text(`Número de Venta: ${datosVenta.id}`, 15, 36);

    // Encabezados de productos
    doc.line(15, 45, 195, 45);
    doc.text('Código', 20, 50);
    doc.text('Producto', 50, 50);
    doc.text('Cantidad', 100, 50);
    doc.text('Precio', 150, 50);
    doc.line(15, 53, 195, 53);

    // Detalles de productos
    let yPosition = 60;
    productos.forEach((producto, index) => {
        doc.text(producto.codigo, 20, yPosition);
        doc.text(`Producto ${index + 1}`, 50, yPosition);
        doc.text(producto.cantidad.toString(), 100, yPosition);
        doc.text(`$${producto.precio.toFixed(2)}`, 150, yPosition);
        yPosition += 7;
    });

    // Total
    const total = parseFloat($('#total').text().replace('$', ''));
    doc.line(15, yPosition + 5, 195, yPosition + 5);
    doc.text('TOTAL', 100, yPosition + 12);
    doc.text(`$${total.toFixed(2)}`, 150, yPosition + 12);

    doc.save(`boleta_venta_${datosVenta.id}.pdf`);
}

// Limpiar lista de venta
function limpiarListaVenta() {
    $('#productoList').empty();
    $('#total').text('$0');
    totalOriginal = 0;
}

// Obtener detalles de la venta para mostrar en la alerta 
function obtenerDetallesVenta(productos) { 
    let detalles = '<ul>'; 
    productos.forEach(producto => { 
        detalles += `<li>Código: ${producto.codigo}, Producto: Producto ${productos.indexOf(producto) + 1}, Cantidad: ${producto.cantidad}, Precio: $${producto.precio.toFixed(2)}</li>`; 
    }); 
    const total = parseFloat($('#total').text().replace('$', '')); 
    detalles += `</ul><p><strong>Total: $${total.toFixed(2)}</strong></p>`; 
    return detalles; } 

    // Agregar evento al botón de procesar venta 
    $('#btnProcesarVenta').on('click', procesarVenta);