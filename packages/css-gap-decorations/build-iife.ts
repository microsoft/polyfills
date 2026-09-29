/**
 * Separate build script to produce a self-contained IIFE bundle
 * that works when loaded via <script> (not type="module").
 * This is what the demo page and file:// usage need.
 */

import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "vite";

const __dirname = dirname(fileURLToPath(import.meta.url));

await build({
  configFile: false,
  build: {
    lib: {
      entry: resolve(__dirname, "src/index.ts"),
      name: "CSSGapDecorations",
      formats: ["iife"],
      fileName: () => "css-gap-decorations.iife.js",
    },
    outDir: resolve(__dirname, "dist"),
    emptyOutDir: false,
    minify: "esbuild",
    target: "es2020",
  },
});

console.log("Built dist/css-gap-decorations.iife.js");
