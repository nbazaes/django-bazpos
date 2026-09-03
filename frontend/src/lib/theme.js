const THEME_KEY = "bazpos-theme";

export function getStoredTheme() {
  return localStorage.getItem(THEME_KEY) || "dark";
}

export function setStoredTheme(theme) {
  localStorage.setItem(THEME_KEY, theme);
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
  const theme = getStoredTheme();
  applyTheme(theme);
}
