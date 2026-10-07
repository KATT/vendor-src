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
2. Run: pnpm exec vendor-src init
   (defaults: vendor dir .repos, managed section in the root AGENTS.md;
   pass --dir <dir> and/or --no-root-agents-md to change them)
   It prints every file it wrote. Review the diff — do not let existing
   oxfmt / editor settings get wiped — then commit them together with the
   install (package.json / lockfile / catalog).
3. If .repos/<name> (or your configured dir) already exists from a manual
   subtree (and there is no vendor-src.json entry), remove it first:
   git rm -rq .repos/<name> && git commit -m "Remove .repos/<name>"
4. Run: pnpm exec vendor-src add <package>
   Example: pnpm exec vendor-src add effect
   (package must already be installed so the matching git tag can be resolved;
   the working tree must be clean)
5. add commits the subtree itself and prints the files left to commit
   (vendor-src.json and the AGENTS.md files). Commit them.
6. Never run formatters/linters on the vendor dir (default .repos/**). init
   already wrote .oxfmtrc.json ignorePatterns and editor excludes for that dir.
   If you add a new tool, exclude it before the first run.
7. Prefer reading .repos/<name> as read-only reference. Do not import from
   .repos/ — keep importing the normal npm package.
8. init adds a postinstall script that runs vendor-src check --sync, so
   dependency upgrades re-vendor the matching tags automatically. If init
   warns that package.json already has a postinstall, chain both in it as
   suggested. The sync commits only the checkouts; commit vendor-src.json and
   the AGENTS.md files together with the upgrade. If it could not sync
   (offline, CI, local edits in the checkout), it warns; run
   pnpm exec vendor-src sync later.
```

## Usage

```shell
# One-time setup (safe to re-run; repairs anything missing)
pnpm exec vendor-src init
pnpm exec vendor-src init --dir vendor --no-root-agents-md

# Vendor the source for an installed dependency at its matching git tag
pnpm exec vendor-src add effect

# Offline drift check (exit 0 with a warning on drift)
pnpm exec vendor-src check

# Fail CI when vendored sources are stale
pnpm exec vendor-src check --strict

# Check, then sync only drifted repos; warns instead when that fails (postinstall)
pnpm exec vendor-src check --sync

# Pull drifted repos to the git tags matching currently installed versions
pnpm exec vendor-src sync

pnpm exec vendor-src list   # alias: ls
pnpm exec vendor-src remove effect   # alias: rm
```

Commands work from any directory inside the project. Every command except `init` needs a `vendor-src.json` and says so when it is missing. `add`, `sync`, and `remove` also require at least one commit. `add` and `remove` require a clean working tree; `sync` only requires the checkouts it syncs to be clean, so it can run right after an install while `package.json` and the lockfile are still uncommitted. Its commits contain only those checkouts. Each command prints the files it changed.

`init` sets the project up:

- creates `vendor-src.json` with `dir` (default `.repos`, or `--dir`) and `rootAgentsMd` (default `true`, or `--no-root-agents-md`)
- maintains a short managed section in root `AGENTS.md` (follows symlinks, e.g. to `README.md`) unless `rootAgentsMd` is `false`
- writes `{dir}/AGENTS.md` with fuller guidance for agents working inside that tree
- writes/merges `.oxfmtrc.json` `ignorePatterns` so Oxfmt skips `{dir}/`
- if `.prettierignore` / `.eslintignore` already exist, merges `{dir}/` into them too (does not create those files)
- merges editor excludes into `.vscode/settings.json`
- sets the `postinstall` script to `vendor-src check --sync`. If `package.json` already has a different `postinstall`, `init` leaves it untouched and prints a warning with a script that runs both, e.g. `"postinstall": "husky && vendor-src check --sync"`

`check --sync` is built for `postinstall`: the drift check only compares `vendor-src.json` with the installed `package.json` versions, so an install with nothing to update stays fast and never runs git or touches the network. Only drifted repos are synced, each on its own. When a sync fails (offline, missing tag, local edits in the checkout) or the `CI` environment variable is set, it prints the drift and a hint to run `vendor-src sync` instead, and exits 0 so the install still succeeds (add `--strict` to fail).

Re-running `init` keeps the existing `vendor-src.json` and re-applies the rest, so it is also the way to restore deleted ignores or the `postinstall` hook, or to apply a `dir` you changed by hand. It refuses `--dir` / `--root-agents-md` values that contradict the existing file; edit `vendor-src.json` instead.

`add`, `sync`, and `remove` keep `vendor-src.json` and both AGENTS.md files in step with the vendored repos.

## Protecting the vendor directory from tooling

Vendored trees are large upstream checkouts. A single repo-wide formatter run without excludes can rewrite thousands of files.

`vendor-src init` writes the ignores for you (using the configured `dir`). If you are wiring tooling manually, copy/paste (replace `.repos` if you changed `dir`):

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

Ignore entries are **globs** (not regexes), matched against posix paths relative to that repo root. A trailing `/**` also matches the directory itself. `vendor-src check` warns if a pattern looks like a regex (e.g. `(^|/)…`).

```json
{
	"$schema": "https://unpkg.com/vendor-src/schema.json",
	"dir": ".repos",
	"rootAgentsMd": true,
	"repos": {
		"effect": {
			"packages": ["effect"],
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

## Monorepos: several packages from one repo

Many npm packages are published from the same git repo (every `@tanstack/react-*` package from [TanStack/router](https://github.com/TanStack/router), every `@effect/*` package from [Effect-TS/effect](https://github.com/Effect-TS/effect)). vendor-src keeps **one checkout per repo**:

- The first package you `add` pins the checkout to its tag. When the package's `repository.directory` says it lives in a monorepo, the checkout is named after the repo (`.repos/router`), not the package.
- Adding another package from the same repo doesn't clone again; it is appended to that entry's `packages`. The first entry in `packages` pins `version` and `ref`, and `check` and `sync` follow it.
- AGENTS.md maps each checkout to the packages it holds, e.g. `@tanstack/react-start@1.168.60`, `@tanstack/react-router` → `.repos/router`.
- `vendor-src remove <package>` stops tracking a package that shares a checkout and keeps the checkout; `vendor-src remove <checkout>` removes the checkout.

```shell
pnpm exec vendor-src add @tanstack/react-start    # checks out .repos/router at @tanstack/react-start@<installed>
pnpm exec vendor-src add @tanstack/react-router   # added to .repos/router; no second clone
```

```json
"router": {
	"packages": ["@tanstack/react-start", "@tanstack/react-router"],
	"url": "https://github.com/TanStack/router.git",
	"version": "1.168.60",
	"ref": "@tanstack/react-start@1.168.60"
}
```

## Manifest

`dir` is the folder for checkouts and is required. `vendor-src init` writes `.repos` unless you pass `--dir`. AGENTS.md text, oxfmt ignores, and editor excludes all follow this value; after changing it by hand, move the checkouts and re-run `vendor-src init`.

`rootAgentsMd` controls whether vendor-src maintains its managed section in the project-root `AGENTS.md`, and is also required. `vendor-src init` writes `true` unless you pass `--no-root-agents-md`. Set it to `false` to keep the root `AGENTS.md` untouched; an existing managed section is removed on the next `init` / `add` / `sync` / `remove`. `{dir}/AGENTS.md` is always written.

```json
{
	"$schema": "https://unpkg.com/vendor-src/schema.json",
	"dir": ".repos",
	"rootAgentsMd": true,
	"repos": {
		"effect": {
			"packages": ["effect"],
			"url": "https://github.com/Effect-TS/effect.git",
			"version": "4.0.1",
			"ref": "effect@4.0.1"
		}
	}
}
```

Editors can validate via `$schema`. The schema is also available from the package as `vendor-src/schema.json`. vendor-src validates the manifest on every run and names the offending field when an entry is incomplete.

vendor-src finds installed packages in the project root and every workspace package (pnpm `packages:` or npm/yarn `workspaces`). When several versions are installed, it pins the highest semver.

## Development

See [`.github/DEVELOPMENT.md`](.github/DEVELOPMENT.md).

This repository is a Vite+ monorepo. The published package is [`packages/vendor-src`](packages/vendor-src) (no `postinstall`). The workspace root dogfoods it by vendoring `effect` under [`.repos/effect`](.repos/effect).

The root `README.md` and `LICENSE.md` are the sources of truth; `pnpm pack` / release copies them into `packages/vendor-src` via `packages/vendor-src/scripts/sync-package-docs.ts`.
