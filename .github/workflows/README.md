# Workflows

To test workflows, use the GitHub CLI and trigger the workflow from a branch.

For more information see the [GitHub CLI documentation](https://cli.github.com/manual/gh_workflow_run).

`ci-pr.yml` runs the repository checks, script tests, workspace builds, and browser tests for pull requests and `main`.

Release automation is entirely in Azure Pipelines. See [the Azure pipeline documentation](../../.ado/pipelines/README.md).
