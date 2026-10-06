import { Console, Effect } from "effect";
import { Argument, Command } from "effect/cli";

import { ensureCleanTree, ensureHasCommits, removePath } from "../git.ts";
import {
	findProjectRoot,
	readManifest,
	updateAgentsMd,
	writeManifest,
} from "../project.ts";

export const removeCommand = Command.make(
	"remove",
	{
		name: Argument.String("name").pipe(
			Argument.withDescription("Vendored directory name under repos/"),
		),
	},
	Effect.fn(function* ({ name }) {
		const projectRoot = yield* findProjectRoot;
		yield* ensureHasCommits;
		yield* ensureCleanTree;

		const manifest = yield* readManifest(projectRoot);
		if (!manifest.repos[name]) {
			return yield* Effect.fail(
				new Error(`no vendored repository named ${name}`),
			);
		}

		const prefix = `${manifest.dir}/${name}`;
		yield* removePath(prefix);
		delete manifest.repos[name];
		yield* writeManifest(projectRoot, manifest);
		yield* updateAgentsMd(projectRoot, manifest);
		yield* Console.log(`Removed ${prefix}.`);
	}),
).pipe(Command.withDescription("Remove a vendored repository"));
