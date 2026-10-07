## Environment

- Node is pinned in `.nvmrc`. The default shell Node may be older; switch first with `eval "$(fnm env)" && fnm use`.
- If `pnpm` fails with `Cannot find module .../corepack/v1/pnpm/<version>/bin/pnpm.cjs`, the installed corepack can't launch the pnpm version in `packageManager`. Upgrade corepack (`npm i -g corepack@latest`) or call the cached binary directly: `~/.cache/node/corepack/v1/pnpm/<version>/pnpm`.
- To run the local CLI without pnpm: `node packages/vendor-src/dist/bin.mjs <command>`. `dist/` is only as fresh as the last `pnpm build`.

## Documentation

- `README.md` describes how vendor-src works **now**. Don't reference history: no "since vX", "as of vX", "previously", "no longer", "pre-X.Y.Z", or migration notes. Version history and upgrade notes belong in `packages/vendor-src/CHANGELOG.md` (generated from commit messages on release), so put that context in the commit / PR description instead.

<!-- vendor-src:start -->

## Vendored Source

Source for this project's key dependencies is vendored under `.repos/`, pinned to the installed versions. When a question is about how one of these libraries actually behaves, read its vendored source — implementation, tests, examples — instead of relying on docs, memory, or web search. The trees are read-only reference material; see `.repos/AGENTS.md` before touching or citing them.

### Vendored packages

- `effect@4.0.1` → `.repos/effect`

<!-- vendor-src:end -->
