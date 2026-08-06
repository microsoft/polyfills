# Contributing

Please see the root [CONTRIBUTING.md](../../CONTRIBUTING.md) for general,
project-wide guidance.

## Test coverage

All new features and bug fixes must include tests. Tests use Node's built-in
test runner and should cover both successful transformations and conservative
fallback behavior.

## Code

The transform is written in TypeScript and uses native ES modules. Relative
imports must include a `.js` extension so the emitted declarations work in
Node.js.

Document all public APIs with TSDoc comments and keep the exported API surface
minimal.

## Design

This package is a conservative build-time transform. When a custom function
cannot be resolved safely, it must preserve the original declaration and emit
a structured diagnostic rather than changing runtime behavior.
