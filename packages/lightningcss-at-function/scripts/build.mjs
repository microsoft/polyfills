import { rm } from "node:fs/promises";
import { build } from "esbuild";

await rm(new URL("../build", import.meta.url), {
  force: true,
  recursive: true,
});

const shared = {
  bundle: true,
  entryPoints: ["src/index.ts"],
  external: ["css-tree", "lightningcss"],
  legalComments: "none",
  logLevel: "info",
  platform: "node",
  sourcemap: true,
  target: "node22",
};

await Promise.all([
  build({
    ...shared,
    format: "esm",
    outfile: "build/index.mjs",
  }),
  build({
    ...shared,
    format: "cjs",
    outfile: "build/index.cjs",
  }),
]);
