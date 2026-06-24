/**
 * Lifecycle management — MutationObserver + ResizeObserver wiring
 * with rAF coalescing.
 */

import {
  detectContainerType,
  getComputedGapStyles,
  resolveElementStyles,
  resolveStyles,
} from "./cascade.js";
import { fetchAllStylesheets } from "./fetch.js";
import type { GapGeometry } from "./geometry/common.js";
import { computeFlexGeometry } from "./geometry/flex.js";
import { computeGridGeometry } from "./geometry/grid.js";
import { computeMulticolGeometry } from "./geometry/multicol.js";
import { paintSegments, removeOverlay } from "./painter.js";
import type { ParsedDeclaration } from "./parse.js";
import { resetSourceOrder } from "./parse.js";
import { generateSegments } from "./segments.js";

let headObserver: MutationObserver | null = null;
const containerObservers = new Map<
  Element,
  { mutation: MutationObserver; resize: ResizeObserver }
>();
let pendingFullUpdate = false;
const pendingContainerUpdates = new Set<Element>();
let allDeclarations: ParsedDeclaration[] = [];
let styledElements = new Set<Element>();
let destroyed = false;

/**
 * Initialize the polyfill: read all stylesheets, resolve styles,
 * paint decorations, and set up observers.
 */
export async function initialize(): Promise<void> {
  destroyed = false;

  // Initial stylesheet read
  const sheets = await fetchAllStylesheets();
  allDeclarations = sheets.flatMap((s) => s.declarations);

  // Resolve and paint
  updateAll();

  // Watch for stylesheet changes
  headObserver = new MutationObserver(onHeadMutation);
  headObserver.observe(document.head, {
    childList: true,
    subtree: true,
    characterData: true,
  });

  // Also observe the body for dynamically added style elements
  if (document.body) {
    headObserver.observe(document.body, {
      childList: true,
      subtree: false,
    });
  }
}

/**
 * Tear down the polyfill: remove overlays, disconnect observers.
 */
export function destroy(): void {
  destroyed = true;

  if (headObserver) {
    headObserver.disconnect();
    headObserver = null;
  }

  for (const [el, obs] of containerObservers) {
    obs.mutation.disconnect();
    obs.resize.disconnect();
    removeOverlay(el);
  }
  containerObservers.clear();
  styledElements.clear();
  allDeclarations = [];
}

function onHeadMutation(mutations: MutationRecord[]): void {
  let needsUpdate = false;

  for (const mutation of mutations) {
    if (mutation.type === "childList") {
      for (const node of mutation.addedNodes) {
        if (
          node instanceof HTMLStyleElement ||
          node instanceof HTMLLinkElement
        ) {
          needsUpdate = true;
        }
      }
      for (const node of mutation.removedNodes) {
        if (
          node instanceof HTMLStyleElement ||
          node instanceof HTMLLinkElement
        ) {
          needsUpdate = true;
        }
      }
    }
    if (mutation.type === "characterData") {
      if (mutation.target.parentElement instanceof HTMLStyleElement) {
        needsUpdate = true;
      }
    }
  }

  if (needsUpdate) {
    scheduleFullUpdate();
  }
}

function scheduleFullUpdate(): void {
  if (pendingFullUpdate || destroyed) {
    return;
  }
  pendingFullUpdate = true;
  requestAnimationFrame(async () => {
    pendingFullUpdate = false;
    if (destroyed) {
      return;
    }
    resetSourceOrder();
    const sheets = await fetchAllStylesheets();
    allDeclarations = sheets.flatMap((s) => s.declarations);
    updateAll();
  });
}

function scheduleContainerUpdate(el: Element): void {
  if (destroyed) {
    return;
  }
  pendingContainerUpdates.add(el);
  if (pendingFullUpdate) {
    return; // will be covered by full update
  }
  requestAnimationFrame(() => {
    if (destroyed) {
      return;
    }
    for (const container of pendingContainerUpdates) {
      if (document.contains(container)) {
        updateContainer(container);
      }
    }
    pendingContainerUpdates.clear();
  });
}

