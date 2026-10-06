import { Console, Effect, FileSystem } from "effect";
import { Argument, Command } from "effect/cli";

import { Git } from "../git.ts";
import { removeRepo, repoPrefix } from "../manifest.ts";
import { Project } from "../project.ts";
import { CommandError, toUserError } from "./shared.ts";

export const removeCommand = Command.make(
	"remove",
	{
		name: Argument.String("name").pipe(
			Argument.withDescription("Vendored directory name"),
		),
	},
	Effect.fn("remove")(function* ({ name }) {
		const fs = yield* FileSystem.FileSystem;
		const project = yield* Project;
		const git = yield* Git;
		yield* git.ensureCleanWorkingTree;

		const manifest = yield* project.readManifest;
		if (manifest.repos[name] === undefined) {
			return yield* new CommandError({
				message: `no vendored repository named ${name}`,
			});
		}

		const prefix = repoPrefix(manifest, name);
		yield* fs.remove(project.resolve(prefix), { recursive: true, force: true });
		const next = removeRepo(manifest, name);
		yield* project.writeManifest(next);
		yield* project.writeAgentsMd(next);
		yield* Console.log(`Removed ${prefix}.`);
	}, Effect.mapError(toUserError)),
).pipe(Command.withDescription("Remove a vendored repository"));
