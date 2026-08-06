# @microsoft/postcss-at-function

A [PostCSS plugin](https://postcss.org/) for the statically resolvable subset
of CSS custom functions defined with
[`@function`](https://developer.mozilla.org/en-US/docs/Web/CSS/Reference/At-rules/@function).

```sh
npm install @microsoft/postcss-at-function postcss --save-dev
```

## Usage

Add the plugin to a PostCSS configuration:

```js
import postcssAtFunction from "@microsoft/postcss-at-function";

export default {
  plugins: [postcssAtFunction()],
};
```

Or use it directly:

```js
import postcss from "postcss";
import postcssAtFunction from "@microsoft/postcss-at-function";

const result = await postcss([
  postcssAtFunction({
    preserve: false,
    strict: false,
  }),
]).process(
  `
    @function --double(--value <length>) returns <length> {
      result: calc(var(--value) * 2);
    }

    .card {
      padding: --double(10px);
    }
  `,
  { from: undefined },
);

console.log(result.css);
console.log(result.warnings());
```

Output:

```css
.card {
  padding: calc(10px * 2);
}
```

## Options

### `preserve`

Type: `boolean`

Default: `false`

Keep native `@function` syntax and insert the transformed declaration first.
For custom or unknown properties, preserve mode leaves the declaration
unchanged and emits an `unsupported-preserve-custom-property` diagnostic
because downstream CSS processors may collapse duplicate fallbacks.

### `strict`

Type: `boolean`

Default: `false`

By default, an unsafe call is left unchanged and reported as a PostCSS warning.
Set `strict: true` to throw an `AtFunctionTransformError`.

### `onDiagnostic`

Type: `(diagnostic) => void`

Receive structured diagnostics with a stable code, message, optional function
name, and source location. Diagnostics are also emitted as PostCSS warnings.

## Supported syntax

- Parameters, positional arguments, and default values.
- Local custom properties and the last declaration in source order.
- Nested custom functions and outer function scopes.
- Shorthand types, `type(...)`, alternatives, and `+`/`#` multipliers.
- Conservative static parameter and return-type validation.
- Comma-containing arguments wrapped in braces, such as `{1px, 2px}`.
- Calls inside standard declaration values, descriptors, and custom
  properties.
- Atomic declaration rollback when any known call cannot be transformed.
- Transitive retention of definitions required by unresolved native calls.

Runtime-dependent values are preserved when direct substitution is safe. For
example, an untyped `--double(var(--space))` call can become
`calc(var(--space) * 2)`.

## Safety boundaries

This is a conservative build-time transform, not a complete
computed-value-time polyfill. It reports and leaves the containing declaration
unchanged for:

- Conditional rules inside functions, including `@media`, `@supports`, and
  `@container`.
- Conditional, layered, or nested function definitions.
- Runtime-dependent typed arguments or return values.
- Dynamic substitutions whose validity controls a parameter or `var()`
  fallback.
- Cyclic functions, defaults, or local bindings.
- CSS-wide local values whose behavior depends on function scope.
- Missing nested function definitions.

Run import expansion before this plugin if definitions live in other files.

## Standards references

- [PostCSS plugin API](https://postcss.org/api/)
- [MDN: CSS custom functions and mixins](https://developer.mozilla.org/en-US/docs/Web/CSS/Guides/Custom_functions_and_mixins)
- [MDN: `@function`](https://developer.mozilla.org/en-US/docs/Web/CSS/Reference/At-rules/@function)
- [CSS Custom Functions and Mixins Module](https://drafts.csswg.org/css-mixins-1/)
