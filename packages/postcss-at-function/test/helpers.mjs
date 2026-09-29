import assert from "node:assert/strict";
import postcss from "postcss";
import postcssAtFunction from "../build/index.mjs";

export async function processCss(css, options = {}) {
  const diagnostics = [];
  const result = await postcss([
    postcssAtFunction({
      ...options,
      onDiagnostic(diagnostic) {
        diagnostics.push(diagnostic);
        options.onDiagnostic?.(diagnostic);
      },
    }),
  ]).process(css, { from: undefined });

  return {
    css: result.css,
    diagnostics,
    warnings: result.warnings(),
  };
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function declarationValues(result, property) {
  const values = [];
  const pattern = new RegExp(`${escapeRegExp(property)}:([^;}]+)`, "g");
  let match = pattern.exec(result.css);

  while (match) {
    values.push(match[1].trim());
    match = pattern.exec(result.css);
  }

  return values;
}

export function functionRuleCount(result) {
  return result.css.match(/@function\b/g)?.length ?? 0;
}

export function warningCodes(result) {
  const diagnosticCodes = result.diagnostics.map(
    (diagnostic) => diagnostic.code,
  );
  const warningCodes = result.warnings.map((warning) => {
    const match = warning.text.match(/^\[([^\]]+)\]/);
    return match?.[1] ?? warning.text;
  });

  assert.deepEqual(warningCodes, diagnosticCodes);
  return diagnosticCodes;
}
