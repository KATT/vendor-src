# Development

This is a Vite+ / pnpm monorepo. The publishable CLI lives in `packages/vendor-src`.
The workspace root dogfoods it (vendored `repos/`, `vendor-src.json`) and intentionally owns the only `postinstall` — the published package has none.

Root `README.md` / `LICENSE.md` are canonical. They are copied into `packages/vendor-src` on `prepack` (and before npm publish) by `scripts/sync-package-docs.mjs` so the npm tarball includes them without maintaining a second copy in git.

After [forking the repo from GitHub](https://help.github.com/articles/fork-a-repo) and [installing pnpm](https://pnpm.io/installation):

```shell
git clone https://github.com/(your-name-here)/vendor-src
cd vendor-src
pnpm install
```

## Building

Run [Vite+ pack](https://viteplus.dev/guide/pack) for `packages/vendor-src`:

```shell
pnpm build
```

## Formatting

[Vite+ fmt](https://viteplus.dev/) (Oxfmt) is used to format code.
Auto-formatting should happen when you save files in your editor via [lint-staged](https://github.com/lint-staged/lint-staged) and [husky](https://typicode.github.io/husky).

```shell
pnpm format
```

## Linting

[Vite+ lint](https://viteplus.dev/) (Oxlint):

```shell
pnpm lint
pnpm lint:fix
```

## Testing

[Vite+ test](https://viteplus.dev/) (Vitest):

```shell
pnpm test
pnpm test --coverage
```

Effect code is tested with [`@effect/vitest`](https://github.com/Effect-TS/effect/tree/main/packages/vitest) (`it.effect` / `it.live`). Service and CLI tests run real `git` against temporary repositories (see `src/testUtils.ts`), so `git` with `git subtree` must be on your `PATH`.

`pnpm-workspace.yaml` pins `vitest` and aliases `vite` to the copies bundled by Vite+, so `@effect/vitest` shares the runner used by `vp test`.

## Type Checking

```shell
pnpm typecheck
```
