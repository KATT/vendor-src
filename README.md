# vendor-src

Vendor dependency source into your repo with `git subtree`, pinned to the installed package version, so coding agents can read real library code instead of guessing from docs.

Inspired by [The One Weird Git Trick That Makes Coding Agents More Effect-ive](https://effect.website/blog/the-one-weird-git-trick-that-makes-coding-agents-more-effect-ive).

## Why

Coding agents are better at exploring source than reading documentation. `node_modules` is usually compiled or ignored, so vendor the upstream git repo under `.repos/` at the **same version you have installed**.

## Install

```shell
pnpm add -D vendor-src
# pnpm workspaces: pnpm add -Dw vendor-src
# pnpm catalogs: if `pnpm add -Dw` errors with "Invalid Version", bump the
# catalog entry in pnpm-workspace.yaml then pnpm install
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
3. If .repos/<name> (or your configured dir) already exists from a manual subtree (and there is no
   vendor-src.json entry), claim it:
   pnpm exec vendor-src adopt <package>
   Or remove and re-add:
   git rm -rq .repos/<name> && git commit -m "Remove .repos/<name>"
4. Otherwise run: pnpm exec vendor-src add <package>
   Example: pnpm exec vendor-src add effect
   (package must already be installed so the matching git tag can be resolved)
5. Commit vendor-src.json, AGENTS.md (or README.md if AGENTS.md symlinks to it;
   skipped when vendor-src.json has "rootAgentsMd": false),
   {dir}/AGENTS.md, .oxfmtrc.json / editor ignores if changed, package.json
   (postinstall), and the subtree commit vendor-src created. Review diffs: do
   not let oxfmt / ignores get wiped.
6. Never run formatters/linters on the vendor dir (default .repos/**). vendor-src
   already writes .oxfmtrc.json ignorePatterns and editor excludes for that dir.
   If you add a new tool, exclude it before the first run.
7. Prefer reading .repos/<name> as read-only reference. Do not import from
   .repos/ — keep importing the normal npm package.
8. After dependency upgrades, run: pnpm exec vendor-src check
   If it warns, run: pnpm exec vendor-src sync
```

## Usage

```shell
# Vendor the source for an installed dependency at its matching git tag
pnpm exec vendor-src add effect

# Claim an existing .repos/<name> checkout (manual subtree) without re-fetching
pnpm exec vendor-src adopt effect

# Offline check after installs (exit 0 with a warning on drift)
pnpm exec vendor-src check

# Fail CI when vendored sources are stale
pnpm exec vendor-src check --strict

# Pull drifted repos to the git tags matching currently installed versions
pnpm exec vendor-src sync

pnpm exec vendor-src list   # alias: ls
pnpm exec vendor-src remove effect   # alias: rm
```

Commands work from any directory inside the project. `add`, `adopt`, `sync`, and `remove` require at least one commit and a clean working tree.

`add` / `adopt` also:

- creates `vendor-src.json` with `dir` set to `.repos` and `rootAgentsMd` set to `true` if it does not exist yet (edit either to change the defaults)
- maintains a short managed section in root `AGENTS.md` (follows symlinks, e.g. to `README.md`) unless `rootAgentsMd` is `false`
- writes `{dir}/AGENTS.md` with fuller guidance for agents working inside that tree
- writes/merges `.oxfmtrc.json` `ignorePatterns` so Oxfmt skips `{dir}/`
- if `.prettierignore` / `.eslintignore` already exist, merges `{dir}/` into them too (does not create those files)
- merges editor excludes into `.vscode/settings.json`
- adds a `postinstall` script that runs `vendor-src check`

## Protecting the vendor directory from tooling

Vendored trees are large upstream checkouts. A single repo-wide formatter run without excludes can rewrite thousands of files.

`vendor-src add` writes the ignores for you (using the configured `dir`). If you are wiring tooling manually, copy/paste (replace `.repos` if you changed `dir`):

```json
// .oxfmtrc.json
{
	"ignorePatterns": [".repos/"]
}
```

```jsonc
// .vscode/settings.json (merge)
{
	"typescript.preferences.autoImportFileExcludePatterns": [".repos/**"],
	"javascript.preferences.autoImportFileExcludePatterns": [".repos/**"],
	"files.exclude": { ".repos/**": true },
	"files.watcherExclude": { ".repos/**": true },
	"search.exclude": { ".repos/**": true },
}
```

For Vite+ config (alternative to `.oxfmtrc.json`):

```ts
// vite.config.ts
export default defineConfig({
	fmt: {
		ignorePatterns: [".repos/**"],
	},
});
```

## Ignore patterns (subtree pruning)

There are **no default ignore patterns**. After each `add` and `sync` (even when already current), vendor-src **deletes** only paths matching globs you configure per repo in `vendor-src.json` or via `--ignore` on `add`.

Ignore entries are **globs** (not regexes), matched against posix paths relative to that repo root. A trailing `/**` also matches the directory itself. `vendor-src check` warns if a pattern still looks like a regex (e.g. `(^|/)…`).

```json
{
	"$schema": "https://unpkg.com/vendor-src/schema.json",
	"dir": ".repos",
	"rootAgentsMd": true,
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

`dir` is the folder for checkouts and is required. vendor-src writes `.repos` when it creates the manifest; set any other folder name you prefer. AGENTS.md text, oxfmt ignores, and editor excludes all follow this value.

`rootAgentsMd` controls whether vendor-src maintains its managed section in the project-root `AGENTS.md`, and is also required. vendor-src writes `true` when it creates the manifest; set it to `false` to keep the root `AGENTS.md` untouched (an existing managed section is removed on the next `add` / `adopt` / `sync` / `remove`). `{dir}/AGENTS.md` is always written.

```json
{
	"$schema": "https://unpkg.com/vendor-src/schema.json",
	"dir": ".repos",
	"rootAgentsMd": true,
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

Editors can validate via `$schema`. The schema is also available from the package as `vendor-src/schema.json`. vendor-src validates the manifest on every run and names the offending field when an entry is incomplete.

When multiple installed versions exist across a workspace, vendor-src pins the highest semver.

## Development

See [`.github/DEVELOPMENT.md`](.github/DEVELOPMENT.md).

This repository is a Vite+ monorepo. The published package is [`packages/vendor-src`](packages/vendor-src) (no `postinstall`). The workspace root dogfoods it by vendoring `effect` under [`.repos/effect`](.repos/effect).

The root `README.md` and `LICENSE.md` are the sources of truth; `pnpm pack` / release copies them into `packages/vendor-src` via `scripts/sync-package-docs.mjs`.
