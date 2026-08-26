import { lexer } from "css-tree";
import type { Declaration, Node, PluginCreator, Result } from "postcss";
import {
  type Diagnostic,
  type DiagnosticReporter,
  reportDiagnostic,
  TRANSFORM_NAME,
} from "./diagnostics.js";
import type { AtFunctionOptions } from "./options.js";
import {
  collectDefinitions,
  definitionDependencies,
} from "./postcss/definitions.js";
import { evaluateDeclarationValue } from "./postcss/evaluate.js";
import type { DefinitionCollection } from "./postcss/model.js";

function isInsideFunction(node: Node): boolean {
  let parent = node.parent;

  while (parent) {
    if (
      parent.type === "atrule" &&
      "name" in parent &&
      typeof parent.name === "string" &&
      parent.name.toLowerCase() === "function"
    ) {
      return true;
    }
    parent = parent.parent;
  }

  return false;
}

function mayContainCustomFunction(declaration: Declaration): boolean {
  return declaration.value.includes("--") && declaration.value.includes("(");
}

function isCustomOrUnknownProperty(property: string): boolean {
  if (property.startsWith("--")) {
    return true;
  }

  return (
    lexer.matchProperty(property, "initial").error?.name ===
    "SyntaxReferenceError"
  );
}

function nodeLocation(node: Node): Diagnostic["loc"] {
  const start = node.source?.start;
  return start
    ? {
        column: start.column,
        line: start.line - 1,
        source_index: 0,
      }
    : undefined;
}

function emitDiagnostic(
  reporter: DiagnosticReporter,
  diagnostic: Diagnostic,
  node: Node,
  result: Result,
): void {
  const located = {
    ...diagnostic,
    loc: diagnostic.loc ?? nodeLocation(node),
  };
  if (!reportDiagnostic(reporter, located)) {
    return;
  }

  node.warn(result, `[${located.code}] ${located.message}`, {
    plugin: TRANSFORM_NAME,
  });
}

function retainedFunctionNames(
  collection: DefinitionCollection,
  unresolvedFunctions: Set<string>,
): Set<string> {
  const retained = new Set(unresolvedFunctions);

  for (const record of collection.records) {
    if (record.definition && record.issues.length > 0) {
      retained.add(record.definition.name);
    }
  }

  let retainedCount = -1;
  while (retainedCount !== retained.size) {
    retainedCount = retained.size;

    for (const record of collection.records) {
      if (!record.definition || !retained.has(record.definition.name)) {
        continue;
      }

      for (const dependency of definitionDependencies(record.definition)) {
        if (collection.registry.has(dependency)) {
          retained.add(dependency);
        }
      }
    }
  }

  return retained;
}

/** Create a PostCSS plugin that resolves statically evaluable `@function` calls. */
const creator: PluginCreator<AtFunctionOptions> = (
  options: AtFunctionOptions = {},
) => {
  const preserve = options.preserve ?? false;
  const strict = options.strict ?? false;

  return {
    postcssPlugin: TRANSFORM_NAME,
    Once(root, { result }) {
      const reporter: DiagnosticReporter = {
        diagnostics: [],
        onDiagnostic: options.onDiagnostic,
        seen: new Set(),
        strict,
      };
      const collection = collectDefinitions(root);
      const unresolvedFunctions = new Set<string>();

      for (const diagnostic of collection.diagnostics) {
        const record = collection.records.find((candidate) =>
          candidate.issues.includes(diagnostic),
        );
        emitDiagnostic(reporter, diagnostic, record?.atRule ?? root, result);
      }

      root.walkDecls((declaration) => {
        if (
          isInsideFunction(declaration) ||
          !mayContainCustomFunction(declaration)
        ) {
          return;
        }

        const evaluated = evaluateDeclarationValue(
          declaration.value,
          collection.registry,
        );

        if (!evaluated.ok) {
          for (const name of evaluated.referencedFunctions) {
            unresolvedFunctions.add(name);
          }
          emitDiagnostic(reporter, evaluated.diagnostic, declaration, result);
          return;
        }

        if (!evaluated.changed || evaluated.value === declaration.value) {
          return;
        }

        if (preserve && isCustomOrUnknownProperty(declaration.prop)) {
          for (const name of evaluated.referencedFunctions) {
            unresolvedFunctions.add(name);
          }
          emitDiagnostic(
            reporter,
            {
              code: "unsupported-preserve-custom-property",
              message:
                "Downstream CSS processors may collapse duplicate custom or unknown property fallbacks, so preserve mode leaves this declaration unchanged.",
            },
            declaration,
            result,
          );
          return;
        }

        if (preserve) {
          declaration.cloneBefore({ value: evaluated.value });
          return;
        }

        declaration.value = evaluated.value;
      });

      if (preserve) {
        return;
      }

      const retained = retainedFunctionNames(collection, unresolvedFunctions);

      for (const record of collection.records) {
        const name = record.definition?.name;
        if (
          record.definition &&
          record.issues.length === 0 &&
          name &&
          !retained.has(name)
        ) {
          record.atRule.remove();
        }
      }
    },
  };
};

creator.postcss = true;

export default creator;
export type { Diagnostic } from "./diagnostics.js";
export { AtFunctionTransformError } from "./diagnostics.js";
export type { AtFunctionOptions } from "./options.js";
export { creator as postcssAtFunction };
