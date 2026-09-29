import {
  isFunctionNode,
  isSimpleBlockNode,
} from "@csstools/css-parser-algorithms";
import type { AtRule, ChildNode, Root } from "postcss";
import type { Diagnostic } from "../diagnostics.js";
import type {
  DefinitionCollection,
  DefinitionRecord,
  FunctionDefinition,
  LocalDefinition,
} from "./model.js";
import { parseFunctionPrelude } from "./parse-function-prelude.js";
import { parseComponentValues } from "./parse-value.js";

function location(node: ChildNode | Root): Diagnostic["loc"] {
  const start = node.source?.start;
  return start
    ? {
        column: start.column,
        line: start.line - 1,
        source_index: 0,
      }
    : undefined;
}

function contextIssue(atRule: AtRule): Diagnostic | undefined {
  if (atRule.parent?.type === "root") {
    return undefined;
  }

  return {
    code: "unsupported-definition-context",
    loc: location(atRule),
    message:
      "The first release only transforms unconditional, unlayered, top-level @function definitions.",
  };
}

function bodyIssue(child: ChildNode): Diagnostic {
  return {
    code: "unsupported-conditional-body",
    loc: location(child),
    message:
      "Conditional rules and nested rules inside @function are not transformed in the first release.",
  };
}

function parseDefinition(atRule: AtRule): DefinitionRecord {
  const prelude = parseFunctionPrelude(atRule);
  const issues = [...prelude.issues];

  if (!prelude.name) {
    return { atRule, issues };
  }

  const context = contextIssue(atRule);
  if (context) {
    issues.push(context);
  }

  const locals = new Map<string, LocalDefinition>();
  let result: string | undefined;

  for (const child of atRule.nodes ?? []) {
    if (child.type !== "decl") {
      if (child.type !== "comment") {
        issues.push(bodyIssue(child));
      }
      continue;
    }

    if (
      child.important &&
      (child.prop.toLowerCase() === "result" || child.prop.startsWith("--"))
    ) {
      issues.push({
        code: "invalid-function-prelude",
        functionName: prelude.name,
        loc: location(child),
        message:
          "Function descriptors and local variables cannot use !important.",
      });
      continue;
    }

    if (child.prop.toLowerCase() === "result") {
      result = child.value;
      continue;
    }

    if (child.prop.startsWith("--")) {
      locals.set(child.prop, {
        declaration: child,
        name: child.prop,
        value: child.value,
      });
    }
  }

  if (result === undefined) {
    issues.push({
      code: "missing-result",
      functionName: prelude.name,
      loc: location(atRule),
      message: `The ${prelude.name}() function does not define an unconditional result descriptor.`,
    });
  }

  const definition: FunctionDefinition = {
    atRule,
    issues,
    locals,
    name: prelude.name,
    parameters: prelude.parameters,
    result,
    returnType: prelude.returnType,
  };

  return {
    atRule,
    definition,
    issues,
  };
}

export function collectDefinitions(root: Root): DefinitionCollection {
  const records: DefinitionRecord[] = [];
  const diagnostics: Diagnostic[] = [];
  const byName = new Map<string, FunctionDefinition[]>();

  root.walkAtRules(/^function$/i, (atRule) => {
    const record = parseDefinition(atRule);
    records.push(record);
    diagnostics.push(...record.issues);

    if (!record.definition) {
      return;
    }

    const definitions = byName.get(record.definition.name) ?? [];
    definitions.push(record.definition);
    byName.set(record.definition.name, definitions);
  });

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
    if (value === undefined) {
      continue;
    }

    const parsed = parseComponentValues(value);
    const stack = [...parsed.values];

    while (stack.length > 0) {
      const component = stack.pop();
      if (!component) {
        continue;
      }

      if (isFunctionNode(component)) {
        const name = component.getName();
        if (name.startsWith("--")) {
          dependencies.add(name);
        }
        stack.push(...component.value);
      } else if (isSimpleBlockNode(component)) {
        stack.push(...component.value);
      }
    }
  }

  return dependencies;
}
