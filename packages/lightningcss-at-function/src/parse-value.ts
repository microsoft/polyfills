import type {
  Angle,
  AnimationName,
  EnvironmentVariable,
  Function as LightningFunction,
  Resolution,
  Time,
  Token,
  TokenOrValue,
} from "lightningcss";

export interface SerializedValues {
  complete: boolean;
  css: string;
}

function formatNumber(value: number): string {
  return Object.is(value, -0) ? "0" : String(value);
}

function serializeToken(token: Token): SerializedValues {
  switch (token.type) {
    case "ident":
      return { complete: true, css: token.value };
    case "at-keyword":
      return { complete: true, css: `@${token.value}` };
    case "hash":
    case "id-hash":
      return { complete: true, css: `#${token.value}` };
    case "string":
      return { complete: true, css: JSON.stringify(token.value) };
    case "unquoted-url":
      return { complete: true, css: `url(${token.value})` };
    case "delim":
      return { complete: true, css: token.value };
    case "number":
      return { complete: true, css: formatNumber(token.value) };
    case "percentage":
      return { complete: true, css: `${formatNumber(token.value * 100)}%` };
    case "dimension":
      return {
        complete: true,
        css: `${formatNumber(token.value)}${token.unit}`,
      };
    case "white-space":
      return { complete: true, css: token.value };
    case "comment":
      return { complete: true, css: `/*${token.value}*/` };
    case "colon":
      return { complete: true, css: ":" };
    case "semicolon":
      return { complete: true, css: ";" };
    case "comma":
      return { complete: true, css: "," };
    case "include-match":
      return { complete: true, css: "~=" };
    case "dash-match":
      return { complete: true, css: "|=" };
    case "prefix-match":
      return { complete: true, css: "^=" };
    case "suffix-match":
      return { complete: true, css: "$=" };
    case "substring-match":
      return { complete: true, css: "*=" };
    case "cdo":
      return { complete: true, css: "<!--" };
    case "cdc":
      return { complete: true, css: "-->" };
    case "function":
      return { complete: true, css: `${token.value}(` };
    case "parenthesis-block":
      return { complete: true, css: "(" };
    case "square-bracket-block":
      return { complete: true, css: "[" };
    case "curly-bracket-block":
      return { complete: true, css: "{" };
    case "close-parenthesis":
      return { complete: true, css: ")" };
    case "close-square-bracket":
      return { complete: true, css: "]" };
    case "close-curly-bracket":
      return { complete: true, css: "}" };
    default:
      return { complete: false, css: "" };
  }
}

function serializeAngle(angle: Angle): string {
  return `${formatNumber(angle.value)}${angle.type}`;
}

function serializeTime(time: Time): string {
  return `${formatNumber(time.value)}${time.type === "seconds" ? "s" : "ms"}`;
}

function serializeResolution(resolution: Resolution): string {
  return `${formatNumber(resolution.value)}${resolution.type}`;
}

function serializeAnimationName(name: AnimationName): string {
  switch (name.type) {
    case "none":
      return "none";
    case "ident":
      return name.value;
    case "string":
      return JSON.stringify(name.value);
  }
}

function environmentName(environment: EnvironmentVariable): string {
  switch (environment.name.type) {
    case "custom":
      return environment.name.ident;
    case "unknown":
      return environment.name.value;
    case "ua":
      return environment.name.value;
  }
}

function serializeValue(value: TokenOrValue): SerializedValues {
  switch (value.type) {
    case "token":
      return serializeToken(value.value);
    case "color":
      // The concrete color is irrelevant when matching a <color> grammar.
      return { complete: true, css: "red" };
    case "unresolved-color":
      return { complete: false, css: "currentcolor" };
    case "url":
      return {
        complete: true,
        css: `url(${JSON.stringify(value.value.url)})`,
      };
    case "var": {
      const fallback = value.value.fallback
        ? `,${serializeValues(value.value.fallback).css}`
        : "";
      return {
        complete: true,
        css: `var(${value.value.name.ident}${fallback})`,
      };
    }
    case "env": {
      const indices =
        value.value.indices?.map((index) => ` ${index}`).join("") ?? "";
      const fallback = value.value.fallback
        ? `,${serializeValues(value.value.fallback).css}`
        : "";
      return {
        complete: true,
        css: `env(${environmentName(value.value)}${indices}${fallback})`,
      };
    }
    case "function": {
      const args = serializeValues(value.value.arguments);
      return {
        complete: args.complete,
        css: `${value.value.name}(${args.css})`,
      };
    }
    case "length":
      return {
        complete: true,
        css: `${formatNumber(value.value.value)}${value.value.unit}`,
      };
    case "angle":
      return { complete: true, css: serializeAngle(value.value) };
    case "time":
      return { complete: true, css: serializeTime(value.value) };
    case "resolution":
      return { complete: true, css: serializeResolution(value.value) };
    case "dashed-ident":
      return { complete: true, css: value.value };
    case "animation-name":
      return { complete: true, css: serializeAnimationName(value.value) };
  }

  return { complete: false, css: "" };
}

