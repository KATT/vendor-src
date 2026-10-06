#!/usr/bin/env node
/**
 * Keep packages/vendor-src docs in sync with the repo-root sources of truth.
 * Root README.md / LICENSE.md are canonical (GitHub). Copies land in the
 * publishable package so `npm pack` / `npm publish` include them.
 */
import { copyFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const pkg = join(root, "packages", "vendor-src");

mkdirSync(pkg, { recursive: true });

for (const name of ["README.md", "LICENSE.md"]) {
	const from = join(root, name);
	const to = join(pkg, name);
	copyFileSync(from, to);
	console.log(`synced ${name} → packages/vendor-src/${name}`);
}
