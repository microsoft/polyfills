// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { setupPage as setupBehaviorPage } from "../../tests/utils.js";

export { expect, pressTab } from "../../tests/utils.js";

export async function setupPage(page, project, html) {
  await routeTestBuild(page);
  return setupBehaviorPage(page, project, html, { forcePolyfill: true });
}

export async function routeTestBuild(page) {
  if (process.env.FOCUSGROUP_TEST_BUILD) {
    await page.route("**/build/**", async (route) => {
      const file = new URL(route.request().url()).pathname.slice(
        "/build/".length,
      );
      await route.fulfill({
        contentType: "text/javascript",
        body: await readFile(join(process.env.FOCUSGROUP_TEST_BUILD, file)),
      });
    });
  }
}
