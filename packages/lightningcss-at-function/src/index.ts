import { lexer } from "css-tree";
import {
  type CustomAtRules,
  composeVisitors,
  type Declaration,
  type Location2,
  transform as lightningTransform,
  type Rule,
  type TokenOrValue,
  type TransformOptions,
  type TransformResult,
  type Visitor,
} from "lightningcss";
import {
  collectDefinitions,
  definitionDependencies,
  getAtFunctionRule,
} from "./definitions.js";
import {
  type Diagnostic,
  type DiagnosticReporter,
  reportDiagnostic,
} from "./diagnostics.js";
import { evaluateDeclarationValue } from "./evaluate.js";
import type { DefinitionCollection } from "./model.js";
import type { AtFunctionOptions } from "./options.js";

/** Lightning CSS grammar for parsing CSS custom function definitions. */
export const atFunctionCustomAtRules = {
  function: {
    body: "style-block",
    prelude: "*",
  },
} as const satisfies CustomAtRules;

export type AtFunctionCustomAtRules = typeof atFunctionCustomAtRules;

function declarationValues(
  declaration: Declaration,
): TokenOrValue[] | undefined {
  if (
    declaration.property === "custom" ||
    declaration.property === "unparsed"
  ) {
    return declaration.value.value;
  }
  return undefined;
}

function declarationPropertyName(declaration: Declaration): string {
  if (declaration.property === "custom") {
    return declaration.value.name;
  }
  if (declaration.property === "unparsed") {
    return declaration.value.propertyId.property;
  }
  return declaration.property;
}

function isCustomOrUnknownProperty(declaration: Declaration): boolean {
  const property = declarationPropertyName(declaration);
  if (property.startsWith("--")) {
    return true;
  }

  return (
    lexer.matchProperty(property, "initial").error?.name ===
    "SyntaxReferenceError"
  );
}

function replaceDeclarationValues(
  declaration: Declaration,
  value: TokenOrValue[],
): Declaration {
  const cloned = structuredClone(declaration);
  if (cloned.property === "custom" || cloned.property === "unparsed") {
    cloned.value.value = value;
  }
  removeNullProperties(cloned);
  return cloned;
}

