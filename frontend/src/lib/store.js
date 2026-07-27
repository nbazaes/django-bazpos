import { apiRequest } from "./api";

let cachedConfig = { telefono: "", direccion: "" };

export function getStoreConfig() {
  return cachedConfig;
}

export async function fetchStoreConfig() {
  try {
    const data = await apiRequest("/configuracion/");
    if (Array.isArray(data) && data.length > 0) {
      cachedConfig = {
        telefono: data[0].telefono || "",
        direccion: data[0].direccion || "",
      };
    }
  } catch {
    // keep cached/default values
  }
  return cachedConfig;
}
