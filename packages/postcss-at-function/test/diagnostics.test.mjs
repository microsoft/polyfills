import assert from "node:assert/strict";
import test from "node:test";
import {
  declarationValues,
  functionRuleCount,
  processCss,
  warningCodes,
} from "./helpers.mjs";

test("diagnoses conditional rules inside a function body", async () => {
  const result = await processCss(`
		@function --responsive(--small, --large) {
			result: var(--large);
			@media (width < 700px) {
				result: var(--small);
			}
		}
		.example { width: --responsive(10px, 20px); }
	`);

  assert.deepEqual(declarationValues(result, "width"), [
    "--responsive(10px, 20px)",
  ]);
  assert.equal(functionRuleCount(result), 1);
  assert.ok(warningCodes(result).includes("unsupported-conditional-body"));
  assert.ok(
    result.warnings.every(
      (warning) => warning.plugin === "@microsoft/postcss-at-function",
    ),
  );
});

test("diagnoses conditionally defined functions", async () => {
  const result = await processCss(`
		@media (width > 1px) {
			@function --conditional() { result: 1px; }
		}
		.example { width: --conditional(); }
	`);

  assert.deepEqual(declarationValues(result, "width"), ["--conditional()"]);
  assert.ok(warningCodes(result).includes("unsupported-definition-context"));
});

test("strict mode throws instead of warning", async () => {
  await assert.rejects(
    processCss(
      `
				@function --bad(--value <length>) { result: var(--value); }
				.example { width: --bad(red); }
			`,
      { strict: true },
    ),
    (error) => {
      assert.match(error.message, /\[invalid-argument-type\]/);
      return true;
    },
  );
});

test("rejects whitespace between a function name and parameter parentheses", async () => {
  const result = await processCss(`
		@function --bad () { result: 1px; }
		.example { width: --bad(); }
	`);

  assert.ok(warningCodes(result).includes("invalid-function-prelude"));
  assert.equal(functionRuleCount(result), 1);
});

test("diagnoses empty call arguments", async () => {
  const result = await processCss(`
		@function --pair(--a, --b) { result: var(--a) var(--b); }
		.example { --actual: --pair(1,); }
	`);

  assert.deepEqual(declarationValues(result, "--actual"), ["--pair(1,)"]);
  assert.ok(warningCodes(result).includes("invalid-function-call"));
});

test("diagnoses missing nested definitions", async () => {
  const result = await processCss(`
		@function --outer() { result: --missing(); }
		.example { --actual: --outer(); }
	`);

  assert.deepEqual(declarationValues(result, "--actual"), ["--outer()"]);
  assert.ok(warningCodes(result).includes("missing-nested-function"));
  assert.equal(functionRuleCount(result), 1);
});

test("rejects !important in parameter defaults", async () => {
  const result = await processCss(`
		@function --bad-default(--value: red !important) {
			result: var(--value);
		}
		.example { color: --bad-default(); }
	`);

  assert.ok(warningCodes(result).includes("invalid-function-prelude"));
  assert.equal(functionRuleCount(result), 1);
});

test("ignores unrelated important descriptors in function bodies", async () => {
  const result = await processCss(`
		@function --size() {
			color: red !important;
			result: 1px;
		}
		.example { width: --size(); }
	`);

  assert.deepEqual(declarationValues(result, "width"), ["1px"]);
  assert.deepEqual(warningCodes(result), []);
});
