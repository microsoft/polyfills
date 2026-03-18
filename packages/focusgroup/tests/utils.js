import { expect as baseExpect } from "@playwright/test";

/**
 * Navigate to the dev server, set the page HTML, and apply the focusgroup polyfill.
 * @param {import('@playwright/test').Page} page
 * @param {string} html - HTML body content to set
 */
export async function setupPage(page, html) {
  await page.goto("/test.html");
  await page.setContent(html);
  await page.evaluate(async () => {
    const { polyfill } = await import("/src/polyfill.js");
    polyfill();
  });
}

/**
 * Extended expect with a toHaveComputedRole matcher.
 * Uses element.computedRole on Chromium (the only browser that supports it);
 * falls back to toHaveRole() on Firefox and WebKit.
 */
export const expect = baseExpect.extend({
  async toHaveComputedRole(locator, role, options) {
    const assertionName = "toHaveComputedRole";
    const supportsComputedRole = await locator.page().evaluate(() => {
      return "computedRole" in HTMLElement.prototype;
    });
    let pass = false;
    let matcherResult;

    try {
      if (supportsComputedRole) {
        await baseExpect(locator).toHaveJSProperty(
          "computedRole",
          role,
          options,
        );
      } else {
        await baseExpect(locator).toHaveRole(role, options);
      }
      pass = true;
    } catch (e) {
      matcherResult = e.matcherResult;
    }

    const message = pass
      ? () =>
          this.utils.matcherHint(assertionName, undefined, undefined, {
            isNot: this.isNot,
          }) +
          `\n\nLocator: ${locator}\nExpected: not ${this.utils.printExpected(role)}\n` +
          (matcherResult
            ? `Received: ${this.utils.printReceived(matcherResult.actual)}`
            : "")
      : () =>
          this.utils.matcherHint(assertionName, undefined, undefined, {
            isNot: this.isNot,
          }) +
          `\n\nLocator: ${locator}\nExpected: ${this.utils.printExpected(role)}\n` +
          (matcherResult
            ? `Received: ${this.utils.printReceived(matcherResult.actual)}`
            : "");

    return {
      message,
      pass,
      name: assertionName,
      expected: role,
      actual: matcherResult?.actual,
    };
  },
});
