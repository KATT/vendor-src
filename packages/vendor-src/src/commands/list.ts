import { Console, Effect, Option } from "effect";
import { Command } from "effect/cli";

import { InstalledPackages } from "../installedPackages.ts";
import { Project } from "../project.ts";
import { toUserError } from "./shared.ts";

export const listCommand = Command.make(
	"list",
	{},
	Effect.fn("list")(function* () {
		const project = yield* Project;
		const packages = yield* InstalledPackages;
		const manifest = yield* project.readManifest;
		const entries = Object.entries(manifest.repos);
		if (entries.length === 0) {
			yield* Console.log("No vendored repositories.");
			return;
		}

		for (const [name, repo] of entries) {
			const status = Option.match(yield* packages.version(repo.package), {
				onNone: () => "not installed",
				onSome: (installed) =>
					installed === repo.version ? "ok" : `drift (installed ${installed})`,
			});
			yield* Console.log(
				`${name}\t${repo.package}@${repo.version}\t${repo.ref}\t${status}`,
			);
		}
	}, Effect.mapError(toUserError)),
).pipe(Command.withDescription("List vendored repositories and drift status"));
