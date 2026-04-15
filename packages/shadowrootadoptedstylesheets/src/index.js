window.__SHADOW_ROOT_ADOPTED_STYLE_SHEETS_MAP ??= new Map();
/** @type {Map<string, CSSStyleSheet>} */
const styleSheetMap = window.__SHADOW_ROOT_ADOPTED_STYLE_SHEETS_MAP;

const BASE = "shadowrootadoptedstylesheets";
const DataName = {
  BASE,
  READY: `${BASE}Ready`,
};

/**
 * Whether the current user agent supports the `shadowrootadoptedstylesheets`
 * attribute for Declarative Shadow DOM.
 * @returns {boolean}
 */
export function supportsShadowRootAdoptedStyleSheets() {
  return (
    "document" in globalThis &&
    "shadowRootAdoptedStyleSheets" in HTMLTemplateElement
  );
}

/**
 * Whether the given element is a `<style type="module" specifier>` element.
 * @param {Element} element
 * @returns {boolean}
 */
function isCSSModule(element) {
  return !!(
    element.nodeName === "STYLE" &&
    element.getAttribute("type") === "module" &&
    element.getAttribute("specifier")
  );
}

/**
 * Whether the given element is a custom element that has the
 * `data-shadowrootadoptedstylesheets` attribute and contains a shadow root.
 * @param {Element} element
 * @returns {boolean}
 */
function hasSpecifier(element) {
  return !!(
    element.nodeName.includes("-") &&
    element.dataset?.[DataName.BASE] &&
    element.shadowRoot
  );
}

/**
 * Installs declarative adopted stylesheets to a given element’s shadow root.
 * @param {Document!} doc
 * @param {HTMLElement} root
 */
function installTo(doc, root) {
  root ??= doc.documentElement;

  const walker = doc.createTreeWalker(
    root,
    NodeFilter.SHOW_ELEMENT,
    (element) =>
      isCSSModule(element) || hasSpecifier(element)
        ? NodeFilter.FILTER_ACCEPT
        : NodeFilter.FILTER_SKIP,
  );

  while (walker.nextNode()) {
    const element = walker.currentNode;

    if (isCSSModule(element)) {
      const specifier = element.getAttribute("specifier");

      if (!specifier || styleSheetMap.has(specifier)) {
        continue;
      }

      const sheet = new CSSStyleSheet({ media: element.media });
      sheet.replaceSync(element.textContent);
      styleSheetMap.set(specifier, sheet);

      continue;
    }

    if (hasSpecifier(element)) {
      const attrValue = element.dataset[DataName.BASE];
      const specifiers = attrValue.trim().split(" ");
      const pending = [];
      const sheets = specifiers
        .filter(Boolean)
        .map((s) => {
          const specifier = s.trim();
          const sheet = styleSheetMap.get(specifier) ?? new CSSStyleSheet();

          if (!styleSheetMap.has(specifier)) {
            styleSheetMap.set(specifier, sheet);
            pending.push(
              fetch(specifier, { headers: { accept: "text/css" } })
                .then((res) => (res.ok && res.status === 200 ? res.text() : ""))
                .then((text) => {
                  sheet.replaceSync(text);
                }),
            );
          }

          return sheet;
        })
        .filter(Boolean);

      element.shadowRoot.adoptedStyleSheets.push(...sheets);

      if (pending.length > 0) {
        Promise.all(pending).then(() => {
          element.dataset[DataName.READY] = "";
        });
      } else {
        element.dataset[DataName.READY] = "";
      }

      installTo(doc, element.shadowRoot);
    }
  }
}

/** @returns {Promise<void>} */
function domReady() {
  return new Promise((resolve) => {
    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", resolve, { once: true });
    } else {
      resolve();
    }
  });
}

/**
 * Installs declarative adopted stylesheets for all the eligible elements in
 * the current document.
 */
export function install() {
  if (supportsShadowRootAdoptedStyleSheets()) {
    return;
  }

  domReady().then(() => {
    installTo(document);
  });
}
