# Workflows

To test workflows, use the GitHub CLI and trigger the workflow from a branch.

For more information see the [GitHub CLI documentation](https://cli.github.com/manual/gh_workflow_run).

## Continuous Deployment

Nightly publishing is split into two coordinated jobs so that npm credentials never leave the Azure environment. GitHub Releases are the source of truth, and `deployed/<tag>` git marker tags track which releases have already been published. Neither side needs a GitHub personal access token (PAT).

- **`cd-github-releases.yml`** (GitHub Actions) runs nightly via cron (`0 8 * * *` UTC) and on `workflow_dispatch`. It does **not** bump versions or push source changes to `main` — version bumps land on `main` through ordinary human-authored pull requests (for example, by running `npm run bump` locally and opening a PR). The workflow has two jobs:
  1. **`detect`** — checks out `main` with `fetch-depth: 0` and runs [`build/scripts/create-github-releases.mjs --check-only`](../../build/scripts/create-github-releases.mjs). The script walks the workspaces tree, computes `${name}_v${version}` for every non-private workspace, and emits `hasMissingReleases=true` if any of those git tags do not yet exist.
  2. **`release`** runs only when missing releases exist. It installs Node and the workspace dependencies, builds the repo, then runs the script in default mode. For every missing release the script packs the npm tarball into `publish_artifacts/` and creates the GitHub release with the asset attached via `gh release create --target <sha>`. The `gh` CLI reads `GH_TOKEN` (set to the ambient `${{ github.token }}` with `contents: write`) and creates the git tag atomically with the release, so "tag exists" and "release exists" are the same fact — a failed release is safely retried on the next run with no orphan tag left behind.
- **`azure-pipelines-cd.yml`** (Azure Pipelines) runs every night (`0 9 * * *` UTC) with `always: true` so it still runs on no-op nights (it is checking external GitHub state, not repo commits). It is split into two stages so the heavy publish work is skipped on no-op nights:
  1. **`Check`** — runs [`build/scripts/download-github-releases.mjs --check-only`](../../build/scripts/download-github-releases.mjs). The script walks the current publishable workspaces, keeps only workspaces whose current `${name}_v${version}` release tag exists, filters out tags that already have a `deployed/<tag>` counterpart, and emits Azure Pipelines output variables for the overall deployment decision plus each package-specific release tag.
  2. **`Package`** — depends on `Check` and runs only when `needsDeployment == 'true'`. Conditional `DownloadGitHubRelease@0` tasks download undeployed release assets through the `polyfills` GitHub service connection, a shell step gathers the `.tgz` assets, then `Polyfills.Release.PipelineTemplate.yml@polyfillsPipelines` performs the actual `npm publish`. On success, the pipeline pushes a `deployed/<tag>` git marker tag for each release that was just published. The next nightly run sees those markers and skips the corresponding releases.

Idempotency is enforced through git tags (`${name}_v${version}` on the GitHub side, `deployed/${name}_v${version}` on the Azure side).

### Legacy bare-tag shim

Unlike a greenfield setup, this repository already has historical package-version tags that were pushed **before** the tokenless CD flow existed and therefore have no corresponding GitHub Release (notably `@microsoft/focusgroup-polyfill_v1.5.0`). Because Azure's `DownloadGitHubRelease@0` task fails if it tries to download a release that does not exist, the `Check` stage queries GitHub's [release-by-tag API](https://docs.github.com/en/rest/releases/releases#get-a-release-by-tag-name) to distinguish a real release from a bare/legacy tag before emitting `NeedsDeployment`:

- A `404` means the tag has no GitHub Release; it is treated as a **bare tag** and skipped (never downloaded).
- A `2xx` whose `tag_name` matches confirms a real release that should be deployed.
- Transient failures (network errors, `429`, `5xx`) are retried with bounded backoff. If they never resolve — or a `2xx` payload is malformed/mismatched — the stage fails **safely** rather than guessing, so a real deployment is never dropped and a nonexistent release is never queued for download.

This one network call in `Check` is a deliberate migration shim. Once every historical tag has a GitHub Release (or a `deployed/<tag>` marker), the shim is inert and the check reduces to local git-tag bookkeeping.

### Adding a publishable package

`cd-github-releases.yml` discovers publishable workspaces automatically from the root `package.json` `workspaces` list, but `azure-pipelines-cd.yml` must be updated because Azure Pipelines cannot create `DownloadGitHubRelease@0` tasks dynamically from the runtime detection output.

The `npm run checkchange` command runs [`build/scripts/check-publish-pipeline.mjs`](../../build/scripts/check-publish-pipeline.mjs) to verify that every non-private workspace has matching Azure CD variables and a conditional `DownloadGitHubRelease@0` task. This guardrail runs in PR validation and fails when a new publishable package is added without updating the publish pipeline.

When adding a new non-private workspace that should publish through CD:

1. Ensure the workspace is included in the root `package.json` `workspaces` list and has a `name` and `version`.
2. Add package-specific output variables to the `Package` stage in `azure-pipelines-cd.yml`. The output prefix is generated from the npm package name by removing the leading `@microsoft/` and converting the remainder to camel case. For example, `@microsoft/focusgroup-polyfill` emits `focusgroupPolyfillNeedsDeployment` and `focusgroupPolyfillReleaseTag`.
3. Add a conditional `DownloadGitHubRelease@0` task for the package using the `polyfills` GitHub service connection, `defaultVersionType: 'specificTag'`, and the package's `$(<prefix>ReleaseTag)` variable.
4. Confirm the artifact-gathering step still covers the package assets (`.tgz` tarballs).

Example Azure additions for `@microsoft/example-polyfill`:

```yml
variables:
  examplePolyfillNeedsDeployment: $[ stageDependencies.Check.CheckVersion.outputs['deploymentCheck.examplePolyfillNeedsDeployment'] ]
  examplePolyfillReleaseTag: $[ stageDependencies.Check.CheckVersion.outputs['deploymentCheck.examplePolyfillReleaseTag'] ]

steps:
- task: DownloadGitHubRelease@0
  displayName: "Download @microsoft/example-polyfill release assets"
  condition: and(succeeded(), eq(variables['examplePolyfillNeedsDeployment'], 'true'))
  inputs:
    connection: polyfills
    userRepository: microsoft/polyfills
    defaultVersionType: 'specificTag'
    version: '$(examplePolyfillReleaseTag)'
    downloadPath: '$(System.ArtifactsDirectory)'
```
