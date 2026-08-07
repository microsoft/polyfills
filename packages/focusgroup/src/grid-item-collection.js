// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

import { DatasetName } from "./constants.js";
import { observers } from "./observer-registry.js";
import {
  hasGenericRole,
  isKeyboardFocusable,
  parseDefinition,
} from "./utils.js";

/**
 * Discovers rectangular, spanless grid topology from native tables or
 * explicitly enrolled direct-child rows.
 */
export class GridItemCollection {
  #owner;
  #manual;
  #entries = [];
  #valid = false;
  #observer;

  constructor(owner, manual) {
    this.#owner = owner;
    this.#manual = manual;
    this.#build();
  }

  #build() {
    this.#entries = [];
    this.#valid = false;
    const rows = this.#manual
      ? [...this.#owner.children].filter((el) =>
          el.hasAttribute("focusgrouprow"),
        )
      : [...this.#owner.children].flatMap((child) =>
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
      [...row.children].filter((cell) =>
        this.#manual ? true : ["TD", "TH"].includes(cell.tagName),
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
        if (isKeyboardFocusable(cell, this.#owner, true)) {
          candidates.push(cell);
        }
        for (const child of cell.querySelectorAll("*")) {
          const scope = child.closest("[focusgroup]");
          const table = child.closest("table");
          if (
            isKeyboardFocusable(child, this.#owner, true) &&
            !child.closest('[focusgroup="none"]') &&
            (!scope || scope.isSameNode(this.#owner)) &&
            (!table || table.isSameNode(this.#owner))
          ) {
            candidates.push(child);
          }
        }
        if (candidates.length !== 1) {
          return;
        }
        this.#entries.push({ element: candidates[0], row: r, col: c, cell });
      }
    }
    this.#valid = true;
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
    return isKeyboardFocusable(element, this.#owner, true);
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
  gridNext(current, operation, def) {
    const source = this.#entries.find((e) => e.element === current);
    if (!source) {
      return null;
    }
    let row = source.row;
    let col = source.col;
    const rowCount = Math.max(...this.#entries.map((e) => e.row)) + 1;
    const colCount = Math.max(...this.#entries.map((e) => e.col)) + 1;
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
    return (
      this.#entries.find(
        (e) => e.row === row && e.col === col && this.#isNavigable(e.element),
      )?.element ?? null
    );
  }
  observe(focusGroup) {
    this.#observer = new MutationObserver((records) => {
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
    });
    this.#observer.observe(this.#owner, {
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
        "tabindex",
      ],
    });
    observers.add(this.#observer);
  }
  disconnect() {
    observers.delete(this.#observer);
    this.#observer?.disconnect();
    this.#observer = null;
  }
  flush() {
    this.#observer?.takeRecords();
  }
}
