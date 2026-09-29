Tests in this directory are converted from Web Platform Tests:
https://github.com/web-platform-tests/wpt/blob/master/html/interaction/focus/focusgroup/

## Item controls regressions

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
returns.

Run the isolated Chromium mutation benchmark from this package:

```sh
npm test -- --project=chromium tests/itemcontrols-performance.spec.js --workers=1 --repeat-each=3 --reporter=line
```

The fixture has 1,000 articles and opted-out buttons. Each of the class and inline
style cases has five warm-up toggles and twenty measured toggles. Timings include
the real mutation observer work through the next MessageChannel task, not just
the attribute assignment. The regression requires a median below 8 ms and no
managed role/tabindex/item-marker writes for measured cosmetic toggles. Raw
samples are logged and attached to the test result. Run without concurrent tests
for comparable timings; these are local interaction measurements, not a Core Web
Vitals score or a guarantee about slower devices.
