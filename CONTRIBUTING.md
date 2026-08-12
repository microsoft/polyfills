# Contributing

This project welcomes contributions and suggestions. Most contributions require you to agree to a
Contributor License Agreement (CLA) declaring that you have the right to, and actually do, grant us
the rights to use your contribution. For details, visit https://cla.opensource.microsoft.com.

When you submit a pull request, a CLA bot will automatically determine whether you need to provide
a CLA and decorate the PR appropriately (e.g., status check, comment). Simply follow the instructions
provided by the bot. You will only need to do this once across all repos using our CLA.

This project has adopted the [Microsoft Open Source Code of Conduct](https://opensource.microsoft.com/codeofconduct/).
For more information see the [Code of Conduct FAQ](https://opensource.microsoft.com/codeofconduct/faq/) or
contact [opencode@microsoft.com](mailto:opencode@microsoft.com) with any additional questions or comments.

## Packages

As this project is composed of several packages, please see the `CONTRIBUTING.md` for the package you are interested in contributing to for specific guidelines.

## Change files

For package changes that should be released, run `npm run change` and commit the generated change file. CI runs `npm run checkchange`, which normally performs `beachball check`.

On `publish_<timestamp>` branches only, `npm run checkchange` can skip `beachball check` when the GitHub API verifies that the GitHub actor has the `admin` repository role on `microsoft/polyfills`. If the branch name, actor, token, or permission check does not match that guard, the normal Beachball check runs.

## Maintainer publishing flow

1. Check out an up-to-date `main` branch and create a `publish_<Date.now()>` branch.
2. Run `npm run bump`, then commit and open a pull request for the version and changelog updates.
3. After review, a repository admin merges the publish PR. The guarded `npm run checkchange` bypass allows this bump PR without requiring another change file.
4. `Polyfills - CD Build` runs from `main`. When a publishable workspace's `${name}_v${version}` tag is missing, its normal-mode `BuildArtifacts` stage builds the workspaces and publishes npm tarballs plus release metadata as Azure pipeline artifacts. If every release tag already exists, `PrepareRelease` succeeds and the downstream stage is skipped.
5. Completion of the build pipeline's `BuildArtifacts` stage triggers `Polyfills - CD`. It validates the artifacts, creates the package-version tags and GitHub Releases, publishes the tarballs to npm, and pushes `deployed/<tag>` marker tags on success.

The tag list emitted by `PrepareRelease` is authoritative for that build. The packing stage preserves the exact selected tags and order, then immediately rechecks every tag on `origin`. If a tag appeared concurrently, production fails before packing anything rather than shrinking or changing the batch; retry the build to generate a fresh selection. Validation mode intentionally allows existing tags for reproducible artifact rebuilds.

For artifact validation, manually run `Polyfills - CD Build` with `validationMode: true`. That run contains `ValidateArtifacts` instead of `BuildArtifacts` and therefore cannot trigger CD. Then manually run `Polyfills - CD` with `validationMode: true`, selecting the validation build as its `releaseBuild` resource. The CD validation stage verifies the artifacts and selected build commit without publishing externally.

Release environment assumptions:

- The Azure GitHub service connection is named `fast` and can create releases in `microsoft/polyfills`.
- The pipeline can push package-version and `deployed/<tag>` tags after checkout.
- The Azure pipeline definitions are registered as `Polyfills - CD Build` and `Polyfills - CD`.
- Publishable workspaces are non-private packages; currently `@microsoft/focusgroup-polyfill` is publishable and `@microsoft/shadowrootadoptedstylesheets-ponyfill` is private.
