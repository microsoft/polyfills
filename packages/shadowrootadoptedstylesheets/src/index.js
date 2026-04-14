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

function installTo(doc, root) {
  root ??= doc.documentElement;

  const walker = doc.createTreeWalker(
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
        .map((s) => {
          // TODO: if a specifier is not found in the map, the ponyfill should
          // make a tempt to fetch the resource, see:
          // https://github.com/MicrosoftEdge/MSEdgeExplainers/blob/main/ShadowDOMAdoptedStyleSheets/explainer.md#fetch-behavior-for-external-specifiers
          return styleSheetMap.get(s.trim());
        })
        .filter(Boolean);

      element.shadowRoot.adoptedStyleSheets.push(...sheets);

      installTo(doc, element.shadowRoot);
    }
  }
}

export function install() {
  if (supportsShadowRootAdoptedStyleSheets()) {
    return;
  }

  installTo(document);
}
