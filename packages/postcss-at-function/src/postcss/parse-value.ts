import {
  type ComponentValue,
  type FunctionNode,
  isFunctionNode,
  isSimpleBlockNode,
  isTokenNode,
  isWhiteSpaceOrCommentNode,
  parseListOfComponentValues,
} from "@csstools/css-parser-algorithms";
import {
  isTokenCloseParen,
  isTokenComma,
  isTokenIdent,
  isTokenOpenCurly,
  tokenize,
} from "@csstools/css-tokenizer";

export interface ParsedComponentValues {
  errors: Error[];
  values: ComponentValue[];
}

export function parseComponentValues(input: string): ParsedComponentValues {
  const errors: Error[] = [];
  const values = parseListOfComponentValues(tokenize({ css: input }), {
    onParseError(error) {
      errors.push(error);
    },
  });

  return { errors, values };
}

export function serializeComponentValues(values: ComponentValue[]): string {
  return values.map((value) => value.toString()).join("");
}

export function trimTrivia(values: ComponentValue[]): ComponentValue[] {
  let start = 0;
  let end = values.length;

  while (start < end && isWhiteSpaceOrCommentNode(values[start])) {
    start += 1;
  }

  while (end > start && isWhiteSpaceOrCommentNode(values[end - 1])) {
    end -= 1;
  }

  return values.slice(start, end);
}

export function splitOnCommas(values: ComponentValue[]): ComponentValue[][] {
  const result: ComponentValue[][] = [[]];

  for (const value of values) {
    if (isTokenNode(value) && isTokenComma(value.value)) {
      result.push([]);
      continue;
    }

    result[result.length - 1]?.push(value);
  }

  return result;
}

export function splitOnFirstComma(values: ComponentValue[]): {
  before: ComponentValue[];
  after?: ComponentValue[];
} {
  for (let index = 0; index < values.length; index += 1) {
    const value = values[index];
    if (isTokenNode(value) && isTokenComma(value.value)) {
      return {
        after: values.slice(index + 1),
        before: values.slice(0, index),
      };
    }
  }

  return { before: values };
}

export function tokenIdentValue(
  value: ComponentValue | undefined,
): string | undefined {
  if (!value || !isTokenNode(value) || !isTokenIdent(value.value)) {
    return undefined;
  }

  return value.value[4].value;
}

export function isClosedFunction(value: FunctionNode): boolean {
  return isTokenCloseParen(value.endToken);
}

export function unwrapCurlyBlock(values: ComponentValue[]): ComponentValue[] {
  const trimmed = trimTrivia(values);

  if (
    trimmed.length === 1 &&
    isSimpleBlockNode(trimmed[0]) &&
    isTokenOpenCurly(trimmed[0].startToken)
  ) {
    return trimmed[0].value;
  }

  return trimmed;
}

export function parseFunctionArguments(
  node: FunctionNode,
): { arguments: string[]; ok: true } | { message: string; ok: false } {
  const significant = trimTrivia(node.value);
  if (significant.length === 0) {
    return { arguments: [], ok: true };
  }

  const groups = splitOnCommas(node.value);
  const args: string[] = [];

  for (const group of groups) {
    const trimmed = trimTrivia(group);
    if (trimmed.length === 0) {
      return {
        message: `The ${node.getName()}() call contains an empty argument.`,
        ok: false,
      };
    }

    args.push(serializeComponentValues(unwrapCurlyBlock(trimmed)));
  }

  return { arguments: args, ok: true };
}

export function hasRuntimeDependency(input: string): boolean {
  const parsed = parseComponentValues(input);
  if (parsed.errors.length > 0) {
    return true;
  }

  const stack = [...parsed.values];
  while (stack.length > 0) {
    const value = stack.pop();
    if (!value) {
      continue;
    }

    if (isFunctionNode(value)) {
      const name = value.getName().toLowerCase();
      if (
        name === "attr" ||
        name === "env" ||
        name === "if" ||
        name === "var" ||
        name.startsWith("--")
      ) {
        return true;
      }
      stack.push(...value.value);
      continue;
    }

    if (isSimpleBlockNode(value)) {
      stack.push(...value.value);
    }
  }

  return false;
}
