const ACCESS_KEY = "bazpos_access";
const REFRESH_KEY = "bazpos_refresh";
const EXPIRES_KEY = "bazpos_expires";
const USER_KEY = "bazpos_user";
const TOKEN_LIFETIME_MS = 8 * 60 * 60 * 1000; // 8 hours

export function saveTokens(tokens) {
  const expiresAt = Date.now() + TOKEN_LIFETIME_MS;
  localStorage.setItem(ACCESS_KEY, tokens.access || "");
  localStorage.setItem(REFRESH_KEY, tokens.refresh || "");
  localStorage.setItem(EXPIRES_KEY, expiresAt.toString());
}

export function clearTokens() {
  localStorage.removeItem(ACCESS_KEY);
  localStorage.removeItem(REFRESH_KEY);
  localStorage.removeItem(EXPIRES_KEY);
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

export function isLoggedIn() {
  const expiresAt = localStorage.getItem(EXPIRES_KEY);
  if (!expiresAt) return false;
  if (Date.now() > parseInt(expiresAt)) {
    clearTokens();
    return false;
  }
  return Boolean(getAccessToken());
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
