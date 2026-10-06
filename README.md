# vendor-src

Vendor dependency source into your repo with `git subtree`, pinned to the installed package version, so coding agents can read real library code instead of guessing from docs.

Inspired by [The One Weird Git Trick That Makes Coding Agents More Effect-ive](https://effect.website/blog/the-one-weird-git-trick-that-makes-coding-agents-more-effect-ive).

## Why

Coding agents are better at exploring source than reading documentation. `node_modules` is usually compiled or ignored, so vendor the upstream git repo under `repos/` at the **same version you have installed**.

## Install

```shell
pnpm add -D vendor-src
# pnpm workspaces: pnpm add -Dw vendor-src
# pnpm catalogs: if `pnpm add -Dw` errors with "Invalid Version", bump the
# catalog entry in pnpm-workspace.yaml (e.g. vendor-src: ^0.3.2) then pnpm install
```

## Quick start (copy/paste for agents)

Paste this into your coding agent:

```text
Set up vendor-src in this repo:

1. Install vendor-src as a root devDependency:
   - pnpm workspace: pnpm add -Dw vendor-src
   - pnpm catalog: if add fails with "Invalid Version", edit the catalog
     entry in pnpm-workspace.yaml then run pnpm install
   - otherwise: pnpm add -D vendor-src
     (or: npm install -D vendor-src / yarn add -D vendor-src / bun add -d vendor-src)
2. Ensure the git working tree is clean and has at least one commit.
   Commit the install (package.json / lockfile / catalog) before continuing.
3. If AGENTS.md is a symlink (e.g. to README.md), either replace it with a
   real AGENTS.md file or plan to paste the vendor-src block manually —
   vendor-src will not write through the symlink.
4. If repos/<name> already exists from a manual subtree (and there is no
   vendor-src.json entry), claim it:
   pnpm exec vendor-src adopt <package>
   Or remove and re-add:
   git rm -rq repos/<name> && git commit -m "Remove repos/<name>"
5. Otherwise run: pnpm exec vendor-src add <package>
   Example: pnpm exec vendor-src add effect
   (package must already be installed so the matching git tag can be resolved)
6. Commit vendor-src.json, AGENTS.md (when it is a real file), .ignore,
   .oxfmtrc.json / editor ignores if changed, package.json (postinstall), and
   the subtree commit vendor-src created. Review diffs: do not let oxfmt /
   ignores get wiped.
7. Never run formatters/linters on repos/**. vendor-src already writes .ignore,
   .oxfmtrc.json ignorePatterns, and editor excludes. If you add a new tool,
   exclude repos/** before the first run.
8. Prefer reading repos/<name> as read-only reference. Do not import from
   repos/ — keep importing the normal npm package.
9. After dependency upgrades, run: pnpm exec vendor-src check
   If it warns, run: pnpm exec vendor-src sync
```

## Usage

```shell
# Vendor the source for an installed dependency at its matching git tag
pnpm exec vendor-src add effect

# Claim an existing repos/<name> checkout (manual subtree) without re-fetching
pnpm exec vendor-src adopt effect

# Offline check after installs (exit 0 with a warning on drift)
pnpm exec vendor-src check

# Fail CI when vendored sources are stale
pnpm exec vendor-src check --strict

# Pull drifted repos to the git tags matching currently installed versions
pnpm exec vendor-src sync

pnpm exec vendor-src list
pnpm exec vendor-src remove effect
```

`add` / `adopt` also:

- writes `vendor-src.json`
- maintains a managed section in `AGENTS.md` when it is a regular file (skips symlinks)
- writes/merges `.ignore` and `.oxfmtrc.json` `ignorePatterns` so Oxfmt skips `repos/`
- if `.prettierignore` / `.eslintignore` already exist, merges `repos/` into them too (does not create those files)
- merges editor excludes into `.vscode/settings.json`
- adds a `postinstall` script that runs `vendor-src check`

## Protecting `repos/` from tooling

Vendored trees are large upstream checkouts. A single repo-wide formatter run without excludes can rewrite thousands of files.

`vendor-src add` writes the ignores for you. If you are wiring tooling manually, copy/paste:

```gitignore
# .ignore
repos/
```

```json
// .oxfmtrc.json
{
	"ignorePatterns": ["repos/"]
}
```

```jsonc
// .vscode/settings.json (merge)
{
	"typescript.preferences.autoImportFileExcludePatterns": ["repos/**"],
	"javascript.preferences.autoImportFileExcludePatterns": ["repos/**"],
	"files.exclude": { "repos/**": true },
	"files.watcherExclude": { "repos/**": true },
	"search.exclude": { "repos/**": true },
}
```

For Vite+ config (alternative to `.oxfmtrc.json`):

```ts
// vite.config.ts
export default defineConfig({
	fmt: {
		ignorePatterns: ["repos/**"],
	},
});
```

## Ignore patterns (subtree pruning)

There are **no default ignore patterns**. After each subtree add/pull (and on `sync` even when already current), vendor-src **deletes** only paths matching globs you configure per repo in `vendor-src.json` or via `--ignore` on `add`.

Since **0.3.4**, ignore entries are **globs** (not regexes). If you upgraded from an older release, rewrite patterns like `(^|/)scratchpad(/|$)` to `scratchpad/**`. `vendor-src check` warns when a pattern still looks like the old regex form.

Patterns match posix paths relative to that repo root; a trailing `/**` also matches the directory itself:

```json
{
	"$schema": "https://unpkg.com/vendor-src/schema.json",
	"dir": "repos",
	"repos": {
		"effect": {
			"package": "effect",
			"url": "https://github.com/Effect-TS/effect.git",
			"version": "4.0.1",
			"ref": "effect@4.0.1",
			"ignore": [
				"scratchpad/**",
				"**/.github/**",
				"**/.vscode/**",
				"**/.changeset/**",
				"**/pnpm-lock.yaml",
				"**/.DS_Store",
				"**/node_modules/**"
			]
		}
	}
}
```

## Manifest

```json
{
	"$schema": "https://unpkg.com/vendor-src/schema.json",
	"dir": "repos",
	"repos": {
		"effect": {
			"package": "effect",
			"url": "https://github.com/Effect-TS/effect.git",
			"version": "4.0.1",
			"ref": "effect@4.0.1"
		}
	}
}
```

Editors can validate via `$schema`. The schema is also available from the package as `vendor-src/schema.json`.

When multiple installed versions exist across a workspace, vendor-src pins the highest semver.

## Development

See [`.github/DEVELOPMENT.md`](.github/DEVELOPMENT.md).

This repository is a Vite+ monorepo. The published package is [`packages/vendor-src`](packages/vendor-src) (no `postinstall`). The workspace root dogfoods it by vendoring `effect` under [`repos/effect`](repos/effect).

The root `README.md` and `LICENSE.md` are the sources of truth; `pnpm pack` / release copies them into `packages/vendor-src` via `scripts/sync-package-docs.mjs`.
