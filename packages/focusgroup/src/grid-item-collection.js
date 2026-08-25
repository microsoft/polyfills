// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

import { DatasetName } from "./constants.js";
import { ObservableItemCollection } from "./observable-item-collection.js";
import { createTreeWalker, getClosestElement } from "./shadow-utils/index.js";
import {
  getGridNavigationDirection,
  hasGenericRole,
  isKeyboardFocusable,
  isKeyConflictElement,
  parseDefinition,
} from "./utils.js";

function flatChildren(element) {
  return [...(element.shadowRoot?.children ?? element.children)].flatMap(
    (child) =>
      child.tagName === "SLOT"
        ? child.assignedElements({ flatten: true })
        : [child],
  );
}

function isDisabledControl(element) {
  return element.matches(":disabled");
}

/**
 * Discovers rectangular, spanless grid topology from native tables or
 * explicitly enrolled direct-child rows.
 */
export class GridItemCollection {
  #owner;
  #manual;
  #entries = [];
  #valid = false;
  #rowCount = 0;
  #colCount = 0;

  constructor(owner, manual) {
    this.#owner = owner;
    this.#manual = manual;
    this.#build();
  }

  #build() {
    this.#entries = [];
    this.#valid = false;
    this.#rowCount = 0;
    this.#colCount = 0;
    const children = flatChildren(this.#owner);
    const rows = this.#manual
      ? children.filter((el) => el.hasAttribute("focusgrouprow"))
      : children.flatMap((child) =>
          child.tagName === "TR"
            ? [child]
            : ["THEAD", "TBODY", "TFOOT"].includes(child.tagName)
              ? [...child.children].filter((row) => row.tagName === "TR")
              : [],
        );
    if (
      !rows.length ||
      (!this.#manual && !["TABLE"].includes(this.#owner.tagName))
    ) {
      return;
    }
    const cells = rows.map((row) =>
      flatChildren(row).filter(
        (cell) => this.#manual || ["TD", "TH"].includes(cell.tagName),
      ),
    );
    if (
      cells.some((row) => !row.length) ||
      new Set(cells.map((row) => row.length)).size !== 1
    ) {
      return;
    }
    if (
      !this.#manual &&
      cells.some((row) =>
        row.some((cell) => cell.rowSpan !== 1 || cell.colSpan !== 1),
      )
    ) {
      return;
    }
    for (let r = 0; r < rows.length; r++) {
      for (let c = 0; c < cells[r].length; c++) {
        const cell = cells[r][c];
        const candidates = [];
        if (
          isKeyboardFocusable(cell, this.#owner, true) ||
          isDisabledControl(cell)
        ) {
          candidates.push(cell);
        }
        const walker = createTreeWalker(
          this.#owner.ownerDocument,
          cell,
          NodeFilter.SHOW_ELEMENT,
        );
        while (walker.nextNode()) {
          const child = walker.currentNode;
          const scope = getClosestElement(child, "[focusgroup]");
          const table = getClosestElement(child, "table");
          if (
            (isKeyboardFocusable(child, this.#owner, true) ||
              isDisabledControl(child)) &&
            !child.closest('[focusgroup="none"]') &&
            (!scope || scope.isSameNode(this.#owner)) &&
            (!table || table.isSameNode(this.#owner))
          ) {
            candidates.push(child);
          }
        }
        if (candidates.length !== 1) {
          this.#entries = [];
          return;
        }
        this.#entries.push({
          element: candidates[0],
          row: r,
          col: c,
          cell,
          nativelyTabbable: isKeyboardFocusable(
            candidates[0],
            this.#owner,
            true,
          ),
        });
      }
    }
    this.#valid = true;
    this.#rowCount = rows.length;
    this.#colCount = cells[0].length;
  }

  *items() {
    if (!this.#valid) {
      return;
    }
    yield* this.#entries;
  }
  first() {
    return this.#entries[0]?.element ?? null;
  }
  last() {
    return this.#entries.at(-1)?.element ?? null;
  }
  next(current) {
    const i = this.#entries.findIndex((e) => e.element === current);
    return this.#entries[i + 1]?.element ?? null;
  }
  previous(current) {
    const i = this.#entries.findIndex((e) => e.element === current);
    return this.#entries[i - 1]?.element ?? null;
  }
  contains(element) {
    return this.#entries.some((e) => e.element === element);
  }
  isItem(element) {
    return this.contains(element);
  }
  #isNavigable(element) {
    const entry = this.#entries.find((item) => item.element === element);
    if (!entry) {
      return false;
    }
    const authorTabindex = element.getAttribute(DatasetName.AUTHOR_TABINDEX);
    return authorTabindex === "none"
      ? entry.nativelyTabbable
      : Number(authorTabindex) > -1;
  }
  sameSegment() {
    return true;
  }
  decorate() {
    this.#build();
    if (!this.#valid) {
      return;
    }
    for (const entry of this.#entries) {
      entry.element.setAttribute(DatasetName.ITEM, "");
      const row = entry.cell.parentElement;
      if (this.#manual && hasGenericRole(row) && !row.hasAttribute("role")) {
        row.setAttribute("role", "row");
        row.setAttribute(DatasetName.INFERRED_ROLE, "");
      }
      if (hasGenericRole(entry.cell) && !entry.cell.hasAttribute("role")) {
        entry.cell.setAttribute("role", "gridcell");
        entry.cell.setAttribute(DatasetName.INFERRED_ROLE, "");
      }
    }
  }
  undecorate() {
    for (const entry of this.#entries) {
      entry.element.removeAttribute(DatasetName.ITEM);
      for (const el of [entry.cell, entry.cell.parentElement]) {
        if (el?.hasAttribute(DatasetName.INFERRED_ROLE)) {
          el.removeAttribute("role");
          el.removeAttribute(DatasetName.INFERRED_ROLE);
        }
      }
    }
  }
  navigate(event, current, definition) {
    if (isKeyConflictElement(current)) {
      return null;
    }
    const operation = getGridNavigationDirection(event, this.#owner);
    return operation
      ? this.#next(current, operation, definition, new Set())
      : null;
  }
  #next(current, operation, def, visited) {
    if (visited.has(current)) {
      return null;
    }
    visited.add(current);

    const source = this.#entries.find((e) => e.element === current);
    if (!source) {
      return null;
    }
    let row = source.row;
    let col = source.col;
    const rowCount = this.#rowCount;
    const colCount = this.#colCount;
    if (operation === "row-start") {
      col = 0;
    } else if (operation === "row-end") {
      col = colCount - 1;
    } else if (operation === "grid-start") {
      row = col = 0;
    } else if (operation === "grid-end") {
      row = rowCount - 1;
      col = colCount - 1;
    } else if (
      operation === "inline-forward" ||
      operation === "inline-backward"
    ) {
      const delta = operation.endsWith("forward") ? 1 : -1;
      if (col + delta < 0 || col + delta >= colCount) {
        const edge = def.rowEdge ?? "none";
        if (edge === "wrap") {
          col = delta > 0 ? 0 : colCount - 1;
        } else if (edge === "flow") {
          row += delta;
          if (row < 0 || row >= rowCount) {
            row = delta > 0 ? 0 : rowCount - 1;
          }
          col = delta > 0 ? 0 : colCount - 1;
        } else {
          return null;
        }
      } else {
        col += delta;
      }
    } else if (
      operation === "block-forward" ||
      operation === "block-backward"
    ) {
      const delta = operation.endsWith("forward") ? 1 : -1;
      if (row + delta < 0 || row + delta >= rowCount) {
        const edge = def.colEdge ?? "none";
        if (edge === "wrap") {
          row = delta > 0 ? 0 : rowCount - 1;
        } else if (edge === "flow") {
          col += delta;
          if (col < 0 || col >= colCount) {
            col = delta > 0 ? 0 : colCount - 1;
          }
          row = delta > 0 ? 0 : rowCount - 1;
        } else {
          return null;
        }
      } else {
        row += delta;
      }
    }
    const target = this.#entries.find((e) => e.row === row && e.col === col);
    if (!target) {
      return null;
    }
    if (!this.#isNavigable(target.element)) {
      return this.#next(target.element, operation, def, visited);
    }
    return target.element;
  }
  observe(focusGroup) {
    this.#observable.startObserving(
      this.#owner,
      (records) => {
        const authorTabindexChanges = records
          .filter(
            (record) =>
              record.type === "attributes" &&
              record.attributeName === "tabindex" &&
              this.#entries.some((entry) => entry.element === record.target),
          )
          .map((record) => record.target);
        const definition = records.some(
          (record) =>
            record.type === "attributes" &&
            record.target === this.#owner &&
            record.attributeName === "focusgroup",
        )
          ? parseDefinition(this.#owner)
          : undefined;
        focusGroup.update({ definition, authorTabindexChanges });
      },
      {
        attributes: true,
        childList: true,
        subtree: true,
        attributeFilter: [
          "focusgroup",
          "focusgrouprow",
          "focusgroupstart",
          "disabled",
          "hidden",
          "inert",
          "rowspan",
          "colspan",
          "tabindex",
        ],
      },
      (callback) => new MutationObserver(callback),
    );
  }
  disconnect() {
    this.#observable.stopObserving();
  }
  flush() {
    this.#observable.flush();
  }

  #observable = new ObservableItemCollection();
}
