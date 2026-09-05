const THEME_KEY = "bazpos-theme";
const SCHEME_KEY = "bazpos-color-scheme";

export const DEFAULT_SCHEME = "purple";

export const COLOR_SCHEMES = {
  purple: { label: "Púrpura", dark: "#8b5cf6", light: "#7c3aed" },
  azul: { label: "Azul", dark: "#6366f1", light: "#4f46e5" },
  verde: { label: "Verde", dark: "#14b8a6", light: "#0d9488" },
  monocromo: { label: "Blanco y negro", dark: "#f5f5f5", light: "#171717" },
  navy: { label: "Azul marino", dark: "#5b9cf6", light: "#1e40af" },
  catppuccin: { label: "Catppuccin", dark: "#cba6f7", light: "#8839ef" },
};

export function getStoredTheme() {
  return localStorage.getItem(THEME_KEY) || "dark";
}

export function setStoredTheme(theme) {
  localStorage.setItem(THEME_KEY, theme);
}

export function getStoredScheme() {
  return localStorage.getItem(SCHEME_KEY) || DEFAULT_SCHEME;
}

export function setStoredScheme(scheme) {
  localStorage.setItem(SCHEME_KEY, scheme || DEFAULT_SCHEME);
}

export function applyScheme(scheme) {
  document.documentElement.setAttribute("data-scheme", scheme || DEFAULT_SCHEME);
}

export function applyTheme(theme) {
  document.documentElement.setAttribute("data-theme", theme);
}

export function toggleTheme() {
  const current = document.documentElement.getAttribute("data-theme") || "dark";
  const next = current === "dark" ? "light" : "dark";
  setStoredTheme(next);
  applyTheme(next);
  return next;
}

export function initTheme() {
  applyTheme(getStoredTheme());
  applyScheme(getStoredScheme());
}