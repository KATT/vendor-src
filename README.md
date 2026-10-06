# vendor-src

Vendor dependency source into your repo with `git subtree`, pinned to the installed package version, so coding agents can read real library code instead of guessing from docs.

Inspired by [The One Weird Git Trick That Makes Coding Agents More Effect-ive](https://effect.website/blog/the-one-weird-git-trick-that-makes-coding-agents-more-effect-ive).

## Why

Coding agents are better at exploring source than reading documentation. `node_modules` is usually compiled or ignored, so vendor the upstream git repo under `repos/` at the **same version you have installed**.

## Install

```shell
pnpm add -D vendor-src
```

## Usage

```shell
# Vendor the source for an installed dependency at its matching git tag
pnpm exec vendor-src add effect

# Offline check after installs (exit 0 with a warning on drift)
pnpm exec vendor-src check

# Fail CI when vendored sources are stale
pnpm exec vendor-src check --strict

# Pull drifted repos to the tags matching currently installed versions
pnpm exec vendor-src sync

pnpm exec vendor-src list
pnpm exec vendor-src remove effect
```

`add` also:

- writes `vendor-src.json`
- maintains a managed section in `AGENTS.md`
- merges editor excludes into `.vscode/settings.json` and `.ignore`
- adds a `postinstall` script that runs `vendor-src check`

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
