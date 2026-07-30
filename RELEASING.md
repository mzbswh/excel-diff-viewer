# Releasing Excel Diff Viewer

## One-time setup

1. Create or verify the `mzbswh` publisher in Visual Studio Marketplace.
2. Confirm that the Marketplace publisher ID matches `package.json#publisher`.
3. Register a single-tenant application in Microsoft Entra ID. A client secret, certificate, and Azure subscription are not required.
4. Enable immutable GitHub Actions OIDC subjects for this repository.
5. Add a federated credential to the application for the `main` branch of this repository.
6. Resolve the service principal's Marketplace profile ID and add it to the `mzbswh` publisher with the Contributor role.
7. Store `AZURE_CLIENT_ID` and `AZURE_TENANT_ID` as GitHub repository secrets.
8. Protect the `main` branch and require the CI workflow before merging when appropriate.

The release workflow uses Microsoft Entra workload identity federation and `vsce publish --azure-credential`. It does not use an Azure subscription, Personal Access Token, Azure client secret, or GitHub Environment.

## Microsoft Entra configuration

The federated credential must match the release job exactly:

- GitHub organization or owner: `mzbswh`
- GitHub organization or owner ID: `58725946`
- Repository: `excel-diff-viewer`
- Repository ID: `1072639702`
- Entity type: Branch
- Branch: `main`
- Issuer: `https://token.actions.githubusercontent.com`
- Audience: `api://AzureADTokenExchange`

The repository uses GitHub's immutable OIDC subject format. The exact subject is:

```text
repo:mzbswh@58725946/excel-diff-viewer@1072639702:ref:refs/heads/main
```

The workflow omits `subscription-id` and sets `allow-no-subscriptions: true`, so `azure/login` establishes a tenant-level service-principal session. `AZURE_CLIENT_ID` is the application ID and `AZURE_TENANT_ID` is the directory ID.

The workflow also checks `github.ref` so manual dispatches from branches other than `main` cannot build or publish. Because the federated credential trusts the `main` branch rather than a specific workflow file, protect `main` from unreviewed workflow changes.

The workflow separates packaging, Marketplace publishing, and GitHub Release creation into different jobs:

- `build-release` only receives `contents: read` and creates the VSIX, release notes, and SHA-256 checksum.
- `publish-marketplace` receives `id-token: write` but not repository write access. It signs in without an Azure subscription, and dependency lifecycle scripts are disabled when installing the pinned publishing toolchain.
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
npm run package -- --out excel-diff-viewer-1.0.1.vsix
npm run package:list
```

Install the generated VSIX in a clean Visual Studio Code profile and verify manual comparison plus built-in Git and GitLens diff takeover before the first public release.
