import { apiRequest } from "./api";

let cachedConfig = { telefono: "", direccion: "", timezone: "America/Santiago", ubicacion_por_defecto: null, ubicacion_por_defecto_nombre: null };

export function getStoreConfig() {
  return cachedConfig;
}

export function getConfiguredTimezone() {
  return cachedConfig.timezone || "America/Santiago";
}

export async function fetchStoreConfig() {
  try {
    const data = await apiRequest("/configuracion/");
    if (Array.isArray(data) && data.length > 0) {
      cachedConfig = {
        telefono: data[0].telefono || "",
        direccion: data[0].direccion || "",
        timezone: data[0].timezone || "America/Santiago",
        ubicacion_por_defecto: data[0].ubicacion_por_defecto ?? null,
        ubicacion_por_defecto_nombre: data[0].ubicacion_por_defecto_nombre ?? null,
      };
    }
  } catch {
    // keep cached/default values
  }
  return cachedConfig;
}
