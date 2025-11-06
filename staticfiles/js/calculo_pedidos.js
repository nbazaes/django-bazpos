function calcular() {
    // Obtener los valores de los campos de entrada
    let costo = parseFloat(document.getElementById("costo").value);
    let porcentaje = parseFloat(document.getElementById("porcentaje").value);

    // Calcular el precio con el porcentaje añadido
    let precioBase = costo + (costo * (porcentaje / 100));

    // Calcular el precio final con el 19% de impuestos
    let precioFinal = precioBase + (precioBase * 0.19);

    // Mostrar el resultado
    document.getElementById("resultado").innerText = "$" + precioFinal.toFixed(0);
}