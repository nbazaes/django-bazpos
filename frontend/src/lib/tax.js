import { apiRequest } from "./api";

let cachedTaxPercent = 19;

export function getTaxPercent() {
  return cachedTaxPercent;
}

export async function fetchTaxPercent() {
  try {
    const data = await apiRequest("/facturas/impuesto/");
    if (typeof data?.tax_percent === "number") {
      cachedTaxPercent = data.tax_percent;
    }
  } catch {
    // keep cached/default value
  }
  return cachedTaxPercent;
}

export function applyTax(amount, taxPercent = getTaxPercent()) {
  return Math.round(Number(amount || 0) * (1 + Number(taxPercent || 0) / 100));
}
