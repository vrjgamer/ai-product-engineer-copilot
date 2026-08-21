"use client";

import { THEME_STORAGE_KEY } from "./themeScript";

type Theme = "light" | "dark";

function apply(next: Theme): void {
  document.documentElement.dataset.theme = next;
  try {
    localStorage.setItem(THEME_STORAGE_KEY, next);
  } catch {
    // Private browsing / storage disabled — the choice just won't persist across visits.
  }
}

/**
 * Sun/moon toggle for the theme `themeScript.ts` set before hydration.
 * Deliberately stateless: which button reads as "current" is driven by CSS
 * (`:root[data-theme] .theme-toggle-btn[data-theme-value]` in globals.css)
 * against the same `data-theme` attribute the script already set on
 * `<html>`, rather than mirrored into React state — that would need an
 * effect to read the real value after hydration (the server can't know it),
 * and a resulting server/client mismatch on first paint.
 */
export function ThemeToggle() {
  return (
    <div className="theme-toggle" role="group" aria-label="Theme">
      <button
        type="button"
        className="theme-toggle-btn"
        data-theme-value="light"
        aria-label="Light mode"
        onClick={() => apply("light")}
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <circle cx="12" cy="12" r="4.5" />
          <path
            strokeLinecap="round"
            d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"
          />
        </svg>
      </button>
      <button
        type="button"
        className="theme-toggle-btn"
        data-theme-value="dark"
        aria-label="Dark mode"
        onClick={() => apply("dark")}
      >
        <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor" stroke="none">
          <path d="M20 14.5A8.5 8.5 0 1 1 9.5 4a7 7 0 0 0 10.5 10.5Z" />
        </svg>
      </button>
    </div>
  );
}
