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

Paste this into your coding agent after installing:

```text
Install is done. Now set up vendor-src for this repo:

1. Ensure the git working tree is clean and has at least one commit.
2. Run: pnpm exec vendor-src add <package>
   Example: pnpm exec vendor-src add effect
3. Commit the resulting vendor-src.json, AGENTS.md, .prettierignore, .eslintignore, .ignore, .vscode/settings.json, and the subtree commit vendor-src created.
4. Never run formatters/linters on repos/**. vendor-src already writes ignore files for Prettier/Oxfmt/ESLint and editor excludes. If you add a new tool, exclude repos/** before the first run.
5. Prefer reading repos/<name> as read-only reference. Do not import from repos/ — keep importing the normal npm package.
6. After dependency upgrades, run: pnpm exec vendor-src check
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
- merges `repos/` into `.prettierignore`, `.eslintignore`, and `.ignore` (Oxfmt/Vite+ fmt read `.prettierignore` by default)
- merges editor excludes into `.vscode/settings.json`
- adds a `postinstall` script that runs `vendor-src check`

## Protecting `repos/` from tooling

Vendored trees are large upstream checkouts. A single repo-wide `oxfmt` / Prettier / ESLint run without excludes can rewrite thousands of files.

`vendor-src add` writes the ignores for you. If you are wiring tooling manually, copy/paste:

```gitignore
# .prettierignore, .eslintignore, and/or .ignore
repos/
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

For Vite+ / Oxfmt config:

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

Add more regexes globally or per repo in `vendor-src.json`, or pass `--ignore` to `add`:

```json
{
	"dir": "repos",
	"ignore": ["(^|/)docs(/|$)"],
	"repos": {
		"effect": {
			"package": "effect",
			"url": "https://github.com/Effect-TS/effect.git",
			"version": "4.0.1",
			"ref": "effect@4.0.1",
			"ignore": ["(^|/)scratchpad(/|$)"]
		}
	}
}
```

## Manifest

```json
{
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

When multiple installed versions exist across a workspace, vendor-src pins the highest semver.

## Development

See [`.github/DEVELOPMENT.md`](.github/DEVELOPMENT.md).

This repository dogfoods itself by vendoring `effect` under [`repos/effect`](repos/effect).
