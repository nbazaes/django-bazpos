import { API_BASE } from "./config";
import { clearTokens, getAccessToken, getRefreshToken, saveTokens } from "./auth";

function redirectToLogin() {
  clearTokens();
  window.location.href = "/registration/login.html";
}

async function rawRequest(path, { method = "GET", body, headers = {} } = {}) {
  const token = getAccessToken();
  const response = await fetch(`${API_BASE}${path}`, {
    method,
    headers: {
      ...(body instanceof FormData ? {} : { "Content-Type": "application/json" }),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...headers,
    },
    body: body ? (body instanceof FormData ? body : JSON.stringify(body)) : undefined,
  });
  return response;
}

async function refreshAccessToken() {
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
  saveTokens({ access: data.access, refresh });
  return true;
}

export async function apiRequest(path, options = {}) {
  let response = await rawRequest(path, options);
  if (response.status === 401 && getRefreshToken()) {
    const refreshed = await refreshAccessToken();
    if (refreshed) response = await rawRequest(path, options);
  }

  if (response.status === 401) {
    redirectToLogin();
    throw new Error("Sesion expirada");
  }

  if (!response.ok) {
    let message = `HTTP ${response.status}`;
    try {
      const data = await response.json();
      message = data.detail || data.error || JSON.stringify(data);
    } catch {
      // noop
    }
    throw new Error(message);
  }

  if (response.status === 204) return null;
  return response.json();
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
