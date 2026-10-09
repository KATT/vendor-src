# vendor-src

Vendor dependency source into your repo with `git subtree`, pinned to the installed package version, so coding agents can read real library code instead of guessing from docs.

Inspired by [The One Weird Git Trick That Makes Coding Agents More Effect-ive](https://effect.website/blog/the-one-weird-git-trick-that-makes-coding-agents-more-effect-ive).

## Why

Coding agents are better at exploring source than reading documentation. `node_modules` is usually compiled or ignored, so vendor-src checks out the upstream git repo under `.repos/` at the **same version you have installed**, and keeps it there as you upgrade.

## Install

```shell
pnpm add -D vendor-src   # workspaces: -Dw; catalogs: bump the catalog entry
pnpm exec vendor-src init
pnpm exec vendor-src add effect
```

`init` writes `vendor-src.json`, the AGENTS.md files, and a `postinstall` hook, then prints what else to set up: keeping `.repos/` out of your formatter, linter, and editor. vendor-src doesn't touch those configs itself because it can't know which tools you use. Commit before `add`, which needs a clean working tree. `add` commits the checkout; commit the rest yourself.

## Quick start (copy/paste for agents)

```text
Set up vendor-src in this repo:
1. Install vendor-src as a root devDependency and run `vendor-src init`.
2. Exclude `.repos/` from the formatters, linters, and editor settings this
   repo uses, then commit.
3. Suggest a few dependencies worth vendoring: the frameworks and libraries
   this code leans on most, especially new or fast-moving ones. Say why for
   each, and ask me which to add.
4. Run `vendor-src add <package>` for each one I pick, committing after each.
```

## Staying in sync

`init` sets `"postinstall": "vendor-src check"`. After each install it compares `vendor-src.json` with the installed versions, offline and without touching git, and warns when a vendored repo is out of date. It never fails the install.

When it warns, run `vendor-src sync`. It re-vendors the matching tags and commits only the checkouts, so you can commit `vendor-src.json` and the AGENTS.md files together with the upgrade. In CI, `vendor-src check --strict` fails on stale sources.

If `package.json` already has a `postinstall`, `init` leaves it alone and prints a combined script to use instead.

## Commands

Run them with `pnpm exec vendor-src` (or `npx vendor-src`) from anywhere in the project. Every command except `init` needs a `vendor-src.json`. `add` and `remove` need a clean working tree; `sync` only needs the checkouts it touches to be clean.

<!-- commands:start -->

### `vendor-src init`

Set up vendor-src: create vendor-src.json, the AGENTS.md files, and the postinstall hook, then print what else to configure (safe to re-run).

- `--dir <value>`: Directory for vendored checkouts (default: .repos).
- `--root-agents-md`: Maintain a managed section in the root AGENTS.md (default: on; pass --no-root-agents-md to opt out).

```shell
# Use the defaults (vendor dir .repos, root AGENTS.md section on)
vendor-src init

# Pick another folder and leave the root AGENTS.md alone
vendor-src init --dir vendor --no-root-agents-md
```

### `vendor-src add <package>`

Vendor a dependency's source into the vendor dir at the installed version's git tag.

- `<package>`: npm package name or git URL to vendor.
- `--name <value>`: Directory name under the vendor dir.
- `--ref <value>`: Git ref/tag to vendor (skips version/tag lookup).
- `--ignore <value>`: Glob matched against paths inside the vendored repo (repeatable).

```shell
# Vendor an installed package
vendor-src add effect

# Prune paths you never want agents to read
vendor-src add effect --ignore 'scratchpad/**' --ignore '**/.github/**'

# Vendor a git repository directly (git-only when the package is not installed)
vendor-src add https://github.com/org/repo.git --ref v1.2.3
```

### `vendor-src check`

Offline check that vendored repos match installed package versions (what the postinstall hook runs).

- `--strict`: Exit 1 when vendored versions drift from installed.

```shell
# Fail CI when vendored sources are stale
vendor-src check --strict
```

### `vendor-src sync [name...]`

Pull vendored repos to the git tags matching installed package versions.

- `[name...]`: Vendored repo names to sync (default: all).

```shell
# Sync every vendored repo after upgrading dependencies
vendor-src sync

# Sync one checkout
vendor-src sync effect
```

### `vendor-src list`

List vendored repositories and drift status. Alias: `ls`.

### `vendor-src remove <name>`

Remove a vendored checkout, or stop tracking a package that shares one. Alias: `rm`.

- `<name>`: Checkout name under the vendor dir, or a vendored package name.

<!-- commands:end -->

## Ignore patterns

To keep paths out of a checkout, list globs under the repo's `ignore` in `vendor-src.json` (or pass `--ignore` to `add`). They are matched against paths inside that repo and deleted after every `add` and `sync`. Nothing is ignored by default.

```json
"ignore": ["scratchpad/**", "**/.github/**", "**/.changeset/**"]
```

## Git-only checkouts

`vendor-src add https://github.com/org/repo.git --ref v1.2.3` works without installing an npm package. The checkout is recorded with an empty `packages` array, `check` / `sync` leave it alone, and AGENTS.md lists it by directory name and ref. Pass `--name <package>` when that package _is_ installed to pin the checkout to the installed version instead (same as adding the package name).

## Several packages from one repo

Packages published from the same monorepo share one checkout. `add @tanstack/react-start` checks out `.repos/router`; a later `add @tanstack/react-router` is recorded in the same entry without a second clone. The first package in `packages` decides the version. `remove <package>` stops tracking one package; `remove <checkout>` deletes the checkout.

```json
"router": {
	"packages": ["@tanstack/react-start", "@tanstack/react-router"],
	"url": "https://github.com/TanStack/router.git",
	"version": "1.168.60",
	"ref": "@tanstack/react-start@1.168.60"
}
```

## Manifest

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

- `dir`: where checkouts live. If you change it by hand, move the checkouts and re-run `init`.
- `rootAgentsMd`: set to `false` to keep vendor-src out of your root `AGENTS.md`. `{dir}/AGENTS.md` is always written.

Installed versions are read from the project root and every workspace package; when several are installed, the highest wins.

## Development

See [`.github/DEVELOPMENT.md`](.github/DEVELOPMENT.md). The published package lives in [`packages/vendor-src`](packages/vendor-src); this repo dogfoods it by vendoring `effect` under [`.repos/effect`](.repos/effect). The command reference above is generated from the CLI with `pnpm readme`.
