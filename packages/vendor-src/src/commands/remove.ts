import { Console, Effect, FileSystem } from "effect";
import { Argument, Command } from "effect/cli";

import { Git } from "../git.ts";
import { removeRepo, repoPrefix } from "../manifest.ts";
import { Project } from "../project.ts";
import { CommandError, reportErrors } from "./shared.ts";

export const removeCommand = Command.make(
	"remove",
	{
		name: Argument.String("name").pipe(
			Argument.withDescription("Vendored directory name under the vendor dir"),
		),
	},
	Effect.fn("vendor-src remove")(function* ({ name }) {
		const fs = yield* FileSystem.FileSystem;
		const project = yield* Project;
		const git = yield* Git;
		yield* git.ensureReady;

		const manifest = yield* project.readManifest;
		if (manifest.repos[name] === undefined) {
			return yield* new CommandError({
				message: `no vendored repository named ${name}`,
			});
		}

		const prefix = repoPrefix(manifest, name);
		// Remove from disk rather than `git rm` so untracked files (e.g. .DS_Store) don't fail it.
		yield* fs.remove(project.resolve(prefix), { recursive: true, force: true });
		const updated = removeRepo(manifest, name);
		yield* project.writeManifest(updated);
		yield* project.writeAgentsMd(updated);
		yield* Console.log(`Removed ${prefix}.`);
	}, reportErrors),
).pipe(
	Command.withDescription("Remove a vendored repository"),
	Command.withAlias("rm"),
);
