import { readFileSync } from "node:fs";
import { resolve } from "node:path";

function serveRawCss() {
  return {
    name: "serve-raw-css",
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        if (req.url?.endsWith(".css") && !req.url.includes("node_modules")) {
          const filePath = resolve(__dirname, req.url.slice(1));
          try {
            const css = readFileSync(filePath, "utf-8");
            res.setHeader("Content-Type", "text/css");
            res.end(css);
          } catch {
            next();
          }
          return;
        }
        next();
      });
    },
  };
}

/** @type {import("vite").UserConfig} */
export default {
  appType: "mpa",
  server: {
    port: 5174,
  },
  plugins: [serveRawCss()],
};
