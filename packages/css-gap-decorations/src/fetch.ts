/**
 * Stylesheet reader — fetches CSS text from <style> and same-origin <link>.
 * Modelled after @oddbird/css-anchor-positioning's src/fetch.ts.
 */

import { type ParsedDeclaration, parseStylesheet } from "./parse.js";

export interface FetchedStylesheet {
  element: HTMLStyleElement | HTMLLinkElement;
  declarations: ParsedDeclaration[];
}

/**
 * Read all gap-decoration declarations from the document's stylesheets.
 */
export async function fetchAllStylesheets(
  root: Document | ShadowRoot = document,
): Promise<FetchedStylesheet[]> {
  const results: FetchedStylesheet[] = [];
  const elements = root.querySelectorAll('style, link[rel="stylesheet"]');

  for (const el of elements) {
    if (el instanceof HTMLStyleElement) {
      const cssText = el.textContent || "";
      const parsed = parseStylesheet(cssText);
      if (parsed.declarations.length > 0) {
        results.push({ element: el, declarations: parsed.declarations });
      }
    } else if (el instanceof HTMLLinkElement) {
      const cssText = await fetchStylesheetText(el);
      if (cssText) {
        const parsed = parseStylesheet(cssText);
        if (parsed.declarations.length > 0) {
          results.push({ element: el, declarations: parsed.declarations });
        }
      }
    }
  }

  return results;
}

/**
 * Fetch the text of a <link rel="stylesheet"> if same-origin.
 */
async function fetchStylesheetText(
  link: HTMLLinkElement,
): Promise<string | null> {
  const href = link.href;
  if (!href || link.disabled) {
    return null;
  }

  // Same-origin check
  try {
    const url = new URL(href, document.baseURI);
    if (url.origin !== location.origin) {
      return null;
    }
  } catch {
    return null;
  }

  try {
    const response = await fetch(href, { credentials: "same-origin" });
    if (!response.ok) {
      return null;
    }
    return await response.text();
  } catch {
    return null;
  }
}
