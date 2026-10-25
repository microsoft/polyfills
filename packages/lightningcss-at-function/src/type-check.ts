import {
  isFunctionNode,
  isWhiteSpaceOrCommentNode,
  parseListOfComponentValues,
} from "@csstools/css-parser-algorithms";
import { tokenize } from "@csstools/css-tokenizer";
import { type DSNode, definitionSyntax, lexer } from "css-tree";
import type { TokenOrValue } from "lightningcss";
import type { TypeSyntax } from "./model.js";
import { hasRuntimeDependency, serializeValues } from "./parse-value.js";

export type TypeCheckStatus = "indeterminate" | "invalid" | "valid";

export interface TypeCheckResult {
  reason?: string;
  status: TypeCheckStatus;
}

export type TypeSyntaxParseResult =
  | { ok: true; type: TypeSyntax }
  | { message: string; ok: false };

const shorthandTypePattern = /^(?:<[-a-z0-9]+>|[-_a-z][-_a-z0-9]*)(?:[+#])?$/i;

function isSyntaxReferenceError(error: Error | null): boolean {
  return (
    error?.name === "SyntaxReferenceError" ||
    error?.constructor.name === "SyntaxReferenceError"
  );
}

function hasUnknownTypeReference(syntax: DSNode): boolean {
  let unknown = false;

  definitionSyntax.walk(syntax, (node) => {
    if (node.type !== "Type") {
      return;
    }

    const result = lexer.matchType(node.name, "");
    if (isSyntaxReferenceError(result.error)) {
      unknown = true;
    }
  });

  return unknown;
}

export function parseTypeSyntax(rawInput: string): TypeSyntaxParseResult {
  const raw = rawInput.trim();
  if (!raw) {
    return { message: "A CSS type cannot be empty.", ok: false };
  }

  const parseErrors: Error[] = [];
  const parsed = parseListOfComponentValues(tokenize({ css: raw }), {
    onParseError(error) {
      parseErrors.push(error);
    },
  });
  if (parseErrors.length > 0) {
    return {
      message: "The CSS type contains invalid syntax.",
      ok: false,
    };
  }

  const values = parsed.filter((value) => !isWhiteSpaceOrCommentNode(value));
  let syntax: string;
  let universal = false;

  if (
    values.length === 1 &&
    isFunctionNode(values[0]) &&
    values[0].getName().toLowerCase() === "type"
  ) {
    syntax = values[0].value
      .map((value) => value.toString())
      .join("")
      .trim();
    if (!syntax) {
      return { message: "The type() function cannot be empty.", ok: false };
    }
    universal = syntax === "*";
  } else {
    syntax = values
      .map((value) => value.toString())
      .join("")
      .trim();
    if (!shorthandTypePattern.test(syntax) || syntax === "*") {
      return {
        message: `The shorthand CSS type "${syntax}" is not a single syntax component.`,
        ok: false,
      };
    }
  }

  if (/^<transform-list>[+#]$/i.test(syntax)) {
    return {
      message: "<transform-list> cannot use a list multiplier.",
      ok: false,
    };
  }

  if (!universal) {
    try {
      const syntaxAst = definitionSyntax.parse(syntax);
      if (hasUnknownTypeReference(syntaxAst)) {
        return {
          message: `The CSS type "${syntax}" contains an unknown type reference.`,
          ok: false,
        };
      }
    } catch (error) {
      return {
        message:
          error instanceof Error ? error.message : "The CSS type is invalid.",
        ok: false,
      };
    }
  }

  return {
    ok: true,
    type: { raw, syntax, universal },
  };
}

export function checkType(
  value: TokenOrValue[],
  type: TypeSyntax,
): TypeCheckResult {
  if (type.universal) {
    return { status: "valid" };
  }

  if (hasRuntimeDependency(value)) {
    return {
      reason: "The value depends on runtime CSS substitution.",
      status: "indeterminate",
    };
  }

  const serialized = serializeValues(value);
  if (!serialized.complete) {
    return {
      reason: "The Lightning CSS value cannot be statically serialized.",
      status: "indeterminate",
    };
  }

  try {
    const match = lexer.match(type.syntax, serialized.css);
    if (!match.error) {
      return { status: "valid" };
    }

    if (isSyntaxReferenceError(match.error)) {
      return {
        reason: match.error.message,
        status: "indeterminate",
      };
    }

    return {
      reason: match.error.message,
      status: "invalid",
    };
  } catch (error) {
    return {
      reason:
        error instanceof Error
          ? error.message
          : "Unable to validate the CSS value.",
      status: "indeterminate",
    };
  }
}
