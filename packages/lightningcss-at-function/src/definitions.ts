import type {
  Declaration,
  DeclarationBlock,
  Rule,
  TokenOrValue,
} from "lightningcss";
import type { Diagnostic } from "./diagnostics.js";
import type {
  AtFunctionRule,
  DefinitionCollection,
  DefinitionRecord,
  FunctionDefinition,
  LocalDefinition,
} from "./model.js";
import { parseFunctionPrelude } from "./parse-function-prelude.js";

export function getAtFunctionRule(rule: Rule): AtFunctionRule | undefined {
  const candidate = rule as unknown as AtFunctionRule;
  return rule.type === "custom" && candidate.value?.name === "function"
    ? candidate
    : undefined;
}

function contextIssue(
  rule: AtFunctionRule,
  topLevel: boolean,
): Diagnostic | undefined {
  if (topLevel) {
    return undefined;
  }

  return {
    code: "unsupported-definition-context",
    loc: rule.value.loc,
    message:
      "The first release only transforms unconditional, unlayered, top-level @function definitions.",
  };
}

function bodyIssue(rule: AtFunctionRule): Diagnostic {
  return {
    code: "unsupported-conditional-body",
    loc: rule.value.loc,
    message:
      "Conditional rules and nested rules inside @function are not transformed in the first release.",
  };
}

function customDeclaration(
  declaration: Declaration,
): { name: string; value: TokenOrValue[] } | undefined {
  if (declaration.property !== "custom") {
    return undefined;
  }

  return {
    name: declaration.value.name,
    value: declaration.value.value,
  };
}

function collectBodyDeclarations(
  block: DeclarationBlock,
  locals: Map<string, LocalDefinition>,
): TokenOrValue[] | undefined {
  let result: TokenOrValue[] | undefined;

  for (const declaration of block.declarations ?? []) {
    const custom = customDeclaration(declaration);
    if (!custom) {
      continue;
    }

    if (custom.name.toLowerCase() === "result") {
      result = custom.value;
    } else if (custom.name.startsWith("--")) {
      locals.set(custom.name, {
        name: custom.name,
        value: custom.value,
      });
    }
  }

  return result;
}

function parseDefinition(
  rule: AtFunctionRule,
  topLevel: boolean,
): DefinitionRecord {
  const prelude = parseFunctionPrelude(
    rule.value.prelude.value,
    rule.value.loc,
  );
  const issues = [...prelude.issues];

  if (!prelude.name) {
    return { issues, rule, topLevel };
  }

  const context = contextIssue(rule, topLevel);
  if (context) {
    issues.push(context);
  }

  const locals = new Map<string, LocalDefinition>();
  let result: TokenOrValue[] | undefined;

  for (const child of rule.value.body.value) {
    if (child.type !== "nested-declarations") {
      issues.push(bodyIssue(rule));
      continue;
    }

    const childResult = collectBodyDeclarations(
      child.value.declarations,
      locals,
    );
    if (childResult !== undefined) {
      result = childResult;
    }

    for (const declaration of child.value.declarations.importantDeclarations ??
      []) {
      const custom = customDeclaration(declaration);
      if (
        custom &&
        (custom.name.toLowerCase() === "result" || custom.name.startsWith("--"))
      ) {
        issues.push({
          code: "invalid-function-prelude",
          functionName: prelude.name,
          loc: child.value.loc,
          message:
            "Function descriptors and local variables cannot use !important.",
        });
      }
    }
  }

  if (result === undefined) {
    issues.push({
      code: "missing-result",
      functionName: prelude.name,
      loc: rule.value.loc,
      message: `The ${prelude.name}() function does not define an unconditional result descriptor.`,
    });
  }

  const definition: FunctionDefinition = {
    issues,
    locals,
    name: prelude.name,
    parameters: prelude.parameters,
    result,
    returnType: prelude.returnType,
    rule,
    topLevel,
  };

  return {
    definition,
    issues,
    rule,
    topLevel,
  };
}

function childRules(rule: Rule): Rule[] {
  switch (rule.type) {
    case "style":
      return rule.value.rules ?? [];
    case "media":
    case "supports":
    case "moz-document":
    case "layer-block":
    case "container":
    case "scope":
    case "starting-style":
      return rule.value.rules;
    case "nesting":
      return rule.value.style.rules ?? [];
    default:
      return getAtFunctionRule(rule)?.value.body.value ?? [];
  }
}

export function collectDefinitions(rules: Rule[]): DefinitionCollection {
  const records: DefinitionRecord[] = [];
  const diagnostics: Diagnostic[] = [];
  const byName = new Map<string, FunctionDefinition[]>();

  const visit = (currentRules: Rule[], topLevel: boolean): void => {
    for (const rule of currentRules) {
      const functionRule = getAtFunctionRule(rule);
      if (functionRule) {
        const record = parseDefinition(functionRule, topLevel);
        records.push(record);
        diagnostics.push(...record.issues);

        if (record.definition) {
          const definitions = byName.get(record.definition.name) ?? [];
          definitions.push(record.definition);
          byName.set(record.definition.name, definitions);
        }
      }

      visit(childRules(rule), false);
    }
  };

  visit(rules, true);

  const registry = new Map<string, FunctionDefinition>();
  for (const [name, definitions] of byName) {
    const selected = definitions[definitions.length - 1];
    if (selected) {
      registry.set(name, selected);
    }
  }

  return {
    diagnostics,
    records,
    registry,
  };
}

export function definitionDependencies(
  definition: FunctionDefinition,
): Set<string> {
  const dependencies = new Set<string>();
  const values = [
    definition.result,
    ...definition.parameters.map((parameter) => parameter.defaultValue),
    ...Array.from(definition.locals.values(), (local) => local.value),
  ];

  for (const value of values) {
    if (!value) {
      continue;
    }

    const stack = [...value];
    while (stack.length > 0) {
      const component = stack.pop();
      if (!component) {
        continue;
      }

      if (component.type === "function") {
        if (component.value.name.startsWith("--")) {
          dependencies.add(component.value.name);
        }
        stack.push(...component.value.arguments);
      } else if (component.type === "var" || component.type === "env") {
        stack.push(...(component.value.fallback ?? []));
      }
    }
  }

  return dependencies;
}
