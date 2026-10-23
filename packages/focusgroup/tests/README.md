Tests in this directory exercise keyboard navigation and computed accessibility
semantics. They are converted from Web Platform Tests, with V2 cases for behavior
not yet covered there:
https://github.com/web-platform-tests/wpt/blob/master/html/interaction/focus/focusgroup/

`itemcontrols.spec.js` checks actual Tab/Shift+Tab entry, active-item controls,
`noitemcontrols`, nested control eligibility, and grid roles after mutations.
Assertions do not depend on polyfill-added roles, tabindex values, or markers.

Run the same E2E fixtures without importing any polyfill to compare with a native
implementation (requires a Canary installation with focusgroup enabled):

```sh
FOCUSGROUP_NATIVE_ONLY=1 npm test -- --project="Google Chrome Canary" '/focusgroup/tests/'
```

Native-only mode does not replace feature detection or relax expectations.
Canary 157.0.8102.0 with experimental web platform features enabled reports the
tokens as supported, but differs from the current explainers in these fixtures:

- `itemcontrols.spec.js`: Tab visits inactive items/actions; reverse entry lands
  on an action rather than the selected item boundary. V2's
  [itemcontrols rules](https://open-ui.org/components/focusgroup-v2.explainer/#itemcontrols)
  require active-item filtering and boundary entry.
- `grid.spec.js`: directional navigation is a no-op in the compared fixtures.
  The [V2 directional operations](https://open-ui.org/components/focusgroup-v2.explainer/#grid-directional-navigation)
  remain the expected behavior.
- `itemcontrols.spec.js`: hiding the sole target inside a rendered cell leaves
  the native owner exposed as `grid`, contrary to the
  [invalid-state rules](https://open-ui.org/components/focusgroup-v2.explainer/#grid-state-and-invalid-structures).
  Hiding an entire structural cell is different: exclusion precedes
  rectangularity and can leave a smaller valid grid. That is not a browser
  discrepancy; the tests cover both cases separately.
- `role-inference.spec.js`: a button in an inferred listbox remains `button`.
  V1 permits the mapped `option` role, which appears in the current
  [ARIA-in-HTML button allowlist](https://www.w3.org/TR/html-aria/#el-button).

These are reproducible differences from the cited proposals, not an assertion
that every failure establishes a Chromium defect. Keep failures visible when
comparing engines; the ordinary test mode retains the package's native-deferral
policy, which polyfills V2 behaviors and the `itemcontrols`/`noitemcontrols`
modifiers even where the browser reports support for them.

`pressTab()` uses Option on macOS WebKit only for sequences that include native
buttons/controls. Polyfilled item boundaries with explicit tabindex work with
plain Tab; the helper also needs to visit unmodified controls and outside
buttons, which Safari otherwise skips.

## Polyfill implementation regressions

Implementation-specific tests live in [`../src/polyfill-tests`](../src/polyfill-tests/),
separately from these browser-behavior fixtures. Their shared setup deliberately
disables native support detection so even Canary tests the polyfill itself;
native feature-policy tests install their own support matrices with own-property
`focusGroup` stubs rather than assigning to its native PutForwards setter.
All six standard/shadowless projects include these tests.

`itemcontrols-config.spec.js` covers behavior/modifier configuration, authored
tabindex parsing against native IDL behavior, the demo examples, and a
model-backed `FocusGroup` whose item controls do not require any DOM tree walking.
`itemcontrols-focus.spec.js` covers reverse grid entry followed by Tab,
synchronous author focus redirection (including opted-out controls and exits),
and overlapping observer registration orders for nested owners.
`itemcontrols-shadow.spec.js` covers shadow-internal script/pointer focus and
listener teardown, focus inside slotted grid cells, and slot assignment changes
for shadow-owned items and controls. A Chromium fullscreen regression checks that
shadow-internal fullscreen content remains a top-layer boundary even though
`document.fullscreenElement` is retargeted to its host.
The shadow-aware observer reports an empty
batch for `slotchange`, since no DOM mutation record exists under a shadow-owned
group for light-DOM reassignment. It also observes assigned subtrees for
attribute mutations, preserving authored tabindex changes (including same-value
writes) even when the assigned content is outside the owner's DOM subtree;
subscriptions are released on reassignment and disconnect.
`role-inference.spec.js` covers native button semantics in grids and nested
owner roles across parent reconciliation and teardown.
`bundle-compatibility.spec.js` also covers mixed-bundle detached cleanup and
current feeds enclosing actual legacy toolbars. Legacy-owned subtrees retain
their own navigation without ancestor control suppression; current owners
continue to use full nested filtering. Set `FOCUSGROUP_LEGACY_BUILD` to built
bundles from `53d8a15` to exercise the original grid/V1 observer protocol in
both load orders.

`itemcontrols-rendering.spec.js` covers class/style visibility changes (including
sibling selectors), ownership state, and native control eligibility.
`itemcontrols-pending-mutations.spec.js` covers author changes and focus movement
in the same task, including nested owners, shadow trees, and custom element
reactions. Managed tabindex writes must not discard these pending author changes.
`native-itemcontrols.spec.js` also runs in the `Google Chrome Canary` project. It
records actual feature detection and uses a deterministic toolbar-only support
stub when the browser either lacks V1 or already supports V2; an ordinary native
toolbar remains untouched by the polyfill. It also covers native takeover and
observer cleanup when `noitemcontrols` is removed, and reinstallation when it
returns. A support matrix covers `itemcontrols` and `noitemcontrols` on a V1
behavior being polyfilled unless `__FOCUSGROUP_POLYFILL_ALLOW_NATIVE_V2__` is set.

`itemcontrols-lifecycle.spec.js` covers pending authored tabindex on subtree
removal (including shared nested controls), native deferral changing between
reservation and frame-delayed installation, detached reparenting and
reinsertion, connected moves (which retain ownership), safe repeated
`disconnect()`, grid invalidation, and destination-first transfer of decorated
items between owners. Removal cleanup restores authored attributes. `bundle-compatibility.spec.js`
always checks the legacy observer protocol. Its additional real-bundle cases
need a separately built pre-provenance version: set `FOCUSGROUP_LEGACY_BUILD` to
the absolute directory containing its `index.min.mjs` and
`index-shadowless.min.mjs`, then run that spec. Without this fixture those cases
are explicitly skipped; no historical code is downloaded during normal tests.
Both load orders exercise sibling and nested owners, arrow keys, and pending
author records during legacy focus handling. The review regression was measured
against bundles built from `f71d77b` using the same library build commands.
Set `FOCUSGROUP_TEST_BUILD` to a separately built revision to reproduce a
regression against that revision instead of the working tree; test helpers
serve its emitted modules without modifying the checkout.

Run the isolated Chromium mutation benchmark from this package:

```sh
npm test -- --project=chromium src/polyfill-tests/itemcontrols-performance.spec.js --workers=1 --repeat-each=3 --reporter=line
```

The fixture has 1,000 articles and opted-out buttons. Each of the class and inline
style cases has five warm-up toggles and twenty measured toggles. Timings include
the real mutation observer work through the next MessageChannel task, not just
the attribute assignment. The regression requires a median below 8 ms and no
managed role/tabindex/item-marker writes for measured cosmetic toggles. Raw
samples are logged and attached to the test result. Run without concurrent tests
for comparable timings; these are local interaction measurements, not a Core Web
Vitals score or a guarantee about slower devices.

The nested-toolbar benchmark adds 1,000 article owners with three controls each.
It measures text-mutation reconciliation, appending twenty nested toolbars, and
arrow navigation, including observer capture counts as the feed grows. Managed
writes capture overlapping owner observers through a root index, preserving
synchronous author reactions and the previous `beginWrite`/`endWrite` protocol.
Writes that would not change an item or control's tabindex skip the capture.
The fixed-depth fixture requires fewer than ten captures per registered
observer per reconciliation; latency medians must stay below 250 ms for
reconciliation, 400 ms for append, and 16 ms for directional dispatch.
`batched-writes.spec.js` covers interleaved author reactions that repeat a
managed old/new value pair, and calls from the previous observer protocol.
