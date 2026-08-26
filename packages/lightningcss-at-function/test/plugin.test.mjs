import assert from "node:assert/strict";
import test from "node:test";
import { transform } from "lightningcss";
import atFunction, { atFunctionCustomAtRules } from "../build/index.mjs";
import {
  declarationValues,
  functionRuleCount,
  processCss,
  warningCodes,
} from "./helpers.mjs";

test("works as a direct Lightning CSS visitor plugin", () => {
  const diagnostics = [];
  const result = transform({
    code: Buffer.from(`
			@function --double(--value) {
				result: calc(var(--value) * 2);
			}
			.example { width: --double(10px); }
		`),
    customAtRules: atFunctionCustomAtRules,
    filename: "test.css",
    minify: true,
    visitor: atFunction({
      onDiagnostic(diagnostic) {
        diagnostics.push(diagnostic);
      },
    }),
  });

  assert.equal(result.code.toString(), ".example{width:calc(10px * 2)}");
  assert.deepEqual(diagnostics, []);
});

test("replaces a basic call and removes its definition", async () => {
  const result = await processCss(`
		@function --double(--value) {
			result: calc(var(--value) * 2);
		}
		.example { width: --double(10px); }
	`);

  assert.deepEqual(declarationValues(result, "width"), ["calc(10px * 2)"]);
  assert.equal(functionRuleCount(result), 0);
  assert.deepEqual(warningCodes(result), []);
});

test("preserve mode inserts a fallback before the native declaration", async () => {
  const result = await processCss(
    `
			@function --double(--value) {
				result: calc(var(--value) * 2);
			}
			.example { width: --double(10px); }
		`,
    { preserve: true },
  );

  assert.deepEqual(declarationValues(result, "width"), [
    "calc(10px * 2)",
    "--double(10px)",
  ]);
  assert.equal(functionRuleCount(result), 1);
});

test("diagnoses preserve mode on custom properties", async () => {
  const result = await processCss(
    `
			@function --double(--value) {
				result: calc(var(--value) * 2);
			}
			.example { --size: --double(10px); }
		`,
    { preserve: true },
  );

  assert.deepEqual(declarationValues(result, "--size"), ["--double(10px)"]);
  assert.equal(functionRuleCount(result), 1);
  assert.ok(
    warningCodes(result).includes("unsupported-preserve-custom-property"),
  );
});

test("diagnoses preserve mode on unknown properties", async () => {
  const result = await processCss(
    `
			@function --double(--value) {
				result: calc(var(--value) * 2);
			}
			.example { future-size: --double(10px); }
		`,
    { preserve: true },
  );

  assert.deepEqual(declarationValues(result, "future-size"), [
    "--double(10px)",
  ]);
  assert.equal(functionRuleCount(result), 1);
  assert.ok(
    warningCodes(result).includes("unsupported-preserve-custom-property"),
  );
});

test("preserves known keyword properties", async () => {
  const result = await processCss(
    `
			@function --float-side() {
				result: left;
			}
			.example { float: --float-side(); }
		`,
    { preserve: true },
  );

  assert.deepEqual(declarationValues(result, "float"), [
    "left",
    "--float-side()",
  ]);
  assert.equal(functionRuleCount(result), 1);
  assert.deepEqual(warningCodes(result), []);
});

test("leaves unknown dashed functions untouched without warnings", async () => {
  const result = await processCss(
    ".example { width: --defined-elsewhere(10px); }",
  );

  assert.deepEqual(declarationValues(result, "width"), [
    "--defined-elsewhere(10px)",
  ]);
  assert.deepEqual(warningCodes(result), []);
});

test("removes unused supported definitions", async () => {
  const result = await processCss(`
		@function --unused() { result: 1px; }
		.example { width: 2px; }
	`);

  assert.equal(functionRuleCount(result), 0);
});

test("uses the last same-scope definition in source order", async () => {
  const result = await processCss(`
		@function --size() { result: 1px; }
		@function --size() { result: 2px; }
		.example { width: --size(); }
	`);

  assert.deepEqual(declarationValues(result, "width"), ["2px"]);
  assert.equal(functionRuleCount(result), 0);
});

test("rolls back an entire declaration when one known call fails", async () => {
  const original = "calc(--ok(1px) + --needs-arg())";
  const result = await processCss(`
		@function --ok(--value) { result: var(--value); }
		@function --needs-arg(--value) { result: var(--value); }
		.example { width: ${original}; }
	`);

  assert.deepEqual(declarationValues(result, "width"), [original]);
  assert.equal(functionRuleCount(result), 2);
  assert.ok(warningCodes(result).includes("invalid-argument-count"));
});

test("retains transitive helper definitions behind an unresolved call", async () => {
  const result = await processCss(`
		@function --inner() { result: 1px; }
		@function --outer(--value <length>) {
			result: --inner() var(--value);
		}
		.example { width: --outer(var(--runtime)); }
	`);

  assert.deepEqual(declarationValues(result, "width"), [
    "--outer(var(--runtime))",
  ]);
  assert.equal(functionRuleCount(result), 2);
  assert.ok(result.css.includes("@function --inner()"));
  assert.ok(warningCodes(result).includes("indeterminate-argument-type"));
});
