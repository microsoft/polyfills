import { resolve } from "node:path";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [],
  build: {
    lib: {
      entry: {
        "css-gap-decorations": resolve(__dirname, "src/index.ts"),
        "css-gap-decorations-fn": resolve(__dirname, "src/index-fn.ts"),
      },
      formats: ["es"],
    },
    rollupOptions: {
      external: [],
      preserveEntrySignatures: false,
      output: {
        preserveModules: false,
      },
    },
    minify: false,
    target: "es2020",
  },
  test: {
    include: ["tests/**/*.test.ts"],
    exclude: ["wpt-runner/**"],
  },
});
