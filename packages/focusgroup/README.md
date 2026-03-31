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

If your project doesn’t need Shadow DOM support, you can use the "shadowless" bundle, which has smaller file size:

```js
import { polyfill } from "@microsoft/focusgroup-polyfill/shadowless";
// Polyfill the entire document
polyfill();

// Polyfill a subtree of the document
const myElement = document.querySelector(".my-element");
polyfill(myElement);
```

## Limitations

While one of the polyfill’s principles is "correctness", it’s still bound to the web platform’s limitations, especially when considering performance.

* The `focusgroup` spec is still evolving, the polyfill may not reflect the latest spec changes and the native implementations, check the [CHANGELOG.md](./CHANGELOG.md) for details
* Doesn’t support `focusgroup` property
    * If the polyfill adds the `focusgroup` property to `HTMLElement.prototype`, it will break feature detection when `polyfill()` is called again. But if it only adds the `focusgroup` property to individual HTML elements, it can’t change the `focusgroup` property’s value on an arbitrary element
* Polyfill explicitly manipulates `tabindex` attributes
    * It does save the attribute’s value that the author defined, so that it can restore the attribute to its original value when needed
* Polyfill doesn’t work with CSS’s `reading-flow`
* Role inferring
    * Polyfill only considers `div`, `span`, and custom elements to have a `generic` role, hence only infers roles on these elements, plus `button` for item role inferring
    * Polyfill will not be able to avoid role inference on items that have non-generic roles defined via their `ElementInternals`
* When a focusgroup item has arrow/home/end key handlers, polyfill is inconsistent with the native implementation because it can’t access author event listeners:
    * Custom element: unless the custom element calls `event.preventDefault()`, adding arrow/home/end key handler will not stop the polyfill from handling directional navigation
    * Built-in elements that have key conflict (e.g. `<input>`): cancelling default arrow/home/end key behavior won’t enable the polyfill to add directional navigation
* If an item’s keyboard focusability is changed by a method that doesn’t reflect on any attribute changes, polyfill will not be able to exclude the item from continuing participating the directional navigation
    * For example, a custom element (as a focusgroup item) gets disabled through a property change or other mechanism without reflecting its disabled state in a `disabled` attribute
* After initial polyfill, visibility changes on elements that matter to the focusgroup’s behaviors will not automatically update the group’s behavior:
    * For example, if a menu has a submenu that is initially hidden, because the submenu is hidden, it will not segment the top-level menu items. When the submenu becomes visible (e.g. hitting `ArrowRight` key on its parent menu item), it still will not segment the top-level menu items, as a result, hitting `Tab` key will not move the focus to the next top-level item, but out of the menu instead
    * This is because the polyfill only observes changes to the child element lists and their attributes, we may add support for visibility changes in the future

## Common patterns

### Using with custom elements that have nested custom elements

If you have a custom element that is a focusgroup, and its items are also custom elements, you may run into issues that the children aren’t ready when focusgroup polyfill kicks in. While the polyfill does observe mutations, there might be racing conditions between the polyfill and child elements, we’d recommend to call the `polyfill()` function inside a `queueMicrotask()` callback function:

```js
import { polyfill } from "@microsoft/focusgroup-polyfill";

class MyTablist extends HTMLElement {
  connectedCallback() {
    // Other tasks for initiating the tablist component

    queueMicrotask(() => {
      polyfill(this);
    });
  }
}
```

### Toggling visibilities of focusgroup items

Currently the polyfill doesn’t support observing visibility changes on items or nested groups. As a workaround, you should add `tabindex="0"` to all items, and if an item is nested inside a hidden container, or itself is hidden, also add `focusgroup="none"` to opt out of the directional navigation. When the item becomes visible, remove the `focusgroup="none"` attribute.
You may want to make the `focusgroup="none"` attribute changes after the visibility changes and inside a `requestAnimationFrame` callback function.

### Selecting focusgroup items

In some UI design patterns, e.g. tab list and tabs, you’ll not only need to handle directional navigation, but also changing an item’s selection state, e.g. activating a tab and deactivating another. Since focusgroup is designed to only handle directional navigation, as a developer, you’ll still have to handle selection by yourself.

Take the tab list and tab patterns as an example, to manage selection, here are some recommendations:

* Set tab list’s `focusgroup` with no memory
* Update selection in a `focusin` event handler
* Add `focusgroupstart` attribute to the selected tab (and remove from the deselected one)

```html
<my-tablist focusgroup="tablist nomemory">
  <my-tab>tab 1</my-tab>
  <my-tab>tab 2</my-tab>
  <my-tab>tab 3</my-tab>
  <my-tab>tab 4</my-tab>
</my-tablist>
```

```js
class MyTablist extends HTMLElement {
  // ...

  // This method listens to the `focusin` event on the tab list element itself.
  handleFocusInEvent(event) {
    const { target } = event;

    // Assuming no nested focusable element inside each tab element.
    if (!isTab(target) || target.disabled) {
      return;
    }

    const currentSelected = this.querySelector("my-tab[aria-selected='true']");
    if (currentSelected) {
      currentSelected.removeAttribute("aria-selected");
      currentSelected.removeAttribute("focusgroupstart");
      // Hide the associated tab panel.
    }

    target.setAttribute("aria-selected", "true");
    target.setAttribute("focusgroupstart", "");
    // Show the associated tab panel.
  }
}
```

If the focusgroup’s reentry point doesn’t need to align with the element that has the selected state within a group, you can skip the `focusgroupstart` attribute manipulation and feel free to remove `nomemory` as you see fit, but it’s still recommended to use `focusin` event on the focusgroup owner element to update selection states.

## Testing

See [TESTING.md](./TESTING.md) for details on how to test this project.

## Contributing

See [CONTRIBUTING.md](./CONTRIBUTING.md).

## Support

See [SUPPORT.md](./SUPPORT.md).
