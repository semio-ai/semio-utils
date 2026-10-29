Add a changeset with `npx changeset` in any pull request that changes the published package.
Describe the change and choose the appropriate version bump.

Inside Studio's mount, the CLI resolves to Studio's workspace root and writes into
Studio's `.changeset/`. Write the file by hand under `packages/utils/.changeset/`,
or run `npx changeset` from a standalone clone.

The release workflow collects changesets in a Version Packages pull request for the next
version. Every main run can stage the current version from its version commit, even while
that PR is open. A maintainer approves it with 2FA, and the workflow tags the published version.
