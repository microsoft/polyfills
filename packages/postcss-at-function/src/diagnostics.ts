export const TRANSFORM_NAME = "@microsoft/postcss-at-function";

/** Source location attached to a plugin diagnostic. */
export interface DiagnosticLocation {
  column: number;
  line: number;
  source_index: number;
}

/** Stable codes for diagnostics emitted by the plugin. */
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

/** Structured information about a definition or call that was not transformed. */
export interface Diagnostic {
  code: DiagnosticCode;
  functionName?: string;
  loc?: DiagnosticLocation;
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
