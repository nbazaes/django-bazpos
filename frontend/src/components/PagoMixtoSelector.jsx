import { METODOS_PAGO_OPCIONES, resolverPagosPedido } from "../lib/pagos";

export default function PagoMixtoSelector({
  montoObjetivo = 0,
  labelObjetivo = "total",
  metodoPago = "EF",
  onChangeMetodoPago,
  esMixto = false,
  onChangeEsMixto,
  pagosMixtos = { EF: 0, TJ: 0, TR: 0, CH: 0 },
  onChangePagosMixtos,
  permiteAbono = false,
  esAbono = false,
  onChangeEsAbono,
  montoAbonoSimple = 0,
  onChangeMontoAbonoSimple,
}) {
  const estado = resolverPagosPedido({
    montoObjetivo,
    metodoPago,
    esMixto,
    pagosMixtos,
    esAbono: permiteAbono && esAbono,
    montoAbonoSimple,
  });

  return (
    <div className="w-100">
      <div className="flex flex-wrap items-end gap-4">
        <div className="form-group mb-0" style={{ minWidth: 180 }}>
          <label>Método de pago</label>
          <select
            className="form-control"
            value={metodoPago}
            onChange={(e) => onChangeMetodoPago?.(e.target.value)}
            disabled={esMixto}
          >
            {METODOS_PAGO_OPCIONES.map((op) => (
              <option key={op.value} value={op.value}>
                {op.label}
              </option>
            ))}
          </select>
        </div>

        {permiteAbono && esAbono && !esMixto && (
          <div className="form-group mb-0" style={{ minWidth: 180 }}>
            <label>Monto a abonar ($)</label>
            <input
              type="number"
              className="form-control"
              min={0}
              step={1000}
              value={montoAbonoSimple}
              onChange={(e) =>
                onChangeMontoAbonoSimple?.(
                  e.target.value === "" ? 0 : Math.max(0, Number(e.target.value)),
                )
              }
            />
          </div>
        )}

        <div className="flex flex-wrap items-center gap-4 mb-2">
          <label className="checkbox-custom" style={{ cursor: "pointer" }}>
            <input
              type="checkbox"
              checked={esMixto}
              onChange={(e) => onChangeEsMixto?.(e.target.checked)}
            />
            <span className="checkbox-custom__mark" />
            <span className="checkbox-custom__label">Mixto (varios medios)</span>
          </label>

          {permiteAbono && (
            <label className="checkbox-custom" style={{ cursor: "pointer" }}>
              <input
                type="checkbox"
                checked={esAbono}
                onChange={(e) => onChangeEsAbono?.(e.target.checked)}
              />
              <span className="checkbox-custom__mark" />
              <span className="checkbox-custom__label">Pago parcializado (abono)</span>
            </label>
          )}
        </div>
      </div>

      {esMixto && (
        <div className="row mt-3">
          {METODOS_PAGO_OPCIONES.map((op) => (
            <div className="col-md-3 mb-2" key={op.value}>
              <label className="font-weight-bold">{op.label}:</label>
              <input
                type="number"
                className="form-control"
                min={0}
                step={1000}
                value={pagosMixtos[op.value] ?? 0}
                onChange={(e) =>
                  onChangePagosMixtos?.((prev) => ({
                    ...prev,
                    [op.value]:
                      e.target.value === "" ? 0 : Math.max(0, Number(e.target.value)),
                  }))
                }
              />
            </div>
          ))}
        </div>
      )}

      {montoObjetivo > 0 && (esMixto || (permiteAbono && esAbono)) && (
        <div className="mt-2">
          {permiteAbono && esAbono ? (
            estado.totalPagado >= montoObjetivo ? (
              <div className="text-danger">
                El abono (${estado.totalPagado.toLocaleString()}) debe ser menor al {labelObjetivo} ($
                {montoObjetivo.toLocaleString()}). Desmarca &ldquo;Pago parcializado (abono)&rdquo; para pago total.
              </div>
            ) : (
              <div className="text-warning font-bold">
                Abono inicial: ${estado.totalPagado.toLocaleString()} — Saldo pendiente al retirar: $
                {estado.saldoPendiente.toLocaleString()}
              </div>
            )
          ) : estado.diferencia === 0 ? (
            <div className="text-success">
              Suma de pagos: ${estado.totalPagado.toLocaleString()} — coincide con el {labelObjetivo}.
            </div>
          ) : (
            <div className="text-danger">
              Suma de pagos: ${estado.totalPagado.toLocaleString()} —{" "}
              {estado.diferencia > 0 ? "faltan" : "sobran"} $
              {Math.abs(estado.diferencia).toLocaleString()}.
            </div>
          )}
        </div>
      )}
    </div>
  );
}
