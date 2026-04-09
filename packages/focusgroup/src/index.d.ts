// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

/**
 * Polyfills the `focusgroup` HTML attribute for the given element and its
 * descendants.
 *
 * @param root - The polyfill target. Defaults to `document.body`.
 */
export function polyfill(root?: HTMLElement): void;

/**
 * Polyfills all potential focusgroups in `document.body`, observes DOM changes,
 * and polyfills any newly added focusgroups.
 */
export function polyfillBodyAndObserve(): void;

/**
 * Whether the current user agent natively supports the `focusgroup` attribute.
 */
export function supportsFocusGroup(): boolean;
