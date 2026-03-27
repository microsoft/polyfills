# Focusgroup Polyfill

Applications can adopt `focusgroup` before it is widely available in the Web Platform.

The polyfill follows these principles:
- **Performance**: Small in terms of bytes and fast in terms of runtime execution.
- **Correctness**: Where performance is in conflict with correctness and spec-compliance, we will favor a correct, spec-compliant implementation.
- **Updates**: Ship updates as the spec evolves so the latest version of the polyfill implements the latest version of the spec.
- **Migration**: Make it easy to migrate to new updates if/when the spec evolves.

For more information about focusgroup itself, see: <https://open-ui.org/components/scoped-focusgroup.explainer/>

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

## Limitations

* The `focusgroup` spec is still evolving, the polyfill may not reflect the latest spec changes and the native implementations, check the [CHANGELOG.md](./CHANGELOG.md) for details
* Doesn’t support `focusgroup` property
    * If the polyfill adds `focusgroup` property to `HTMLElement.prototype`, it will break feature detection when `polyfill()` is called again. But if it only adds `focusgroup` property to individual HTML elements, it can’t changing `focusgroup` property’s value on an arbitrary element
* Polyfill explicitly manipulates `tabindex` attributes
    * It does save the attribute’s value that the author defined, so that it can restore the attribute to its original value when needed
* Polyfill doesn’t work with CSS’s `reading-flow`
* Role inferring
    * Polyfill only consider `div`, `span`, and custom elements to have a `generic` role, hence only infer roles on these elements, plus `button` for item role inferring
    * Polyfill will not be able to avoid role inference on items that have non-generic roles defined via their `ElementInternals`
* When an focusgroup item has arrow/home/end key handlers, polyfill is inconsistent with the native implementation because it can’t access author event listeners:
    * Custom element: unless the custom element calls `event.preventDefault()`, adding arrow/home/end key handler will not stop the polyfill from handling directional navigation
    * Built-in elements that have key conflict (e.g. `<input>`): cancelling default arrow/home/end key behavior won’t enable the polyfill to add directional navigation
* If an item’s keyboard focusability changed by a method that doesn’t reflect on any attribute changes, polyfill will not be able to exclude the item from continuing participating the directional navigation
    * For example, a custom element (as a focusgroup item) gets disabled through a property change or other mechanism without reflecting its disabled state to a `disabled` attribute
* After initial polyfill, visibility changes on elements that matter to the focusgroup’s behaviors will not automatically update the group’s behavior:
    * For example, if a menu has a submenu that is initially hidden, because the submenu is hidden, it will not segment the top-level menu items. When the submenu becomes visible (e.g. hitting `ArrowRight` key on its parent menu item), it still will not segment the top-level menu items, as a result, hitting `Tab` key will not move the focus to the next top-level item, but out of the menu instead
    * This is because the polyfill only observe changes to the child element lists and their attributes, we may add support to visibility changes in the future

## Common patterns

### Using with custom elements that have nested custom elements

If you have a custom element that is a focusgroup, and its items are also custom elements, you may run into issues that the children aren’t ready when focusgroup polyfill kicks in. While the polyfill does observe mutations, there might be racing conditions between the polyfill and child elements, we’d recommend to call the `polyfill()` function inside a `queueMicrotask()` callback function:

```js
import { polyfill } from "@microsoft/focusgroup-polyfill";

class MyTablist extends HTMLElement {
  connectedCallback() {
    // Other tasks to do for initiate the tablist component

    queueMicrotask(() => {
      polyfill(this);
    });
  }
}
```

### Toggling visibilities of focusgroup items

Currently the polyfill doesn’t support observing visibility changes on items or nested groups. As a workaround, you should add `tabindex="0"` to all items, and if an item is nested inside a hidden container, or itself is hidden, also add `focusgroup="none"` to opt out of the directional navigation. When the item becomes visible, remove `focusgroup="none"`  attribute.
You may want to make the `focusgroup="none"` attribute changes after the visibility changes and inside a `requestAnimationFrame` callback function.

## Testing

See [TESTING.md](./TESTING.md) for details on how to test this project.

## Contributing

See [CONTRIBUTING.md](./CONTRIBUTING.md).

## Support

See [SUPPORT.md](./SUPPORT.md).
