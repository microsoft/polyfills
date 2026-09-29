---
description: "Context for working on the css-gap-decorations polyfill package — architecture, Blink reference behavior, fixes, and implementation notes."
agent: "agent"
---

# CSS Gap Decorations Polyfill — Continuation Context

You are continuing work on a CSS Gap Decorations polyfill at `packages/css-gap-decorations/`. The polyfill implements the [CSS Gap Decorations spec (css-gaps-1)](https://drafts.csswg.org/css-gaps-1/) for grid, flex, and multicol containers. The reference implementation is Chromium/Blink.

## Architecture

```
src/
  index.ts / index-fn.ts  — Entry points (auto-apply vs function export)
  cascade.ts              — CSS cascade: reads custom gap-decoration properties
  parse.ts                — Parses shorthand values into longhands
  properties.ts           — Property types (InsetValue, LineStyle, RuleBreak, etc.)
  resolve.ts              — Resolves computed values (visibility-items, rule-break, etc.)
  segments.ts             — Core segment logic: converts geometry + styles into drawable segments
  painter.ts              — Renders segments as styled div overlays
  observer.ts             — MutationObserver / ResizeObserver for live updates
  fetch.ts                — Fetches cross-origin stylesheets
  geometry/
    common.ts             — Shared types: Gap, Intersection, GapGeometry
    grid.ts               — Grid geometry: track positions, occupancy, intersections
    flex.ts               — Flex geometry: line-based gaps, abutting cross gaps
    multicol.ts           — Multicol geometry: column-wrap rows, spanner handling
```

## Key Data Flow

1. `cascade.ts` reads CSS custom properties from stylesheets
2. `geometry/*.ts` computes `GapGeometry`: gaps, intersections, occupancy grid, blocked ranges
3. `segments.ts` generates `Segment[]` from geometry + styles:
   - Raw per-track segments from intersection pairs
   - Visibility filtering (`rule-visibility-items: between | around | all`)
   - Merge per `rule-break` (none / normal / intersection)
   - Cap vs junction endpoint classification for inset computation
   - Inset resolution (px, %, overlap-join)
4. `painter.ts` renders each segment as a positioned div with border styling

## Intersection Model

Each gap has an intersection list: `[edge, (cross-end, cross-start)*, edge]`
- `edge`: container boundary (crossingGapWidth = 0)
- `cross-end` / `cross-start`: where a crossing gap interrupts this gap
- `crossingGapWidth`: size of the crossing gap at this intersection
- For flex: edge endpoints at abutting cross gaps carry `crossingGapWidth > 0`

## Endpoint Classification (isCapEndpoint)

Mirrors Blink's `IsCapIntersection` + `HasCrossGapSegment`:
- Container edge with no abutting gap → cap
- Same-axis visibility not "between" → always junction (Blink early return)
- For "between": check cross-direction segment on BOTH tracks flanking the gap
- Each track's visibility is gated by spanning-item blocked status (`isCrossGapBlockedAt`)
- Cap = no cross segment present; Junction = at least one side has visible, non-blocked cross segment

## Overlap-Join Inset

Per Blink's MC gap model (`layout/gap/README.md`), overlap-join distinguishes main vs cross direction:
- Grid: always `-(crossingGapWidth/2 + crossDecorationWidth/2)` — gaps overlap
- Flex/multicol **main-direction** gaps: `-(crossingGapWidth/2)` — gaps abut, no overlap
- Flex/multicol **cross-direction** gaps: `-(crossingGapWidth/2 + crossDecorationWidth/2)` — full overlap
- Multicol main=ROW (column-wrap rows + spanners), cross=COLUMN (opposite of intuition)
- Cap endpoints with overlap-join get 0 extension (flush)

## Merge Logic

`mergeSegments` for rule-break: normal requires contiguous track indexes — never merges across filtered-out invisible tracks (prevents donut-hole stitching).

**Visibility-items + rule-break: none**: The `ruleBreak === "none"` path applies visibility filtering before merge, then merges only contiguous visible segments. Previously it bypassed visibility entirely, creating full-length segments regardless of occupancy.

## Multicol Spanner Handling

- Spanners (`column-span: all`) create `blockedRanges` on column gaps
- Spanners are added as intersection points on column gaps (cross-end/cross-start pairs)
- Spanners do NOT create row gaps themselves
- Children are split into content blocks between spanners for independent row detection
- Spanner edges ARE included as row boundaries so `row-gap` spacing between content and spanners generates proper row gaps
- `detectMulticolRows` uses mode-based top/bottom to handle inflated first-column bounding rects after spanners

## Grid Occupancy

`geometry/grid.ts` builds an `occupied[row][col]` boolean grid. Uses CSS grid placement (`gridColumnStart`/`gridColumnEnd`) for zero-gap grids (avoids bounding-rect ambiguity). Falls back to bounding-rect hit-testing otherwise. In vertical writing modes, axes are swapped (`cTop` → columns, `cLeft` → rows) with `hitTrackDesc` for vertical-rl/sideways-rl descending tracks. Spanning items add `blockedRanges` to crossed gaps.

## Subgrid Support

When `gridTemplateColumns` or `gridTemplateRows` starts with `"subgrid"`, the polyfill walks up to the parent grid, extracts the subset of parent tracks the subgrid spans (via bounding-rect matching), and uses the parent's gap size. Non-subgridded axes use the element's own tracks/gaps. All 25 core subgrid tests pass.

## Writing-Mode Support

- **Grid**: Full axis swap in `geometry/grid.ts`. Columns along Y, rows along X. Vertical-rl/sideways-rl row gaps computed R-to-L. `isVertical` and `writingMode` fields on `GapGeometry`.
- **Flex**: Physical `isRow` for coordinate computation, logical `dirRow` for CSS-semantic labeling. Cross-gap size, value list labels, and final array assignments all use `dirRow`.
- **Multicol**: Full axis swap in `geometry/multicol.ts` using grid-style pattern (`inlineSize`/`blockSize` aliases, conditional column gap axis, row detection along X in vertical modes). `detectMulticolRows` takes `isVertical`+`writingMode` params, clusters by block-axis position. Multi-value cycling: multicol added to block-RTL row-rule reversal.
- **Painter**: `paintVertically = isVertical ? axis === "row" : axis === "column"` swaps which axis renders vertically/horizontally.

## Test Infrastructure

- WPT reftests via Playwright: `wpt-runner/playwright.config.ts`, `wpt-runner/wpt.spec.ts`
- Tests in `wpt-runner/wpt/css/css-gaps/{grid,flex,multicol}/`
- Run: `npm run test:wpt -- --project=chromium`
- `playwright.config.ts` `testMatch` includes BOTH `wpt.spec.ts` and `repaint.spec.ts`
- `wpt-runner/repaint.spec.ts` — local (non-WPT) specs that verify the polyfill repaints on child mutations. Uses a sentinel-div detector and explicitly waits for the first paint, so it genuinely exercises the mutation path (the vendored WPT repaint reftests can pass via async-init timing without doing so). 3 specs.
- Screenshots: `ATTACH_SCREENSHOTS=1` env var
- HTML report: add `--reporter=html` with `PLAYWRIGHT_HTML_OPEN=never`
- Diffs saved to `test-results/diffs/`
- Unit tests: `npm run test` (vitest) — 55 tests in `tests/{parse,properties,resolve}.test.ts`
- Build: `npm run build` (vite + tsc + iife bundle)
- Lint: biome 2.4.13. The lefthook pre-commit hook lints only STAGED files (`{staged_files}`); CI (`npm run check` at repo root) runs `biome check` REPO-WIDE. Files not touched since a biome version bump can therefore accumulate debt that only CI catches — re-run `npm run check` from the repo root before relying on green CI.
- A matching Playwright browser is required: after a `@playwright/test` version bump (e.g. from a rebase + `npm install`), run `npx playwright install chromium`.

## Current Status (Chromium WPT)

**Chromium run is green — 0 failed.** All WPT reftests for supported features
pass, plus the 3 local `repaint.spec.ts` specs. Crash tests run deterministically
(renderer-survival check, not a timeout) and pass. Skipped with documented
reasons: fragmentation (~74, not implemented) and the known-unfixable tests under
*Known Limitations* below. (A few upstream references that render via gap
decorations get the polyfill injected as a documented workaround so they still
run.)

### Fixes applied (May–June 2026)

| Commit | Tests fixed | Description |
|--------|------------|-------------|
| Column-wrap row detection | multicol-008/009/010/017/033 | Grid-based row detection using `column-height` CSS property for exact row positions in `column-wrap` layouts |
| Native column-rule suppression | (prevented regressions) | `adoptedStyleSheets` per-container suppression of native `column-rule` |
| Column-wrap auto detection | multicol-021 | `column-wrap: auto` with `column-height` triggers wrapping per spec |
| Row gap empty ranges | multicol-014/034/036 | `emptyRanges`/`fullyEmptyRanges` on row gaps for visibility filtering at empty column positions |
| Collapsed grid tracks | grid-061/062 | Correct gap positioning for `auto-fit` grids with collapsed 0px tracks; sequential gap indices for style mapping |
| Scroll offset | grid-034 | Removed incorrect scroll offset pinning from shadow overlay positioning |
| Broader suppression | (correctness) | Suppress native column-rule for any polyfill-only feature (insets, break, visibility, multi-value lists) |
| Robustness pass | (robustness) | Error boundaries, feature detection, source order reset, inline style restore, flex visibility-items, ResizeObserver simplification, ESM unminified, package rename |
| Code-quality pass | (code quality) | `buildGapsAlongAxis` helper, segment div reuse |
| Layout API caching | (performance) | Per-child `getComputedStyle`/`getBoundingClientRect` caching across geometry modules |
| Adopted-stylesheet host styles | (robustness) | Container containing-block/stacking-context applied via marker attributes, not inline styles — no `style` mutation to restore |
| Multicol shadow-DOM unification | (architecture) | Multicol uses the same shadow-root overlay as grid/flex; removed the wrapper div. Verified: full multicol suite green on Chromium, zero additional Firefox breakage |

### Known Limitations (skipped, not failing)

| Test | Diff | Category | Root Cause |
|------|------|----------|------------|
| grid-024/025/027 | 3100px | Unfixable | `:visited` browser security restriction |
| webkit-box | 1500px | Unfixable | Legacy `-webkit-box` display not detected as flex |
| multicol-007 | 84000px | Pre-existing | Nested multicol with fragmentation |
| multicol-013 | 1840px | Known limitation | Overflow columns + inset (suppression correct but polyfill can't detect overflow columns) |
| multicol-026 | 796px | Known limitation | `column-count: auto` with text content and spanners |
| multicol-027 | 3075px | Known limitation | Overflow columns beyond `column-count` with `rule-visibility-items: all` |

### Failure Categories
| Category | Count | Notes |
|----------|-------|-------|
| Fragmentation | ~74 | Not implemented (grid, flex, subgrid, multicol fragmentation tests excluded) |
| `:visited` security | 3 | Browser security restriction on `:visited` styling — unfixable |
| Legacy `-webkit-box` | 1 | `display: -webkit-box` not detected as flex — unfixable |
| Multicol overflow columns | 3 | Polyfill only detects columns up to `column-count`; `column-fill: auto` and overflowing content create additional columns the polyfill can't see |

### Key Architectural Decisions

**Shadow DOM overlay** (`painter.ts`): The polyfill overlay lives in a shadow root with `<slot display:contents>` for **all container types (grid, flex, and multicol)**, so it doesn't appear in the light-DOM child list (which would break `:first-child`/`:last-child`/`:nth-child` on content). The container is made a containing block (`position: relative`) and stacking context (`z-index: 0`) — so the overlay's `z-index: -1` paints behind in-flow items (critical for semi-transparent backgrounds) — via an **adopted stylesheet keyed on marker attributes (`data-gap-host-relative` / `data-gap-host-stacking`), not inline styles**. The container's own `style` attribute is never touched: nothing to save/restore on cleanup, and no self-triggered MutationObserver (it filters on `style`/`class`). Markers are only ever *added* during paint, never cleared (clearing would flip-flop against the rule's own effect on the re-read computed value); `removeOverlay` clears them. The overlay uses `position: absolute` at the border-box origin (negative border offsets) and scrolls naturally with the container's content. **No light-DOM fallback**: an earlier version appended the overlay into the container's light DOM when `attachShadow` failed, but that broke `:first-child`/`:nth-child`, so it was removed. `attachShadow` is now allowed to throw (it does for non-shadow-host elements like `<ul>`/`<table>`/`<button>` used as a grid/flex/multicol container) and propagate to the `updateContainer` error boundary (which `console.warn`s and removes the partial overlay) rather than silently skipping; likewise no `try/catch` wraps the constructable-stylesheet creation. The deliberate philosophy is to surface failures in dev tools instead of silently painting nothing/mispositioned. **Multicol** uses the same shadow overlay: the `<slot display:contents>` projects children back into the container so they still fragment into columns normally, and native `column-rule` is suppressed via the adopted stylesheet (see *Native column-rule suppression*). The wrapper-`<div>` strategy multicol previously used was removed — its historical justifications (slot projection breaking Chromium's column fragmenter; a stacking context disrupting column balancing) do not reproduce in current Chromium/Firefox, and the semi-transparent paint-order failures once attributed to shadow DOM were the z-order limitation later fixed by the stacking-context + `z-index: -1` change (now applied to multicol too). The unified shadow strategy passes the full multicol reftest suite on Chromium with zero additional Firefox breakage.

**Property model** (`properties.ts`): Every gap decoration property applies to all gap container types (grid, flex, multicol), matching the spec ("applies the full set of properties to other container types"). There is therefore no per-property `appliesTo` list — a property either exists or it doesn't — and the cascade applies any recognized longhand regardless of container type.

**Subgrid support** (`geometry/grid.ts`): Detect `gridTemplateColumns`/`gridTemplateRows` starting with `"subgrid"`, walk to parent grid, extract spanned tracks via bounding-rect matching, use parent's gap size. Non-subgridded axes use the element's own tracks/gaps. Subgrid children use bounding-rect hit-testing (not CSS grid placement, which returns parent grid line numbers).

**Writing-mode**: Grid has full axis swap (columns along Y, rows along X) with `hitTrackDesc` for vertical-rl descending tracks. Flex uses logical `dirRow` for CSS-semantic labeling (not physical `isRow`). Multicol has full axis swap using grid-style pattern (`inlineSize`/`blockSize` aliases). Multi-value cycling direction depends on writing-mode: `sideways-lr` reverses column-rule cycling, block-RTL reverses flex/multicol row-rule cycling.

**Zero-gap hit-testing** (`geometry/grid.ts`): When gap=0, adjacent tracks share boundaries and 1px-tolerance bounding-rect matching fails. Use CSS grid placement (`gridColumnStart`/`gridColumnEnd`) for exact logical indices. Only for zero-gap (subgrids need bounding-rect).

**Collapsed auto-fit tracks** (`geometry/grid.ts`): When a grid has both zero-sized and non-zero-sized tracks (auto-fit with collapsed empty tracks), skip gap creation AND gap space when the next track is 0px. Gaps exiting a collapsed region are kept only when a non-zero track preceded the collapse — leading collapsed tracks at the start of the grid don't generate gaps. Uses sequential gap indices (not raw track index `i`) for correct per-gap style mapping after collapse. If ALL tracks are 0px (intentionally sized), keep gaps. Per CSS Grid spec, gutters adjacent to collapsed auto-fit tracks collapse to 0px.

**JS-set gap styles** (`cascade.ts`): A user agent that doesn't implement a given gap decoration property isn't required to serialize it back to `getAttribute('style')` even when it's set via JS — this is per-spec behavior, and these properties are standard (not "non-standard"). The polyfill therefore also reads gap decoration properties directly from the `CSSStyleDeclaration` object via camelCase access (`el.style.rowRuleColor`). The long-standing CSS3 multicol `column-rule-*` properties ARE serialized.

**Multicol row-gap capping** (`geometry/multicol.ts`): The measured distance between a spanner bottom and the next content row can exceed the CSS `row-gap` value (due to first-column inflated bounding rects). Cap gap size to `Math.min(gapSize, rowGap)` and anchor to the content-side boundary (`nextRowStart - effectiveGapSize / 2`). Verified against Blink's `ColumnGapAccumulator::AddMainGap`.

**Multicol fewer-columns** (`geometry/multicol.ts`, `segments.ts`): Rows with fewer columns than the max use `emptyRanges` on column gaps (distinct from `blockedRanges` which are for spanning items). Empty ranges are only filtered when `rule-visibility-items` is not `"all"`, allowing `"all"` to paint rules in empty column positions. Row gaps also carry `emptyRanges`/`fullyEmptyRanges` based on per-column occupancy of adjacent rows, so `rule-visibility-items: between/around` correctly hides row decorations at unoccupied column positions.

**Native column-rule suppression** (`painter.ts`): The browser paints native `column-rule` independently of the polyfill. When the polyfill uses features the native engine doesn't support (insets, intersection breaks, visibility filtering, multi-value lists), native column-rule must be suppressed to prevent double-painting. Suppression uses `document.adoptedStyleSheets` with a per-container data attribute (`data-gap-suppress-crule`), which: (1) is invisible to the polyfill's cascade scanner (which only queries `<style>` and `<link>` elements), (2) doesn't modify element inline styles (avoiding MutationObserver loops), (3) applies via normal CSS cascade with `!important`. The suppression check (`needsColumnRuleSuppression`) tests for: row segments, non-default `column-rule-break` (not normal/intersection), non-default `column-rule-visibility-items` (not normal/between), any column-rule inset, or multi-value width/style/color lists. Containers with only standard column-rule properties (single values, default break/visibility) are NOT suppressed — native rendering is pixel-perfect for those cases and avoids sub-pixel polyfill diffs.

**Multicol column-wrap row detection** (`geometry/multicol.ts`): With `column-wrap: wrap` (or `column-wrap: auto` when `column-height` is specified), rows form a fixed grid: row n starts at `contentBlockStart + n * (columnHeight + rowGap)`. This grid-based approach gives exact row positions, avoiding inaccuracy from `getBoundingClientRect()` on fragmented children (which returns a union rect spanning all fragments). Spanners split grid rows into pre/post-spanner segments without shifting the grid. Column-wrap detection checks `columnWrap !== "nowrap"` when `column-height` is set — `auto` (the default) wraps when `column-height` triggers it, per the CSS Multicol Level 2 spec. The `column-height` property is accessed via `getCSSProperty(cs, "columnHeight")` — a typed utility in `geometry/common.ts` for Chromium-specific CSS properties not in TypeScript's `CSSStyleDeclaration` type.

**Multicol overflow columns**: Known limitation. The polyfill detects columns up to `cs.columnCount`. When `column-fill: auto` or overflowing content creates additional columns beyond this count, the polyfill can't detect or render decorations for them. This affects tests with content overflow (multicol-013, multicol-027). Native column-rule handles overflow columns correctly, but when suppression is active (due to polyfill-only features like insets), the missing overflow column-rules become visible.

**Style aliasing** (`painter.ts`): A gap-decoration rule sits in a gap with content on both sides and no "interior", so the bevelled border styles render symmetrically — `inset` paints identically to `ridge` and `outset` identically to `groove`. The polyfill maps `inset`→`ridge` and `outset`→`groove` to match the engine's native gap-decoration rendering (verified empirically against native Chromium). Note this mapping is **not** stated in the spec; it matches observed native behavior.

**Direction/RTL** (`segments.ts`): In RTL, column-rule multi-value lists reverse. Row-rule `inset-start`/`inset-end` swap for the inline axis.

### Known Remaining Issues
- **Fragmentation**: Not implemented (~74 tests). Would need container-level fragmentation support.
- **:visited pseudo-class** (3 tests): grid-024/025/027. Browser security restriction prevents `:visited` color from applying to gap decoration properties.
- **Legacy -webkit-box** (1 test): webkit-box.tentative. `display: -webkit-box` not detected as flex container.
- **Multicol overflow columns** (3 tests): multicol-007/013/027. Polyfill only detects columns up to `column-count`; `column-fill: auto` and overflowing content create additional columns invisible to the polyfill.
- **Multicol column-count:auto + text** (1 test): multicol-026. Text-based content with `column-count: auto` and spanners produces sub-pixel positioning differences.
- **Column-rule inset in block-reversed vertical modes** (`segments.ts`): logical inset start/end is mapped to physical segment start/end assuming top-to-bottom block flow. For block-reversed vertical modes (`vertical-rl` / `sideways-rl`), `column-rule` inset start/end would also need to swap, but no WPT currently exercises insets combined with a vertical writing mode, so this is intentionally deferred until such coverage exists. (Value-list cycling and geometry axis-swap for vertical modes ARE handled; this gap is specific to the inset start/end mapping.)

### Firefox Support

Firefox lacks CSS Multicol Level 2 properties (`column-height`, `column-wrap`, row rules), so all multicol tests fail on Firefox. Grid and flex tests mostly pass, with the same `:visited` and `webkit-box` failures as Chromium plus a few Firefox-specific rendering differences (flex-023, grid-017).

### Dependencies

The polyfill has zero runtime dependencies — all CSS parsing uses custom lightweight code. The build produces three artifacts:
- ESM library (unminified, `dist/`) — consumers handle their own minification
- TypeScript declarations (`dist/`)
- IIFE bundle (minified, `dist/css-gap-decorations.iife.js`, ~47KB / ~14KB gzipped)

Package name: `@microsoft/css-gap-decorations-polyfill` (following `@microsoft/focusgroup-polyfill` precedent).

### Robustness, Performance & Code Quality

Robustness, performance, and code-quality improvements:

**Correctness & robustness:**
- `rule-visibility-items` now applies to flex containers (spec compliance)
- Error boundary around `updateContainer` — catches geometry errors, removes overlay, logs warning
- Feature detection checks `column-rule-break: intersection` instead of `row-rule-color` — avoids disabling polyfill on partial browser implementations
- `globalSourceOrder` reset to 0 before full re-parse — prevents stale source-order numbers from inverting cascade priorities
- Container containing-block (`position: relative`) and stacking context (`z-index: 0`) applied via adopted-stylesheet marker attributes (`data-gap-host-relative` / `data-gap-host-stacking`), not inline styles — so nothing needs restoring on cleanup

**Performance:**
- `getComputedStyle` and `getBoundingClientRect` cached per child element in all geometry modules — eliminates redundant layout-forcing calls in sort comparators (~14× reduction for flex), occupancy loops, and row detection
- ResizeObserver simplified to container-only — child observations removed
- Overlay segment divs reused across repaints instead of clear+recreate

**MutationObserver — direct-child attribute observation** (`observer.ts`): The container MutationObserver uses `subtree: true` with `attributeFilter: ["style", "class"]`, but the callback filters to mutations on the container itself or its **direct children** (`m.target === el || m.target.parentNode === el`). This catches placement-affecting attribute changes on grid/flex items (e.g. `grid-column`, span, class) that would otherwise leave stale decorations, while ignoring deep content mutations. Polyfill-internal node insertions (multicol probes, overlay — all marked `data-gap-decorations-polyfill`) are excluded from the childList check to prevent self-triggered repaint loops. Verified: 0 idle repaints for grid, flex, and `column-count: auto` multicol. **Residual limitation**: a child's intrinsic-size change within a fixed-size container, with no attribute mutation, is not caught (child ResizeObservers were removed). Tested by `wpt-runner/repaint.spec.ts` (sentinel-based repaint detection, independent of the vendored WPT reftests which pass via async-init timing).

**Code quality:**
- Grid gap building extracted into `buildGapsAlongAxis` helper (4 duplicated blocks → 1 function)
- `getCSSProperty` utility in `geometry/common.ts` replaces unsafe `as unknown as Record<string, string>` casts

**Remaining investigation items** (not yet addressed):
- CSSOM feasibility — prototype `document.styleSheets`/`cssRules` cascade walker for `var()`, `calc()`, `@layer`, `@import` support

## Blink Reference Sources

Key Chromium source files for reference behavior (at `Q:\cr\src\third_party\blink\renderer\core`):
- `paint/gap_decorations_painter.cc` — main paint loop, segment iteration, inset/overlap computation
- `layout/gap/gap_geometry.cc` — `IsCapIntersection`, `ComputeOverlapJoinInset`, intersection generation, `GenerateCrossIntersectionListForMulticol`
- `layout/gap/gap_geometry.h` — `GetCrossingGapSize` returns CSS gap value (not measured), `GetCrossWidthForIntersection`
- `layout/gap/main_gap.h` — `MainGap` with `gap_offset_` (midpoint), `SpannerMainGapType` (kStart/kEnd/kNone)
- `layout/gap/README.md` — Main-Cross gap geometry design: grid/flex/multicol axis models
- `layout/column_gap_accumulator.cc` — `AddMainGap` offsets by `row_gap_size_/2` for non-spanner gaps; spanner gaps use raw offset
- `layout/column_layout_algorithm.cc` — multicol layout with gap accumulation, spanner handling
- `css/css_gap_decoration_property_utils.cc` — `HasCrossGapSegment`, `IsRuleSegmentVisible`

## Working Conventions

- Always build before testing: `npm run build`
- Run targeted tests first: `--grep "pattern"`
- Check for regressions with full suite before committing
- Lint with biome before commit: `npx biome check --fix --unsafe <files>`. The lefthook pre-commit hook only lints STAGED files; run `npm run check` (repo root) to reproduce CI's repo-wide lint before relying on green CI.
- Use `npx playwright test --config wpt-runner/playwright.config.ts --project=chromium` for WPT tests
- For screenshots: `$env:ATTACH_SCREENSHOTS="1"`; for HTML report: `--reporter=html`
- Avoid `Select-Object -Last` or `Select-String` piped from Playwright — they buffer the entire stream. Use `--reporter=dot` or write to file instead.
- Coordinate spaces: all positions are border-box-relative (px from container's `getBoundingClientRect` origin)
- When comparing test results across commits: use `Compare-Object` on sorted test-name lists saved to files
