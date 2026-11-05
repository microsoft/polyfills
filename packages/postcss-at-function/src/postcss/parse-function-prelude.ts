import {
  type ComponentValue,
  isFunctionNode,
  isTokenNode,
} from "@csstools/css-parser-algorithms";
import {
  isTokenCloseParen,
  isTokenColon,
  isTokenIdent,
  tokenize,
} from "@csstools/css-tokenizer";
import type { AtRule } from "postcss";
import type { Diagnostic } from "../diagnostics.js";
import type { FunctionParameter, TypeSyntax } from "./model.js";
import {
  parseComponentValues,
  serializeComponentValues,
  splitOnCommas,
  tokenIdentValue,
  trimTrivia,
  unwrapCurlyBlock,
} from "./parse-value.js";
import { checkType, parseTypeSyntax } from "./type-check.js";

export interface ParsedFunctionPrelude {
  issues: Diagnostic[];
  name?: string;
  parameters: FunctionParameter[];
  returnType?: TypeSyntax;
}

function location(atRule: AtRule): Diagnostic["loc"] {
  const start = atRule.source?.start;
  return start
    ? {
        column: start.column,
        line: start.line - 1,
        source_index: 0,
      }
    : undefined;
}

function invalidPrelude(
  atRule: AtRule,
  message: string,
  functionName?: string,
): Diagnostic {
  return {
    code: "invalid-function-prelude",
    functionName,
    loc: location(atRule),
    message,
  };
}

function findColon(values: ComponentValue[]): number {
  return values.findIndex(
    (value) => isTokenNode(value) && isTokenColon(value.value),
  );
}

function parseParameter(
  atRule: AtRule,
  values: ComponentValue[],
  names: Set<string>,
): { issue?: Diagnostic; parameter?: FunctionParameter } {
  const trimmed = trimTrivia(values);
  const name = tokenIdentValue(trimmed[0]);

  if (!name?.startsWith("--")) {
    return {
      issue: invalidPrelude(
        atRule,
        "Each function parameter must start with a custom property name.",
      ),
    };
  }

  if (names.has(name)) {
    return {
      issue: invalidPrelude(
        atRule,
        `The parameter "${name}" is declared more than once.`,
        name,
      ),
    };
  }
  names.add(name);

  const remainder = trimmed.slice(1);
  const colonIndex = findColon(remainder);
  const typeValues =
    colonIndex === -1 ? remainder : remainder.slice(0, colonIndex);
  const defaultValues =
    colonIndex === -1 ? undefined : remainder.slice(colonIndex + 1);
  const typeSource = serializeComponentValues(trimTrivia(typeValues)).trim();
  const defaultValue =
    defaultValues === undefined
      ? undefined
      : serializeComponentValues(unwrapCurlyBlock(defaultValues)).trim();

  if (defaultValues !== undefined && !defaultValue) {
    return {
      issue: invalidPrelude(
        atRule,
        `The default value for "${name}" cannot be empty.`,
        name,
      ),
    };
  }

  if (defaultValue && /!\s*important\s*$/i.test(defaultValue)) {
    return {
      issue: invalidPrelude(
        atRule,
        `The default value for "${name}" cannot contain !important.`,
        name,
      ),
    };
  }

  let type: TypeSyntax | undefined;
  if (typeSource) {
    const parsedType = parseTypeSyntax(typeSource);
    if (!parsedType.ok) {
      return {
        issue: invalidPrelude(
          atRule,
          `The type for "${name}" is invalid: ${parsedType.message}`,
          name,
        ),
      };
    }
    type = parsedType.type;
  }

  if (type && defaultValue !== undefined) {
    const checked = checkType(defaultValue, type);
    if (checked.status === "invalid") {
      return {
        issue: invalidPrelude(
          atRule,
          `The default value for "${name}" does not match ${type.raw}.`,
          name,
        ),
      };
    }
  }

  return {
    parameter: {
      defaultValue,
      name,
      type,
    },
  };
}

export function parseFunctionPrelude(atRule: AtRule): ParsedFunctionPrelude {
  const issues: Diagnostic[] = [];
  const parseErrors: Error[] = [];
  const values = parseComponentValues(atRule.params);

  parseErrors.push(...values.errors);
  tokenize(
    { css: atRule.params },
    {
      onParseError(error) {
        parseErrors.push(error);
      },
    },
  );

  if (parseErrors.length > 0) {
    issues.push(
      invalidPrelude(
        atRule,
        "The @function prelude contains invalid CSS syntax.",
      ),
    );
    return { issues, parameters: [] };
  }

  const significant = trimTrivia(values.values);
  const functionNode = significant[0];

  if (!functionNode || !isFunctionNode(functionNode)) {
    issues.push(
      invalidPrelude(
        atRule,
        "The function name must be immediately followed by its parameter parentheses.",
      ),
    );
    return { issues, parameters: [] };
  }

  if (!isTokenCloseParen(functionNode.endToken)) {
    issues.push(
      invalidPrelude(atRule, "The function parameter list is not closed."),
    );
    return { issues, parameters: [] };
  }

  const name = functionNode.getName();
  if (!name.startsWith("--")) {
    issues.push(
      invalidPrelude(
        atRule,
        'A CSS custom function name must start with "--".',
        name,
      ),
    );
  }

  const parameters: FunctionParameter[] = [];
  const parameterGroups = splitOnCommas(functionNode.value);
  const meaningfulParameters = trimTrivia(functionNode.value).length > 0;
  const names = new Set<string>();

  if (meaningfulParameters) {
    for (const group of parameterGroups) {
      if (trimTrivia(group).length === 0) {
        issues.push(
          invalidPrelude(
            atRule,
            "The parameter list contains an empty parameter.",
            name,
          ),
        );
        continue;
      }

      const parsed = parseParameter(atRule, group, names);
      if (parsed.issue) {
        issues.push(parsed.issue);
      } else if (parsed.parameter) {
        parameters.push(parsed.parameter);
      }
    }
  }

  const trailing = trimTrivia(significant.slice(1));
  let returnType: TypeSyntax | undefined;

  if (trailing.length > 0) {
    const returnsNode = trailing[0];
    const returnsKeyword =
      isTokenNode(returnsNode) && isTokenIdent(returnsNode.value)
        ? returnsNode.value[4].value
        : undefined;

    if (returnsKeyword?.toLowerCase() !== "returns") {
      issues.push(
        invalidPrelude(
          atRule,
          "Unexpected syntax after the function parameter list.",
          name,
        ),
      );
    } else {
      const returnSource = serializeComponentValues(
        trimTrivia(trailing.slice(1)),
      ).trim();
      if (!returnSource) {
        issues.push(
          invalidPrelude(
            atRule,
            "The returns keyword requires a CSS type.",
            name,
          ),
        );
      } else {
        const parsedReturn = parseTypeSyntax(returnSource);
        if (!parsedReturn.ok) {
          issues.push(
            invalidPrelude(
              atRule,
              `The return type is invalid: ${parsedReturn.message}`,
              name,
            ),
          );
        } else {
          returnType = parsedReturn.type;
        }
      }
    }
  }

  return {
    issues,
    name,
    parameters,
    returnType,
  };
}
