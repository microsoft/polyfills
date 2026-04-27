# Declarative adopted style sheets ponyfill

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![npm version](https://badge.fury.io/js/%40microsoft%2Fshadowrootadoptedstylesheets-ponyfill.svg)](https://badge.fury.io/js/%40microsoft%2Fshadowrootadoptedstylesheets-ponyfill)

For more information about declarative adopted style sheets itself, see: <https://github.com/MicrosoftEdge/MSEdgeExplainers/blob/main/ShadowDOM/explainer.md> and <https://github.com/MicrosoftEdge/MSEdgeExplainers/blob/main/ShadowDOMAdoptedStyleSheets/explainer.md>

## Usage

```bash
# npm
npm install @microsoft/shadowrootadoptedstylesheets-ponyfill

# yarn
yarn add @microsoft/shadowrootadoptedstylesheets-ponyfill
```

```html
<style type="module" specifier="tokens">
  ...
</style>

<style type="module" specifier="my-element-styles">
  :host {}
  ...
</style>

<my-element data-shadowrootadoptedstylesheets="tokens my-element-styles ./extra-styles.css">
  <template
    shadowrootmode="open"
    shadowrootadoptedstylesheets="tokens my-element-styles ./extra-styles.css"
  >
    ...
  </template>
</my-element>

<script type="module">
  import { install } from "@microsoft/shadowrootadoptedstylesheets-ponyfill";

  install();
</script>
```

## Limitations

The ponyfill works differently than the native implementation in a few ways — hence “ponyfill” rather than “polyfill”:

* The ponyfill requires an extra `data-shadowrootadoptedstylesheets` data attribute on the shadow host, because once a declarative shadow root `<template>` element is parsed, it becomes a shadow root right away, so there’s no way for JavaScript to locate the `<template>` and read the attribute
    * It’s still recommended to add the `shadowrootadoptedstylesheets` attribute to the declarative shadow root `<template>` element for browsers that do natively support this feature
* The ponyfill does not add `<style type="module" specifier>` elements to the importmap, because it requires browser support for both [multiple importmaps](https://caniuse.com/mdn-html_elements_script_type_importmap_multiple_import_maps) and [CSS module import attribute](https://caniuse.com/wf-css-modules)

## Testing

See [TESTING.md](./TESTING.md) for details on how to test this project.

## Contributing

See [CONTRIBUTING.md](./CONTRIBUTING.md).

## Support

See [SUPPORT.md](./SUPPORT.md).
