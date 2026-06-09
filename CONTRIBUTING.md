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

Publishing and releasing should not use a GitHub personal access token (PAT).

1. Check out an up-to-date `main` branch and create a `publish_<Date.now()>` branch.
2. Run `npm run bump`, then commit and open a pull request for the version and changelog updates.
3. After review, a repository admin merges the publish PR. The guarded `npm run checkchange` bypass allows this FAST-style bump PR without requiring another change file.
4. The `Release packages to GitHub releases` GitHub Actions workflow runs on schedule or by `workflow_dispatch`. It detects publishable workspaces without package-version tags, builds the workspaces, packs npm tarballs, and creates GitHub Releases using the default `GITHUB_TOKEN` with `contents: write`.
5. The Azure CD pipeline checks for GitHub Releases that do not have `deployed/<tag>` marker tags. For each undeployed release, it downloads tarball assets with the Azure GitHub service connection named `polyfills`, publishes them through `Polyfills.Release.PipelineTemplate.yml@polyfillsPipelines`, and pushes `deployed/<tag>` marker tags using checkout credentials.

Release environment assumptions:

- The Azure GitHub service connection is named `polyfills` and can read release assets from `microsoft/polyfills`.
- Npm publishing credentials are managed by `Polyfills.Release.PipelineTemplate.yml@polyfillsPipelines`.
- Pipeline checkout credentials can push `deployed/<tag>` tags.
- Publishable workspaces are non-private packages; currently `@microsoft/focusgroup-polyfill` is publishable and `@microsoft/shadowrootadoptedstylesheets-ponyfill` is private.
