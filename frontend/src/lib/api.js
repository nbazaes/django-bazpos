import { API_BASE } from "./config";
import { clearTokens, getAccessToken, getRefreshToken, saveTokens } from "./auth";

const DEFAULT_TIMEOUT_MS = 25000;
const DOWNLOAD_TIMEOUT_MS = 120000;

export class ApiError extends Error {
  constructor(message, { status = null, kind = "http", retryable = false } = {}) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.kind = kind;
    this.retryable = retryable;
  }
}

function redirectToLogin() {
  clearTokens();
  if (window.location.pathname !== "/login") {
    window.location.href = "/login";
  }
}

async function rawRequest(path, { method = "GET", body, headers = {}, timeout = DEFAULT_TIMEOUT_MS } = {}) {
  const token = getAccessToken();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeout);
  try {
    const response = await fetch(`${API_BASE}${path}`, {
      method,
      headers: {
        ...(body instanceof FormData ? {} : { "Content-Type": "application/json" }),
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...headers,
      },
      body: body ? (body instanceof FormData ? body : JSON.stringify(body)) : undefined,
      signal: controller.signal,
    });
    return response;
  } catch (err) {
    if (err.name === "AbortError") {
      throw new ApiError("La solicitud tardó demasiado. Revisa tu conexión.", { kind: "timeout", retryable: true });
    }
    throw new ApiError("Sin conexión con el servidor. Verifica tu internet.", { kind: "network", retryable: true });
  } finally {
    clearTimeout(timer);
  }
}

let refreshPromise = null;

async function doRefresh() {
  const refresh = getRefreshToken();
  if (!refresh) return false;
  const response = await fetch(`${API_BASE}/auth/token/refresh/`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ refresh }),
  });
  if (!response.ok) {
    return false;
  }
  const data = await response.json();
  saveTokens({ access: data.access, refresh: data.refresh });
  return true;
}

function refreshAccessToken() {
  if (!refreshPromise) {
    refreshPromise = doRefresh().finally(() => {
      refreshPromise = null;
    });
  }
  return refreshPromise;
}

export async function apiRequest(path, options = {}) {
  let response = await rawRequest(path, options);
  if (response.status === 401 && getRefreshToken()) {
    const refreshed = await refreshAccessToken();
    if (refreshed) response = await rawRequest(path, options);
  }

  if (response.status === 401) {
    redirectToLogin();
    throw new ApiError("Sesion expirada", { status: 401 });
  }

  if (!response.ok) {
    let message = `HTTP ${response.status}`;
    try {
      const data = await response.json();
      message = data.detail || data.error || JSON.stringify(data);
    } catch {
      // noop
    }
    const retryable = response.status >= 500 || response.status === 429;
    throw new ApiError(message, { status: response.status, retryable });
  }

  if (response.status === 204) return null;
  return response.json();
}

export function buildQuery(params = {}) {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null || value === "") continue;
    query.set(key, value);
  }
  const qs = query.toString();
  return qs ? `?${qs}` : "";
}

export async function downloadFile(path) {
  let response = await rawRequest(path, { timeout: DOWNLOAD_TIMEOUT_MS });
  if (response.status === 401 && getRefreshToken()) {
    const refreshed = await refreshAccessToken();
    if (refreshed) response = await rawRequest(path, { timeout: DOWNLOAD_TIMEOUT_MS });
  }
  if (!response.ok) {
    let message = `HTTP ${response.status}`;
    try {
      const data = await response.json();
      message = data.detail || data.error || JSON.stringify(data);
    } catch {
      // noop
    }
    const retryable = response.status >= 500 || response.status === 429;
    throw new ApiError(message, { status: response.status, retryable });
  }
  return response.blob();
}

export async function login(username, password) {
  const response = await fetch(`${API_BASE}/auth/token/`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username, password }),
  });
  if (!response.ok) throw new Error("Credenciales incorrectas");
  const tokens = await response.json();
  saveTokens(tokens);
  return tokens;
}

export async function me() {
  return apiRequest("/auth/me/");
}
