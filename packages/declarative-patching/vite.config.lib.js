import { copyFileSync } from "node:fs";
import { resolve } from "node:path";

const src = (path) => resolve(import.meta.dirname, path);

const entry = src("src/index.js");

/** @returns {import("vite").Plugin} */
function copyTypes() {
  return {
    name: "copy-types",
    closeBundle() {
      copyFileSync(src("src/index.d.ts"), src("build/index.d.ts"));
    },
  };
}

/** @returns {import("vite").Plugin} */
function stripPureAnnotations() {
  return {
    name: "strip-pure-annotations",
    generateBundle(_, bundle) {
      for (const chunk of Object.values(bundle)) {
        if (chunk.type === "chunk" && chunk.code.includes("@__PURE__")) {
          chunk.code = chunk.code.replaceAll("/* @__PURE__ */", "");
        }
      }
    },
  };
}

export default ({ mode }) => {
  const isMinified = mode.includes("minified");

  const min = isMinified ? ".min" : "";

  return {
    plugins: [
      copyTypes(),
      ...(mode === "minified" ? [stripPureAnnotations()] : []),
    ],
    build: {
      lib: {
        entry,
        formats: ["es"],
        fileName: () => `declarative-patching-polyfill${min}.mjs`,
      },
      target: "es2022",
      minify: isMinified ? "terser" : false,
      terserOptions: {
        module: true,
        ecma: 2020,
        compress: {
          ecma: 2020,
          module: true,
          toplevel: true,
          passes: 3,
          pure_getters: true,
        },
        mangle: {
          module: true,
          toplevel: true,
        },
        format: {
          comments: false,
          ecma: 2020,
          preserve_annotations: false,
        },
      },
      rolldownOptions: {
        treeshake: {
          propertyReadSideEffects: false,
        },
      },
      outDir: "build",
      emptyOutDir: !isMinified,
    },
  };
};
