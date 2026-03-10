import { resolve } from "node:path";

const entry = resolve(import.meta.dirname, "src/focusgroup-polyfill.js");

export default ({ mode }) => ({
	build: {
		lib: {
			entry,
			formats: ["es"],
			fileName: () =>
				mode === "minified"
					? "focusgroup-polyfill.min.mjs"
					: "focusgroup-polyfill.mjs",
		},
		minify: mode === "minified" ? "terser" : false,
		outDir: "build",
		emptyOutDir: mode !== "minified",
	},
});
