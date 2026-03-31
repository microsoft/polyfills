export default {
  ignorePatterns: [
    ".github/",
    "tests/",
    // This one is especially important (otherwise dependabot would be blocked by change file requirements)
    "package-lock.json",
  ],
  packToPath: "publish_artifacts",
};
