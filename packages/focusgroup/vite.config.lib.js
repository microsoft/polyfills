import { resolve } from "node:path";

const entry = resolve(import.meta.dirname, "src/index.js");

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

export default ({ mode }) => ({
	plugins: mode === "minified" ? [stripPureAnnotations()] : [],
	build: {
		lib: {
			entry,
			formats: ["es"],
			fileName: () =>
				mode === "minified"
					? "focusgroup-polyfill.min.mjs"
					: "focusgroup-polyfill.mjs",
		},
		target: "es2022",
		minify: mode === "minified" ? "terser" : false,
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
		rollupOptions: {
			treeshake: {
				propertyReadSideEffects: false,
				tryCatchDeoptimization: false,
			},
		},
		outDir: "build",
		emptyOutDir: mode !== "minified",
	},
});
