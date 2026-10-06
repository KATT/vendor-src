import { Effect, Layer } from "effect";
import { Command } from "effect/cli";

import { addCommand } from "./commands/add.ts";
import { adoptCommand } from "./commands/adopt.ts";
import { checkCommand } from "./commands/check.ts";
import { listCommand } from "./commands/list.ts";
import { removeCommand } from "./commands/remove.ts";
import { reportErrors } from "./commands/shared.ts";
import { syncCommand } from "./commands/sync.ts";
import { Git } from "./git.ts";
import { InstalledPackages } from "./packages.ts";
import { Project } from "./project.ts";

/** The `vendor-src` command tree, before services are provided. */
export const vendorSrc = Command.make("vendor-src").pipe(
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

/**
 * Services for the project found at or above `cwd`. Built only when a
 * subcommand runs, so `--help` works outside a project.
 */
export const layer = (cwd: string = ".") =>
	Layer.mergeAll(Git.layer, InstalledPackages.layer).pipe(
		Layer.provideMerge(Layer.effect(Project, reportErrors(Project.make(cwd)))),
	);

/** Run the CLI against `args` (without the `node` / script prefix). */
export const run = (
	args: ReadonlyArray<string>,
	options: { readonly version: string; readonly cwd?: string },
) =>
	Command.runWith(vendorSrc.pipe(Command.provide(layer(options.cwd))), {
		version: options.version,
	})(args).pipe(Effect.withSpan("vendor-src"));
