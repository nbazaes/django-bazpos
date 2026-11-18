export const METODOS_PAGO_OPCIONES = [
  { value: "EF", label: "Efectivo" },
  { value: "TJ", label: "Tarjeta" },
  { value: "TR", label: "Transferencia" },
  { value: "CH", label: "Cheque" },
];

export const PAGOS_MIXTOS_VACIO = { EF: 0, TJ: 0, TR: 0, CH: 0 };

export function resolverPagosPedido({
  montoObjetivo = 0,
  metodoPago = "EF",
  esMixto = false,
  pagosMixtos = PAGOS_MIXTOS_VACIO,
  esAbono = false,
  montoAbonoSimple = 0,
}) {
  const objetivo = Math.max(0, Number(montoObjetivo) || 0);
  const sumaMixta = Object.values(pagosMixtos || {}).reduce(
    (acc, val) => acc + (Number(val) || 0),
    0,
  );

  if (esAbono) {
    const abono = esMixto ? sumaMixta : Number(montoAbonoSimple) || 0;
    const valido =
      objetivo > 0 &&
      abono >= 0 &&
      abono < objetivo &&
      (esMixto || abono === 0 || Boolean(metodoPago));
    const pagos = esMixto
      ? Object.entries(pagosMixtos || {})
          .map(([metodo_pago, monto]) => ({
            metodo_pago,
            monto: Number(monto) || 0,
          }))
          .filter((p) => p.monto > 0)
      : abono > 0
        ? [{ metodo_pago: metodoPago || "EF", monto: abono }]
        : [];
    const metodoPrincipal =
      pagos[0]?.metodo_pago || metodoPago || "EF";
    return {
      valido,
      pagos,
      metodoPrincipal,
      totalPagado: abono,
      saldoPendiente: Math.max(0, objetivo - abono),
      diferencia: objetivo - abono,
    };
  }

  if (esMixto) {
    const diferencia = objetivo - sumaMixta;
    const valido = objetivo > 0 && diferencia === 0;
    const pagos = Object.entries(pagosMixtos || {})
      .map(([metodo_pago, monto]) => ({
        metodo_pago,
        monto: Number(monto) || 0,
      }))
      .filter((p) => p.monto > 0);
    const metodoPrincipal =
      pagos[0]?.metodo_pago || metodoPago || "EF";
    return {
      valido,
      pagos,
      metodoPrincipal,
      totalPagado: sumaMixta,
      saldoPendiente: Math.max(0, diferencia),
      diferencia,
    };
  }

  const valido = objetivo > 0 && Boolean(metodoPago);
  const metodo = metodoPago || "EF";
  return {
    valido,
    pagos: objetivo > 0 ? [{ metodo_pago: metodo, monto: objetivo }] : [],
    metodoPrincipal: metodo,
    totalPagado: objetivo,
    saldoPendiente: 0,
    diferencia: 0,
  };
}
