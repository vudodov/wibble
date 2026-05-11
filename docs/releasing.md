# Releasing Packages

This repository publishes the Wibble workspace packages to npm from GitHub Actions.

## One-time Setup

1. Create the GitHub repository.
2. Check the package metadata if the repository owner or name is different from `vudodov/wibble`.
3. Make sure the npm scope exists. The package names use `@wibble`.
4. Configure npm publishing.

Npm setup:

- Configure trusted publishing for this GitHub repository.
- Use `.github/workflows/publish-npm.yml`.
- Protect the GitHub environment named `npm` if you want manual approval before publishing.

Trusted publisher settings:

- Publisher: GitHub Actions
- Owner: `vudodov`
- Repository: `wibble`
- Workflow file: `publish-npm.yml`
- Environment: `npm`

Add the trusted publisher entry for each public package that will be published.

For a brand-new package, npm may not show the package or scope in the trusted publishing UI yet. Publish the first version manually from a local machine with your npm account and 2FA, then add the trusted publisher entry for future releases.

## Release Flow

Prepare a version:

```sh
pnpm release:version 0.1.1
pnpm install
pnpm run ci
```

Commit the version changes:

```sh
git add packages package.json pnpm-lock.yaml
git commit -m "Release 0.1.1"
```

Create and push a tag:

```sh
git tag v0.1.1
git push origin main --tags
```

Create a GitHub Release for the tag. Publishing the release starts the npm workflow.

## Dry Run

Run this locally before publishing:

```sh
pnpm release:dry-run
```

The dry run builds every package and asks npm to print publish output without uploading anything.

## Published Packages

The publish workflow skips private workspace packages. It packs each public package with pnpm, then publishes the tarballs with npm.

Public packages:

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

The root package, playground, and VS Code extension package are private.

## Notes

- Package builds clean `dist` before emitting.
- Package `files` fields restrict npm contents to `dist`.
- Workspace dependencies stay as `workspace:*` in source and are rewritten by pnpm when packed.
- `scripts/publish-packages.mjs` publishes packages in workspace dependency order.
