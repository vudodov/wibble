# Releasing Wibble Packages

This repository is prepared to publish the Wibble workspace packages to npm from GitHub Actions.

## Before The First Release

1. Create the GitHub repository.
2. Update package metadata if the repository owner or name differs from `wibble-js/wibble-js`.
3. Decide the project license and update `license` in every publishable package. The current value is `UNLICENSED` so the legal choice stays explicit.
4. Reserve or verify the npm scope used by package names, currently `@wibble`.
5. Configure npm publishing.

Preferred setup:

- In npm, configure each package for trusted publishing from this GitHub repository.
- Use the workflow `.github/workflows/publish-npm.yml`.
- Keep the GitHub environment named `npm` protected with required reviewers.

Fallback setup:

- Create an npm automation token.
- Add it to the GitHub repository secrets as `NPM_TOKEN`.
- Keep the same publish workflow.

## Release Flow

Prepare a version:

```sh
pnpm release:version 0.1.0
pnpm install
pnpm ci
```

Commit the version changes, then create and push a tag:

```sh
git add packages package.json pnpm-lock.yaml
git commit -m "Release 0.1.0"
git tag v0.1.0
git push origin main --tags
```

Create a GitHub Release for the tag. Publishing the GitHub Release triggers the npm workflow.

## Dry Run

Run this locally before a first publish:

```sh
pnpm release:dry-run
```

The dry run builds every package and asks pnpm to produce npm publish output without uploading packages.

## Published Packages

The publish workflow skips private workspace packages. It packs each package with pnpm so `workspace:*` dependencies are rewritten to the release version, then publishes each tarball with the npm CLI so npm trusted publishing and provenance can work in GitHub Actions.

The playground and VS Code extension package are private by default. Publishable packages currently are:

- `@wibble/core`
- `@wibble/compiler`
- `@wibble/vite`
- `@wibble/router`
- `@wibble/store`
- `@wibble/forms`
- `@wibble/http`
- `@wibble/ui`
- `@wibble/ssr`
- `@wibble/devtools`
- `@wibble/testing`
- `@wibble/language-server`
- `@wibble/cli`

## Notes

- All package builds clean `dist` before emitting, so npm tarballs do not include stale files.
- Package `files` fields restrict npm contents to `dist`.
- Internal workspace dependencies stay as `workspace:*` in source and are rewritten to the published version by pnpm when packing.
- `scripts/publish-packages.mjs` publishes packages in workspace dependency order.
- The root package remains private and is never published.
