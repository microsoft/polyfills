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
 * Whether the current user agent natively supports the `focusgroup` attribute.
 */
export function supportsFocusGroup(): boolean;
