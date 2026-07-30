# Releasing Excel Diff Viewer

## One-time setup

1. Create or verify the `mzbswh` publisher in Visual Studio Marketplace.
2. Confirm that the Marketplace publisher ID matches `package.json#publisher`.
3. Create a user-assigned managed identity for Marketplace publishing and grant it the minimal Azure subscription access required for OIDC login (Reader is sufficient for the documented setup).
4. Create the `vscode-marketplace` GitHub Environment and restrict its deployment branches to `main` only. Requiring approval for this environment is recommended for production publishing.
5. Add a GitHub Actions federated credential scoped to the `vscode-marketplace` environment in this repository.
6. Add the managed identity to the `mzbswh` Visual Studio Marketplace publisher and grant it the Contributor role.
7. Store `AZURE_CLIENT_ID`, `AZURE_TENANT_ID`, and `AZURE_SUBSCRIPTION_ID` as GitHub environment secrets.
8. Protect the `main` branch and require the CI workflow before merging when appropriate.

The release workflow uses Microsoft Entra workload identity federation and `vsce publish --azure-credential`. It does not use a Personal Access Token or Azure client secret.

## Microsoft Entra configuration

The federated credential must match the release job exactly:

- GitHub organization or owner: `mzbswh`
- Repository: `excel-diff-viewer`
- Entity type: Environment
- Environment name: `vscode-marketplace`

For repositories using GitHub's classic OIDC subject format, this environment produces `repo:mzbswh/excel-diff-viewer:environment:vscode-marketplace`. If immutable OIDC subject claims are enabled for the repository, use the exact subject containing the owner and repository IDs when creating the Azure federated credential.

The workflow also checks `github.ref` so manual dispatches from any branch other than `main` cannot build or publish. Keep the Environment deployment-branch restriction as a second, independently configured guard.

The workflow separates packaging, Marketplace publishing, and GitHub Release creation into different jobs:

- `build-release` only receives `contents: read` and creates the VSIX, release notes, and SHA-256 checksum.
- `publish-marketplace` receives `id-token: write` but not repository write access. Dependency lifecycle scripts are disabled when installing the pinned publishing toolchain.
- `publish-github` receives `contents: write` but no OIDC permission.

All reusable GitHub Actions are pinned to immutable full commit SHAs. Checkout credentials are not persisted into either workspace.

## Release process

1. Update `package.json` and `package-lock.json` to the same SemVer version.
2. Add a non-empty matching version section to `CHANGELOG.md`. Its contents become the GitHub Release notes.
3. Push the change to `main`.
4. The release workflow compares the previous and current package versions.
5. A new version is type-checked, built, packaged, checksummed, and published to Visual Studio Marketplace.
6. The workflow extracts the matching `CHANGELOG.md` section, creates the `v<version>` GitHub Release with those notes, and uploads the VSIX and `SHA256SUMS`.

Automatic push runs use the Git tag as an idempotency lock. A rerun of the original workflow or a manual `workflow_dispatch` from `main` deliberately ignores that lock so it can repair a partially created GitHub Release or resume a failed publication. If the tag already exists, the workflow first verifies that it resolves to the current workflow commit, preventing assets from being replaced with a build from different source. Marketplace publishing uses `--skip-duplicate`, while existing GitHub Release assets are replaced with `--clobber`.

## Local package verification

```bash
npm ci
npm run check
npm run build
npm run package -- --out excel-diff-viewer-1.0.0.vsix
npm run package:list
```

Install the generated VSIX in a clean Visual Studio Code profile and verify manual comparison plus built-in Git and GitLens diff takeover before the first public release.
