import type { Location2 } from "lightningcss";

/** Stable codes for diagnostics emitted by the transform. */
export type DiagnosticCode =
  | "cyclic-binding"
  | "cyclic-function"
  | "indeterminate-argument-type"
  | "indeterminate-return-type"
  | "indeterminate-substitution"
  | "invalid-argument-count"
  | "invalid-argument-type"
  | "invalid-function-call"
  | "invalid-function-prelude"
  | "invalid-return-type"
  | "missing-nested-function"
  | "missing-result"
  | "unsupported-conditional-body"
  | "unsupported-css-wide-keyword"
  | "unsupported-definition-context"
  | "unsupported-preserve-custom-property";

export interface Diagnostic {
  code: DiagnosticCode;
  functionName?: string;
  loc?: Location2;
  message: string;
}

export interface DiagnosticReporter {
  diagnostics: Diagnostic[];
  onDiagnostic?: (diagnostic: Diagnostic) => void;
  seen: Set<string>;
  strict: boolean;
}

/** Error thrown for the first diagnostic when strict mode is enabled. */
export class AtFunctionTransformError extends Error {
  diagnostic: Diagnostic;

  constructor(diagnostic: Diagnostic) {
    super(`[${diagnostic.code}] ${diagnostic.message}`);
    this.name = "AtFunctionTransformError";
    this.diagnostic = diagnostic;
  }
}

function diagnosticKey(diagnostic: Diagnostic): string {
  return [
    diagnostic.loc?.source_index ?? -1,
    diagnostic.loc?.line ?? -1,
    diagnostic.loc?.column ?? -1,
    diagnostic.code,
    diagnostic.message,
  ].join(":");
}

export function reportDiagnostic(
  reporter: DiagnosticReporter,
  diagnostic: Diagnostic,
): boolean {
  const key = diagnosticKey(diagnostic);
  if (reporter.seen.has(key)) {
    return false;
  }
  reporter.seen.add(key);
  reporter.diagnostics.push(diagnostic);
  reporter.onDiagnostic?.(diagnostic);

  if (reporter.strict) {
    throw new AtFunctionTransformError(diagnostic);
  }

  return true;
}
