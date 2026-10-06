# Development

After [forking the repo from GitHub](https://help.github.com/articles/fork-a-repo) and [installing pnpm](https://pnpm.io/installation):

```shell
git clone https://github.com/(your-name-here)/vendor-src
cd vendor-src
pnpm install
```

## Building

Run [**Vite+ (`vp pack`)**](https://Vite+ (`vp pack`).dev) locally to build source files from `src/` into output files in `dist/`:

```shell
pnpm build
```

Add `--watch` to run the builder in a watch mode that continuously cleans and recreates `dist/` as you save files:

```shell
pnpm build --watch
```

## Formatting

[Vite+ fmt](https://viteplus.dev/) (Oxfmt) is used to format code.
Auto-formatting should happen when you save files in your editor via [lint-staged](https://github.com/lint-staged/lint-staged) and [husky](https://typicode.github.io/husky).

To manually reformat all files, you can run:

```shell
pnpm format
```

## Linting

This package uses [Vite+ lint](https://viteplus.dev/) (Oxlint) to enforce consistent code quality.

```shell
pnpm lint
pnpm lint:fix
```

## Testing

[Vite+ test](https://viteplus.dev/) (Vitest) is used for tests.
You can run it locally on the command-line:

```shell
pnpm test
```

Add the `--coverage` flag to compute test coverage and place reports in the `coverage/` directory:

```shell
pnpm test --coverage
```

Note that [console-fail-test](https://github.com/JoshuaKGoldberg/console-fail-test) is enabled for all test runs.
Calls to `console.log`, `console.warn`, and other console methods will cause a test to fail.

## Type Checking

You should be able to see suggestions from [TypeScript](https://typescriptlang.org) in your editor for all open files.

However, it can be useful to run the TypeScript command-line (`tsc`) to type check all files in `src/`:

```shell
pnpm tsc
```

Add `--watch` to keep the type checker running in a watch mode that updates the display as you save files:

```shell
pnpm tsc --watch
```
