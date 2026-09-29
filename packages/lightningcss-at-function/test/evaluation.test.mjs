import assert from "node:assert/strict";
import test from "node:test";
import {
  declarationValues,
  functionRuleCount,
  processCss,
  warningCodes,
} from "./helpers.mjs";

test("resolves defaults and last local declarations regardless of position", async () => {
  const result = await processCss(`
		@function --size(--base: 2px) {
			result: var(--computed);
			--computed: calc(var(--base) + 1px);
			--computed: calc(var(--base) + 2px);
		}
		.example { width: --size(); }
	`);

  assert.deepEqual(declarationValues(result, "width"), ["calc(2px + 2px)"]);
});

test("resolves defaults that reference other parameters", async () => {
  const result = await processCss(`
		@function --pair(--x: 5px, --y: var(--x)) {
			result: var(--x) var(--y);
		}
		.example { --actual: --pair(); }
	`);

  assert.deepEqual(declarationValues(result, "--actual"), ["5px 5px"]);
});

test("makes outer parameters and locals visible to nested functions", async () => {
  const result = await processCss(`
		@function --outer(--x) {
			--y: 2;
			result: --inner();
		}
		@function --inner() {
			result: calc(var(--x) + var(--y));
		}
		.example { z-index: --outer(1); }
	`);

  assert.deepEqual(declarationValues(result, "z-index"), ["calc(1 + 2)"]);
});

test("preserves safe call-site custom property references", async () => {
  const result = await processCss(`
		@function --double(--value) {
			result: calc(var(--value) * 2);
		}
		.example { width: --double(var(--space)); }
	`);

  assert.deepEqual(declarationValues(result, "width"), [
    "calc(var(--space) * 2)",
  ]);
  assert.deepEqual(warningCodes(result), []);
});

test("supports comma-containing arguments wrapped in braces", async () => {
  const result = await processCss(`
		@function --join(--list, --tail) {
			result: var(--list) / var(--tail);
		}
		.example { --actual: --join({1px, 2px}, 3px); }
	`);

  assert.deepEqual(declarationValues(result, "--actual"), ["1px, 2px / 3px"]);
});

test("unwraps comma-containing default values wrapped in braces", async () => {
  const result = await processCss(`
		@function --list(--value <length>#: {1px, 2px}) returns <length># {
			result: var(--value);
		}
		.example { --actual: --list(); }
	`);

  assert.deepEqual(declarationValues(result, "--actual"), ["1px, 2px"]);
  assert.deepEqual(warningCodes(result), []);
});

test("warns when runtime validity controls a parameter fallback", async () => {
  const original = "--identity(var(--external))";
  const result = await processCss(`
		@function --identity(--value) {
			result: var(--value, 1px);
		}
		.example { width: ${original}; }
	`);

  assert.deepEqual(declarationValues(result, "width"), [original]);
  assert.equal(functionRuleCount(result), 1);
  assert.ok(warningCodes(result).includes("indeterminate-substitution"));
});

test("detects recursive custom functions", async () => {
  const result = await processCss(`
		@function --a() { result: --b(); }
		@function --b() { result: --a(); }
		.example { --actual: --a(); }
	`);

  assert.deepEqual(declarationValues(result, "--actual"), ["--a()"]);
  assert.ok(warningCodes(result).includes("cyclic-function"));
  assert.equal(functionRuleCount(result), 2);
});

test("detects cyclic local bindings", async () => {
  const result = await processCss(`
		@function --cycle() {
			--a: var(--b);
			--b: var(--a);
			result: 1px;
		}
		.example { width: --cycle(); }
	`);

  assert.deepEqual(declarationValues(result, "width"), ["--cycle()"]);
  assert.ok(warningCodes(result).includes("cyclic-binding"));
});

test("diagnoses CSS-wide local scope behavior", async () => {
  const result = await processCss(`
		@function --scope(--value) {
			--value: initial;
			result: var(--value);
		}
		.example { width: --scope(1px); }
	`);

  assert.deepEqual(declarationValues(result, "width"), ["--scope(1px)"]);
  assert.ok(warningCodes(result).includes("unsupported-css-wide-keyword"));
});

test("substitutes parameters inside unresolved color alpha channels", async () => {
  const result = await processCss(`
		@function --alpha-color(--alpha) {
			result: rgb(255 0 0 / var(--alpha));
		}
		.example { color: --alpha-color(0.5); }
	`);

  assert.ok(!result.css.includes("var(--alpha)"));
  assert.equal(functionRuleCount(result), 0);
  assert.deepEqual(warningCodes(result), []);
});

test("substitutes locals inside unresolved color alpha channels", async () => {
  const result = await processCss(`
		@function --alpha-color() {
			--alpha: 0.25;
			result: rgb(0 0 0 / var(--alpha));
		}
		.example { color: --alpha-color(); }
	`);

  assert.ok(!result.css.includes("var(--alpha)"));
  assert.equal(functionRuleCount(result), 0);
  assert.deepEqual(warningCodes(result), []);
});

test("substitutes case-insensitive var function names", async () => {
  const result = await processCss(`
		@function --identity(--value) {
			result: VAR(--value);
		}
		.example { color: --identity(red); }
	`);

  assert.deepEqual(declarationValues(result, "color"), ["red"]);
  assert.deepEqual(warningCodes(result), []);
});
