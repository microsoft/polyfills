import type { Diagnostic } from "./diagnostics.js";

export interface AtFunctionOptions {
  /**
   * Keep native declarations and @function definitions while inserting a
   * transformed fallback first.
   *
   * @default false
   */
  preserve?: boolean;

  /**
   * Throw an AtFunctionTransformError instead of reporting a diagnostic and
   * leaving the declaration unchanged.
   *
   * @default false
   */
  strict?: boolean;

  /**
   * Receive diagnostics for definitions or calls that cannot be transformed.
   */
  onDiagnostic?: (diagnostic: Diagnostic) => void;
}
