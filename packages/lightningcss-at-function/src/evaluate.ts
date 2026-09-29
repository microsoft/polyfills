import type {
  Function as LightningFunction,
  UnresolvedColor,
  Variable,
} from "lightningcss";
import type { Diagnostic } from "./diagnostics.js";
import type {
  CssValue,
  FunctionDefinition,
  FunctionParameter,
  TypeSyntax,
} from "./model.js";
import {
  cloneValues,
  parseFunctionArguments,
  singleIdent,
  splitOnFirstComma,
  trimTrivia,
} from "./parse-value.js";
import { checkType } from "./type-check.js";

interface ResolvedValue {
  dynamic: boolean;
  value: CssValue;
}

interface Binding {
  frame: Frame;
  kind: "argument" | "default" | "local";
  name: string;
  resolved?: ResolvedValue;
  resolving: boolean;
  source?: CssValue;
  type?: TypeSyntax;
}

interface Frame {
  definition: FunctionDefinition;
  locals: Map<string, Binding>;
  parameters: Map<string, Binding>;
  parentScope: Scope | null;
}

interface Scope {
  frame: Frame;
  includeLocals: boolean;
  parent: Scope | null;
}

interface EvaluationState {
  callStack: FunctionDefinition[];
  referencedFunctions: Set<string>;
  registry: Map<string, FunctionDefinition>;
}

interface ResolutionContext {
  requireKnownDashed: boolean;
  scope: Scope | null;
  state: EvaluationState;
}

interface ResolutionSuccess {
  changed: boolean;
  dynamic: boolean;
  nodes: CssValue;
  ok: true;
}

interface ResolutionFailure {
  diagnostic: Diagnostic;
  ok: false;
}

type Resolution = ResolutionFailure | ResolutionSuccess;

export interface DeclarationEvaluationSuccess {
  changed: boolean;
  ok: true;
  referencedFunctions: Set<string>;
  value: CssValue;
}

export interface DeclarationEvaluationFailure {
  diagnostic: Diagnostic;
  ok: false;
  referencedFunctions: Set<string>;
}

export type DeclarationEvaluation =
  | DeclarationEvaluationFailure
  | DeclarationEvaluationSuccess;

const cssWideKeywords = new Set([
  "inherit",
  "initial",
  "revert",
  "revert-layer",
  "unset",
]);

function failure(
  code: Diagnostic["code"],
  message: string,
  functionName?: string,
): ResolutionFailure {
  return {
    diagnostic: {
      code,
      functionName,
      message,
    },
    ok: false,
  };
}

function success(
  nodes: CssValue,
  dynamic = false,
  changed = false,
): ResolutionSuccess {
  return {
    changed,
    dynamic,
    nodes,
    ok: true,
  };
}

function fullScope(frame: Frame): Scope {
  return {
    frame,
    includeLocals: true,
    parent: frame.parentScope,
  };
}

function parameterScope(frame: Frame): Scope {
  return {
    frame,
    includeLocals: false,
    parent: frame.parentScope,
  };
}

function resolveExpression(
  input: CssValue,
  context: ResolutionContext,
): Resolution {
  return resolveComponents(cloneValues(input), context);
}

function lookupBinding(scope: Scope | null, name: string): Binding | undefined {
  let current = scope;

  while (current) {
    if (current.includeLocals) {
      const local = current.frame.locals.get(name);
      if (local) {
        return local;
      }
    }

    const parameter = current.frame.parameters.get(name);
    if (parameter) {
      return parameter;
    }

    current = current.parent;
  }

  return undefined;
}

function validateResolvedBinding(
  binding: Binding,
  value: ResolvedValue,
): ResolutionFailure | undefined {
  if (!binding.type) {
    return undefined;
  }

  const checked = checkType(value.value, binding.type);
  if (checked.status === "valid") {
    return undefined;
  }

  if (checked.status === "indeterminate") {
    return failure(
      "indeterminate-argument-type",
      `The value of "${binding.name}" cannot be statically checked against ${binding.type.raw}.`,
      binding.frame.definition.name,
    );
  }

  return failure(
    "invalid-argument-type",
    `The value of "${binding.name}" does not match ${binding.type.raw}.`,
    binding.frame.definition.name,
  );
}

