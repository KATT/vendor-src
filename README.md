# vendor-src

Vendor dependency source into your repo with `git subtree`, pinned to the installed package version, so coding agents can read real library code instead of guessing from docs.

Inspired by [The One Weird Git Trick That Makes Coding Agents More Effect-ive](https://effect.website/blog/the-one-weird-git-trick-that-makes-coding-agents-more-effect-ive).

## Why

Coding agents are better at exploring source than reading documentation. `node_modules` is usually compiled or ignored, so vendor the upstream git repo under `repos/` at the **same version you have installed**.

## Install

```shell
pnpm add -D vendor-src
```

## Quick start (copy/paste for agents)

Paste this into your coding agent:

```text
Set up vendor-src in this repo:

1. Install: pnpm add -D vendor-src
   (or: npm install -D vendor-src / yarn add -D vendor-src / bun add -d vendor-src)
2. Ensure the git working tree is clean and has at least one commit.
3. Run: pnpm exec vendor-src add <package>
   Example: pnpm exec vendor-src add effect
4. Commit the resulting vendor-src.json, AGENTS.md, .ignore, .oxfmtrc.json, .vscode/settings.json, and the subtree commit vendor-src created.
5. Never run formatters/linters on repos/**. vendor-src already writes .ignore, .oxfmtrc.json ignorePatterns, and editor excludes. If you add a new tool, exclude repos/** before the first run.
6. Prefer reading repos/<name> as read-only reference. Do not import from repos/ — keep importing the normal npm package.
7. After dependency upgrades, run: pnpm exec vendor-src check
   If it warns, run: pnpm exec vendor-src sync
```

## Usage

```shell
# Vendor the source for an installed dependency at its matching git tag
pnpm exec vendor-src add effect

# Offline check after installs (exit 0 with a warning on drift)
pnpm exec vendor-src check

# Fail CI when vendored sources are stale
pnpm exec vendor-src check --strict

# Pull drifted repos to the git tags matching currently installed versions
pnpm exec vendor-src sync

pnpm exec vendor-src list
pnpm exec vendor-src remove effect
```

`add` also:

- writes `vendor-src.json`
- maintains a managed section in `AGENTS.md` (including “do not format/lint `repos/`”)
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

By default, after each subtree add/pull, vendor-src also **deletes** matching paths inside the vendored tree and commits that prune:

- `.DS_Store`
- nested `repos/`
- `node_modules/`
- `.git/`

Add more regexes **per vendored repo** in `vendor-src.json`, or pass `--ignore` to `add`:

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
			"ignore": ["(^|/)docs(/|$)", "(^|/)scratchpad(/|$)"]
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
