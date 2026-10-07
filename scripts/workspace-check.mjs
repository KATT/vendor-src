#!/usr/bin/env node
/**
 * Workspace dogfood: run `vendor-src check --sync` after install when the package is built.
 * The published package intentionally has no postinstall.
 */
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const localBin = join(root, "packages", "vendor-src", "dist", "bin.mjs");

if (!existsSync(localBin)) {
	process.exit(0);
}

const result = spawnSync(process.execPath, [localBin, "check", "--sync"], {
	cwd: root,
	stdio: "inherit",
});

process.exit(result.status ?? 0);
