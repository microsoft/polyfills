// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

import { test } from "@playwright/test";
import { expect, setupPage } from "./utils.js";

// ax-role-inference-owner.html
test("should infer ARIA roles for owners", async ({ page }) => {
  await setupPage(
    page,
    `
    <div data-testid="toolbar" focusgroup="toolbar"></div>
    <div data-testid="tablist" focusgroup="tablist"></div>
    <div data-testid="radiogroup" focusgroup="radiogroup"></div>
    <div data-testid="listbox" focusgroup="listbox"></div>
    <div data-testid="menu" focusgroup="menu"></div>
    <div data-testid="menubar" focusgroup="menubar"></div>
  `,
  );

  await expect(page.getByTestId("toolbar")).toHaveComputedRole("toolbar");
  await expect(page.getByTestId("tablist")).toHaveComputedRole("tablist");
  await expect(page.getByTestId("radiogroup")).toHaveComputedRole("radiogroup");
  await expect(page.getByTestId("listbox")).toHaveComputedRole("listbox");
  await expect(page.getByTestId("menu")).toHaveComputedRole("menu");
  await expect(page.getByTestId("menubar")).toHaveComputedRole("menubar");
});

test("should infer ARIA roles for custom element owners", async ({ page }) => {
  await setupPage(
    page,
    `
    <my-element data-testid="toolbar" focusgroup="toolbar"></my-element>
    <my-element data-testid="tablist" focusgroup="tablist"></my-element>
    <my-element data-testid="radiogroup" focusgroup="radiogroup"></my-element>
    <my-element data-testid="listbox" focusgroup="listbox"></my-element>
    <my-element data-testid="menu" focusgroup="menu"></my-element>
    <my-element data-testid="menubar" focusgroup="menubar"></my-element>
  `,
  );

  await expect(page.getByTestId("toolbar")).toHaveComputedRole("toolbar");
  await expect(page.getByTestId("tablist")).toHaveComputedRole("tablist");
  await expect(page.getByTestId("radiogroup")).toHaveComputedRole("radiogroup");
  await expect(page.getByTestId("listbox")).toHaveComputedRole("listbox");
  await expect(page.getByTestId("menu")).toHaveComputedRole("menu");
  await expect(page.getByTestId("menubar")).toHaveComputedRole("menubar");
});

// ax-role-inference-children.html
test("should infer ARIA roles for items", async ({ page }) => {
  await setupPage(
    page,
    `
    <div focusgroup="tablist">
      <span tabindex="0" data-testid="tablist-item-span"></span>
      <div tabindex="0" data-testid="tablist-item-div"></div>
      <button data-testid="tablist-item-button"></button>
      <my-element tabindex="0" data-testid="tablist-item-ce"></my-element>
    </div>
    <div focusgroup="radiogroup">
      <span tabindex="0" data-testid="radiogroup-item-span"></span>
      <div tabindex="0" data-testid="radiogroup-item-div"></div>
      <button data-testid="radiogroup-item-button"></button>
      <my-element tabindex="0" data-testid="radiogroup-item-ce"></my-element>
    </div>
    <div focusgroup="listbox">
      <span tabindex="0" data-testid="listbox-item-span"></span>
      <div tabindex="0" data-testid="listbox-item-div"></div>
      <button data-testid="listbox-item-button"></button>
      <my-element tabindex="0" data-testid="listbox-item-ce"></my-element>
    </div>
    <div focusgroup="menu">
      <span tabindex="0" data-testid="menu-item-span"></span>
      <div tabindex="0" data-testid="menu-item-div"></div>
      <button data-testid="menu-item-button"></button>
      <my-element tabindex="0" data-testid="menu-item-ce"></my-element>
    </div>
    <div focusgroup="menubar">
      <span tabindex="0" data-testid="menubar-item-span"></span>
      <div tabindex="0" data-testid="menubar-item-div"></div>
      <button data-testid="menubar-item-button"></button>
      <my-element tabindex="0" data-testid="menubar-item-ce"></my-element>
    </div>
  `,
  );

  await expect(page.getByTestId("tablist-item-span")).toHaveComputedRole("tab");
  await expect(page.getByTestId("tablist-item-div")).toHaveComputedRole("tab");
  await expect(page.getByTestId("tablist-item-button")).toHaveComputedRole(
    "tab",
  );
  await expect(page.getByTestId("tablist-item-ce")).toHaveComputedRole("tab");
  await expect(page.getByTestId("radiogroup-item-span")).toHaveComputedRole(
    "radio",
  );
  await expect(page.getByTestId("radiogroup-item-div")).toHaveComputedRole(
    "radio",
  );
  await expect(page.getByTestId("radiogroup-item-button")).toHaveComputedRole(
    "radio",
  );
  await expect(page.getByTestId("radiogroup-item-ce")).toHaveComputedRole(
    "radio",
  );
  await expect(page.getByTestId("listbox-item-span")).toHaveComputedRole(
    "option",
  );
  await expect(page.getByTestId("listbox-item-div")).toHaveComputedRole(
    "option",
  );
  await expect(page.getByTestId("listbox-item-button")).toHaveComputedRole(
    "option",
  );
  await expect(page.getByTestId("listbox-item-ce")).toHaveComputedRole(
    "option",
  );
  await expect(page.getByTestId("menu-item-span")).toHaveComputedRole(
    "menuitem",
  );
  await expect(page.getByTestId("menu-item-div")).toHaveComputedRole(
    "menuitem",
  );
  await expect(page.getByTestId("menu-item-button")).toHaveComputedRole(
    "menuitem",
  );
  await expect(page.getByTestId("menu-item-ce")).toHaveComputedRole("menuitem");
  await expect(page.getByTestId("menubar-item-span")).toHaveComputedRole(
    "menuitem",
  );
  await expect(page.getByTestId("menubar-item-div")).toHaveComputedRole(
    "menuitem",
  );
  await expect(page.getByTestId("menubar-item-button")).toHaveComputedRole(
    "menuitem",
  );
  await expect(page.getByTestId("menubar-item-ce")).toHaveComputedRole(
    "menuitem",
  );
});

test("owner and items with a non-generic native role do not get inferred roles", async ({
  page,
}) => {
  await setupPage(
    page,
    `
    <nav data-testid="tablist" focusgroup="tablist">
      <a href="" data-testid="tab">tab</a>
    </nav>
  `,
  );

  await expect(page.getByTestId("tablist")).not.toHaveComputedRole("tablist");
  await expect(page.getByTestId("tab")).not.toHaveComputedRole("tab");
});
