import { expect, test } from "@playwright/test";

const fixture = (name) => `/tests/fixtures/${name}.html`;

test.describe("declarative partial updates polyfill", () => {
  test("basic replacement: start/end range replaced by template content", async ({
    page,
  }) => {
    await page.goto(fixture("basic-replacement"));

    const section = page.locator("section[marker=gallery]");
    await expect(section.locator("p")).toHaveText("Actual gallery content");
    // "Loading..." placeholder should be gone
    await expect(section).not.toContainText("Loading...");
    // Template should be removed from DOM
    await expect(page.locator("template[for=gallery]")).toHaveCount(0);
  });

  test("marker insertion: content inserted at marker point", async ({
    page,
  }) => {
    await page.goto(fixture("marker-insertion"));

    const items = page.locator("ul[marker=list] li");
    await expect(items).toHaveCount(3);
    await expect(items.nth(0)).toHaveText("first item");
    await expect(items.nth(1)).toHaveText("middle item");
    await expect(items.nth(2)).toHaveText("last item");
  });

  test("start-only range: content from start to end of parent replaced", async ({
    page,
  }) => {
    await page.goto(fixture("start-only"));

    const div = page.locator("div[marker=results]");
    await expect(div).not.toContainText("Loading results...");
    await expect(div.locator("p").nth(0)).toHaveText("Result 1");
    await expect(div.locator("p").nth(1)).toHaveText("Result 2");
  });

  test("multiple named ranges: separate patches for different ranges", async ({
    page,
  }) => {
    await page.goto(fixture("multiple-ranges"));

    const div = page.locator("div[marker='part-one part-two']");
    // Placeholders gone
    await expect(div).not.toContainText("Placeholder content");
    // Parts replaced
    await expect(div.locator("p").nth(0)).toHaveText(
      "Actual 1st part of the content",
    );
    await expect(div.locator("p").nth(1)).toHaveText(
      "Actual 2nd part of the content",
    );
    // <hr> separator should still be present
    await expect(div.locator("hr")).toHaveCount(1);
  });

  test("interleaved patching: sequential templates with continuation markers", async ({
    page,
  }) => {
    await page.goto(fixture("interleaved"));

    const div = page.locator("div[marker=search-results]");
    await expect(div).not.toContainText("Loading...");

    const paragraphs = div.locator("p");
    await expect(paragraphs).toHaveCount(3);
    await expect(paragraphs.nth(0)).toHaveText("first result");
    await expect(paragraphs.nth(1)).toHaveText("second result");
    await expect(paragraphs.nth(2)).toHaveText("third result");
  });

  test("no markers fallback: content appended to target", async ({ page }) => {
    await page.goto(fixture("no-markers"));

    const div = page.locator("div[marker=appendable]");
    await expect(div.locator("p")).toHaveText("Appended content");
  });

  test("failed patch: template remains in DOM when target not found", async ({
    page,
  }) => {
    await page.goto(fixture("failed-patch"));

    // Template should still be present (patch failed)
    await expect(page.locator("template[for=nonexistent]")).toHaveCount(1);
    // Container unchanged
    await expect(page.locator("div[marker=other]")).toHaveText(
      "No matching marker element here",
    );
  });

  test("dynamic patching: observe() handles templates added after load", async ({
    page,
  }) => {
    await page.goto(fixture("dynamic"));

    // Wait for the microtask-queued template to be processed
    const section = page.locator("section[marker=dynamic]");
    await expect(section.locator("p")).toHaveText("Dynamically patched", {
      timeout: 2000,
    });
    await expect(section).not.toContainText("Placeholder");
  });

  test("bare marker: unnamed <?marker> replaced by template content", async ({
    page,
  }) => {
    await page.goto(fixture("bare-marker"));

    const section = page.locator("section[marker=gallery]");
    await expect(section.locator("p")).toHaveText("Actual gallery content");
    await expect(page.locator("template[for=gallery]")).toHaveCount(0);
  });

  test("bare start/end: unnamed <?start>/<?end> replaced by template content", async ({
    page,
  }) => {
    await page.goto(fixture("bare-start-end"));

    const section = page.locator("section[marker=gallery]");
    await expect(section.locator("p")).toHaveText("Actual gallery content");
    await expect(section).not.toContainText("Loading...");
  });

  test("hash syntax: for='element#marker' targets a specific named marker", async ({
    page,
  }) => {
    await page.goto(fixture("hash-syntax"));

    const section = page.locator("section[marker=gallery]");
    await expect(section.locator("p")).toHaveText("Actual gallery content");
    await expect(section).not.toContainText("Loading...");
  });

  test("nested markers: markers inside child elements are found and replaced", async ({
    page,
  }) => {
    await page.goto(fixture("nested-markers"));

    const section = page.locator("section[marker=gallery]");
    // Inner content replaced, outer "Loading..." still present
    await expect(section.locator("p")).toHaveText("Inner content replaced");
    await expect(section).toContainText("Loading...");
    await expect(section).not.toContainText("Loading inner...");
  });

  test("single-quoted name: name='x' is parsed correctly", async ({ page }) => {
    await page.goto(fixture("single-quoted"));

    const section = page.locator("section[marker=gallery]");
    await expect(section.locator("p")).toHaveText("Actual gallery content");
    await expect(section).not.toContainText("Loading...");
  });
});
