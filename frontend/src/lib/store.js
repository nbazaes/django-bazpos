import { apiRequest } from "./api";

let cachedConfig = { telefono: "", direccion: "", timezone: "America/Santiago" };

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
      };
    }
  } catch {
    // keep cached/default values
  }
  return cachedConfig;
}
