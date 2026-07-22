/**
 * Appearance mode — light / dark / system.
 * Applied by toggling the `dark` class on <html>. Cached in localStorage.
 */
export type ThemeMode = "light" | "dark" | "system";

const STORAGE_KEY = "viora:appearance";

export function getStoredMode(): ThemeMode {
  if (typeof window === "undefined") return "light";
  const v = window.localStorage.getItem(STORAGE_KEY);
  return v === "dark" || v === "system" || v === "light" ? v : "light";
}

export function setStoredMode(mode: ThemeMode) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(STORAGE_KEY, mode);
  applyTheme(mode);
  window.dispatchEvent(new CustomEvent("viora:appearance", { detail: mode }));
}

export function resolvedTheme(mode: ThemeMode): "light" | "dark" {
  if (mode !== "system") return mode;
  if (typeof window === "undefined") return "light";
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

export function applyTheme(mode: ThemeMode) {
  if (typeof document === "undefined") return;
  const resolved = resolvedTheme(mode);
  const html = document.documentElement;
  if (resolved === "dark") html.classList.add("dark");
  else html.classList.remove("dark");
  html.style.colorScheme = resolved;
}

let mediaListenerAttached = false;
export function initTheme() {
  if (typeof window === "undefined") return;
  applyTheme(getStoredMode());
  if (mediaListenerAttached) return;
  mediaListenerAttached = true;
  const mql = window.matchMedia("(prefers-color-scheme: dark)");
  mql.addEventListener("change", () => {
    if (getStoredMode() === "system") applyTheme("system");
  });
}

/** Inline script — runs before React hydrates to avoid FOUC. */
export const THEME_BOOT_SCRIPT = `
try {
  var m = localStorage.getItem('${STORAGE_KEY}') || 'light';
  var isDark = m === 'dark' || (m === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches);
  var e = document.documentElement;
  if (isDark) e.classList.add('dark'); else e.classList.remove('dark');
  e.style.colorScheme = isDark ? 'dark' : 'light';
} catch (e) {}
`;
