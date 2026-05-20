# Contributing

Please see the root [CONTRIBUTING.md](../../CONTRIBUTING.md) for general, project-wide guidance.

## Test coverage

All new contributions must be accompanied by tests for the new feature. Similarly, bug fixes should include a test that demonstrates the bug being fixed.

As this feature is highly dependent on browser focus behavior, all tests must be written for Playwright. Refer to [TESTING.md](./TESTING.md) and see the existing tests for examples.

## Code

All code is written in JavaScript and uses native ES modules. In particular this means imported scripts must have a `.js` extension.

All public APIs must have [JSDoc](https://jsdoc.app/) comments.
