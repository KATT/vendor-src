import { Effect, Layer } from "effect";
import { Command } from "effect/cli";

import { addCommand } from "./commands/add.ts";
import { adoptCommand } from "./commands/adopt.ts";
import { checkCommand } from "./commands/check.ts";
import { listCommand } from "./commands/list.ts";
import { removeCommand } from "./commands/remove.ts";
import { toUserError } from "./commands/shared.ts";
import { syncCommand } from "./commands/sync.ts";
import { Git } from "./git.ts";
import { InstalledPackages } from "./installedPackages.ts";
import { Project } from "./project.ts";

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

/** Services for the project containing `cwd`. Built only when a command runs, so `--help` works anywhere. */
export const layer = (cwd: string) =>
	Layer.mergeAll(Git.layer, InstalledPackages.layer).pipe(
		Layer.provideMerge(
			Layer.effect(
				Project,
				Project.make(cwd).pipe(Effect.mapError(toUserError)),
			),
		),
	);

/** The vendor-src CLI operating on the project containing `cwd`. */
export const cli = (cwd: string) => vendorSrc.pipe(Command.provide(layer(cwd)));
