// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

/**
 * Declarative Partial Updates Polyfill
 *
 * Polyfills <template for="name"> patching from the "Interleaved HTML
 * streaming (patching)" proposal.
 *
 * @see https://github.com/WICG/declarative-partial-updates/blob/main/patching-explainer.md
 *
 * Browsers parse processing instructions
 * (<?start>, <?end>, <?marker>) as Comment nodes whose data begins with "?".
 * This module detects those comments, matches them to <template for>
 * elements, and applies the declarative patches.
 *
 * @module declarative-partial-updates-polyfill
 */

// ---------------------------------------------------------------------------
// PI Comment parsing
// ---------------------------------------------------------------------------

// Named: <?start name="x">, <?start name='x'>, <?start name=x>
// Per spec, <?end> does not have a name attribute — names only apply to <?start> and <?marker>.
const PI_NAMED_RE =
  /^\?(start|end|marker)\s+name\s*=\s*(?:"([^"]*)"|'([^']*)'|(\S+))\s*$/;

// Bare: <?start>, <?end>, <?marker>
const PI_BARE_RE = /^\?(start|end|marker)\s*$/;

/**
 * If `node` is a Comment node encoding a processing instruction, return
 * `{ type, name }` (name is `null` for bare markers).  Otherwise `null`.
 *
 * @param {Node} node
 * @returns {{ type: 'start' | 'end' | 'marker', name: string | null } | null}
 */
function parsePI(node) {
  if (node.nodeType !== Node.COMMENT_NODE) {
    return null;
  }
  const data = /** @type {Comment} */ (node).data;

  let m = data.match(PI_NAMED_RE);
  if (m) {
    return {
      type: /** @type {'start' | 'end' | 'marker'} */ (m[1]),
      name: m[2] || m[3] || m[4],
    };
  }

  m = data.match(PI_BARE_RE);
  if (m) {
    return {
      type: /** @type {'start' | 'end' | 'marker'} */ (m[1]),
      name: null,
    };
  }

  return null;
}

// ---------------------------------------------------------------------------
// Marker search
// ---------------------------------------------------------------------------

/**
 * Check whether a PI's name matches the search name.
 *
 * @param {string | null} piName
 * @param {string | null} searchName
 * @returns {boolean}
 */
function nameMatches(piName, searchName) {
  return searchName === null ? piName === null : piName === searchName;
}

/**
 * Walk the subtree of `root` and return the first start/marker PI whose name
 * matches `searchName`.  When a `<?start>` is found, walk forward from it to
 * find the paired `<?end>`.
 *
 * Per spec, `<?end>` does not have a `name` attribute — it closes the nearest
 * open `<?start>`.  Nested `<?start>` PIs increment a depth counter so that
 * inner `<?end>` nodes are skipped correctly.
 *
 * @param {Node} root
 * @param {string | null} searchName
 * @returns {{ start: Comment | null, end: Comment | null, marker: Comment | null }}
 */
function findMarkers(root, searchName) {
  const result = { start: null, end: null, marker: null };
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_COMMENT);
  let node = /** @type {Comment | null} */ (walker.nextNode());
  while (node) {
    const pi = parsePI(node);
    if (!pi || !nameMatches(pi.name, searchName)) {
      node = /** @type {Comment | null} */ (walker.nextNode());
      continue;
    }

    if (pi.type === "marker") {
      result.marker = node;
      return result;
    }

    if (pi.type === "start") {
      result.start = node;
      // Forward-walk from start to find paired <?end>, tracking nesting depth
      let depth = 0;
      let endNode = /** @type {Comment | null} */ (walker.nextNode());
      while (endNode) {
        const endPI = parsePI(endNode);
        if (!endPI) {
          endNode = /** @type {Comment | null} */ (walker.nextNode());
          continue;
        }
        if (endPI.type === "start") {
          depth += 1;
        } else if (endPI.type === "end") {
          if (depth === 0) {
            result.end = endNode;
            break;
          }
          depth -= 1;
        }
        endNode = /** @type {Comment | null} */ (walker.nextNode());
      }
      return result;
    }
    node = /** @type {Comment | null} */ (walker.nextNode());
  }
  return result;
}

// ---------------------------------------------------------------------------
// DOM helpers
// ---------------------------------------------------------------------------

/**
 * Remove all sibling nodes between `start` and `end` (exclusive).
 *
 * @param {Node} start
 * @param {Node} end
 */
