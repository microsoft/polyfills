import { existsSync } from "node:fs";
import { resolve as resolvePath } from "node:path";

const src = (path) => resolvePath(import.meta.dirname, path);

const entry = src("src/index.js");
const shadowlessUtils = src("src/shadow-utils/index-shadowless.js");

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

/**
 * Drop `-shadowless` chunks that don't transitively depend on the shadow-utils
 * shadowless replacement, and rewrite imports to point at the unsuffixed file.
 * @returns {import("vite").Plugin}
 */
function dedupeShadowlessChunks() {
  return {
    name: "dedupe-shadowless-chunks",
    generateBundle(_, bundle) {
      const outDir = this.environment?.config?.build?.outDir || "build";
      const chunks = Object.values(bundle).filter((c) => c.type === "chunk");
      const byFile = new Map(chunks.map((c) => [c.fileName, c]));

      const isShadowDependent = new Map();
      const visit = (fileName) => {
        if (isShadowDependent.has(fileName)) {
          return isShadowDependent.get(fileName);
        }
        isShadowDependent.set(fileName, false);
        const chunk = byFile.get(fileName);
        if (!chunk) {
          return false;
        }
        let dependent = false;
        for (const imp of chunk.imports) {
          if (imp.startsWith("shadow-utils/")) {
            dependent = true;
            break;
          }
          if (visit(imp)) {
            dependent = true;
            break;
          }
        }
        isShadowDependent.set(fileName, dependent);
        return dependent;
      };
      for (const c of chunks) {
        visit(c.fileName);
      }

      const renamed = new Set();
      for (const c of chunks) {
        if (!c.fileName.endsWith("-shadowless.mjs")) {
          continue;
        }
        if (c.fileName.startsWith("index-shadowless")) {
          continue;
        }
        if (isShadowDependent.get(c.fileName)) {
          continue;
        }
        const target = c.fileName.replace(/-shadowless\.mjs$/, ".mjs");
        if (!existsSync(resolvePath(outDir, target))) {
          continue;
        }
        renamed.add(c.fileName);
        delete bundle[c.fileName];
      }

      if (renamed.size === 0) {
        return;
      }
      const replaceRefs = (code) =>
        code.replace(
          /(["'])(\.{1,2}\/[^"']+?-shadowless\.mjs)\1/g,
          (m, q, spec) => {
            const base = spec.slice(spec.lastIndexOf("/") + 1);
            for (const r of renamed) {
              if (r === base || r.endsWith(`/${base}`)) {
                return `${q}${spec.replace(/-shadowless\.mjs$/, ".mjs")}${q}`;
              }
            }
            return m;
          },
        );
      for (const c of Object.values(bundle)) {
        if (c.type === "chunk") {
          c.code = replaceRefs(c.code);
        }
      }
    },
  };
}

export default ({ mode }) => {
  const isShadowless = mode.includes("shadowless");
  const isMinified = mode.includes("minified");

  const variant = isShadowless ? "-shadowless" : "";
  const min = isMinified ? ".min" : "";

  return {
    plugins: [
      ...(mode === "minified" ? [stripPureAnnotations()] : []),
      ...(isShadowless && !isMinified ? [dedupeShadowlessChunks()] : []),
    ],
    build: {
      lib: {
        entry,
        formats: ["es"],
        fileName: () => `index${variant}${min}.mjs`,
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
          unsafe: true,
          unsafe_comps: true,
          unsafe_math: true,
          unsafe_methods: true,
          unsafe_proto: true,
          unsafe_regexp: true,
          hoist_funs: true,
          hoist_props: true,
          keep_fargs: false,
          global_defs: {
            "NodeFilter.SHOW_ELEMENT": 1,
            "NodeFilter.FILTER_ACCEPT": 1,
            "NodeFilter.FILTER_REJECT": 2,
            "NodeFilter.FILTER_SKIP": 3,
            "Node.DOCUMENT_NODE": 9,
            "Node.ELEMENT_NODE": 1,
            "Node.DOCUMENT_FRAGMENT_NODE": 11,
            "document.DOCUMENT_FRAGMENT_NODE": 11,
          },
        },
        mangle: {
          module: true,
          toplevel: true,
          properties: {
            regex: /^(savedSlotted|hostNode|walker)$/,
          },
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
        ...(isMinified
          ? {}
          : {
              output: {
                preserveModules: true,
                preserveModulesRoot: "src",
                entryFileNames: (chunk) => {
                  const name = chunk.name.endsWith(variant)
                    ? chunk.name
                    : `${chunk.name}${variant}`;
                  return `${name}.mjs`;
                },
              },
            }),
      },
      outDir: "build",
      emptyOutDir: !isShadowless && !isMinified,
    },
    resolve: {
      alias: isShadowless
        ? [
            {
              find: /\.\/shadow-utils\/index\.js$/,
              replacement: shadowlessUtils,
            },
          ]
        : [],
    },
  };
};
