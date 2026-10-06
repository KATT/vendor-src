import { Console, Effect } from "effect";
import { Command } from "effect/cli";

import { resolveInstalledVersion } from "../installedVersions.ts";
import { findProjectRoot, readManifest } from "../project.ts";

export const listCommand = Command.make(
	"list",
	{},
	Effect.fn(function* () {
		const projectRoot = yield* findProjectRoot;
		const manifest = yield* readManifest(projectRoot);
		const entries = Object.entries(manifest.repos);
		if (entries.length === 0) {
			yield* Console.log("No vendored repositories.");
			return;
		}

		for (const [name, repo] of entries) {
			const installed = resolveInstalledVersion(repo.package, projectRoot);
			const status =
				installed === undefined
					? "not installed"
					: installed === repo.version
						? "ok"
						: `drift (installed ${installed})`;
			yield* Console.log(
				`${name}\t${repo.package}@${repo.version}\t${repo.ref}\t${status}`,
			);
		}
	}),
).pipe(Command.withDescription("List vendored repositories and drift status"));
