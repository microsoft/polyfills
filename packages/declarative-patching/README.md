# Declarative Patching Polyfill

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![npm version](https://badge.fury.io/js/%40microsoft%2Fdeclarative-patching-polyfill.svg)](https://badge.fury.io/js/%40microsoft%2Fdeclarative-patching-polyfill)

Minimal polyfill for the [Declarative Partial Updates (interleaved HTML streaming / patching)](https://github.com/WICG/declarative-partial-updates/blob/main/patching-explainer.md) proposal.

It enables declarative, out-of-order HTML patching using `<template for="name">` elements and processing-instruction markers (`<?start>`, `<?end>`, `<?marker>`).

## How it works

Browsers parse XML processing instructions like `<?start name="gallery">` as **Comment nodes** (bogus comments). The polyfill:

1. Detects these Comment nodes via regex matching on `.data`
2. Matches `<template for="X">` elements to target elements with a `marker="X"` attribute
3. Replaces content in the marked ranges with the template's content
4. Uses a `MutationObserver` to handle templates added dynamically (streaming)

When browsers ship native support (`"marker" in Element.prototype`), the polyfill no-ops automatically.

## Usage

```bash
# npm
npm install @microsoft/declarative-patching-polyfill

# yarn
yarn add @microsoft/declarative-patching-polyfill
```

```js
import { observe } from "@microsoft/declarative-patching-polyfill";

// Start observing — processes existing patches and watches for new ones
const disconnect = observe();

// Stop observing when done
disconnect();
```

### Scoping to a subtree

```js
const container = document.getElementById("my-container");
const disconnect = observe(container);
```

### HTML structure

```html
<!-- Target element with a marker attribute -->
<section marker="gallery">
  <?start name="gallery">Loading...<?end>
</section>

<!-- Patch template — replaces the marked range -->
<template for="gallery">
  <p>Actual gallery content</p>
</template>
```

### Patch modes

| Mode | HTML | Behavior |
|------|------|----------|
| **Start/end range** | `<?start name="x">...<?end>` | Replaces everything between start and end |
| **Start-only range** | `<?start name="x">...` | Replaces from start to end of parent |
| **Marker point** | `<?marker name="x">` | Inserts content at the marker position |
| **No markers** | (none) | Appends content to the target element |
| **Bare markers** | `<?start>...<?end>` | Unnamed markers, matched by unnamed templates |

### Hash syntax

Target a specific named marker within an element:

```html
<section marker="gallery">
  <?start name="part">Loading...<?end>
</section>

<template for="gallery#part">
  <p>Replaces the "part" range inside gallery</p>
</template>
```

### Interleaved patching

Stream content incrementally using continuation markers:

```html
<div marker="results">
  <?start name="results">Loading...
</div>

<template for="results">
  <p>first result</p>
  <?marker name="results">
</template>

<template for="results">
  <p>second result</p>
</template>
```

### Error handling

Per the spec, `<template for>` elements that fail to match a target remain in the DOM as an error signal. Only successfully applied templates are removed.

## Not implemented

The following parts of the proposal are out of scope for this polyfill:

- `streamAppendHTMLUnsafe()` integration
- `element.markerRange()` API
- `patchsrc` attribute (URL-based patching)
- Implicit markers (`marker="gallery:all"`)
- `contentrevision` matching
- Shadow DOM scoping constraints

## Testing

See [TESTING.md](./TESTING.md) for details on how to test this project.

## Contributing

See [CONTRIBUTING.md](./CONTRIBUTING.md).

## Support

See [SUPPORT.md](./SUPPORT.md).
