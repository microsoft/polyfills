# Azure Pipelines

Release publishing uses two pipeline definitions:

- **`Polyfills - CD Build`** uses `azure-pipelines-build.yml`. A `main` build checks every non-private npm workspace for its `${name}_v${version}` tag. If any tag is missing, the normal-mode `BuildArtifacts` stage installs dependencies, builds the workspaces, packs the corresponding npm tarballs, and publishes both the packages and release metadata. If no release is needed, `PrepareRelease` succeeds and the downstream stage is skipped.
- **`Polyfills - CD`** uses `azure-pipelines-cd.yml`. It has no git trigger; completion of the build pipeline's `BuildArtifacts` stage starts it. The official 1ES pipeline validates the metadata and package hashes against the triggering commit, creates the package-version tags and GitHub Releases, publishes the tarballs to npm through `Polyfills.Release.PipelineTemplate.yml`, and finally pushes `deployed/<release-tag>` marker tags.

Release metadata follows the multi-package manifest shape `{ releaseCommit, packages }`, extended with its schema and validation mode. CD requires the manifest's `releaseCommit` to be a full commit hash and to exactly match `$(resources.pipeline.releaseBuild.sourceCommit)`. Run-number `<count>` is the number of package entries, not the number of tarballs or other assets: `<count>-build-<Build.BuildId>` for the build pipeline and `<count>-cd-<Build.BuildId>` for CD. The build pipeline sets its number after package selection, including zero-package and validation runs. CD sets its number from the manifest only after commit, validation-mode, package, and hash validation succeeds.

The build pipeline's `validationMode` can rebuild already-tagged package versions. Compile-time selection creates `BuildArtifacts` in normal mode or `ValidateArtifacts` in validation mode, never both. Only `BuildArtifacts` triggers CD automatically, so a validation build cannot start publication.

To validate end to end, first run the build pipeline manually with `validationMode: true`. Then run the CD pipeline manually with `validationMode: true` and select that build as the `releaseBuild` resource. CD retains its own `ValidateArtifacts` stage and checks the metadata commit against the selected build's source commit, but does not create tags, releases, or npm publications.

## Adding a publishable package

Artifact discovery is automatic, but Azure Pipelines cannot generate `GitHubRelease@1` tasks from runtime metadata. For each new non-private workspace:

1. Add the package to the root `package.json` workspaces.
2. In the CD pipeline's `PublishRelease` stage, consume the package's `<prefix>Included`, `<prefix>ReleaseTag`, and `<prefix>ReleaseAsset` outputs from `ValidateArtifacts`.
3. Add a conditional `GitHubRelease@1` task using the `fast` GitHub service connection.

The pipeline definitions require:

- An Azure GitHub service connection named `fast` with permission to create releases in `microsoft/polyfills`.
- Pipeline checkout credentials that can push package-version and `deployed/` tags.
- The Azure pipeline definitions to use the exact names documented above.
