import { transformAtFunctions } from "../build/index.mjs";

export async function processCss(css, options = {}) {
  const transformed = transformAtFunctions({
    atFunction: options,
    code: Buffer.from(css),
    filename: "test.css",
    minify: true,
  });

  return {
    css: transformed.code.toString(),
    diagnostics: transformed.diagnostics,
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
    values.push(match[1]);
    match = pattern.exec(result.css);
  }

  return values;
}

export function functionRuleCount(result) {
  return result.css.match(/@function\b/g)?.length ?? 0;
}

export function warningCodes(result) {
  return result.diagnostics.map((diagnostic) => diagnostic.code);
}
