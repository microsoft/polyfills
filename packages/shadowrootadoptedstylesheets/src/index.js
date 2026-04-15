const PROPERTY_NAME = "shadowRootAdoptedStyleSheets";
const ATTR_NAME_DATA_BASE = `data-${PROPERTY_NAME.toLocaleLowerCase()}`;
const ATTR_NAME_DATA_READY = `${ATTR_NAME_DATA_BASE}-ready`;
const ATTR_NAME_SPECIFIER = "specifier";

/**
 * Whether the current user agent supports the `shadowrootadoptedstylesheets`
 * attribute for Declarative Shadow DOM.
 * @returns {boolean}
 */
export function supportsShadowRootAdoptedStyleSheets() {
  return "document" in globalThis && PROPERTY_NAME in HTMLTemplateElement;
}

/**
 * Whether the given element is a `<style type="module" specifier>` element.
 * @param {Element} element
 * @returns {boolean}
 */
function isCSSModule(element) {
  return !!(
    element.nodeName === "STYLE" &&
    element.getAttribute("type")?.trim() === "module" &&
    element.getAttribute(ATTR_NAME_SPECIFIER)?.trim()
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
    element.hasAttribute(ATTR_NAME_DATA_BASE) &&
    element.shadowRoot
  );
}

/**
 * Installs declarative adopted stylesheets to a given DOM root node.
 * @param {Map<string, CSSStyleSheet>} map
 * @param {Document!} doc
 * @param {(Document|ShadowRoot)?} root
 */
function installToRoot(map, doc, root) {
  root ??= doc;

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
      const specifier = element.getAttribute(ATTR_NAME_SPECIFIER).trim();

      if (!specifier || map.has(specifier)) {
        continue;
      }

      const sheet = new CSSStyleSheet({ media: element.media });
      sheet.replaceSync(element.textContent);
      map.set(specifier, sheet);

      continue;
    }

    if (hasSpecifier(element)) {
      const attrValue = element.getAttribute(ATTR_NAME_DATA_BASE).trim();
      const specifiers = attrValue.split(" ");
      const pending = [];
      const sheets = specifiers.filter(Boolean).map((s) => {
        const specifier = s.trim();
        const sheet = map.get(specifier) ?? new CSSStyleSheet();

        if (!map.has(specifier)) {
          map.set(specifier, sheet);
          pending.push(
            fetch(specifier, { headers: { accept: "text/css" } })
              .then((res) => (res.ok && res.status === 200 ? res.text() : ""))
              .then((text) => {
                sheet.replaceSync(text);
              }),
          );
        }

        return sheet;
      });

      element.shadowRoot.adoptedStyleSheets.push(...sheets);

      Promise.all(pending).then(() => {
        element.toggleAttribute(ATTR_NAME_DATA_READY, true);
      });

      installToRoot(map, doc, element.shadowRoot);
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

  window.__SHADOW_ROOT_ADOPTED_STYLE_SHEETS_MAP ??= new Map();

  domReady().then(() => {
    installToRoot(window.__SHADOW_ROOT_ADOPTED_STYLE_SHEETS_MAP, document);
  });
}
