import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function expandWorkspacePattern(pattern, repoRoot) {
  const segments = pattern.split(/[\\/]+/).filter(Boolean);
  let paths = ["."];

  for (const segment of segments) {
    const nextPaths = [];
    const hasWildcard = segment.includes("*");
    const matcher = hasWildcard
      ? new RegExp(
          `^${segment
            .split("*")
            .map(part => escapeRegExp(part))
            .join(".*")}$`,
        )
      : null;

    for (const currentPath of paths) {
      const absolutePath = join(repoRoot, currentPath);
      if (!existsSync(absolutePath)) {
        continue;
      }

      if (!hasWildcard) {
        nextPaths.push(join(currentPath, segment));
        continue;
      }

      for (const entry of readdirSync(absolutePath, { withFileTypes: true })) {
        if (entry.isDirectory() && matcher.test(entry.name)) {
          nextPaths.push(join(currentPath, entry.name));
        }
      }
    }

    paths = nextPaths;
  }

  return paths;
}

function npmNameToOutputPrefix(npmName) {
  return npmName
    .replace(/^@/, "")
    .replace(/\//g, "-")
    .replace(/^microsoft-/, "")
    .replace(/[^a-zA-Z0-9]+([a-zA-Z0-9])/g, (_, char) => char.toUpperCase());
}

function listPublishableWorkspaces(repoRoot) {
  const rootPackage = JSON.parse(
    readFileSync(join(repoRoot, "package.json"), "utf8"),
  );
  const patterns = Array.isArray(rootPackage.workspaces)
    ? rootPackage.workspaces
    : (rootPackage.workspaces?.packages ?? []);
  const locations = new Set(
    patterns.flatMap(pattern => expandWorkspacePattern(pattern, repoRoot)),
  );

  return Array.from(locations)
    .map(location => {
      const packagePath = join(repoRoot, location, "package.json");
      if (!existsSync(packagePath)) {
        return null;
      }

      const packageJson = JSON.parse(readFileSync(packagePath, "utf8"));
      if (packageJson.private === true || !packageJson.name || !packageJson.version) {
        return null;
      }

      return {
        location,
        name: packageJson.name,
        outputPrefix: npmNameToOutputPrefix(packageJson.name),
        tag: `${packageJson.name}_v${packageJson.version}`,
        version: packageJson.version,
      };
    })
    .filter(Boolean)
    .sort((a, b) => a.name.localeCompare(b.name));
}

export {
  expandWorkspacePattern,
  listPublishableWorkspaces,
  npmNameToOutputPrefix,
};
