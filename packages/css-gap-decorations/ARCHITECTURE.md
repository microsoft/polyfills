# CSS Gap Decorations Polyfill — Architecture

A concise, durable reference to the polyfill's structure and design decisions,
for humans and agents. For deep per-feature algorithms, Blink references, and
fix history, see `.github/prompts/css-gap-decorations-context.prompt.md`.

---

## What it does

Implements the [CSS Gap Decorations spec (css-gaps-1)](https://drafts.csswg.org/css-gaps-1/)
— `column-rule`/`row-rule` and their `*-rule-*` longhands (`-style`, `-color`,
`-width`, `-break`, `-inset-*`, `rule-visibility-items`, `rule-overlap`) — for
**grid**, **flex**, and **multicol** containers in browsers without native
support. Every property applies to all three container types. The reference
implementation is Chromium/Blink.

It runs entirely at runtime, with zero dependencies: it reads CSS, computes gap
geometry per container, and paints decorations as positioned, CSS-border-styled
`<div>` overlays that render pixel-identically to native.

---

## Pipeline

```
fetch → parse → shift → resolve → geometry → segments → paint → observe
```

| Stage | File(s) | Responsibility |
|-------|---------|----------------|
| fetch | `fetch.ts` | Collect stylesheet text (`<style>`, `<link>`; cross-origin via `fetch()`). |
| parse | `parse.ts` | Hand-written CSS parser: walk rules (incl. `@media`/`@supports`/`@layer`), parse gap-decoration declarations and shorthands → longhands, and capture each declaration's at-rule/`@layer` context. |
| shift | `shift.ts` | Rewrite gap-decoration declarations into `--gdp-*` custom properties (registered via `@property`) in an adopted stylesheet, so the browser resolves the cascade; read the results back with `getComputedStyle`. |
| cascade | `cascade.ts` | Discover gap containers (matched selectors + inline declarations) and read their resolved `ComputedGapStyles` via `shift`. |
| resolve | `resolve.ts` | Resolve container-dependent keyword defaults (e.g. multicol `column-rule-break: normal` → `intersection`). |
| geometry | `geometry/{grid,flex,multicol}.ts`, `common.ts` | Compute gap positions, intersections, cell occupancy, blocked/empty ranges. The heaviest area (multicol and grid). |
| segments | `segments.ts` | Convert geometry + styles into drawable `Segment[]`: visibility filtering, rule-break merging, cap/junction classification, inset resolution. |
| paint | `painter.ts` | Render segments as bordered `<div>`s in a shadow-root overlay; suppress native `column-rule` where needed (multicol). |
| observe | `observer.ts` | `MutationObserver` + `ResizeObserver` drive rAF-coalesced repaints. |

Entry points: `index.ts` (auto-installs on load) and `index-fn.ts` (the `./fn`
export — `await polyfill()`). Both no-op when the browser natively supports gap
decorations (feature-detected via `CSS.supports('column-rule-break','intersection')`).

---

## Key design decisions

**Bordered-`<div>` overlay (native-identical rendering).** Each segment is a
zero-size `<div>` with a single CSS border edge. CSS border styles
(`dotted`/`dashed`/`double`/`ridge`/`groove`/`inset`/`outset`) rasterize in
browser-specific ways that canvas or SVG can't reproduce pixel-for-pixel — the
div overlay is what makes the output match native (and pass the reftests).
`inset`/`outset` are mapped to `ridge`/`groove` to match how the engine paints a
gap-decoration rule, which sits in a gap with content on both sides.

**One shadow-DOM overlay for all container types.** The overlay lives in the
container's open shadow root, before a `<slot display:contents>` that projects
the light-DOM children back into the container's own layout (so grid, flex, and
multicol all lay out and fragment normally). Keeping the overlay out of the
light-DOM child list preserves `:first-child`/`:nth-child` on content. The
container is made a containing block (`position: relative`) and a stacking
context (`z-index: 0`) so the overlay's `z-index: -1` paints behind in-flow
content — correct even behind semi-transparent items. (A wrapper-`<div>`
strategy is deliberately avoided: it would sever subgrid's parent-child
relationship, sit outside the container's overflow clip, and change which
element is the layout item in an outer grid/flex.)

**Container styles via adopted stylesheet, not inline.** The containing block,
stacking context, and native-`column-rule` suppression are applied through a
single adopted stylesheet keyed on marker attributes (`data-gap-host-relative`,
`data-gap-host-stacking`, `data-gap-suppress-crule`). The container's own
`style` attribute is never mutated, so nothing needs saving/restoring and the
polyfill doesn't trip its own `MutationObserver`. Markers are only added during
paint (never cleared mid-paint, which would flip-flop against the rule's effect
on the re-read computed value); `removeOverlay` clears them.

