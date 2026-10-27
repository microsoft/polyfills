/**
 * Manual polyfill entry point — exports polyfill() without auto-installing.
 * Usage: import polyfill from '@microsoft/css-gap-decorations-polyfill/fn';
 *        await polyfill();
 */

import { destroy, initialize } from "./observer.js";

export { destroy };

export default async function polyfill(): Promise<void> {
  // Feature detection: if the browser natively supports gap decorations,
  // do nothing.  We check for an advanced spec feature so the polyfill
  // stays active even if a browser ships only basic column-rule support
  // without the full gap-decorations feature set.
  if (
    typeof CSS !== "undefined" &&
    CSS.supports &&
    CSS.supports("column-rule-break", "intersection")
  ) {
    return;
  }

  await initialize();
}