function removeBetween(start, end) {
  let cur = start.nextSibling;
  while (cur && cur !== end) {
    const next = cur.nextSibling;
    cur.parentNode?.removeChild(cur);
    cur = next;
  }
}

/**
 * Remove all siblings that follow `node` within the same parent.
 *
 * @param {Node} node
 */
function removeAfter(node) {
  while (node.nextSibling) {
    node.parentNode?.removeChild(node.nextSibling);
  }
}

// ---------------------------------------------------------------------------
// Patch application
// ---------------------------------------------------------------------------

/**
 * Find an element whose `marker` attribute (space-separated tokens) includes
 * the given name, searching within `root`.
 *
 * @param {string} name
 * @param {ParentNode} root
 * @returns {Element | null}
 */
function findTarget(name, root) {
  for (const el of root.querySelectorAll("[marker]")) {
    const tokens = el.getAttribute("marker")?.split(/\s+/) ?? [];
    if (tokens.includes(name)) {
      return el;
    }
  }
  return null;
}

/**
 * Apply a single `<template for="name">` patch.
 * Returns `true` if the patch was applied.
 *
 * The `for` attribute supports two forms:
 * - `for="elementName"` -- finds named markers matching `elementName`, then
 *   falls back to unnamed (bare) markers.
 * - `for="elementName#markerName"` -- finds markers with `name="markerName"`.
 *
 * @param {HTMLTemplateElement} template
 * @param {ParentNode} root
 * @returns {boolean}
 */
function applyPatch(template, root) {
  const forAttr = template.getAttribute("for");
  if (!forAttr) {
    return false;
  }

  const hashIdx = forAttr.indexOf("#");
  const elementName = hashIdx !== -1 ? forAttr.substring(0, hashIdx) : forAttr;
  const markerName = hashIdx !== -1 ? forAttr.substring(hashIdx + 1) : null;

  const target = findTarget(elementName, root);
  if (!target) {
    return false;
  }

  let markers;
  if (markerName !== null) {
    // Explicit #name: look for PIs with that name
    markers = findMarkers(target, markerName);
  } else {
    // No #: try named PIs matching elementName (spec), fall back to unnamed
    markers = findMarkers(target, elementName);
    if (!markers.start && !markers.end && !markers.marker) {
      markers = findMarkers(target, null);
    }
  }

  const content = template.content.cloneNode(true);

  if (markers.start && markers.end) {
    removeBetween(markers.start, markers.end);
    markers.start.replaceWith(content);
    markers.end.remove();
  } else if (markers.start) {
    removeAfter(markers.start);
    markers.start.replaceWith(content);
  } else if (markers.marker) {
    markers.marker.replaceWith(content);
  } else {
    target.appendChild(content);
  }

  return true;
}

// ---------------------------------------------------------------------------
// Batch processing
// ---------------------------------------------------------------------------

/**
 * Process every `<template for>` inside `root`.
 * Successfully applied templates are removed from the DOM; ones that fail
 * remain as an error signal (per spec).
 *
 * @param {ParentNode} root
 */
function processTemplates(root) {
  const templates = root.querySelectorAll("template[for]");
  for (const t of templates) {
    if (applyPatch(/** @type {HTMLTemplateElement} */ (t), root)) {
      t.remove();
    }
  }
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Apply any existing `<template for>` patches within `root` and start
 * observing for dynamically added ones.  Returns a function that stops
 * the observer.
 *
 * No-ops and returns a no-op disconnect if native support is detected.
 *
 * @param {ParentNode} [root]
 * @returns {() => void}
 */
export function observe(root = document) {
  // Feature detection: skip polyfill when browser supports natively
  if ("marker" in Element.prototype) {
    return () => {};
  }

  processTemplates(root);

  const observer = new MutationObserver((mutations) => {
    for (const mutation of mutations) {
      for (const node of mutation.addedNodes) {
        if (
          node.nodeType === Node.ELEMENT_NODE &&
          /** @type {Element} */ (node).nodeName === "TEMPLATE" &&
          /** @type {Element} */ (node).hasAttribute("for")
        ) {
          if (applyPatch(/** @type {HTMLTemplateElement} */ (node), root)) {
            node.parentNode?.removeChild(node);
          }
        }
      }
    }
  });
  observer.observe(root, { childList: true, subtree: true });

  return () => observer.disconnect();
}
