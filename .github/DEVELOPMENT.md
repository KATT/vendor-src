# Development

This is a Vite+ / pnpm monorepo. The publishable CLI lives in `packages/vendor-src`.
The workspace root dogfoods it (vendored `repos/`, `vendor-src.json`) and intentionally owns the only `postinstall` — the published package has none.

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

## Type Checking

```shell
pnpm typecheck
```
