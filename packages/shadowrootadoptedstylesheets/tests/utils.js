/**
 * @param {import("@playwright/test").Page} page
 * @param {string} channel
 */
export async function setupPage(page, channel) {
  await page.goto("/tests/");
  if (channel !== "chrome-canary") {
    await page.evaluate(() => {
      import("/src/index.js").then(({ install }) => {
        install();
      });
    });
  }
}
