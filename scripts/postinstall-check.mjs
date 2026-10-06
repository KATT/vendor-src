import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const localBin = join(root, "dist", "bin.mjs");

if (!existsSync(localBin)) {
	// Fresh clone before the first build — never break install.
	process.exit(0);
}

const result = spawnSync(process.execPath, [localBin, "check"], {
	cwd: root,
	stdio: "inherit",
});

process.exit(result.status ?? 0);
