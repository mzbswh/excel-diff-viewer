# Releasing Excel Diff Viewer

## One-time setup

1. Create or verify the `mzbswh` publisher in Visual Studio Marketplace.
2. Confirm that the Marketplace publisher ID matches `package.json#publisher`.
3. Add a Marketplace publishing credential to the GitHub repository as the `VSCE_PAT` Actions secret.
4. Allow GitHub Actions to create releases by granting the workflow `contents: write` permission.
5. Protect the `main` and `v1.0` branches and require the CI workflow before merging when appropriate.

`VSCE_PAT` is supported for the initial workflow, but global Azure DevOps PATs are scheduled for retirement on December 1, 2026. Migrate the Marketplace publish step to Microsoft Entra workload identity and `vsce publish --azure-credential` before that date.

## Release process

1. Update `package.json` and `package-lock.json` to the same SemVer version.
2. Add the matching version section to `CHANGELOG.md`.
3. Push the change to `main` or `v1.0`.
4. The release workflow compares the previous and current package versions.
5. A new version is type-checked, built, packaged, and published to Visual Studio Marketplace.
6. The workflow creates the matching `v<version>` GitHub Release and uploads the VSIX.

The release job uses the Git tag as an idempotency lock and Marketplace publishing uses `--skip-duplicate`, so a failed run can be retried safely. A manual `workflow_dispatch` run can resume a version that does not yet have a GitHub tag.

## Local package verification

```bash
npm ci
npm run check
npm run build
npm run package -- --out excel-diff-viewer-1.0.0.vsix
npm run package:list
```

Install the generated VSIX in a clean Visual Studio Code profile and verify manual comparison plus built-in Git and GitLens diff takeover before the first public release.