function resolveBinding(
  binding: Binding,
  context: ResolutionContext,
): Resolution {
  if (binding.resolved) {
    return success(
      cloneValues(binding.resolved.value),
      binding.resolved.dynamic,
    );
  }

  if (binding.resolving) {
    return failure(
      "cyclic-binding",
      `The "${binding.name}" binding participates in a cycle.`,
      binding.frame.definition.name,
    );
  }

  const source = binding.source ?? [];
  const cssWideKeyword = singleIdent(source)?.toLowerCase();
  if (cssWideKeyword && cssWideKeywords.has(cssWideKeyword)) {
    return failure(
      "unsupported-css-wide-keyword",
      `The "${binding.name}" binding uses the CSS-wide keyword "${cssWideKeyword}", which requires runtime scope semantics.`,
      binding.frame.definition.name,
    );
  }

  binding.resolving = true;
  const scope =
    binding.kind === "default"
      ? parameterScope(binding.frame)
      : fullScope(binding.frame);
  const resolved = resolveExpression(source, {
    ...context,
    requireKnownDashed: true,
    scope,
  });
  binding.resolving = false;

  if (!resolved.ok) {
    return resolved;
  }

  const value = {
    dynamic: resolved.dynamic,
    value: resolved.nodes,
  };
  const invalid = validateResolvedBinding(binding, value);
  if (invalid) {
    return invalid;
  }

  binding.resolved = {
    dynamic: value.dynamic,
    value: cloneValues(value.value),
  };
  return resolved;
}

function resolveVariable(
  variable: Variable,
  context: ResolutionContext,
): Resolution {
  const name = variable.name.ident;
  const binding = lookupBinding(context.scope, name);

  if (!binding) {
    const cloned = structuredClone(variable);
    let changed = false;
    if (cloned.fallback) {
      const fallback = resolveComponents(cloned.fallback, context);
      if (!fallback.ok) {
        return fallback;
      }
      cloned.fallback = fallback.nodes;
      changed = fallback.changed;
    }
    return success([{ type: "var", value: cloned }], true, changed);
  }

  const resolved = resolveBinding(binding, context);
  if (!resolved.ok) {
    return resolved;
  }

  if (resolved.dynamic && variable.fallback) {
    return failure(
      "indeterminate-substitution",
      `The fallback in var(${name}, …) depends on runtime validity and cannot be preserved safely.`,
      binding.frame.definition.name,
    );
  }

  return resolved;
}

function checkedArgument(
  parameter: FunctionParameter,
  value: ResolvedValue,
  functionName: string,
): ResolutionFailure | "default" | undefined {
  if (!parameter.type) {
    if (value.dynamic && parameter.defaultValue !== undefined) {
      return failure(
        "indeterminate-substitution",
        `The runtime validity of "${parameter.name}" determines whether its default is used.`,
        functionName,
      );
    }
    return undefined;
  }

  const checked = checkType(value.value, parameter.type);
  if (checked.status === "valid") {
    return undefined;
  }

  if (checked.status === "invalid" && parameter.defaultValue !== undefined) {
    return "default";
  }

  if (checked.status === "indeterminate") {
    return failure(
      "indeterminate-argument-type",
      `The argument for "${parameter.name}" cannot be statically checked against ${parameter.type.raw}.`,
      functionName,
    );
  }

  return failure(
    "invalid-argument-type",
    `The argument for "${parameter.name}" does not match ${parameter.type.raw}.`,
    functionName,
  );
}

function createFrame(
  definition: FunctionDefinition,
  parentScope: Scope | null,
  arguments_: Array<ResolvedValue | "default">,
): Frame {
  const frame: Frame = {
    definition,
    locals: new Map(),
    parameters: new Map(),
    parentScope,
  };

  for (let index = 0; index < definition.parameters.length; index += 1) {
    const parameter = definition.parameters[index];
    const argument = arguments_[index];
    if (!parameter) {
      continue;
    }

    const binding: Binding = {
      frame,
      kind: argument === "default" ? "default" : "argument",
      name: parameter.name,
      resolving: false,
      type: parameter.type,
    };

    if (argument === "default") {
      binding.source = parameter.defaultValue;
    } else {
      binding.resolved = argument;
    }

    frame.parameters.set(parameter.name, binding);
  }

  for (const local of definition.locals.values()) {
    const parameterType = definition.parameters.find(
      (parameter) => parameter.name === local.name,
    )?.type;
    frame.locals.set(local.name, {
      frame,
      kind: "local",
      name: local.name,
      resolving: false,
      source: local.value,
      type: parameterType,
    });
  }

  return frame;
}

