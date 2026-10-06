#!/usr/bin/env node
import { NodeRuntime, NodeServices } from "@effect/platform-node";
import { Effect } from "effect";
import { Command } from "effect/cli";

import { addCommand } from "./commands/add.ts";
import { checkCommand } from "./commands/check.ts";
import { listCommand } from "./commands/list.ts";
import { removeCommand } from "./commands/remove.ts";
import { syncCommand } from "./commands/sync.ts";

import packageJson from "../package.json" with { type: "json" };

const version = packageJson.version;

const vendorSrc = Command.make("vendor-src").pipe(
	Command.withDescription(
		"Vendor dependency source into your repo with git subtree, pinned to the installed version",
	),
	Command.withSubcommands([
		addCommand,
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
