// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

const PROP_NAME = "shadowRootAdoptedStyleSheets";
const ATTR_NAME_DATA_BASE = `data-${PROP_NAME.toLowerCase()}`;
const ATTR_NAME_DATA_READY = `${ATTR_NAME_DATA_BASE}-ready`;
const ATTR_NAME_SPECIFIER = "specifier";
/** @enum {number} */
const CollectType = {
  PROCESSABLE_ELEMENT: 0,
  SHADOW_ROOT: 1,
};

const installedRoots = new WeakSet();

/**
 * Whether the given specifier string is a fetchable external module.
 * @see https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Statements/import#module_specifier_resolution
 * @param {string} specifier
 * @returns {boolean}
 */
function isFetchableModule(specifier) {
  return /\.{0,2}\//.test(specifier) || !!URL.canParse?.(specifier);
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
 * Whether the given element has the `data-shadowRootAdoptedStyleSheets`
 * attribute and contains a shadow root.
 * @param {Element} element
 * @returns {boolean}
 */
function hasSpecifier(element) {
  return !!(element.hasAttribute(ATTR_NAME_DATA_BASE) && element.shadowRoot);
}

/**
 * Processes a given element.
 * @param {Map<string, CSSStyleSheet>} map
 * @param {Element} element
 */
function processElement(map, element) {
  if (isCSSModule(element)) {
    const specifier = element.getAttribute(ATTR_NAME_SPECIFIER).trim();

    if (map.has(specifier)) {
      return;
    }

    const sheet = new CSSStyleSheet({ media: element.media });
    sheet.replaceSync(element.textContent);
    map.set(specifier, sheet);

    return;
  }

  if (hasSpecifier(element)) {
    const attrValue = element.getAttribute(ATTR_NAME_DATA_BASE).trim();
    const specifiers = attrValue.split(/\s+/).filter(Boolean);
    const pending = [];
    const sheets = specifiers.map((specifier) => {
      let sheet = map.get(specifier);
      if (!sheet) {
        sheet = new CSSStyleSheet();
        map.set(specifier, sheet);
        if (isFetchableModule(specifier)) {
          pending.push(
            fetch(specifier, { headers: { accept: "text/css" } })
              .then((res) => (res.ok ? res.text() : ""))
              .then(
                (text) => {
                  sheet.replaceSync(text);
                },
                () => {},
              ),
          );
        }
      }

      return sheet;
    });

    element.shadowRoot.adoptedStyleSheets.push(...sheets);

    Promise.all(pending).then(() => {
      element.toggleAttribute(ATTR_NAME_DATA_READY, true);
    });
  }
}

/**
 * @param {Node} element
 * @returns {boolean}
 */
function shouldProcessElement(element) {
  return (
    element.nodeType === Node.ELEMENT_NODE &&
    (isCSSModule(element) || hasSpecifier(element))
  );
}

/**
 * Yields elements (or their shadow roots) that are descendants of the given
 * `root` (inclusive). The `type` parameter determines what to collect:
 * - `CollectType.PROCESSABLE_ELEMENT`: yields elements that should be processed.
 * - `CollectType.SHADOW_ROOT`: yields shadow roots attached to elements.
 * @param {typeof CollectType[keyof typeof CollectType]} type
 * @param {Document} doc
 * @param {Node} root
 * @returns {Generator<Element | ShadowRoot>}
 */
function* collect(type, doc, root) {
  const matches = (/** @type {Element} */ element) =>
    type === CollectType.PROCESSABLE_ELEMENT
      ? shouldProcessElement(element)
      : !!element.shadowRoot;
  const get = (/** @type {Element} */ element) =>
    type === CollectType.PROCESSABLE_ELEMENT ? element : element.shadowRoot;

  if (
    root.nodeType === Node.ELEMENT_NODE &&
    matches(/** @type {Element} */ (root))
  ) {
    yield get(/** @type {Element} */ (root));
  }
  const walker = doc.createTreeWalker(
    root,
    NodeFilter.SHOW_ELEMENT,
    (element) =>
      matches(/** @type {Element} */ (element))
        ? NodeFilter.FILTER_ACCEPT
        : NodeFilter.FILTER_SKIP,
  );
  while (walker.nextNode()) {
    yield get(/** @type {Element} */ (walker.currentNode));
  }
}

/**
 * Installs declarative adopted stylesheets to a given DOM root node.
 * @param {Map<string, CSSStyleSheet>} map
 * @param {Document} doc
 * @param {Document|ShadowRoot} [root]
 */
function installToRoot(map, doc, root) {
  root ??= doc;

  if (installedRoots.has(root)) {
    return;
  }
  installedRoots.add(root);

  for (const element of collect(CollectType.PROCESSABLE_ELEMENT, doc, root)) {
    processElement(map, /** @type {Element} */ (element));
  }

  new MutationObserver((entries) => {
    for (const entry of entries) {
      for (const added of entry.addedNodes) {
        for (const element of collect(
          CollectType.PROCESSABLE_ELEMENT,
          doc,
          added,
        )) {
          processElement(map, /** @type {Element} */ (element));
        }
        for (const shadowRoot of collect(CollectType.SHADOW_ROOT, doc, added)) {
          installToRoot(map, doc, /** @type {ShadowRoot} */ (shadowRoot));
        }
      }
    }
  }).observe(root, {
    childList: true,
    subtree: true,
  });

  // Install this to all existing shadow roots.
  for (const shadowRoot of collect(CollectType.SHADOW_ROOT, doc, root)) {
    installToRoot(map, doc, /** @type {ShadowRoot} */ (shadowRoot));
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
 * NOTE: This currently isn’t working because browsers that support the feature
 * don’t have the `shadowRootAdoptedStyleSheets` property, the working group
 * is working on this.
 * @returns {boolean}
 */
function supportsAdoptedStyleSheets() {
  return (
    typeof document !== "undefined" &&
    typeof ShadowRoot !== "undefined" &&
    "adoptedStyleSheets" in ShadowRoot.prototype
  );
}

/**
 * Whether the current user agent supports the `shadowRootAdoptedStyleSheets`
 * attribute for Declarative Shadow DOM.
 * @returns {boolean}
 */
export function supportsShadowRootAdoptedStyleSheets() {
  return (
    typeof document !== "undefined" &&
    PROP_NAME in HTMLTemplateElement.prototype
  );
}

/**
 * Installs declarative adopted stylesheets for all the eligible elements in
 * the current document.
 */
export function install() {
  if (!supportsAdoptedStyleSheets() || supportsShadowRootAdoptedStyleSheets()) {
    return;
  }

  window.__SHADOW_ROOT_ADOPTED_STYLE_SHEETS_MAP ??= new Map();

  domReady().then(() => {
    installToRoot(window.__SHADOW_ROOT_ADOPTED_STYLE_SHEETS_MAP, document);
  });
}