export function serializeValues(values: TokenOrValue[]): SerializedValues {
  let css = "";
  let complete = true;

  for (const value of values) {
    const serialized = serializeValue(value);
    css += serialized.css;
    complete &&= serialized.complete;
  }

  return { complete, css };
}

export function cloneValues(values: TokenOrValue[]): TokenOrValue[] {
  return structuredClone(values);
}

export function isTrivia(value: TokenOrValue | undefined): boolean {
  return (
    value?.type === "token" &&
    (value.value.type === "white-space" || value.value.type === "comment")
  );
}

export function trimTrivia(values: TokenOrValue[]): TokenOrValue[] {
  let start = 0;
  let end = values.length;

  while (start < end && isTrivia(values[start])) {
    start += 1;
  }
  while (end > start && isTrivia(values[end - 1])) {
    end -= 1;
  }

  return values.slice(start, end);
}

function blockDelta(value: TokenOrValue): number {
  if (value.type !== "token") {
    return 0;
  }

  switch (value.value.type) {
    case "parenthesis-block":
    case "square-bracket-block":
    case "curly-bracket-block":
      return 1;
    case "close-parenthesis":
    case "close-square-bracket":
    case "close-curly-bracket":
      return -1;
    default:
      return 0;
  }
}

export function splitOnCommas(values: TokenOrValue[]): TokenOrValue[][] {
  const result: TokenOrValue[][] = [[]];
  let depth = 0;

  for (const value of values) {
    if (depth === 0 && value.type === "token" && value.value.type === "comma") {
      result.push([]);
      continue;
    }

    result[result.length - 1]?.push(value);
    depth += blockDelta(value);
  }

  return result;
}

export function splitOnFirstComma(values: TokenOrValue[]): {
  after?: TokenOrValue[];
  before: TokenOrValue[];
} {
  let depth = 0;

  for (let index = 0; index < values.length; index += 1) {
    const value = values[index];
    if (
      depth === 0 &&
      value?.type === "token" &&
      value.value.type === "comma"
    ) {
      return {
        after: values.slice(index + 1),
        before: values.slice(0, index),
      };
    }
    if (value) {
      depth += blockDelta(value);
    }
  }

  return { before: values };
}

export function findTopLevelColon(values: TokenOrValue[]): number {
  let depth = 0;

  for (let index = 0; index < values.length; index += 1) {
    const value = values[index];
    if (
      depth === 0 &&
      value?.type === "token" &&
      value.value.type === "colon"
    ) {
      return index;
    }
    if (value) {
      depth += blockDelta(value);
    }
  }

  return -1;
}

export function unwrapCurlyBlock(values: TokenOrValue[]): TokenOrValue[] {
  const trimmed = trimTrivia(values);
  const first = trimmed[0];
  const last = trimmed[trimmed.length - 1];

  if (
    first?.type !== "token" ||
    first.value.type !== "curly-bracket-block" ||
    last?.type !== "token" ||
    last.value.type !== "close-curly-bracket"
  ) {
    return trimmed;
  }

  let depth = 0;
  for (let index = 0; index < trimmed.length; index += 1) {
    const value = trimmed[index];
    if (!value) {
      continue;
    }
    depth += blockDelta(value);
    if (depth === 0 && index !== trimmed.length - 1) {
      return trimmed;
    }
  }

  return trimmed.slice(1, -1);
}

export function tokenIdentValue(
  value: TokenOrValue | undefined,
): string | undefined {
  if (value?.type === "dashed-ident") {
    return value.value;
  }
  if (value?.type === "token" && value.value.type === "ident") {
    return value.value.value;
  }
  return undefined;
}

export function singleIdent(values: TokenOrValue[]): string | undefined {
  const trimmed = trimTrivia(values);
  return trimmed.length === 1 ? tokenIdentValue(trimmed[0]) : undefined;
}

export function parseFunctionArguments(
  fn: LightningFunction,
): { arguments: TokenOrValue[][]; ok: true } | { message: string; ok: false } {
  if (trimTrivia(fn.arguments).length === 0) {
    return { arguments: [], ok: true };
  }

  const groups = splitOnCommas(fn.arguments);
  const args: TokenOrValue[][] = [];

  for (const group of groups) {
    const trimmed = trimTrivia(group);
    if (trimmed.length === 0) {
      return {
        message: `The ${fn.name}() call contains an empty argument.`,
        ok: false,
      };
    }
    args.push(unwrapCurlyBlock(trimmed));
  }

  return { arguments: args, ok: true };
}

export function hasRuntimeDependency(values: TokenOrValue[]): boolean {
  const stack = [...values];

  while (stack.length > 0) {
    const value = stack.pop();
    if (!value) {
      continue;
    }

    switch (value.type) {
      case "var":
        return true;
      case "env":
        return true;
      case "unresolved-color":
        return true;
      case "function": {
        const name = value.value.name.toLowerCase();
        if (name === "attr" || name === "if" || name.startsWith("--")) {
          return true;
        }
        stack.push(...value.value.arguments);
        break;
      }
    }
  }

  return false;
}
