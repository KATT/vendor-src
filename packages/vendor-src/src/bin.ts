#!/usr/bin/env node
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { NodeRuntime, NodeServices } from "@effect/platform-node";
import { Effect } from "effect";
import { Command } from "effect/cli";

import { addCommand } from "./commands/add.ts";
import { adoptCommand } from "./commands/adopt.ts";
import { checkCommand } from "./commands/check.ts";
import { listCommand } from "./commands/list.ts";
import { removeCommand } from "./commands/remove.ts";
import { syncCommand } from "./commands/sync.ts";

/** Read version from package.json at runtime so release bumps stay accurate. */
function readPackageVersion(): string {
	const here = dirname(fileURLToPath(import.meta.url));
	const candidates = [
		join(here, "..", "package.json"),
		join(here, "package.json"),
	];
	for (const file of candidates) {
		try {
			const pkg = JSON.parse(readFileSync(file, "utf8")) as {
				version?: string;
			};
			if (pkg.version) {
				return pkg.version;
			}
		} catch {
			// try next
		}
	}
	return "0.0.0";
}

const version = readPackageVersion();

const vendorSrc = Command.make("vendor-src").pipe(
	Command.withDescription(
		"Vendor dependency source into your repo with git subtree, pinned to the installed version",
	),
	Command.withSubcommands([
		addCommand,
		adoptCommand,
		checkCommand,
		syncCommand,
		listCommand,
		removeCommand,
	]),
);

vendorSrc.pipe(
	Command.run({ version }),
	Effect.provide(NodeServices.layer),
	NodeRuntime.runMain,
);