function evaluateCustomFunction(
  fn: LightningFunction,
  context: ResolutionContext,
): Resolution {
  const name = fn.name;
  const definition = context.state.registry.get(name);

  if (!definition) {
    return failure(
      "missing-nested-function",
      `The ${name}() function is required by another transformed function but is not defined in this stylesheet.`,
      name,
    );
  }

  context.state.referencedFunctions.add(name);

  const issue = definition.issues[0];
  if (issue) {
    return failure(
      issue.code,
      `The ${name}() function cannot be transformed: ${issue.message}`,
      name,
    );
  }

  if (context.state.callStack.includes(definition)) {
    return failure(
      "cyclic-function",
      `The ${name}() function participates in a recursive call cycle.`,
      name,
    );
  }

  const parsedArguments = parseFunctionArguments(fn);
  if (!parsedArguments.ok) {
    return failure("invalid-function-call", parsedArguments.message, name);
  }

  if (parsedArguments.arguments.length > definition.parameters.length) {
    return failure(
      "invalid-argument-count",
      `The ${name}() function accepts ${definition.parameters.length} argument(s), but received ${parsedArguments.arguments.length}.`,
      name,
    );
  }

  const arguments_: Array<ResolvedValue | "default"> = [];

  for (let index = 0; index < definition.parameters.length; index += 1) {
    const parameter = definition.parameters[index];
    const source = parsedArguments.arguments[index];
    if (!parameter) {
      continue;
    }

    if (source === undefined) {
      if (parameter.defaultValue === undefined) {
        return failure(
          "invalid-argument-count",
          `The ${name}() call is missing the required "${parameter.name}" argument.`,
          name,
        );
      }
      arguments_.push("default");
      continue;
    }

    const resolved = resolveExpression(source, {
      ...context,
      requireKnownDashed: true,
    });
    if (!resolved.ok) {
      return resolved;
    }

    const value = {
      dynamic: resolved.dynamic,
      value: resolved.nodes,
    };
    const checked = checkedArgument(parameter, value, name);
    if (checked === "default") {
      arguments_.push("default");
    } else if (checked) {
      return checked;
    } else {
      arguments_.push(value);
    }
  }

  const frame = createFrame(definition, context.scope, arguments_);
  context.state.callStack.push(definition);

  for (const binding of frame.parameters.values()) {
    if (binding.kind !== "default") {
      continue;
    }
    const resolvedBinding = resolveBinding(binding, {
      ...context,
      requireKnownDashed: true,
      scope: parameterScope(frame),
    });
    if (!resolvedBinding.ok) {
      context.state.callStack.pop();
      return resolvedBinding;
    }
  }

  for (const binding of frame.locals.values()) {
    const resolvedBinding = resolveBinding(binding, {
      ...context,
      requireKnownDashed: true,
      scope: fullScope(frame),
    });
    if (!resolvedBinding.ok) {
      context.state.callStack.pop();
      return resolvedBinding;
    }
  }

  const resolved = resolveExpression(definition.result ?? [], {
    ...context,
    requireKnownDashed: true,
    scope: fullScope(frame),
  });
  context.state.callStack.pop();

  if (!resolved.ok) {
    return resolved;
  }

  if (definition.returnType) {
    const checked = checkType(resolved.nodes, definition.returnType);
    if (checked.status === "indeterminate") {
      return failure(
        "indeterminate-return-type",
        `The result of ${name}() cannot be statically checked against ${definition.returnType.raw}.`,
        name,
      );
    }
    if (checked.status === "invalid") {
      return failure(
        "invalid-return-type",
        `The result of ${name}() does not match ${definition.returnType.raw}.`,
        name,
      );
    }
  }

  return success(resolved.nodes, resolved.dynamic, true);
}

