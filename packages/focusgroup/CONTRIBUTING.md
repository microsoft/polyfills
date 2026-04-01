# Contributing

Please see the root [CONTRIBUTING.md](../../CONTRIBUTING.md) for general, project-wide guidance.

## Test coverage

All new contributions must be accompanied by tests for the new feature. Similarly, bug fixes should include a test that demonstrates the bug being fixed.

As this feature is highly dependent on browser focus behavior, all tests must be written for Playwright. Refer to [TESTING.md](./TESTING.md) and see the existing tests for examples.

## Code

All code is written in JavaScript and uses native ES modules. In particular this means imported scripts must have a `.js` extension.

All public APIs must have [JSDoc](https://jsdoc.app/) comments.

## Design

This polyfill is designed to export a minimal public API surface, keeping the code simple to use and maintain.

On a high-level, the polyfill works in 3 stages:

1. **Decoration**: decorates the focusgroup owner and its items
    * Parses focusgroup definition based on the owner’s `focusgroup` attribute
    * Infers owner and item roles
    * Adds various data attribute to store focusgroup-relevant states
    * Determines `tabindex` values for items
2. **Traversal**: traverses the DOM as user making directional navigations
    * Listens to keyboard and pointer events
    * Uses `TreeWalker` to determine the next focusing element based on user input and language writing direction (CSS `direction` and `writing-mode`)
    * Updates `tabindex` on the current and next focusing elements, and move the focus
3. **Observation**: observes DOM changes within the focusgroup to adjust the decoration
    * Observes to a list of attribute changes in the subtree of the group
    * Runs the decoration stage again to update the states on affected item elements

And for each of these 3 stages, because the focusgroup spec supports Shadow DOM, the polyfill uses [utilities](./src/shadow-utils/) that are ergonomically similar to native DOM API but are able to pierce through open shadow boundaries.
