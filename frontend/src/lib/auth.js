const ACCESS_KEY = "bazpos_access";
const REFRESH_KEY = "bazpos_refresh";
const USER_KEY = "bazpos_user";

export function saveTokens(tokens) {
  localStorage.setItem(ACCESS_KEY, tokens.access || "");
  localStorage.setItem(REFRESH_KEY, tokens.refresh || "");
}

export function clearTokens() {
  localStorage.removeItem(ACCESS_KEY);
  localStorage.removeItem(REFRESH_KEY);
  localStorage.removeItem(USER_KEY);
}

export function getAccessToken() {
  return localStorage.getItem(ACCESS_KEY) || "";
}

export function getRefreshToken() {
  return localStorage.getItem(REFRESH_KEY) || "";
}

export function saveUser(user) {
  localStorage.setItem(USER_KEY, JSON.stringify(user));
}

export function getUser() {
  const userStr = localStorage.getItem(USER_KEY);
  if (!userStr) return null;
  try {
    return JSON.parse(userStr);
  } catch {
    return null;
  }
}

function decodeToken(token) {
  try {
    const payload = token.split(".")[1];
    const json = atob(payload.replace(/-/g, "+").replace(/_/g, "/"));
    return JSON.parse(decodeURIComponent(Array.from(json, (c) => `%${c.charCodeAt(0).toString(16).padStart(2, "0")}`).join("")));
  } catch {
    return null;
  }
}

export function isLoggedIn() {
  const access = getAccessToken();
  const refresh = getRefreshToken();
  if (!access && !refresh) return false;
  if (refresh) return true;
  const payload = decodeToken(access);
  return Boolean(payload && payload.exp && Date.now() < payload.exp * 1000);
}

export function isGerente(user) {
  if (!user) return false;
  if (user.is_superuser) return true;
  const grupos = user.groups || [];
  return grupos.some((g) => g === "Gerente" || g === "Encargado");
}

export function isBodeguero(user) {
  if (!user) return false;
  if (user.is_superuser) return true;
  const grupos = user.groups || [];
  return grupos.some((g) => g === "Bodeguero" || g === "Encargado" || g === "Gerente");
}
