export const THEME_STORAGE_KEY = "theme";

/**
 * Runs before hydration (inlined into `<head>` by layout.tsx) so the
 * correct theme paints on the first frame instead of flashing light-then-dark
 * once React mounts. Resolves the visitor's stored choice, falling back to
 * their OS preference the first time they visit.
 */
export const themeInitScript = `(function(){try{var s=localStorage.getItem(${JSON.stringify(
  THEME_STORAGE_KEY,
)});var t=s==="light"||s==="dark"?s:(window.matchMedia("(prefers-color-scheme: dark)").matches?"dark":"light");document.documentElement.dataset.theme=t;}catch(e){}})();`;
