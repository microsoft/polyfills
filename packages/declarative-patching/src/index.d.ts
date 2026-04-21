// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

/**
 * Apply any existing `<template for>` patches within `root` and start
 * observing for dynamically added ones.  Returns a function that stops
 * the observer.
 *
 * No-ops and returns a no-op disconnect if native support is detected.
 *
 * @param root - The polyfill target. Defaults to `document`.
 */
export function observe(root?: ParentNode): () => void;