function ruleLocation(rule: Rule): Location2 | undefined {
  if (rule.type === "ignored") {
    return undefined;
  }

  if (
    "value" in rule &&
    rule.value &&
    typeof rule.value === "object" &&
    "loc" in rule.value
  ) {
    return rule.value.loc as Location2;
  }

  return undefined;
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

function locationKey(location: Location2): string {
  return `${location.source_index}:${location.line}:${location.column}`;
}

function removeNullProperties(value: unknown): void {
  if (Array.isArray(value)) {
    for (const item of value) {
      removeNullProperties(item);
    }
    return;
  }

  if (!value || typeof value !== "object") {
    return;
  }

  for (const [key, item] of Object.entries(value)) {
    if (item === null) {
      delete (value as Record<string, unknown>)[key];
    } else {
      removeNullProperties(item);
    }
  }
}

function removableDefinitions(
  collection: DefinitionCollection,
  retained: Set<string>,
): Set<string> {
  const removable = new Set<string>();

  for (const record of collection.records) {
    if (
      record.topLevel &&
      record.definition &&
      record.issues.length === 0 &&
      !retained.has(record.definition.name)
    ) {
      removable.add(locationKey(record.rule.value.loc));
    }
  }

  return removable;
}

/**
 * Create a Lightning CSS visitor that resolves statically evaluable
 * `@function` calls.
 */
export default function atFunction(
  options: AtFunctionOptions = {},
): Visitor<AtFunctionCustomAtRules> {
  const preserve = options.preserve ?? false;
  const strict = options.strict ?? false;
  let collection: DefinitionCollection = {
    diagnostics: [],
    records: [],
    registry: new Map(),
  };
  let reporter: DiagnosticReporter = {
    diagnostics: [],
    onDiagnostic: options.onDiagnostic,
    seen: new Set(),
    strict,
  };
  let functionDepth = 0;
  let ruleStack: Rule[] = [];
  let unresolvedFunctions = new Set<string>();

  return {
    StyleSheet(stylesheet) {
      collection = collectDefinitions(stylesheet.rules);
      reporter = {
        diagnostics: [],
        onDiagnostic: options.onDiagnostic,
        seen: new Set(),
        strict,
      };
      functionDepth = 0;
      ruleStack = [];
      unresolvedFunctions = new Set();

      for (const diagnostic of collection.diagnostics) {
        reportDiagnostic(reporter, diagnostic);
      }
    },
    Rule(rule) {
      const typedRule = rule as Rule;
      ruleStack.push(typedRule);
      if (getAtFunctionRule(typedRule)) {
        functionDepth += 1;
      }
    },
    RuleExit(rule) {
      const typedRule = rule as Rule;
      if (getAtFunctionRule(typedRule)) {
        functionDepth -= 1;
      }
      ruleStack.pop();
    },
    Declaration(declaration) {
      if (functionDepth > 0) {
        return;
      }

      const value = declarationValues(declaration);
      if (!value) {
        return;
      }

      const evaluated = evaluateDeclarationValue(value, collection.registry);
      if (!evaluated.ok) {
        for (const name of evaluated.referencedFunctions) {
          unresolvedFunctions.add(name);
        }
        reportDiagnostic(reporter, {
          ...evaluated.diagnostic,
          loc: ruleLocation(ruleStack[ruleStack.length - 1] as Rule),
        });
        return;
      }

      if (!evaluated.changed) {
        return;
      }

      if (preserve && isCustomOrUnknownProperty(declaration)) {
        for (const name of evaluated.referencedFunctions) {
          unresolvedFunctions.add(name);
        }
        reportDiagnostic(reporter, {
          code: "unsupported-preserve-custom-property",
          loc: ruleLocation(ruleStack[ruleStack.length - 1] as Rule),
          message:
            "Lightning CSS collapses duplicate custom or unknown properties, so preserve mode leaves this declaration unchanged.",
        });
        return;
      }

      const transformed = replaceDeclarationValues(
        declaration,
        evaluated.value,
      );
      if (!preserve) {
        return transformed;
      }

      const original = structuredClone(declaration);
      removeNullProperties(original);
      return [transformed, original];
    },
    StyleSheetExit(stylesheet) {
      if (preserve) {
        return;
      }

      const retained = retainedFunctionNames(collection, unresolvedFunctions);
      const removable = removableDefinitions(collection, retained);
      if (removable.size === 0) {
        return;
      }
      const transformed = structuredClone(stylesheet);
      transformed.rules = transformed.rules.filter((rule) => {
        const functionRule = getAtFunctionRule(rule as Rule);
        return (
          !functionRule || !removable.has(locationKey(functionRule.value.loc))
        );
      });
      removeNullProperties(transformed);
      return transformed;
    },
  };
}

export interface TransformAtFunctionsOptions
  extends Omit<
    TransformOptions<AtFunctionCustomAtRules>,
    "customAtRules" | "filename" | "visitor"
  > {
  atFunction?: AtFunctionOptions;
  filename?: string;
  visitor?: Visitor<AtFunctionCustomAtRules>;
}

export interface TransformAtFunctionsResult extends TransformResult {
  diagnostics: Diagnostic[];
}

/** Run Lightning CSS with the custom at-rule grammar and transform configured. */
export function transformAtFunctions(
  options: TransformAtFunctionsOptions,
): TransformAtFunctionsResult {
  const {
    atFunction: atFunctionOptions = {},
    filename = "style.css",
    visitor,
    ...lightningOptions
  } = options;
  const diagnostics: Diagnostic[] = [];
  const customVisitor = atFunction({
    ...atFunctionOptions,
    onDiagnostic(diagnostic) {
      diagnostics.push(diagnostic);
      atFunctionOptions.onDiagnostic?.(diagnostic);
    },
  });
  const composedVisitor = visitor
    ? composeVisitors([customVisitor, visitor])
    : customVisitor;
  const result = lightningTransform({
    ...lightningOptions,
    customAtRules: atFunctionCustomAtRules,
    filename,
    visitor: composedVisitor,
  });

  return {
    ...result,
    diagnostics,
  };
}

export type { Diagnostic } from "./diagnostics.js";
export { AtFunctionTransformError } from "./diagnostics.js";
export type { AtFunctionOptions } from "./options.js";