function resolveFunction(
  fn: LightningFunction,
  context: ResolutionContext,
): Resolution {
  const name = fn.name;
  const lowerName = name.toLowerCase();

  if (lowerName === "var") {
    const split = splitOnFirstComma(fn.arguments);
    const variableName = singleIdent(split.before);
    if (!variableName?.startsWith("--")) {
      return failure(
        "invalid-function-call",
        "A var() reference contains an invalid custom property name.",
      );
    }

    return resolveVariable(
      {
        fallback: split.after,
        name: { ident: variableName },
      },
      context,
    );
  }

  if (name.startsWith("--")) {
    if (context.state.registry.has(name)) {
      return evaluateCustomFunction(fn, context);
    }

    if (context.requireKnownDashed) {
      return failure(
        "missing-nested-function",
        `The ${name}() function is not defined in this stylesheet.`,
        name,
      );
    }

    const nested = resolveComponents(fn.arguments, context);
    if (!nested.ok) {
      return nested;
    }
    return success(
      [
        {
          type: "function",
          value: { ...fn, arguments: nested.nodes },
        },
      ],
      true,
      nested.changed,
    );
  }

  const nested = resolveComponents(fn.arguments, context);
  if (!nested.ok) {
    return nested;
  }

  return success(
    [
      {
        type: "function",
        value: { ...fn, arguments: nested.nodes },
      },
    ],
    nested.dynamic ||
      lowerName === "attr" ||
      lowerName === "env" ||
      lowerName === "if",
    nested.changed,
  );
}

function resolveUnresolvedColor(
  color: UnresolvedColor,
  context: ResolutionContext,
): Resolution {
  const cloned = structuredClone(color);
  let changed = false;

  if (cloned.type === "light-dark") {
    const light = resolveComponents(cloned.light, context);
    if (!light.ok) {
      return light;
    }
    const dark = resolveComponents(cloned.dark, context);
    if (!dark.ok) {
      return dark;
    }
    cloned.light = light.nodes;
    cloned.dark = dark.nodes;
    changed = light.changed || dark.changed;
  } else {
    const alpha = resolveComponents(cloned.alpha, context);
    if (!alpha.ok) {
      return alpha;
    }
    cloned.alpha = alpha.nodes;
    changed = alpha.changed;
  }

  return success([{ type: "unresolved-color", value: cloned }], true, changed);
}

function resolveComponents(
  values: CssValue,
  context: ResolutionContext,
): Resolution {
  const output: CssValue = [];
  let changed = false;
  let dynamic = false;

  for (const value of values) {
    let resolved: Resolution;

    switch (value.type) {
      case "function":
        resolved = resolveFunction(value.value, context);
        break;
      case "var":
        resolved = resolveVariable(value.value, context);
        break;
      case "env": {
        const environment = structuredClone(value.value);
        let fallbackChanged = false;
        if (environment.fallback) {
          const fallback = resolveComponents(environment.fallback, context);
          if (!fallback.ok) {
            return fallback;
          }
          environment.fallback = fallback.nodes;
          fallbackChanged = fallback.changed;
        }
        resolved = success(
          [{ type: "env", value: environment }],
          true,
          fallbackChanged,
        );
        break;
      }
      case "unresolved-color":
        resolved = resolveUnresolvedColor(value.value, context);
        break;
      default:
        resolved = success([value]);
    }

    if (!resolved.ok) {
      return resolved;
    }

    output.push(...resolved.nodes);
    changed ||= resolved.changed;
    dynamic ||= resolved.dynamic;
  }

  return success(output, dynamic, changed);
}

export function evaluateDeclarationValue(
  value: CssValue,
  registry: Map<string, FunctionDefinition>,
): DeclarationEvaluation {
  const state: EvaluationState = {
    callStack: [],
    referencedFunctions: new Set(),
    registry,
  };
  const resolved = resolveExpression(trimTrivia(value), {
    requireKnownDashed: false,
    scope: null,
    state,
  });

  if (!resolved.ok) {
    return {
      diagnostic: resolved.diagnostic,
      ok: false,
      referencedFunctions: state.referencedFunctions,
    };
  }

  return {
    changed: resolved.changed,
    ok: true,
    referencedFunctions: state.referencedFunctions,
    value: resolved.nodes,
  };
}
