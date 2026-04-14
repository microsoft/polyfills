window.__SHADOW_ROOT_ADOPTED_STYLE_SHEETS_MAP ??= new Map();
/** @type {Map<string, CSSStyleSheet>} */
const styleSheetMap = window.__SHADOW_ROOT_ADOPTED_STYLE_SHEETS_MAP;

export function supportsShadowRootAdoptedStyleSheets() {
  return (
    "document" in globalThis &&
    "shadowRootAdoptedStyleSheets" in HTMLTemplateElement
  );
}

function isCSSModule(element) {
  return !!(
    element.nodeName === "STYLE" &&
    element.getAttribute("type") === "module" &&
    element.getAttribute("specifier")
  );
}

function hasDcmSpecifier(element) {
  return !!(
    element.nodeName.includes("-") &&
    element.dataset?.shadowrootadoptedstylesheets &&
    element.shadowRoot
  );
}

export function install(root = document.documentElement) {
  if (supportsShadowRootAdoptedStyleSheets()) {
    return;
  }

  const walker = document.createTreeWalker(
    root,
    NodeFilter.SHOW_ELEMENT,
    (element) =>
      isCSSModule(element) || hasDcmSpecifier(element)
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
    }

    if (hasDcmSpecifier(element)) {
      const attrValue = element.dataset.shadowrootadoptedstylesheets;
      const specifiers = attrValue.trim().split(" ");
      const sheets = specifiers
        .filter(Boolean)
        .map((s) => styleSheetMap.get(s.trim()))
        .filter(Boolean);

      element.shadowRoot.adoptedStyleSheets.push(...sheets);

      install(element.shadowRoot);
    }
  }
}
