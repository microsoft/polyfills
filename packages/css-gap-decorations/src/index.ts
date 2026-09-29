/**
 * CSS Gap Decorations Polyfill — auto-installing entry point.
 *
 * Usage:
 *   <script type="module" src="css-gap-decorations.js"></script>
 *
 * Or:
 *   import '@microsoft/css-gap-decorations-polyfill';
 *
 * The polyfill auto-detects native support and no-ops if present.
 */

import polyfill from "./index-fn.js";

export { destroy } from "./observer.js";

// Auto-install: run polyfill when the document is ready
if (typeof document !== "undefined") {
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", () => void polyfill());
  } else {
    void polyfill();
  }
}
