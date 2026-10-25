import assert from "node:assert/strict";
import { createRequire } from "node:module";
import test from "node:test";
import postcssAtFunction, {
  postcssAtFunction as namedPostcssAtFunction,
} from "@microsoft/postcss-at-function";
import postcss from "postcss";

test("exports the ESM PostCSS plugin", () => {
  assert.equal(typeof postcssAtFunction, "function");
  assert.equal(namedPostcssAtFunction, postcssAtFunction);
  assert.equal(postcssAtFunction.postcss, true);
});

test("exports the CommonJS PostCSS plugin", () => {
  const require = createRequire(import.meta.url);
  const plugin = require("@microsoft/postcss-at-function");

  assert.equal(typeof plugin, "function");
  assert.equal(plugin.default, plugin);
  assert.equal(plugin.postcssAtFunction, plugin);
  assert.equal(plugin.postcss, true);
});

test("passes the CommonJS export directly to PostCSS", async () => {
  const require = createRequire(import.meta.url);
  const plugin = require("@microsoft/postcss-at-function");
  const result = await postcss([plugin]).process(
    `
      @function --size() { result: 10px; }
      .example { width: --size(); }
    `,
    { from: undefined },
  );

  assert.equal(result.css.trim(), ".example { width: 10px; }");
});
