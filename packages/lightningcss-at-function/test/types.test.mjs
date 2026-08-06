import assert from "node:assert/strict";
import test from "node:test";
import {
  declarationValues,
  functionRuleCount,
  processCss,
  warningCodes,
} from "./helpers.mjs";

test("accepts a statically valid shorthand parameter type", async () => {
  const result = await processCss(`
		@function --identity(--value <length>) returns <length> {
			result: var(--value);
		}
		.example { width: --identity(10px); }
	`);

  assert.deepEqual(declarationValues(result, "width"), ["10px"]);
  assert.deepEqual(warningCodes(result), []);
});

test("accepts type() unions and list-free values", async () => {
  const result = await processCss(`
		@function --alpha(--value type(<number> | <percentage>)) {
			result: var(--value);
		}
		.example { opacity: --alpha(50%); }
	`);

  assert.deepEqual(declarationValues(result, "opacity"), ["50.0%"]);
});

test("accepts a statically typed calc value", async () => {
  const result = await processCss(`
		@function --identity(--value <length>) returns <length> {
			result: var(--value);
		}
		.example { width: --identity(calc(10px + 2px)); }
	`);

  assert.deepEqual(declarationValues(result, "width"), ["calc(10px + 2px)"]);
});

test("uses a default for a statically invalid typed argument", async () => {
  const result = await processCss(`
		@function --size(--value <length>: 12px) returns <length> {
			result: var(--value);
		}
		.example { width: --size(red); }
	`);

  assert.deepEqual(declarationValues(result, "width"), ["12px"]);
});

test("leaves a statically invalid typed argument unchanged without a default", async () => {
  const original = "--size(red)";
  const result = await processCss(`
		@function --size(--value <length>) returns <length> {
			result: var(--value);
		}
		.example { width: ${original}; }
	`);

  assert.deepEqual(declarationValues(result, "width"), [original]);
  assert.equal(functionRuleCount(result), 1);
  assert.ok(warningCodes(result).includes("invalid-argument-type"));
});

test("defers typed runtime-dependent arguments", async () => {
  const original = "--size(var(--runtime-size))";
  const result = await processCss(`
		@function --size(--value <length>) returns <length> {
			result: var(--value);
		}
		.example { width: ${original}; }
	`);

  assert.deepEqual(declarationValues(result, "width"), [original]);
  assert.ok(warningCodes(result).includes("indeterminate-argument-type"));
});

test("accepts runtime-dependent values for type(*)", async () => {
  const result = await processCss(`
		@function --identity(--value type(*)) returns type(*) {
			result: var(--value);
		}
		.example { --actual: --identity(var(--runtime-value)); }
	`);

  assert.deepEqual(declarationValues(result, "--actual"), [
    "var(--runtime-value)",
  ]);
});

test("diagnoses an invalid return type", async () => {
  const result = await processCss(`
		@function --bad() returns <length> {
			result: red;
		}
		.example { width: --bad(); }
	`);

  assert.deepEqual(declarationValues(result, "width"), ["--bad()"]);
  assert.ok(warningCodes(result).includes("invalid-return-type"));
});

test("rejects an unknown parameter type in a definition", async () => {
  const result = await processCss(`
		@function --bad(--value <dino>) {
			result: var(--value);
		}
		.example { --actual: --bad(1); }
	`);

  assert.ok(warningCodes(result).includes("invalid-function-prelude"));
  assert.equal(functionRuleCount(result), 1);
});

test("rejects a statically invalid typed default", async () => {
  const result = await processCss(`
		@function --bad(--value <length>: red) {
			result: var(--value);
		}
		.example { width: --bad(); }
	`);

  assert.ok(warningCodes(result).includes("invalid-function-prelude"));
  assert.equal(functionRuleCount(result), 1);
});
