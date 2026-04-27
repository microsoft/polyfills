/** @type {import("lage").ConfigOptions} */
module.exports = {
  pipeline: {
    build: {
      dependsOn: ["^build"],
      outputs: ["build/**"],
    },
    "test:ci": {
      dependsOn: ["build"],
      outputs: [],
    },
  },
  cacheOptions: {
    outputGlob: ["build/**"],
    environmentGlob: ["package.json", "tsconfig.json", "lage.config.js"],
  },
  ignore: ["change/**", "*.md", ".github/**"],
};
