import assert from "node:assert/strict";
import { createRequire } from "node:module";
import test from "node:test";
import atFunction, {
  transformAtFunctions,
} from "@microsoft/lightningcss-at-function";

test("exports the ESM visitor and convenience transform", () => {
  assert.equal(typeof atFunction, "function");
  assert.equal(typeof transformAtFunctions, "function");
});

test("exports the CommonJS visitor and convenience transform", () => {
  const require = createRequire(import.meta.url);
  const module = require("@microsoft/lightningcss-at-function");

  assert.equal(typeof module.default, "function");
  assert.equal(typeof module.transformAtFunctions, "function");
});
