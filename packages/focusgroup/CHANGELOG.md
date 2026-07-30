# Change Log - @microsoft/focusgroup-polyfill

<!-- This log was last generated on Thu, 30 Jul 2026 18:34:53 GMT and should not be manually modified. -->

<!-- Start content -->

## 1.6.0

Thu, 30 Jul 2026 18:34:53 GMT

### Minor changes

- no longer require behavior token to be the first token in focusgroup attribute (machi@microsoft.com)

### Patches

- polyfill focusgroup elements that custom elements render into their shadow roots after the polyfill is installed, and stop treating the polyfill() root as a focusgroup owner when it has no focusgroup attribute (jeroen.zwartepoorte@gmail.com)

## 1.5.0

Thu, 14 May 2026 00:04:39 GMT

### Minor changes

- support `focusGroup` in feature detection as per implementation update (machi@microsoft.com)

## 1.4.1

Wed, 06 May 2026 16:42:21 GMT

### Patches

- allow keydown event propagation (machi@microsoft.com)

## 1.4.0

Wed, 06 May 2026 00:11:30 GMT

### Minor changes

- added default modifier for listbox and radiogroup to align with spec updates (machi@microsoft.com)

## 1.3.0

Fri, 01 May 2026 00:02:49 GMT

### Minor changes

- added exports of FocusGroup and FocusGroupItemCollection (machi@microsoft.com)

## 1.2.2

Thu, 30 Apr 2026 21:42:54 GMT

### Patches

- fixed slotted items not being polyfilled in shadowless bundle (machi@microsoft.com)
- fixed nested focusgroups not being properly observed (machi@microsoft.com)
- fixed nested focusability not being restored when focus leaves a group that has nomemory (machi@microsoft.com)

## 1.2.1

Fri, 10 Apr 2026 17:18:38 GMT

### Patches

- replace import with default in package json exports (machi@microsoft.com)

## 1.2.0

Thu, 09 Apr 2026 02:00:38 GMT

### Minor changes

- add `polyfillBodyAndObserve()` function to polyfill and observe `document.body` (machi@microsoft.com)

### Patches

- make sure focusgroupstart changes are respected if a focusgroup has nomemory (machi@microsoft.com)

## 1.1.0

Sat, 04 Apr 2026 00:07:50 GMT

### Minor changes

- add typescript declaration file for public API (machi@microsoft.com)

## 1.1.0

Sat, 04 Apr 2026 00:02:33 GMT

### Minor changes

- add typescript declaration file for public API (machi@microsoft.com)

## 1.0.0

Fri, 03 Apr 2026 21:11:52 GMT

### Major changes

- publish focusgroup polyfill to npm (machi@microsoft.com)