**Native column-rule suppression (multicol).** The browser paints native
`column-rule` independently. When the polyfill renders features native can't
(row rules, rule-break, insets, visibility filtering, multi-value lists), it
suppresses native `column-rule` via the adopted stylesheet to avoid
double-painting. Standard single-value column rules are left to native rendering
(pixel-perfect, avoids sub-pixel diffs).

**Cascade delegated to the browser (the "shift" strategy).** Rather than
implementing the CSS cascade in JavaScript, `shift.ts` rewrites each
gap-decoration declaration into a `--gdp-<longhand>` custom property
(registered via `@property`) and emits them into an adopted stylesheet that
mirrors the original selector, source order, `!important`, and
at-rule/`@layer`/`@media` context. The engine then resolves specificity,
source order, `!important`, `@layer`, and `var()`, and the polyfill reads the
winning values back with `getComputedStyle`. Inset and keyword longhands are
registered with specific `@property` syntaxes (so the engine validates them
and resolves `calc()`/units/percentages); the color/style/width list longhands
use `syntax: "*"` and are parsed/serialized by the polyfill, because the
`repeat()` grammar can't be expressed as a registered syntax. Inline (and
JS-set) declarations are emitted last via `[data-gdp-inline]` marker-attribute
rules. This custom-property-rename approach is the same technique the CSS
Anchor Positioning polyfill (`@oddbird/css-anchor-positioning`) uses to
polyfill engine-unrecognized properties.

**Hand-written CSS parser, zero dependencies.** `parse.ts` tokenizes and
parses the gap-decoration value grammar — including `repeat()`, `<gap-rule>`,
and insets — that no native API exposes, and decomposes the list shorthands
into longhands. Gap-decoration values set via JS that the engine isn't
required to serialize are also read directly from the `CSSStyleDeclaration`
object.

**Fail loud, not silent.** `updateContainer` (`observer.ts`) wraps each
container's update in an error boundary that removes any partial overlay and
`console.warn`s. The painter deliberately does not swallow exceptions (e.g.
`attachShadow` on a non-host element such as a `<ul>`/`<table>` used as a
grid/flex container), so failures surface in dev tools rather than the polyfill
silently painting nothing.

**Targeted observation.** The container `MutationObserver` uses `subtree: true`
but reacts only to attribute/childList changes on the container or its direct
children (placement-affecting), ignoring deep content mutations and the
polyfill's own nodes. `ResizeObserver` is container-only. Repaints are
rAF-coalesced.

---

## Testing

- **WPT reftests** via Playwright (`wpt-runner/`) compare the polyfill's output
  against each test's reference. Native gap decorations are disabled for the
  Chromium project so the test page exercises the polyfill; the reference is
  rendered *without* the polyfill, as an independent oracle. A few upstream
  references that themselves render via gap decorations get the polyfill injected
  as a documented workaround.
- **Crash tests** run the polyfill against fuzzer-found inputs and pass when the
  renderer survives. They use a deterministic signal — the polyfill's readiness
  promise (resolves after its initial synchronous paint) plus the WPT
  `test-wait` signal — instead of a fixed timeout, and assert no renderer crash
  or uncaught error.
- **Repaint specs** (`wpt-runner/repaint.spec.ts`) verify the polyfill repaints
  on DOM mutation — a polyfill-internal concern the WPT suite doesn't pin down.
- **Unit tests** (`tests/`, vitest) cover parsing, properties, and resolution.

Fragmentation is not implemented, so fragmentation tests are skipped. A small set
of tests are known-unfixable by a polyfill and are skipped with reasons:
`:visited` color (browser privacy restriction), legacy `-webkit-box`, and a few
multicol overflow-column / `column-count: auto` cases. Firefox lacks CSS Multicol
Level 2 (`column-height`, `column-wrap`, row rules), so multicol features don't
apply there; grid and flex otherwise work.

---

## Build & commands

```sh
cd packages/css-gap-decorations
npm run build    # vite (unminified ESM) + tsc + minified IIFE
npm run test     # vitest unit tests

# Full WPT suite (Chromium):
npx playwright test --config wpt-runner/playwright.config.ts \
  --project=chromium --reporter=line

# Multicol only, on either engine:
npx playwright test --config wpt-runner/playwright.config.ts \
  --grep multicol --project=chromium   # or --project=firefox
```

Build artifacts (`dist/`, git-ignored): a minified IIFE
(`css-gap-decorations.iife.js`, the delivery bundle), an unminified ESM library
(`css-gap-decorations-fn.js`; consumers minify), and a tiny auto-install ESM
entry (`css-gap-decorations.js`).
