/**
 * Whether the current user agent supports the `shadowrootadoptedstylesheets`
 * attribute for Declarative Shadow DOM.
 * @returns {boolean}
 */
export function supportsShadowRootAdoptedStyleSheets(): boolean;

/**
 * Installs declarative adopted stylesheets for all the eligible elements in
 * the current document.
 */
export function install(): void;
