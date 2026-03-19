# Focusgroup Polyfill

Applications can adopt `focusgroup` before it is widely available in the Web Platform.

The polyfill follows these principles:
- **Performance**: Small in terms of bytes and fast in terms of runtime execution.
- **Correctness**: Where performance is in conflict with correctness and spec-compliance, we will favor a correct, spec-compliant implementation.
- **Updates**: Ship updates as the spec evolves so the latest version of the polyfill implements the latest version of the spec.
- **Migration**: Make it easy to migrate to new updates if/when the spec evolves.

For more information about focusgroup itself, see: https://open-ui.org/components/scoped-focusgroup.explainer/

## Usage

```bash
# npm
npm install @microsoft/focusgroup-polyfill

# yarn
yarn add @microsoft/focusgroup-polyfill
```

```js
import { polyfill } from "@microsoft/focusgroup-polyfill";
// Polyfill the entire document
polyfill();

// Polyfill a subtree of the document
const myElement = document.querySelector(".my-element");
polyfill(myElement);
```

If your project doesn’t need Shadow DOM support, you can use the “shadowless” bundle, which has smaller file size:

```js
import { polyfill } from "@microsoft/focusgroup-polyfill/shadowless";
// Polyfill the entire document
polyfill();

// Polyfill a subtree of the document
const myElement = document.querySelector(".my-element");
polyfill(myElement);
```
