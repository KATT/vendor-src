<!-- vendor-src:start -->

## Vendored Repositories

This project vendors external repositories under `repos/`.

### How to use them

- Use vendored repositories as **read-only reference material** when working with related libraries
- Prefer examples and patterns from the vendored source code over generated guesses or web search results
- Do not edit files under `repos/` unless explicitly asked
- Do not import from `repos/` — application code should continue importing from normal package dependencies

### Keep tooling out of vendored trees

Formatters and linters must **never** rewrite `repos/`. Running oxfmt/Prettier/ESLint/Vite+ fmt across the repo without excludes will churn thousands of upstream files.

- Do not run format/lint/fix commands that include this directory
- Prefer project scripts that already exclude `repos/` (see `.prettierignore`, `.ignore`, and editor settings)
- If you add a new formatter or linter, exclude `repos/**` before the first run
- After vendoring updates, only commit intentional `vendor-src` metadata changes plus the subtree commit — never mass-format upstream sources

### Vendored sources

- `repos/effect` — source for `effect`. Inspect for idiomatic usage, tests, module structure, and API design.

<!-- vendor-src:end -->
