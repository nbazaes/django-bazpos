import { useSyncExternalStore } from "react";
import { apiRequest } from "./api";
import { STORE_NAME as FALLBACK_STORE_NAME } from "./config";

const DEFAULT_CONFIG = {
  id: null,
  nombre: "",
  telefono: "",
  direccion: "",
  tax_percent: 19,
  timezone: "America/Santiago",
  currency_code: "CLP",
  locale: "es-CL",
  price_round_to: 100,
  total_round_to: 1000,
  total_round_threshold: 900,
  default_shipping_cost: 4500,
  default_margin_percent: 30,
  feature_flags: {},
  payment_methods: [],
  document_types: [],
  product_search_fields: [],
  effective_product_search_fields: ["codigo_producto", "nombre", "oem", "oem_alternativo", "codigo_proveedor", "marca"],
  effective_payment_methods: [
    { code: "EF", label: "Efectivo", active: true },
    { code: "TJ", label: "Tarjeta", active: true },
    { code: "TR", label: "Transferencia", active: true },
    { code: "CH", label: "Cheque", active: true },
  ],
  effective_document_types: [
    { code: "BO", label: "Boleta", active: true },
    { code: "FA", label: "Factura", active: true },
    { code: "OT", label: "Otros", active: true },
  ],
  ubicacion_por_defecto: null,
  ubicacion_por_defecto_nombre: null,
  is_setup_complete: false,
  config_loaded: false,
};

let cachedConfig = { ...DEFAULT_CONFIG };
const listeners = new Set();
let fetchPromise = null;

function setConfig(config) {
  cachedConfig = { ...DEFAULT_CONFIG, ...config };
  cachedConfig.config_loaded = true;
  cachedConfig.is_setup_complete = Boolean(cachedConfig.nombre);
  listeners.forEach((listener) => listener());
}

function subscribe(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function getStoreConfig() {
  return cachedConfig;
}

export async function fetchStoreConfig() {
  if (!fetchPromise) {
    fetchPromise = apiRequest("/configuracion/")
      .then((data) => {
        if (Array.isArray(data) && data.length > 0) setConfig(data[0]);
      })
      .catch(() => {
        // keep cached/default values
      })
      .finally(() => {
        fetchPromise = null;
      });
  }
  return fetchPromise;
}

export function initStoreConfig() {
  return fetchStoreConfig();
}

export function refreshStoreConfig() {
  return fetchStoreConfig();
}

export function getConfiguredTimezone() {
  return cachedConfig.timezone || "America/Santiago";
}

export function getLocale() {
  return cachedConfig.locale || "es-CL";
}

export function getCurrencyCode() {
  return cachedConfig.currency_code || "CLP";
}

export function formatMoney(amount, options = {}) {
  const locale = getLocale();
  const currency = getCurrencyCode();
  try {
    return new Intl.NumberFormat(locale, {
      style: "currency",
      currency,
      minimumFractionDigits: options.minimumFractionDigits ?? 0,
      maximumFractionDigits: options.maximumFractionDigits ?? 0,
    }).format(Number(amount) || 0);
  } catch {
    return `$${Number(amount || 0).toLocaleString("es-CL")}`;
  }
}

export function getStoreName() {
  return cachedConfig.nombre || FALLBACK_STORE_NAME;
}

export function useStoreName() {
  const config = useSyncExternalStore(subscribe, getStoreConfig, getStoreConfig);
  return config.nombre || FALLBACK_STORE_NAME;
}

export function useStoreConfigSync() {
  return useSyncExternalStore(subscribe, getStoreConfig, getStoreConfig);
}

export function getTaxPercent() {
  return Number(cachedConfig.tax_percent ?? 19);
}

export function applyTax(amount, taxPercent = getTaxPercent()) {
  return Math.round(Number(amount || 0) * (1 + Number(taxPercent || 0) / 100));
}

export function roundPrice(amount) {
  const n = Number(cachedConfig.price_round_to) || 1;
  const value = Number(amount) || 0;
  if (n <= 1) return Math.trunc(value);
  return Math.ceil(value / n) * n;
}

export function roundSaleTotal(amount) {
  const n = Number(cachedConfig.total_round_to) || 1;
  const threshold = cachedConfig.total_round_threshold == null ? n - 1 : Number(cachedConfig.total_round_threshold);
  const value = Math.trunc(Number(amount) || 0);
  if (n <= 1) return value;
  const remainder = value % n;
  if (remainder >= threshold) return (Math.floor(value / n) + 1) * n;
  return Math.floor(value / n) * n;
}

export function calcularPrecioVenta(precioCosto, margenUtilidad) {
  const costo = Number(precioCosto) || 0;
  const pct = Number(margenUtilidad) || 0;
  const base = costo * (1 + pct / 100);
  const baseIva = Math.trunc(base * (1 + getTaxPercent() / 100));
  return roundPrice(baseIva);
}