import {
  formatReleaseTagCsv,
  parseReleaseTagCsv,
} from "./release-tag-csv.mjs";

function parseSelectedReleaseTags(value) {
  return parseReleaseTagCsv(value, "SELECTED_RELEASE_TAGS");
}

function formatSelectedReleaseTags(releases) {
  return formatReleaseTagCsv(
    releases.map(release => release.tag),
    "release tags",
  );
}

function resolveSelectedReleases(workspaces, requestedTags) {
  formatReleaseTagCsv(requestedTags, "SELECTED_RELEASE_TAGS");
  const workspaceByTag = new Map(
    workspaces.map(workspace => [workspace.tag, workspace]),
  );
  if (workspaceByTag.size !== workspaces.length) {
    throw new Error("Publishable workspaces contain duplicate release tags.");
  }
  const releases = requestedTags.map(tag => workspaceByTag.get(tag));
  const unknownTags = requestedTags.filter((_, index) => !releases[index]);
  if (unknownTags.length > 0) {
    throw new Error(
      `Invalid SELECTED_RELEASE_TAGS: unknown or non-publishable tags: ${unknownTags.join(", ")}`,
    );
  }
  return releases;
}

function assertSelectedReleaseTagsNotOnOrigin(
  releases,
  validationMode,
  originTags,
) {
  const conflictingTags = releases
    .filter(release => originTags.exists(release.tag))
    .map(release => release.tag);
  if (!validationMode && conflictingTags.length > 0) {
    throw new Error(
      "Concurrent release detected: selected release tags appeared on origin " +
        `after selection: ${conflictingTags.join(", ")}. ` +
        "Refusing to shrink or alter the selected release batch.",
    );
  }
  return releases;
}

export {
  assertSelectedReleaseTagsNotOnOrigin,
  formatSelectedReleaseTags,
  parseSelectedReleaseTags,
  resolveSelectedReleases,
};
