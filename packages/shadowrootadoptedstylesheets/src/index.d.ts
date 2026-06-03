// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

/**
 * Whether the current user agent supports the `shadowRootAdoptedStyleSheets`
 * attribute for Declarative Shadow DOM.
 * @returns {boolean}
 */
export function supportsShadowRootAdoptedStyleSheets(): boolean;

/**
 * Installs declarative adopted stylesheets for all the eligible elements in
 * the current document.
 */
export function install(): void;