function updateAll(): void {
  // Clean up old containers that may no longer be styled
  for (const el of styledElements) {
    if (!document.contains(el)) {
      cleanupContainer(el);
    }
  }

  // Resolve styles for all matching elements
  styledElements = resolveStyles(allDeclarations);

  // Paint each container
  for (const el of styledElements) {
    updateContainer(el);
    ensureContainerObservers(el);
  }

  // Clean up containers that are no longer styled
  for (const [el] of containerObservers) {
    if (!styledElements.has(el)) {
      cleanupContainer(el);
    }
  }
}

function updateContainer(el: Element): void {
  try {
    updateContainerUnsafe(el);
  } catch (err) {
    // Remove any partial overlay to avoid stale decorations.
    try {
      removeOverlay(el);
    } catch {
      // Ignore cleanup errors.
    }
    if (typeof console !== "undefined" && console.warn) {
      console.warn("css-gap-decorations: error updating container", err);
    }
  }
}

function updateContainerUnsafe(el: Element): void {
  const containerType = detectContainerType(el);
  if (!containerType) {
    removeOverlay(el);
    return;
  }

  // Re-resolve styles for this element (picks up inline style changes)
  resolveElementStyles(el, allDeclarations);
  const styles = getComputedGapStyles(el);

  // Compute geometry
  let geometry: GapGeometry;
  switch (containerType) {
    case "grid":
      geometry = computeGridGeometry(el);
      break;
    case "flex":
      geometry = computeFlexGeometry(el);
      break;
    case "multicol":
      geometry = computeMulticolGeometry(el);
      break;
    default:
      return;
  }

  // Generate and paint segments
  const cs2 = getComputedStyle(el);
  const direction = cs2.direction === "rtl" ? "rtl" : "ltr";
  const segments = generateSegments(geometry, styles, direction);
  paintSegments(
    el,
    segments,
    styles["rule-overlap"],
    geometry.isVertical,
    styles,
  );
}

function ensureContainerObservers(el: Element): void {
  if (containerObservers.has(el)) {
    return;
  }

  const resize = new ResizeObserver(() => {
    if (!destroyed) {
      scheduleContainerUpdate(el);
    }
  });
  resize.observe(el);

  const mutation = new MutationObserver((mutations) => {
    if (destroyed) {
      return;
    }

    // Determine whether any mutation is relevant to gap geometry:
    //   - childList on the container itself (items added/removed), or
    //   - a style/class change on the container itself (e.g. gap or
    //     grid-template changed via a class), or
    //   - a style/class change on a DIRECT child (grid/flex item) whose
    //     placement or size may have changed.
    // We watch the subtree so direct-child attribute changes are visible,
    // but filter to the container + its direct children only, to avoid
    // repainting on deep content mutations that don't affect gap geometry.
    // Mutations involving only
    // the polyfill's own elements (overlay, probes) are ignored to avoid
    // self-triggered repaint loops.
    let relevant = false;
    for (const m of mutations) {
      if (m.type === "childList") {
        if (m.target !== el) {
          continue;
        }
        // Ignore add/remove of the polyfill's own nodes (probes, overlay).
        const nodes = [...m.addedNodes, ...m.removedNodes];
        const hasUserNode = nodes.some(
          (n) =>
            !(n instanceof Element) ||
            !n.hasAttribute("data-gap-decorations-polyfill"),
        );
        if (hasUserNode) {
          relevant = true;
          break;
        }
        continue;
      }
      if (
        m.type === "attributes" &&
        (m.target === el || m.target.parentNode === el)
      ) {
        relevant = true;
        break;
      }
    }

    if (relevant) {
      scheduleContainerUpdate(el);
    }
  });
  mutation.observe(el, {
    childList: true,
    attributes: true,
    attributeFilter: ["style", "class"],
    subtree: true,
  });

  containerObservers.set(el, { mutation, resize });
}

function cleanupContainer(el: Element): void {
  const obs = containerObservers.get(el);
  if (obs) {
    obs.mutation.disconnect();
    obs.resize.disconnect();
    containerObservers.delete(el);
  }
  removeOverlay(el);
  styledElements.delete(el);
}
