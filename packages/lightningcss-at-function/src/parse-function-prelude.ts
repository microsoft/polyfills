import type {
  Function as LightningFunction,
  Location2,
  TokenOrValue,
} from "lightningcss";
import type { Diagnostic } from "./diagnostics.js";
import type { FunctionParameter, TypeSyntax } from "./model.js";
import {
  findTopLevelColon,
  serializeValues,
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

function invalidPrelude(
  message: string,
  loc?: Location2,
  functionName?: string,
): Diagnostic {
  return {
    code: "invalid-function-prelude",
    functionName,
    loc,
    message,
  };
}

function parseParameter(
  values: TokenOrValue[],
  names: Set<string>,
  loc?: Location2,
): { issue?: Diagnostic; parameter?: FunctionParameter } {
  const trimmed = trimTrivia(values);
  const name = tokenIdentValue(trimmed[0]);

  if (!name?.startsWith("--")) {
    return {
      issue: invalidPrelude(
        "Each function parameter must start with a custom property name.",
        loc,
      ),
    };
  }

  if (names.has(name)) {
    return {
      issue: invalidPrelude(
        `The parameter "${name}" is declared more than once.`,
        loc,
        name,
      ),
    };
  }
  names.add(name);

  const remainder = trimmed.slice(1);
  const colonIndex = findTopLevelColon(remainder);
  const typeValues =
    colonIndex === -1 ? remainder : remainder.slice(0, colonIndex);
  const defaultValues =
    colonIndex === -1 ? undefined : remainder.slice(colonIndex + 1);
  const typeSource = serializeValues(trimTrivia(typeValues)).css.trim();
  const defaultValue =
    defaultValues === undefined ? undefined : unwrapCurlyBlock(defaultValues);

  if (defaultValue !== undefined && trimTrivia(defaultValue).length === 0) {
    return {
      issue: invalidPrelude(
        `The default value for "${name}" cannot be empty.`,
        loc,
        name,
      ),
    };
  }

  if (
    defaultValue !== undefined &&
    /!\s*important\s*$/i.test(serializeValues(defaultValue).css)
  ) {
    return {
      issue: invalidPrelude(
        `The default value for "${name}" cannot contain !important.`,
        loc,
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
          `The type for "${name}" is invalid: ${parsedType.message}`,
          loc,
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
          `The default value for "${name}" does not match ${type.raw}.`,
          loc,
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

function isFunctionValue(
  value: TokenOrValue | undefined,
): value is { type: "function"; value: LightningFunction } {
  return value?.type === "function";
}

export function parseFunctionPrelude(
  prelude: TokenOrValue[],
  loc?: Location2,
): ParsedFunctionPrelude {
  const issues: Diagnostic[] = [];
  const significant = trimTrivia(prelude);
  const functionValue = significant[0];

  if (!isFunctionValue(functionValue)) {
    issues.push(
      invalidPrelude(
        "The function name must be immediately followed by its parameter parentheses.",
        loc,
      ),
    );
    return { issues, parameters: [] };
  }

  const name = functionValue.value.name;
  if (!name.startsWith("--")) {
    issues.push(
      invalidPrelude(
        'A CSS custom function name must start with "--".',
        loc,
        name,
      ),
    );
  }

  const parameters: FunctionParameter[] = [];
  const names = new Set<string>();
  if (trimTrivia(functionValue.value.arguments).length > 0) {
    for (const group of splitOnCommas(functionValue.value.arguments)) {
      if (trimTrivia(group).length === 0) {
        issues.push(
          invalidPrelude(
            "The parameter list contains an empty parameter.",
            loc,
            name,
          ),
        );
        continue;
      }

      const parsed = parseParameter(group, names, loc);
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
    const returnsKeyword = tokenIdentValue(trailing[0]);
    if (returnsKeyword?.toLowerCase() !== "returns") {
      issues.push(
        invalidPrelude(
          "Unexpected syntax after the function parameter list.",
          loc,
          name,
        ),
      );
    } else {
      const returnSource = serializeValues(
        trimTrivia(trailing.slice(1)),
      ).css.trim();
      if (!returnSource) {
        issues.push(
          invalidPrelude("The returns keyword requires a CSS type.", loc, name),
        );
      } else {
        const parsedReturn = parseTypeSyntax(returnSource);
        if (!parsedReturn.ok) {
          issues.push(
            invalidPrelude(
              `The return type is invalid: ${parsedReturn.message}`,
              loc,
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
